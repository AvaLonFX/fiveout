import time
import argparse
import pandas as pd
import numpy as np
from supabase import create_client
import joblib

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

FEATURES_V2 = [
    "home_win_pct_last10","away_win_pct_last10",
    "home_pts_for_last10","away_pts_for_last10",
    "home_pts_against_last10","away_pts_against_last10",
    "home_net_last10","away_net_last10",
    "home_home_win_pct_last10","home_home_pts_for_last10","home_home_pts_against_last10",
    "away_away_win_pct_last10","away_away_pts_for_last10","away_away_pts_against_last10",
    "home_season_win_pct_to_date","away_season_win_pct_to_date",
    "home_rest_days","away_rest_days","home_b2b","away_b2b",
]

def decimal_odds(p: float, margin: float = 0.05):
    # simple bookmaker margin: shrink both probs then renormalize
    p = float(np.clip(p, 1e-6, 1 - 1e-6))
    q = 1.0 - p
    p_m = p * (1 - margin)
    q_m = q * (1 - margin)
    s = p_m + q_m
    p_m, q_m = p_m / s, q_m / s
    return (1.0 / p_m, 1.0 / q_m)

def fetch_upcoming(limit=600):
    resp = supabase.table("GameSchedule") \
        .select("nba_game_id,date,startTime,home_team_id,away_team_id,homeTeam,awayTeam,status") \
        .gt("startTime", pd.Timestamp.utcnow().isoformat()) \
        .order("startTime", desc=False) \
        .limit(limit) \
        .execute()
    return pd.DataFrame(resp.data or [])

def fetch_team_logs(page_size=1000):
    all_rows = []
    start = 0
    cols = "nba_game_id,game_date,season,team_id,team_abbr,is_home,wl,pts"
    while True:
        end = start + page_size - 1
        resp = supabase.table("TeamGameLogs").select(cols).range(start, end).execute()
        data = resp.data or []
        all_rows.extend(data)
        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)
    df = pd.DataFrame(all_rows)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["nba_game_id","game_date","team_id","wl"])
    df["win"] = (df["wl"].astype(str) == "W").astype(int)
    df["pts_for"] = pd.to_numeric(df["pts"], errors="coerce")
    df["team_id"] = df["team_id"].astype(str)
    df["nba_game_id"] = df["nba_game_id"].astype(str)

    # opponent points
    opp = df[["nba_game_id","team_id","pts_for"]].rename(columns={"team_id":"opp_team_id","pts_for":"pts_against"})
    merged = df.merge(opp, on="nba_game_id", how="left")
    merged = merged[merged["team_id"] != merged["opp_team_id"]].copy()
    merged = merged.sort_values(["team_id","game_date","nba_game_id"]).drop_duplicates(["nba_game_id","team_id"])
    return merged

def compute_features_for_team_history(df_team):
    df_team = df_team.sort_values(["game_date","nba_game_id"]).copy()

    # overall last10 (shifted)
    df_team["win_pct_last10"] = df_team["win"].rolling(10, min_periods=1).mean().shift(1)
    df_team["pts_for_last10"] = df_team["pts_for"].rolling(10, min_periods=1).mean().shift(1)
    df_team["pts_against_last10"] = df_team["pts_against"].rolling(10, min_periods=1).mean().shift(1)

    # home/away split rolling
    df_team["home_win_pct_last10"] = np.nan
    df_team["home_pts_for_last10"] = np.nan
    df_team["home_pts_against_last10"] = np.nan
    hm = df_team["is_home"] == True
    if hm.any():
        sub = df_team.loc[hm].copy()
        df_team.loc[hm, "home_win_pct_last10"] = sub["win"].rolling(10, min_periods=1).mean().shift(1).values
        df_team.loc[hm, "home_pts_for_last10"] = sub["pts_for"].rolling(10, min_periods=1).mean().shift(1).values
        df_team.loc[hm, "home_pts_against_last10"] = sub["pts_against"].rolling(10, min_periods=1).mean().shift(1).values

    df_team["away_win_pct_last10"] = np.nan
    df_team["away_pts_for_last10"] = np.nan
    df_team["away_pts_against_last10"] = np.nan
    am = df_team["is_home"] == False
    if am.any():
        sub = df_team.loc[am].copy()
        df_team.loc[am, "away_win_pct_last10"] = sub["win"].rolling(10, min_periods=1).mean().shift(1).values
        df_team.loc[am, "away_pts_for_last10"] = sub["pts_for"].rolling(10, min_periods=1).mean().shift(1).values
        df_team.loc[am, "away_pts_against_last10"] = sub["pts_against"].rolling(10, min_periods=1).mean().shift(1).values

    # season-to-date win% (before current)
    games_before = df_team.groupby("season").cumcount()
    wins_before = df_team.groupby("season")["win"].cumsum() - df_team["win"]
    df_team["season_win_pct_to_date"] = np.where(games_before > 0, wins_before / games_before, 0.5)

    # rest/b2b
    prev_date = df_team["game_date"].shift(1)
    rest = (df_team["game_date"] - prev_date).dt.days - 1
    rest = rest.fillna(3).clip(lower=0).astype(int)
    df_team["rest_days"] = rest
    df_team["b2b"] = (df_team["rest_days"] == 0).astype(int)

    return df_team

def latest_team_snapshot(team_hist, team_id, as_of_date, home_flag):
    # use games strictly before the upcoming game's date
    th = team_hist[(team_hist["team_id"] == str(team_id)) & (team_hist["game_date"] < as_of_date)].copy()
    th = th.sort_values(["game_date","nba_game_id"])
    if len(th) == 0:
        # fallback defaults
        return {
            "win_pct_last10": 0.5, "pts_for_last10": 110.0, "pts_against_last10": 110.0,
            "home_win_pct_last10": 0.5, "home_pts_for_last10": 110.0, "home_pts_against_last10": 110.0,
            "away_win_pct_last10": 0.5, "away_pts_for_last10": 110.0, "away_pts_against_last10": 110.0,
            "season_win_pct_to_date": 0.5,
            "rest_days": 2, "b2b": 0,
        }

    last = th.iloc[-1]
    # if upcoming is home game, use home-only snapshot; else use away-only
    return {
        "win_pct_last10": float(last["win_pct_last10"] if pd.notna(last["win_pct_last10"]) else 0.5),
        "pts_for_last10": float(last["pts_for_last10"] if pd.notna(last["pts_for_last10"]) else 110.0),
        "pts_against_last10": float(last["pts_against_last10"] if pd.notna(last["pts_against_last10"]) else 110.0),
        "home_win_pct_last10": float(last["home_win_pct_last10"] if pd.notna(last["home_win_pct_last10"]) else 0.5),
        "home_pts_for_last10": float(last["home_pts_for_last10"] if pd.notna(last["home_pts_for_last10"]) else 110.0),
        "home_pts_against_last10": float(last["home_pts_against_last10"] if pd.notna(last["home_pts_against_last10"]) else 110.0),
        "away_win_pct_last10": float(last["away_win_pct_last10"] if pd.notna(last["away_win_pct_last10"]) else 0.5),
        "away_pts_for_last10": float(last["away_pts_for_last10"] if pd.notna(last["away_pts_for_last10"]) else 110.0),
        "away_pts_against_last10": float(last["away_pts_against_last10"] if pd.notna(last["away_pts_against_last10"]) else 110.0),
        "season_win_pct_to_date": float(last["season_win_pct_to_date"] if pd.notna(last["season_win_pct_to_date"]) else 0.5),
        "rest_days": int(last["rest_days"]) if pd.notna(last["rest_days"]) else 2,
        "b2b": int(last["b2b"]) if pd.notna(last["b2b"]) else 0,
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model_path", required=True)
    ap.add_argument("--model_name", required=True)
    ap.add_argument("--limit", type=int, default=600)
    ap.add_argument("--margin", type=float, default=0.05)
    args = ap.parse_args()

    model = joblib.load(args.model_path)

    upcoming = fetch_upcoming(limit=args.limit)
    print("Upcoming games:", len(upcoming))

    team_logs = fetch_team_logs()
    print("TeamGameLogs fetched:", len(team_logs))

    team_logs["season"] = team_logs["season"].astype(str)
    team_logs["is_home"] = team_logs["is_home"].astype(bool)

    # compute rolling features per team
    team_hist = team_logs.sort_values(["team_id","game_date","nba_game_id"]).groupby("team_id", group_keys=False).apply(compute_features_for_team_history)
    print("Team history rows:", len(team_hist))

    rows = []
    for _, g in upcoming.iterrows():
        nba_game_id = str(g["nba_game_id"])
        game_date = pd.to_datetime(g["date"], errors="coerce")
        if pd.isna(game_date):
            continue

        home_id = str(g["home_team_id"])
        away_id = str(g["away_team_id"])

        home_snap = latest_team_snapshot(team_hist, home_id, game_date, True)
        away_snap = latest_team_snapshot(team_hist, away_id, game_date, False)

        # v2 features
        feats = {
            "home_win_pct_last10": home_snap["win_pct_last10"],
            "away_win_pct_last10": away_snap["win_pct_last10"],
            "home_pts_for_last10": home_snap["pts_for_last10"],
            "away_pts_for_last10": away_snap["pts_for_last10"],
            "home_pts_against_last10": home_snap["pts_against_last10"],
            "away_pts_against_last10": away_snap["pts_against_last10"],
            "home_net_last10": home_snap["pts_for_last10"] - home_snap["pts_against_last10"],
            "away_net_last10": away_snap["pts_for_last10"] - away_snap["pts_against_last10"],

            "home_home_win_pct_last10": home_snap["home_win_pct_last10"],
            "home_home_pts_for_last10": home_snap["home_pts_for_last10"],
            "home_home_pts_against_last10": home_snap["home_pts_against_last10"],

            "away_away_win_pct_last10": away_snap["away_win_pct_last10"],
            "away_away_pts_for_last10": away_snap["away_pts_for_last10"],
            "away_away_pts_against_last10": away_snap["away_pts_against_last10"],

            "home_season_win_pct_to_date": home_snap["season_win_pct_to_date"],
            "away_season_win_pct_to_date": away_snap["season_win_pct_to_date"],

            "home_rest_days": home_snap["rest_days"],
            "away_rest_days": away_snap["rest_days"],
            "home_b2b": home_snap["b2b"],
            "away_b2b": away_snap["b2b"],
        }

        X = np.array([[feats[f] for f in FEATURES_V2]], dtype=float)
        p_home = float(model.predict_proba(X)[:, 1][0])
        p_away = 1.0 - p_home

        oh, oa = decimal_odds(p_home, margin=args.margin)

        rows.append({
            "nba_game_id": nba_game_id,
            "model_name": args.model_name,

            # context (da nema NULL)
            "start_time_utc": g.get("startTime"),
            "home_team_id": str(g.get("home_team_id")) if g.get("home_team_id") is not None else None,
            "away_team_id": str(g.get("away_team_id")) if g.get("away_team_id") is not None else None,
            "home_team_abbr": g.get("homeTeam"),
            "away_team_abbr": g.get("awayTeam"),

            # predictions
            "p_home": round(p_home, 6),
            "p_away": round(p_away, 6),
            "odds_home_decimal": round(float(oh), 2),
            "odds_away_decimal": round(float(oa), 2),

            # (ako imaš ove kolone u tablici)
            "margin": float(args.margin),
        })


    print("Prepared odds rows:", len(rows))

    BATCH = 250
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        supabase.table("GameOdds").upsert(chunk, on_conflict="nba_game_id,model_name").execute()
        print(f"Upserted {min(i+BATCH, len(rows))}/{len(rows)}")
        time.sleep(0.05)

    print("Done ✅ Odds written to GameOdds")

if __name__ == "__main__":
    main()
