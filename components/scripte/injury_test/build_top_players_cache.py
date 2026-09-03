import json
import time
import argparse
import pandas as pd

from nba_api.stats.endpoints import leaguedashplayerstats

def fetch_top_players_by_min(season: str, season_type: str = "Regular Season", top_n: int = 5):
    """
    Returns dict: { team_id(str): [player_id(str), ...] } (top_n by MIN)
    """
    resp = leaguedashplayerstats.LeagueDashPlayerStats(
        season=season,
        season_type_all_star=season_type,
        per_mode_detailed="PerGame"
    )
    df = resp.get_data_frames()[0]

    # columns we need
    # TEAM_ID, PLAYER_ID, MIN
    df = df[["TEAM_ID", "PLAYER_ID", "MIN"]].copy()
    df["TEAM_ID"] = df["TEAM_ID"].astype(str)
    df["PLAYER_ID"] = df["PLAYER_ID"].astype(str)
    df["MIN"] = pd.to_numeric(df["MIN"], errors="coerce").fillna(0.0)

    top = (
        df.sort_values(["TEAM_ID", "MIN"], ascending=[True, False])
          .groupby("TEAM_ID")
          .head(top_n)
    )

    out = {}
    for team_id, g in top.groupby("TEAM_ID"):
        out[team_id] = g["PLAYER_ID"].tolist()

    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seasons", nargs="+", required=True, help='e.g. 2019-20 2020-21 ...')
    ap.add_argument("--season_type", default="Regular Season")
    ap.add_argument("--top_n", type=int, default=5)
    ap.add_argument("--out", default="top_players_by_min_cache.json")
    args = ap.parse_args()

    cache = {}
    for s in args.seasons:
        print(f"Fetching top players by MIN for season {s} ...")
        try:
            cache[s] = fetch_top_players_by_min(s, args.season_type, args.top_n)
            teams = len(cache[s].keys())
            print(f"  -> teams: {teams} (should be 30)")
        except Exception as e:
            print(f"❌ Failed season {s}: {e}")
        time.sleep(0.6)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2)

    print(f"✅ Saved: {args.out}")

if __name__ == "__main__":
    main()
