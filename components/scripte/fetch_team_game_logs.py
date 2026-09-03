from pipeline_config import get_supabase as pipeline_database, season as configured_season
import time
import pandas as pd
from nba_api.stats.endpoints import leaguegamefinder
from supabase import create_client

# -----------------------
# CONFIG
# -----------------------

SEASONS = [configured_season()]
SEASON_TYPE = "Regular Season"

BATCH_SIZE = 500
SLEEP_BETWEEN_BATCHES = 0.25

# NBA API zna rate-limitat
SLEEP_BETWEEN_SEASONS = 1.5
MAX_RETRIES = 4

supabase = pipeline_database()

def fetch_season(season: str) -> pd.DataFrame:
    """Fetch season data with basic retry/backoff."""
    last_err = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            print(f"  -> Fetching {season} (attempt {attempt}/{MAX_RETRIES})")
            lgf = leaguegamefinder.LeagueGameFinder(
                season_nullable=season,
                league_id_nullable="00",
                timeout=30,
                season_type_nullable=SEASON_TYPE
            )
            df = lgf.get_data_frames()[0]
            return df
        except Exception as e:
            last_err = e
            wait = 2 ** attempt
            print(f"  ⚠️ fetch failed: {e}. retry in {wait}s")
            time.sleep(wait)
    raise last_err

def clean_df(df: pd.DataFrame, season: str) -> pd.DataFrame:
    """Clean and filter rows so DB constraints won't fail."""
    if df is None or df.empty:
        return pd.DataFrame()

    # Ensure columns exist
    needed = ["GAME_ID", "GAME_DATE", "TEAM_ID", "TEAM_ABBREVIATION", "MATCHUP", "WL", "PTS"]
    for col in needed:
        if col not in df.columns:
            df[col] = pd.NA

    # Convert date safely
    df["GAME_DATE"] = pd.to_datetime(df["GAME_DATE"], errors="coerce").dt.date

    # Home/away
    df["IS_HOME"] = df["MATCHUP"].astype(str).str.contains("vs", na=False)

    # Coerce IDs to string, but keep NaN as NA for filtering
    df["GAME_ID"] = df["GAME_ID"].astype("string")
    df["TEAM_ID"] = df["TEAM_ID"].astype("string")
    df["TEAM_ABBREVIATION"] = df["TEAM_ABBREVIATION"].astype("string")

    # Filter out broken rows that would violate NOT NULL
    before = len(df)
    df = df.dropna(subset=["GAME_ID", "TEAM_ID", "TEAM_ABBREVIATION", "GAME_DATE", "WL"])
    # Also remove empty strings
    df = df[
        (df["GAME_ID"].str.len() > 0) &
        (df["TEAM_ID"].str.len() > 0) &
        (df["TEAM_ABBREVIATION"].str.len() > 0)
    ]
    after = len(df)
    if after != before:
        print(f"  🧹 Cleaned {before - after} broken rows (kept {after})")

    # Keep only relevant columns
    out = df[[
        "GAME_ID",
        "GAME_DATE",
        "TEAM_ID",
        "TEAM_ABBREVIATION",
        "IS_HOME",
        "WL",
        "PTS",
        "MATCHUP"
    ]].copy()

    out["season"] = season
    out["season_type"] = SEASON_TYPE

    return out

def upsert_rows(out: pd.DataFrame):
    if out.empty:
        print("  (no rows to upsert)")
        return

    rows = []
    for _, r in out.iterrows():
        # PTS might be NA
        pts_val = None
        if pd.notna(r["PTS"]):
            try:
                pts_val = int(r["PTS"])
            except Exception:
                pts_val = None

        rows.append({
            "nba_game_id": str(r["GAME_ID"]),
            "game_date": str(r["GAME_DATE"]),
            "team_id": str(r["TEAM_ID"]),
            "team_abbr": str(r["TEAM_ABBREVIATION"]),
            "is_home": bool(r["IS_HOME"]),
            "wl": str(r["WL"]),
            "pts": pts_val,
            "matchup": None if pd.isna(r["MATCHUP"]) else str(r["MATCHUP"]),
            "season": str(r["season"]),
            "season_type": str(r["season_type"])
        })

    print(f"  Prepared {len(rows)} rows, upserting...")

    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        supabase.table("TeamGameLogs").upsert(
            chunk,
            on_conflict="nba_game_id,team_id"
        ).execute()

        print(f"    Upserted {min(i + len(chunk), len(rows))}/{len(rows)}")
        time.sleep(SLEEP_BETWEEN_BATCHES)

def main():
    print("Fetching configured season from NBA API ...")

    total = 0
    for season in SEASONS:
        df = fetch_season(season)
        print(f"Season {season}: raw rows = {len(df)}")

        out = clean_df(df, season)
        print(f"Season {season}: cleaned rows = {len(out)}")

        upsert_rows(out)
        total += len(out)

        time.sleep(SLEEP_BETWEEN_SEASONS)

    print(f"Done ✅ Total cleaned rows processed: {total}")

if __name__ == "__main__":
    main()
