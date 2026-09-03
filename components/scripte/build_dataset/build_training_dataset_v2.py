import time
import numpy as np
import pandas as pd
from supabase import create_client

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"

TRAIN_SEASONS = {"2019-20","2020-21","2021-22","2022-23","2023-24","2024-25"}

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_paged(table: str, columns: str, page_size: int = 1000) -> pd.DataFrame:
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        resp = supabase.table(table).select(columns).range(start, end).execute()
        data = resp.data or []
        all_rows.extend(data)
        print(f"Fetched rows {start}-{end}: got {len(data)} (total {len(all_rows)})")
        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)
    return pd.DataFrame(all_rows)

def build_team_history(team_logs: pd.DataFrame) -> pd.DataFrame:
    """
    Builds per-team per-game history with pts_for, pts_against, win, is_home, season, game_date.
    pts_against computed by joining opponent row on nba_game_id.
    """
    df = team_logs.copy()
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["nba_game_id","game_date","team_id","team_abbr","wl","season"])

    df["nba_game_id"] = df["nba_game_id"].astype(str)
    df["team_id"] = df["team_id"].astype(str)
    df["team_abbr"] = df["team_abbr"].astype(str)
    df["season"] = df["season"].astype(str)
    df["is_home"] = df["is_home"].astype(bool)

    df["win"] = (df["wl"].astype(str) == "W").astype(int)
    df["pts_for"] = pd.to_numeric(df["pts"], errors="coerce")

    # opponent pts via self-join on nba_game_id
    opp = df[["nba_game_id","team_id","pts_for"]].copy()
    opp = opp.rename(columns={"team_id":"opp_team_id", "pts_for":"pts_against"})

    merged = df.merge(opp, on="nba_game_id", how="left")
    merged = merged[merged["team_id"] != merged["opp_team_id"]].copy()

    # remove any accidental duplicates
    merged = merged.sort_values(["nba_game_id","team_id","game_date"]).drop_duplicates(["nba_game_id","team_id"])

    merged = merged.sort_values(["team_id","season","game_date","nba_game_id"]).reset_index(drop=True)
    return merged[[
        "nba_game_id","game_date","season","team_id","team_abbr","is_home","win","pts_for","pts_against"
    ]]

def add_features_for_team(df_team: pd.DataFrame) -> pd.DataFrame:
    """
    df_team contains one team across multiple seasons (all rows for a single team_id).
    Computes (all strictly BEFORE current game via shift / exclude-current):
      - overall last10: win%, pts_for, pts_against
      - home-only last10 (for rows where is_home=True)
      - away-only last10 (for rows where is_home=False)
      - season-to-date win% within same season (before current game)
      - rest_days and b2b from previous game date
    """
    df_team = df_team.sort_values(["game_date", "nba_game_id"]).copy()

    # -----------------------
    # Overall rolling last10 (shifted so it uses only past games)
    df_team["win_pct_last10"] = (
        df_team["win"].rolling(10, min_periods=1).mean().shift(1)
    )
    df_team["pts_for_last10"] = (
        df_team["pts_for"].rolling(10, min_periods=1).mean().shift(1)
    )
    df_team["pts_against_last10"] = (
        df_team["pts_against"].rolling(10, min_periods=1).mean().shift(1)
    )

    # -----------------------
    # Home-only rolling last10 (computed only on home games, shifted within that subset)
    df_team["home_win_pct_last10"] = np.nan
    df_team["home_pts_for_last10"] = np.nan
    df_team["home_pts_against_last10"] = np.nan

    home_mask = df_team["is_home"] == True
    if home_mask.any():
        home_sub = df_team.loc[home_mask].copy()
        df_team.loc[home_mask, "home_win_pct_last10"] = (
            home_sub["win"].rolling(10, min_periods=1).mean().shift(1).values
        )
        df_team.loc[home_mask, "home_pts_for_last10"] = (
            home_sub["pts_for"].rolling(10, min_periods=1).mean().shift(1).values
        )
        df_team.loc[home_mask, "home_pts_against_last10"] = (
            home_sub["pts_against"].rolling(10, min_periods=1).mean().shift(1).values
        )

    # -----------------------
    # Away-only rolling last10 (computed only on away games, shifted within that subset)
    df_team["away_win_pct_last10"] = np.nan
    df_team["away_pts_for_last10"] = np.nan
    df_team["away_pts_against_last10"] = np.nan

    away_mask = df_team["is_home"] == False
    if away_mask.any():
        away_sub = df_team.loc[away_mask].copy()
        df_team.loc[away_mask, "away_win_pct_last10"] = (
            away_sub["win"].rolling(10, min_periods=1).mean().shift(1).values
        )
        df_team.loc[away_mask, "away_pts_for_last10"] = (
            away_sub["pts_for"].rolling(10, min_periods=1).mean().shift(1).values
        )
        df_team.loc[away_mask, "away_pts_against_last10"] = (
            away_sub["pts_against"].rolling(10, min_periods=1).mean().shift(1).values
        )

    # -----------------------
    # Season-to-date win% (STRICTLY before current game; no leakage)
    # games_before: 0 for first game of season, 1 for second, ...
    games_before = df_team.groupby("season").cumcount()

    # wins_before: cumulative wins excluding current game
    wins_before = df_team.groupby("season")["win"].cumsum() - df_team["win"]

    df_team["season_win_pct_to_date"] = np.where(
        games_before > 0,
        wins_before / games_before,
        0.5
    )

    # -----------------------
    # Rest days and B2B (based on previous game date for the same team)
    prev_date = df_team["game_date"].shift(1)
    rest = (df_team["game_date"] - prev_date).dt.days - 1
    rest = rest.fillna(3).clip(lower=0).astype(int)

    df_team["rest_days"] = rest
    df_team["b2b"] = (df_team["rest_days"] == 0).astype(int)

    return df_team


def pair_games(team_hist: pd.DataFrame) -> pd.DataFrame:
    df = team_hist[team_hist["season"].isin(TRAIN_SEASONS)].copy()

    # compute per-team features
    df = df.sort_values(["team_id","season","game_date","nba_game_id"]).copy()
    df = df.groupby("team_id", group_keys=False).apply(add_features_for_team)

    home = df[df["is_home"]].copy()
    away = df[~df["is_home"]].copy()

    merged = home.merge(
        away,
        on=["nba_game_id","game_date","season"],
        suffixes=("_home","_away"),
        how="inner"
    )

    # target
    merged["home_win"] = (merged["pts_for_home"] > merged["pts_for_away"]).astype(int)

    # net rating last10 (overall)
    merged["net_last10_home"] = merged["pts_for_last10_home"] - merged["pts_against_last10_home"]
    merged["net_last10_away"] = merged["pts_for_last10_away"] - merged["pts_against_last10_away"]

    out = pd.DataFrame({
        "nba_game_id": merged["nba_game_id"].astype(str),
        "game_date": merged["game_date"].dt.date.astype(str),
        "season": merged["season"].astype(str),

        "home_team_id": merged["team_id_home"].astype(str),
        "away_team_id": merged["team_id_away"].astype(str),
        "home_team_abbr": merged["team_abbr_home"].astype(str),
        "away_team_abbr": merged["team_abbr_away"].astype(str),

        "home_win": merged["home_win"].astype(int),

        # existing overall last10
        "home_win_pct_last10": merged["win_pct_last10_home"].fillna(0.5),
        "away_win_pct_last10": merged["win_pct_last10_away"].fillna(0.5),
        "home_pts_for_last10": merged["pts_for_last10_home"].fillna(110.0),
        "away_pts_for_last10": merged["pts_for_last10_away"].fillna(110.0),
        "home_pts_against_last10": merged["pts_against_last10_home"].fillna(110.0),
        "away_pts_against_last10": merged["pts_against_last10_away"].fillna(110.0),

        # new: net
        "home_net_last10": merged["net_last10_home"].fillna(0.0),
        "away_net_last10": merged["net_last10_away"].fillna(0.0),

        # new: home-only for home team
        "home_home_win_pct_last10": merged["home_win_pct_last10_home"].fillna(0.5),
        "home_home_pts_for_last10": merged["home_pts_for_last10_home"].fillna(110.0),
        "home_home_pts_against_last10": merged["home_pts_against_last10_home"].fillna(110.0),

        # new: away-only for away team
        "away_away_win_pct_last10": merged["away_win_pct_last10_away"].fillna(0.5),
        "away_away_pts_for_last10": merged["away_pts_for_last10_away"].fillna(110.0),
        "away_away_pts_against_last10": merged["away_pts_against_last10_away"].fillna(110.0),

        # new: season-to-date win%
        "home_season_win_pct_to_date": merged["season_win_pct_to_date_home"].fillna(0.5),
        "away_season_win_pct_to_date": merged["season_win_pct_to_date_away"].fillna(0.5),

        # rest/b2b
        "home_rest_days": merged["rest_days_home"].astype(int),
        "away_rest_days": merged["rest_days_away"].astype(int),
        "home_b2b": merged["b2b_home"].astype(int),
        "away_b2b": merged["b2b_away"].astype(int),
    })

    return out

def upsert_training(df_out: pd.DataFrame):
    rows = df_out.to_dict(orient="records")
    print("TrainingDataset_v2 rows:", len(rows))

    BATCH = 500
    for i in range(0, len(rows), BATCH):
        chunk = rows[i:i+BATCH]
        supabase.table("TrainingDataset_v2").upsert(chunk, on_conflict="nba_game_id").execute()
        print(f"Upserted {min(i+BATCH, len(rows))}/{len(rows)}")
        time.sleep(0.05)

def main():
    logs = fetch_paged(
        "TeamGameLogs",
        "nba_game_id,game_date,season,team_id,team_abbr,is_home,wl,pts",
        page_size=1000
    )
    print("TeamGameLogs fetched:", len(logs))

    team_hist = build_team_history(logs)
    print("Team history rows:", len(team_hist))

    out = pair_games(team_hist)
    print("TrainingDataset_v2 paired games:", len(out))
    print(out.head(3))

    upsert_training(out)
    print("Done ✅")

if __name__ == "__main__":
    main()
