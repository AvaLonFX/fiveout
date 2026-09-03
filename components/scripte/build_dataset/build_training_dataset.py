import time
import pandas as pd
import numpy as np
from supabase import create_client

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"

TRAIN_SEASONS = {"2019-20","2020-21","2021-22","2022-23","2023-24","2024-25"}

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all_teamgamelogs(page_size: int = 1000) -> pd.DataFrame:
    all_rows = []
    start = 0

    while True:
        end = start + page_size - 1

        resp = supabase.table("TeamGameLogs").select(
            "nba_game_id,game_date,team_id,team_abbr,is_home,wl,pts,season"
        ).range(start, end).execute()

        data = resp.data or []
        all_rows.extend(data)

        print(f"Fetched rows {start}-{end}: got {len(data)} (total {len(all_rows)})")

        # ako je vraceno manje od page_size, nema vise stranica
        if len(data) < page_size:
            break

        start += page_size
        time.sleep(0.1)

    df = pd.DataFrame(all_rows)

    # types / cleaning
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["nba_game_id","game_date","team_id","team_abbr","wl","season"])

    df["is_home"] = df["is_home"].astype(bool)
    df["wl"] = df["wl"].astype(str)
    df["win"] = (df["wl"] == "W").astype(int)
    df["pts"] = pd.to_numeric(df["pts"], errors="coerce")

    return df


def add_team_rolling_features(df_team: pd.DataFrame) -> pd.DataFrame:
    df_team = df_team.sort_values("game_date").copy()

    df_team["win_pct_last10"] = df_team["win"].rolling(10, min_periods=1).mean().shift(1)
    df_team["pts_for_last10"] = df_team["pts"].rolling(10, min_periods=1).mean().shift(1)

    return df_team

def compute_rest(df_team: pd.DataFrame) -> pd.DataFrame:
    df_team = df_team.sort_values("game_date").copy()
    prev_date = df_team["game_date"].shift(1)

    df_team["rest_days"] = (df_team["game_date"] - prev_date).dt.days - 1
    df_team["rest_days"] = df_team["rest_days"].fillna(3).clip(lower=0).astype(int)
    df_team["b2b"] = (df_team["rest_days"] == 0).astype(int)

    return df_team

def pair_games(df: pd.DataFrame) -> pd.DataFrame:
    df = df[df["season"].isin(TRAIN_SEASONS)].copy()

    # groupby apply (warning je ok, ali ovako ga smirimo bez da mijenjamo logiku)
    df = df.sort_values(["team_id","game_date","nba_game_id"]).copy()
    df = df.groupby("team_id", group_keys=False).apply(add_team_rolling_features)
    df = df.groupby("team_id", group_keys=False).apply(compute_rest)

    home = df[df["is_home"]].copy()
    away = df[~df["is_home"]].copy()

    merged = home.merge(
        away,
        on=["nba_game_id", "game_date", "season"],
        suffixes=("_home", "_away"),
        how="inner"
    )

    merged["pts_against_last10_home"] = merged["pts_for_last10_away"]
    merged["pts_against_last10_away"] = merged["pts_for_last10_home"]

    merged["home_win"] = (merged["pts_home"] > merged["pts_away"]).astype(int)

    out = pd.DataFrame({
        "nba_game_id": merged["nba_game_id"],
        "game_date": merged["game_date"].dt.date.astype(str),
        "season": merged["season"],

        "home_team_id": merged["team_id_home"],
        "away_team_id": merged["team_id_away"],
        "home_team_abbr": merged["team_abbr_home"],
        "away_team_abbr": merged["team_abbr_away"],

        "home_pts": merged["pts_home"].fillna(0).astype(int),
        "away_pts": merged["pts_away"].fillna(0).astype(int),
        "home_win": merged["home_win"].astype(int),

        "home_win_pct_last10": merged["win_pct_last10_home"].fillna(0.5),
        "away_win_pct_last10": merged["win_pct_last10_away"].fillna(0.5),

        "home_pts_for_last10": merged["pts_for_last10_home"].fillna(110),
        "away_pts_for_last10": merged["pts_for_last10_away"].fillna(110),

        "home_pts_against_last10": merged["pts_against_last10_home"].fillna(110),
        "away_pts_against_last10": merged["pts_against_last10_away"].fillna(110),

        "home_rest_days": merged["rest_days_home"].astype(int),
        "away_rest_days": merged["rest_days_away"].astype(int),
        "home_b2b": merged["b2b_home"].astype(int),
        "away_b2b": merged["b2b_away"].astype(int),
    })

    return out

def upsert_training(out: pd.DataFrame):
    rows = out.to_dict(orient="records")
    print("Training rows:", len(rows))

    BATCH = 500
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        supabase.table("TrainingDataset").upsert(
            chunk,
            on_conflict="nba_game_id"
        ).execute()
        print(f"Upserted {min(i+BATCH, len(rows))}/{len(rows)}")
        time.sleep(0.1)

def main():
    df = fetch_all_teamgamelogs(page_size=1000)
    print("TeamGameLogs rows fetched:", len(df))

    out = pair_games(df)
    print("TrainingDataset rows (paired games):", len(out))
    print(out.head(3))

    upsert_training(out)
    print("Done ✅")

if __name__ == "__main__":
    main()
