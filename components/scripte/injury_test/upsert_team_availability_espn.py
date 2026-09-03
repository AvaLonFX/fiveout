from io import StringIO
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline_config import get_supabase as pipeline_database, season as configured_season
import os
import re
import time
import argparse
import unicodedata
from datetime import datetime, timezone

import requests
import pandas as pd
from supabase import create_client

# ================== PLACEHOLDERS (STAVI SVOJE) ==================
# ================================================================

ESPN_INJ_URL = "https://www.espn.com/nba/injuries"

# status weights -> "expected missing"
STATUS_WEIGHT = {
    "out": 1.0,
    "doubtful": 0.8,
    "questionable": 0.5,
    "probable": 0.2,
}

# ESPN team names can vary; map to NBA abbreviations if needed
# We'll try to read team name from ESPN table sections; fallback to this map.
ESPN_TEAMNAME_TO_ABBR = {
    "atlanta hawks": "ATL",
    "boston celtics": "BOS",
    "brooklyn nets": "BKN",
    "charlotte hornets": "CHA",
    "chicago bulls": "CHI",
    "cleveland cavaliers": "CLE",
    "dallas mavericks": "DAL",
    "denver nuggets": "DEN",
    "detroit pistons": "DET",
    "golden state warriors": "GSW",
    "houston rockets": "HOU",
    "indiana pacers": "IND",
    "la clippers": "LAC",
    "los angeles clippers": "LAC",
    "la lakers": "LAL",
    "los angeles lakers": "LAL",
    "memphis grizzlies": "MEM",
    "miami heat": "MIA",
    "milwaukee bucks": "MIL",
    "minnesota timberwolves": "MIN",
    "new orleans pelicans": "NOP",
    "new york knicks": "NYK",
    "oklahoma city thunder": "OKC",
    "orlando magic": "ORL",
    "philadelphia 76ers": "PHI",
    "phoenix suns": "PHX",
    "portland trail blazers": "POR",
    "sacramento kings": "SAC",
    "san antonio spurs": "SAS",
    "toronto raptors": "TOR",
    "utah jazz": "UTA",
    "washington wizards": "WAS",
}

def get_supabase():
    return pipeline_database()

def norm_name(s: str) -> str:
    """
    Normalize player names for matching:
    - remove accents
    - lowercase
    - keep letters/spaces only
    """
    if s is None:
        return ""
    s = str(s).strip()
    s = unicodedata.normalize("NFKD", s)
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower()
    s = re.sub(r"[^a-z\s\-\.']", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def http_get(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.espn.com/",
    }
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.text

def parse_espn_injuries(html: str) -> pd.DataFrame:
    """
    ESPN injuries page has multiple tables (one per team).
    pd.read_html() usually extracts them.

    We'll return a dataframe with columns:
    team_name, player_name, player_name_norm, status, status_norm, weight
    """
    tables = pd.read_html(StringIO(html))
    rows = []

    # ESPN tables typically include columns like: "NAME", "POS", "EST. RETURN DATE", "STATUS", "COMMENT"
    # But the exact headers can vary; we try to detect a name + status column.
    for idx, t in enumerate(tables):
        cols = [str(c).strip() for c in t.columns.tolist()]
        lower_cols = [c.lower() for c in cols]

        # try to find columns
        name_col = None
        status_col = None
        for c in cols:
            if str(c).lower() in ["name", "player", "player (position)"]:
                name_col = c
            if str(c).lower() in ["status", "injury status"]:
                status_col = c

        # fallback heuristics
        if name_col is None:
            # first col often contains name
            name_col = cols[0]
        if status_col is None:
            # sometimes status is 3rd/4th col
            for c in cols:
                if "status" in str(c).lower():
                    status_col = c
                    break
        if status_col is None:
            # if still none, skip
            continue

        # ESPN doesn't include team name in table itself always.
        # We'll try to detect from surrounding structure later — but read_html loses that.
        # We'll keep team_name unknown; later we match by player->team top list (works fine),
        # but it's better if you add a team column source later.
        for _, r in t.iterrows():
            pname = str(r.get(name_col, "")).strip()
            status = str(r.get(status_col, "")).strip()
            if pname == "" or pname.lower() in ["nan", "none"]:
                continue
            if status == "" or status.lower() in ["nan", "none"]:
                continue

            s_norm = status.lower().strip()
            # standardize status to one of keys
            key = None
            for k in STATUS_WEIGHT.keys():
                if k in s_norm:
                    key = k
                    break
            weight = STATUS_WEIGHT.get(key, 0.0)

            rows.append({
                "team_name": None,  # not always available
                "player_name": pname,
                "player_name_norm": norm_name(pname),
                "status": status,
                "status_norm": key,
                "weight": float(weight),
            })

    if not rows:
        raise RuntimeError("No injury rows parsed; refusing to mark every player healthy")
    df = pd.DataFrame(rows).drop_duplicates(subset=["player_name_norm","status"])
    return df

def fetch_upcoming(sb, limit: int):
    resp = (
        sb.table("GameSchedule")
        .select("nba_game_id,date,startTime,home_team_id,away_team_id,homeTeam,awayTeam,status")
        .gt("startTime", pd.Timestamp.utcnow().isoformat())
        .lt("startTime", (pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=7)).isoformat())
        .like("nba_game_id", "002%")
        .order("startTime", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data or []

def fetch_top_players_by_min(sb, topn: int = 5) -> pd.DataFrame:
    """
    Pull from CurrentStats_NBA:
    expected columns based on your example:
    PLAYER_ID, PLAYER_NAME, TEAM_ID, TEAM_ABBREVIATION, MIN
    """
    cols = "PLAYER_ID,PLAYER_NAME,TEAM_ID,TEAM_ABBREVIATION,MIN,GP"
    resp = sb.table("CurrentStats_NBA").select(cols).execute()
    data = resp.data or []
    df = pd.DataFrame(data)
    if df.empty:
        raise SystemExit("❌ CurrentStats_NBA is empty or columns mismatch.")

    df["TEAM_ID"] = df["TEAM_ID"].astype(str)
    df["TEAM_ABBREVIATION"] = df["TEAM_ABBREVIATION"].astype(str)
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    df["MIN"] = pd.to_numeric(df["MIN"], errors="coerce").fillna(0.0)
    df["GP"] = pd.to_numeric(df.get("GP", 0), errors="coerce").fillna(0.0)

    # ranking metric: MIN per game is okay; you can also use MIN*GP for stability
    df["min_score"] = df["MIN"] * df["GP"].clip(lower=1)

    df["player_name_norm"] = df["PLAYER_NAME"].apply(norm_name)

    df = df.sort_values(["TEAM_ID","min_score"], ascending=[True, False])
    df["rk"] = df.groupby("TEAM_ID").cumcount() + 1
    df = df[df["rk"] <= topn].copy()
    return df

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=200, help="how many upcoming games")
    ap.add_argument("--topn", type=int, default=5, help="top N players by minutes per team")
    ap.add_argument("--source", default="espn_injuries_v1")
    ap.add_argument("--sleep", type=float, default=0.3)
    ap.add_argument("--debug", type=int, default=1)
    args = ap.parse_args()

    sb = get_supabase()

    # 1) upcoming games -> which teams & which report_dates we need
    upcoming = fetch_upcoming(sb, args.limit)
    print("Upcoming games:", len(upcoming))
    if not upcoming:
        print("No upcoming games; availability refresh not needed.")
        return

    # collect (report_date, team_id, team_abbr)
    need = set()
    for g in upcoming:
        dt = pd.to_datetime(g.get("date") or g.get("startTime"), errors="coerce")
        if pd.isna(dt):
            continue
        report_date = str(dt.date())
        for side in ["home","away"]:
            tid = str(g.get(f"{side}_team_id") or "")
            abbr = str(g.get("homeTeam") if side=="home" else g.get("awayTeam") or "")
            if tid:
                need.add((report_date, tid, abbr))
    need = sorted(list(need))
    print("Unique (date,team) pairs:", len(need))

    # 2) top players by minutes per team from CurrentStats_NBA
    top_df = fetch_top_players_by_min(sb, topn=args.topn)
    print("Top players rows:", len(top_df))
    if args.debug:
        print(top_df.head(10).to_string(index=False))

    # 3) scrape ESPN injuries
    html = http_get(ESPN_INJ_URL)
    inj_df = parse_espn_injuries(html)
    print("ESPN injury rows parsed:", len(inj_df))
    if args.debug and not inj_df.empty:
        print(inj_df.head(12).to_string(index=False))

    inj_set = set(inj_df["player_name_norm"].tolist())

    # 4) build TeamAvailability rows
    out_rows = []
    for (report_date, team_id, team_abbr) in need:
        team_top = top_df[top_df["TEAM_ID"] == str(team_id)].copy()

        if team_top.empty:
            # fallback: still write row but NULL so you see missing data
            out_rows.append({
                "report_date": report_date,
                "team_id": str(team_id),
                "team_abbr": team_abbr,
                "missing_top3_expected": None,
                "missing_top5_expected": None,
                "injured_count": None,
                "questionable_count": None,
                "probable_count": None,
                "source": args.source,
            })
            if args.debug:
                print(f"⚠️ {report_date} {team_abbr} team_id={team_id}: no top players found in CurrentStats_NBA -> NULL")
            continue

        # match by normalized player name
        team_top["is_inj"] = team_top["player_name_norm"].apply(lambda x: x in inj_set)

        # weights by status if available
        # create dict for quick lookup: player_norm -> max weight
        weight_map = {}
        status_map = {}
        if not inj_df.empty:
            for _, r in inj_df.iterrows():
                pn = r["player_name_norm"]
                w = float(r["weight"])
                st = r["status_norm"]
                if pn not in weight_map or w > weight_map[pn]:
                    weight_map[pn] = w
                    status_map[pn] = st

        team_top["w"] = team_top["player_name_norm"].apply(lambda x: float(weight_map.get(x, 0.0)))
        team_top["status_norm"] = team_top["player_name_norm"].apply(lambda x: status_map.get(x, None))

        # expected missing for top5/top3 (rounded to int OR keep float?)
        top5 = team_top.sort_values("rk").head(5)
        top3 = team_top.sort_values("rk").head(3)

        miss5_expected = float(top5["w"].sum())
        miss3_expected = float(top3["w"].sum())

        # counts by category (useful for debugging/UI)
        injured_count = int((top5["status_norm"] == "out").sum())
        questionable_count = int((top5["status_norm"] == "questionable").sum())
        probable_count = int((top5["status_norm"] == "probable").sum())

        # If your DB columns are int, convert to int (simple):
        # BUT: you already have int columns in TeamAvailability.
        # We'll store rounded expected -> int.
        miss5_int = int(round(miss5_expected))
        miss3_int = int(round(miss3_expected))

        out_rows.append({
            "report_date": report_date,
            "team_id": str(team_id),
            "team_abbr": team_abbr,
            "missing_top3_expected": miss3_int,
            "missing_top5_expected": miss5_int,
            "injured_count": injured_count,
            "questionable_count": questionable_count,
            "probable_count": probable_count,
            "source": args.source,
        })

        if args.debug:
            names = list(zip(top5["PLAYER_NAME"].tolist(), top5["status_norm"].tolist(), top5["w"].tolist()))
            print(f"{report_date} {team_abbr} {team_id} | miss3={miss3_int} miss5={miss5_int} | top5={names}")

        time.sleep(args.sleep)

    # 5) upsert to TeamAvailability
    print("Prepared TeamAvailability rows:", len(out_rows))
    BATCH = 250
    for i in range(0, len(out_rows), BATCH):
        chunk = out_rows[i:i+BATCH]
        sb.table("TeamAvailability").upsert(chunk, on_conflict="report_date,team_id").execute()
        print(f"Upserted {min(i+BATCH, len(out_rows))}/{len(out_rows)}")
        time.sleep(0.05)

    print("✅ Done: TeamAvailability updated from ESPN injuries.")

if __name__ == "__main__":
    main()
