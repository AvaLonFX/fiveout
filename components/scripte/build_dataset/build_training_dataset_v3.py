import os
import time
import json
import argparse
from typing import Dict, List

import numpy as np
import pandas as pd
from supabase import create_client

from nba_api.stats.endpoints import leaguedashplayerstats, boxscoretraditionalv2

# =========================
# Supabase
# =========================
SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"  # ili stavi u env SUPABASE_KEY

# =========================
# NBA team whitelist (30 teams)
# =========================
NBA_TEAM_IDS = {
    "1610612737","1610612738","1610612739","1610612740","1610612741","1610612742",
    "1610612743","1610612744","1610612745","1610612746","1610612747","1610612748",
    "1610612749","1610612750","1610612751","1610612752","1610612753","1610612754",
    "1610612755","1610612756","1610612757","1610612758","1610612759","1610612760",
    "1610612761","1610612762","1610612763","1610612764"
}

def is_nba_team_id(x) -> bool:
    return str(x) in NBA_TEAM_IDS

def safe_sleep(sec: float):
    time.sleep(max(0.0, float(sec)))

# =========================
# Fetch helpers (Supabase)
# =========================
def fetch_all_table(supabase, table: str, cols: str, page_size: int = 1000) -> pd.DataFrame:
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        resp = supabase.table(table).select(cols).range(start, end).execute()
        data = resp.data or []
        all_rows.extend(data)
        if len(data) < page_size:
            break
        start += page_size
        safe_sleep(0.05)
    return pd.DataFrame(all_rows)

# =========================
# nba_api: top players by season totals MIN
# =========================
def get_team_top_players_by_min(season: str) -> Dict[str, Dict[str, List[int]]]:
    """
    Returns mapping:
      top_map[team_id_str] = {"top3":[pid..], "top5":[pid..]}
    Based on season totals minutes (Regular Season).
    """
    endpoint = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        season_type_all_star="Regular Season",
        per_mode_detailed="Totals"
    )
    df = endpoint.get_data_frames()[0]

    # expected columns: PLAYER_ID, TEAM_ID, MIN
    df = df[["PLAYER_ID", "TEAM_ID", "MIN"]].copy()
    df["TEAM_ID"] = df["TEAM_ID"].astype(str)
    df["PLAYER_ID"] = pd.to_numeric(df["PLAYER_ID"], errors="coerce").astype("Int64")
    df["MIN"] = pd.to_numeric(df["MIN"], errors="coerce").fillna(0.0)

    # keep only NBA teams + valid player ids
    df = df[df["TEAM_ID"].apply(is_nba_team_id)].copy()
    df = df.dropna(subset=["PLAYER_ID"])
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(int)

    top_map: Dict[str, Dict[str, List[int]]] = {}

    for team_id, g in df.groupby("TEAM_ID"):
        g = g.sort_values("MIN", ascending=False)
        top3 = g.head(3)["PLAYER_ID"].tolist()
        top5 = g.head(5)["PLAYER_ID"].tolist()
        top_map[str(team_id)] = {"top3": top3, "top5": top5}

    # fallback: ensure all 30 teams exist
    for tid in NBA_TEAM_IDS:
        top_map.setdefault(tid, {"top3": [], "top5": []})

    return top_map

# =========================
# nba_api: boxscore -> played sets
# =========================
def parse_played_players_from_boxscore(players_df: pd.DataFrame) -> Dict[str, set]:
    """
    Returns dict team_id_str -> set(player_id_int) who played >0 minutes.
    """
    played: Dict[str, set] = {}
    if players_df is None or len(players_df) == 0:
        return played

    if "TEAM_ID" not in players_df.columns or "PLAYER_ID" not in players_df.columns:
        return played

    for _, r in players_df.iterrows():
        try:
            team_id = str(int(r["TEAM_ID"]))
            player_id = int(r["PLAYER_ID"])
        except:
            continue

        # ignore non-NBA teams (safety)
        if team_id not in NBA_TEAM_IDS:
            continue

        min_val = r.get("MIN", None)

        if pd.isna(min_val) or min_val in [None, "", "0", "0:00"]:
            continue

        mins = 0.0
        if isinstance(min_val, str) and ":" in min_val:
            try:
                mm, ss = min_val.split(":")
                mins = float(mm) + float(ss) / 60.0
            except:
                mins = 0.0
        else:
            try:
                mins = float(min_val)
            except:
                mins = 0.0

        if mins > 0:
            played.setdefault(team_id, set()).add(player_id)

    return played

def fetch_boxscore_played(game_id: str, retries: int = 3, sleep_sec: float = 0.6) -> Dict[str, set]:
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            bs = boxscoretraditionalv2.BoxScoreTraditionalV2(game_id=game_id)
            players = bs.get_data_frames()[0]  # PlayerStats
            played = parse_played_players_from_boxscore(players)
            safe_sleep(sleep_sec)
            return played
        except Exception as e:
            last_err = e
            safe_sleep(sleep_sec * attempt)
    return {}

# =========================
# JSON-safe conversion
# =========================
def make_json_safe_row(row_dict: dict) -> dict:
    # game_date: Timestamp/date -> "YYYY-MM-DD"
    if "game_date" in row_dict and row_dict["game_date"] is not None:
        try:
            row_dict["game_date"] = pd.to_datetime(row_dict["game_date"]).date().isoformat()
        except:
            row_dict["game_date"] = None

    # convert NaN to None
    for k, v in list(row_dict.items()):
        if v is None:
            continue
        if isinstance(v, float) and np.isnan(v):
            row_dict[k] = None

        # numpy types -> python types
        if isinstance(v, (np.integer,)):
            row_dict[k] = int(v)
        if isinstance(v, (np.floating,)):
            row_dict[k] = float(v)

    return row_dict

# =========================
# Main
# =========================
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source_table", default="TrainingDataset_v2")
    ap.add_argument("--dest_table", default="TrainingDataset_v3")
    ap.add_argument("--page_size", type=int, default=1000)
    ap.add_argument("--sleep_box", type=float, default=0.6)
    ap.add_argument("--max_games", type=int, default=0, help="0 = all (testing set e.g. 200)")
    ap.add_argument("--cache_file", default="boxscore_played_cache.json")
    ap.add_argument("--retries", type=int, default=3)
    args = ap.parse_args()

    url = os.environ.get("SUPABASE_URL", SUPABASE_URL)
    key = os.environ.get("SUPABASE_KEY", SUPABASE_KEY)
    supabase = create_client(url, key)

    # 1) load v2
    df = fetch_all_table(supabase, args.source_table, "*", page_size=args.page_size)
    if df.empty:
        print("❌ Source dataset is empty:", args.source_table)
        return

    # cleanup
    for c in ["nba_game_id", "season", "home_team_id", "away_team_id"]:
        if c in df.columns:
            df[c] = df[c].astype(str)

    if "game_date" in df.columns:
        df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")

    # keep NBA regular season game ids (avoid weird ids)
    if "nba_game_id" in df.columns:
        df = df[df["nba_game_id"].str.startswith("002")].copy()

    if args.max_games and args.max_games > 0:
        df = df.head(args.max_games).copy()

    print(f"Loaded {len(df)} rows from {args.source_table}")

    seasons = sorted(df["season"].dropna().unique().tolist())
    print("Seasons found:", seasons)

    # 2) top players per season
    top_by_season: Dict[str, Dict[str, Dict[str, List[int]]]] = {}
    for s in seasons:
        print(f"Fetching top players by MIN for season {s} ...")
        top_by_season[s] = get_team_top_players_by_min(s)
        print(f"  -> teams: {len(top_by_season[s])} (should be 30)")

    # 3) load cache (game_id -> team_id -> [player_ids])
    cache: Dict[str, Dict[str, List[int]]] = {}
    if os.path.exists(args.cache_file):
        try:
            with open(args.cache_file, "r", encoding="utf-8") as f:
                cache = json.load(f)
            print(f"Loaded cache: {len(cache)} games from {args.cache_file}")
        except Exception:
            cache = {}

    def cache_get(game_id: str) -> Dict[str, set]:
        if game_id in cache:
            return {tid: set(pids) for tid, pids in cache[game_id].items()}
        return {}

    def cache_set(game_id: str, played: Dict[str, set]):
        cache[game_id] = {tid: sorted(list(pids)) for tid, pids in played.items()}

    out_rows = []
    total = len(df)

    def count_missing(top_list: List[int], played_set: set) -> int:
        if not top_list:
            return 0
        return int(sum(1 for pid in top_list if pid not in played_set))

    # 4) compute features
    for i, (_, r) in enumerate(df.iterrows(), 1):
        game_id = str(r["nba_game_id"])
        season = str(r["season"])
        home_tid = str(r["home_team_id"])
        away_tid = str(r["away_team_id"])

        # safety: NBA teams only
        if not (is_nba_team_id(home_tid) and is_nba_team_id(away_tid)):
            continue

        # top lists
        top_season = top_by_season.get(season, {})
        home_top = top_season.get(home_tid, {"top3": [], "top5": []})
        away_top = top_season.get(away_tid, {"top3": [], "top5": []})

        # played sets from cache or API
        played = cache_get(game_id)
        if not played:
            played = fetch_boxscore_played(game_id, retries=args.retries, sleep_sec=args.sleep_box)
            cache_set(game_id, played)

            # save cache periodically
            if len(cache) % 50 == 0:
                try:
                    with open(args.cache_file, "w", encoding="utf-8") as f:
                        json.dump(cache, f)
                    print(f"Saved cache: {len(cache)} games -> {args.cache_file}")
                except:
                    pass

        home_played = played.get(home_tid, set())
        away_played = played.get(away_tid, set())

        home_top3_missing = count_missing(home_top["top3"], home_played)
        away_top3_missing = count_missing(away_top["top3"], away_played)
        home_top5_missing = count_missing(home_top["top5"], home_played)
        away_top5_missing = count_missing(away_top["top5"], away_played)

        row_dict = r.to_dict()
        row_dict["home_top3_missing"] = home_top3_missing
        row_dict["away_top3_missing"] = away_top3_missing
        row_dict["home_top5_missing"] = home_top5_missing
        row_dict["away_top5_missing"] = away_top5_missing

        row_dict = make_json_safe_row(row_dict)
        out_rows.append(row_dict)

        if i % 100 == 0:
            print(f"Processed {i}/{total}")

    # final cache write
    try:
        with open(args.cache_file, "w", encoding="utf-8") as f:
            json.dump(cache, f)
        print(f"Saved cache: {len(cache)} games -> {args.cache_file}")
    except:
        pass

    print("Prepared rows:", len(out_rows))
    if not out_rows:
        print("❌ No rows prepared (check filtering / ids).")
        return

    # 5) upsert
    BATCH = 250
    for i in range(0, len(out_rows), BATCH):
        chunk = out_rows[i:i+BATCH]
        supabase.table(args.dest_table).upsert(chunk, on_conflict="nba_game_id").execute()
        print(f"Upserted {min(i+BATCH, len(out_rows))}/{len(out_rows)}")
        safe_sleep(0.05)

    print("Done ✅ TrainingDataset_v3 written.")

if __name__ == "__main__":
    main()
