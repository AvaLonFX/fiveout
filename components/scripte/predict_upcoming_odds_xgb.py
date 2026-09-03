import time
import math
import numpy as np
import pandas as pd
from datetime import datetime, date
from supabase import create_client
import joblib

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"  # smijes u kod ako hoces

MODEL_PATH = "xgb_moneyline_v1.joblib"
MODEL_NAME = "xgb_moneyline_v1"
MARGIN = 0.05  # 5% vig

FEATURES = [
    "home_win_pct_last10",
    "away_win_pct_last10",
    "home_pts_for_last10",
    "away_pts_for_last10",
    "home_pts_against_last10",
    "away_pts_against_last10",
    "home_rest_days",
    "away_rest_days",
    "home_b2b",
    "away_b2b",
]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_paged(table: str, columns: str, page_size: int = 1000, filters=None):
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        q = supabase.table(table).select(columns).range(start, end)
        if filters:
            for f in filters:
                # f = ("gte"/"eq"/..., col, value)
                op, col, val = f
                q = getattr(q, op)(col, val)
        resp = q.execute()
        data = resp.data or []
        all_rows.extend(data)
        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)
    return pd.DataFrame(all_rows)

def decimal_odds_from_prob(p: float, margin: float):
    # clamp to avoid inf
    p = float(np.clip(p, 0.02, 0.98))
    q = 1.0 - p

    # add margin (vig) then normalize
    p_adj = p * (1 + margin)
    q_adj = q * (1 + margin)
    s = p_adj + q_adj
    p_final = p_adj / s
    q_final = q_adj / s

    return (1.0 / p_final, 1.0 / q_final, p_final, q_final)

def build_team_history(team_logs: pd.DataFrame) -> pd.DataFrame:
    """
    Make per-team per-game rows with pts_for, pts_against, win, game_date.
    Computes pts_against by joining opponent row on nba_game_id.
    """
    df = team_logs.copy()
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["nba_game_id","game_date","team_id","team_abbr","is_home","wl"])
    df["nba_game_id"] = df["nba_game_id"].astype(str)
    df["team_id"] = df["team_id"].astype(str)
    df["team_abbr"] = df["team_abbr"].astype(str)
    df["is_home"] = df["is_home"].astype(bool)
    df["win"] = (df["wl"].astype(str) == "W").astype(int)
    df["pts_for"] = pd.to_numeric(df["pts"], errors="coerce")

    # opponent pts: self-join by nba_game_id where team_id differs
    opp = df[["nba_game_id","team_id","pts_for"]].copy()
    opp = opp.rename(columns={"team_id":"opp_team_id", "pts_for":"pts_against"})

    merged = df.merge(opp, on="nba_game_id", how="left")
    merged = merged[merged["team_id"] != merged["opp_team_id"]].copy()

    # In rare cases there can be dupes; keep first per (nba_game_id, team_id)
    merged = merged.sort_values(["nba_game_id","team_id","game_date"]).drop_duplicates(["nba_game_id","team_id"])

    return merged[[
        "nba_game_id","game_date","team_id","team_abbr","is_home","win","pts_for","pts_against"
    ]].sort_values(["team_id","game_date","nba_game_id"])

def last10_features(team_hist: pd.DataFrame, team_id: str, before_date: pd.Timestamp):
    """
    Compute last10 rolling stats strictly before before_date.
    """
    g = team_hist[(team_hist["team_id"] == team_id) & (team_hist["game_date"] < before_date)].copy()
    g = g.sort_values("game_date")
    tail = g.tail(10)

    if len(tail) == 0:
        # defaults
        return {
            "win_pct_last10": 0.5,
            "pts_for_last10": 110.0,
            "pts_against_last10": 110.0,
            "last_game_date": None
        }

    return {
        "win_pct_last10": float(tail["win"].mean()),
        "pts_for_last10": float(tail["pts_for"].mean(skipna=True)) if tail["pts_for"].notna().any() else 110.0,
        "pts_against_last10": float(tail["pts_against"].mean(skipna=True)) if tail["pts_against"].notna().any() else 110.0,
        "last_game_date": tail["game_date"].max()
    }

def rest_features(last_game_date: pd.Timestamp, game_date: pd.Timestamp):
    if last_game_date is None or pd.isna(last_game_date):
        # if unknown, assume normal rest
        return {"rest_days": 3, "b2b": 0}
    delta = (game_date.date() - last_game_date.date()).days - 1
    if delta < 0:
        delta = 0
    b2b = 1 if delta == 0 else 0
    return {"rest_days": int(delta), "b2b": int(b2b)}

def main():
    model = joblib.load(MODEL_PATH)

    # 1) upcoming games from GameSchedule
    today = date.today()
    games = fetch_paged(
        "GameSchedule",
        "nba_game_id,date,startTime,home_team_id,away_team_id,homeTeam,awayTeam,status",
        page_size=1000,
        filters=[("gte","date", str(today))]
    )
    if games.empty:
        print("No upcoming games found.")
        return

    games = games.dropna(subset=["nba_game_id","date","home_team_id","away_team_id"])
    games["date"] = pd.to_datetime(games["date"], errors="coerce")
    games = games.dropna(subset=["date"])
    games = games.sort_values("date")

    print("Upcoming games:", len(games))

    # 2) all TeamGameLogs (paged)
    logs = fetch_paged(
        "TeamGameLogs",
        "nba_game_id,game_date,team_id,team_abbr,is_home,wl,pts",
        page_size=1000
    )
    print("TeamGameLogs fetched:", len(logs))

    team_hist = build_team_history(logs)
    print("Team history rows:", len(team_hist))

    odds_rows = []
    for _, g in games.iterrows():
        nba_game_id = str(g["nba_game_id"])
        game_date = pd.to_datetime(g["date"])
        home_id = str(g["home_team_id"])
        away_id = str(g["away_team_id"])

        home_abbr = g.get("homeTeam") or None
        away_abbr = g.get("awayTeam") or None

        home_f = last10_features(team_hist, home_id, game_date)
        away_f = last10_features(team_hist, away_id, game_date)

        home_rest = rest_features(home_f["last_game_date"], game_date)
        away_rest = rest_features(away_f["last_game_date"], game_date)

        x = np.array([[
            home_f["win_pct_last10"],
            away_f["win_pct_last10"],
            home_f["pts_for_last10"],
            away_f["pts_for_last10"],
            home_f["pts_against_last10"],
            away_f["pts_against_last10"],
            home_rest["rest_days"],
            away_rest["rest_days"],
            home_rest["b2b"],
            away_rest["b2b"],
        ]], dtype=float)

        p_home = float(model.predict_proba(x)[0, 1])
        odds_home, odds_away, p_home_final, p_away_final = decimal_odds_from_prob(p_home, MARGIN)

        odds_rows.append({
            "nba_game_id": nba_game_id,
            "game_date": str(game_date.date()),
            "start_time_utc": g.get("startTime") or None,

            "home_team_id": home_id,
            "away_team_id": away_id,
            "home_team_abbr": home_abbr,
            "away_team_abbr": away_abbr,

            "p_home": p_home_final,
            "p_away": p_away_final,
            "odds_home_decimal": float(odds_home),
            "odds_away_decimal": float(odds_away),

            "margin": MARGIN,
            "model_name": MODEL_NAME,
        })

    print("Prepared odds rows:", len(odds_rows))

    # 3) upsert to GameOdds
    BATCH = 250
    for i in range(0, len(odds_rows), BATCH):
        chunk = odds_rows[i:i+BATCH]
        supabase.table("GameOdds").upsert(chunk, on_conflict="nba_game_id,model_name").execute()
        print(f"Upserted {min(i+BATCH, len(odds_rows))}/{len(odds_rows)}")
        time.sleep(0.05)

    print("Done ✅ Odds written to GameOdds")

if __name__ == "__main__":
    main()
