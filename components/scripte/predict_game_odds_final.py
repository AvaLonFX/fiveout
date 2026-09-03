from pipeline_config import get_supabase as pipeline_database, season as configured_season
import argparse
import time
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import joblib
from supabase import create_client

# ----------------- PLACEHOLDERS (STAVI SVOJE) -----------------
# ---------------------------------------------------------------

# v3 feature columns (mora biti identično trainu)
FEATURE_COLS_V3 = [
    "home_win_pct_last10",
    "away_win_pct_last10",
    "home_pts_for_last10",
    "away_pts_for_last10",
    "home_pts_against_last10",
    "away_pts_against_last10",
    "home_net_last10",
    "away_net_last10",
    "home_home_win_pct_last10",
    "home_home_pts_for_last10",
    "home_home_pts_against_last10",
    "away_away_win_pct_last10",
    "away_away_pts_for_last10",
    "away_away_pts_against_last10",
    "home_season_win_pct_to_date",
    "away_season_win_pct_to_date",
    "home_rest_days",
    "away_rest_days",
    "home_b2b",
    "away_b2b",
    "home_top3_missing",
    "away_top3_missing",
    "home_top5_missing",
    "away_top5_missing",
]

def sb_client():
    return pipeline_database()

def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()

def parse_start_time_utc(start_time_text: str):
    # startTime je text (ISO). Best-effort parse.
    if not start_time_text:
        return None
    dt = pd.to_datetime(start_time_text, errors="coerce", utc=True)
    if pd.isna(dt):
        return None
    # supabase timestamptz ok sa isoformat
    return dt.to_pydatetime().isoformat()

def fetch_upcoming_games(sb, limit: int):
    resp = (
        sb.table("GameSchedule")
        .select("nba_game_id,date,startTime,home_team_id,away_team_id,homeTeam,awayTeam")
        .gt("startTime", utc_now_iso())
        .lt("startTime", (pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=7)).isoformat())
        .like("nba_game_id", "002%")
        .order("startTime", desc=False)
        .limit(limit)
        .execute()
    )
    return resp.data or []

def fetch_team_gamelogs_before(sb, team_id: str, before_date: str, limit_rows: int = 200):
    """
    Pull recent games before a date for a team (Regular Season only).
    We use game_date (date) from TeamGameLogs.
    """
    resp = (
        sb.table("TeamGameLogs")
        .select("nba_game_id,game_date,team_id,team_abbr,is_home,wl,pts,season_type")
        .eq("team_id", str(team_id))
        .eq("season_type", "Regular Season")
        .lt("game_date", str(before_date))
        .order("game_date", desc=True)
        .limit(limit_rows)
        .execute()
    )
    rows = resp.data or []
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df["pts"] = pd.to_numeric(df["pts"], errors="coerce")
    df["is_home"] = df["is_home"].astype(bool)
    df["wl"] = df["wl"].astype(str)
    return df

def compute_lastN_features(df_team: pd.DataFrame, N: int = 10, home_away_filter=None):
    """
    df_team is desc by game_date (latest first).
    - wl: "W"/"L"
    - pts: points scored by the team
    - need pts allowed => we don't have directly, so we must infer from opponent row?
      BUT you already stored pts_against_last10 in TrainingDataset_v3, meaning you had it somewhere.
      In TeamGameLogs screenshot you don't show pts_against.
      If you DO have pts_against column, add it here.
    """
    if df_team is None or df_team.empty:
        return None

    d = df_team.copy()

    if home_away_filter is not None:
        d = d[d["is_home"] == bool(home_away_filter)]

    d = d.sort_values("game_date", ascending=False).head(N)

    if d.empty:
        return None

    # win pct
    wins = (d["wl"].str.upper() == "W").sum()
    win_pct = float(wins) / float(len(d))

    # pts_for
    pts_for = float(np.nanmean(d["pts"].values)) if len(d["pts"]) else np.nan

    # pts_against:
    # -> Ako nemaš kolonu pts_against u TeamGameLogs, moramo je joinat (isti nba_game_id, druga ekipa).
    # Ovdje ćemo vratiti None i kasnije popuniti preko join-a koji radimo u compute_team_features().
    return {
        "win_pct": win_pct,
        "pts_for": pts_for,
        "n": len(d),
        "game_ids": list(d["nba_game_id"].astype(str).values),
    }

def add_pts_against_from_opponent(team_logs: pd.DataFrame, all_logs_by_game: pd.DataFrame):
    """
    For each row in team_logs, find opponent row with same nba_game_id and take opponent pts as pts_against.
    """
    if team_logs.empty:
        return team_logs

    # build map: game_id -> {team_id: pts}
    # use all_logs_by_game containing rows for both teams
    m = {}
    for _, r in all_logs_by_game.iterrows():
        gid = str(r["nba_game_id"])
        tid = str(r["team_id"])
        pts = r["pts"]
        m.setdefault(gid, {})[tid] = pts

    pts_against = []
    for _, r in team_logs.iterrows():
        gid = str(r["nba_game_id"])
        tid = str(r["team_id"])
        d = m.get(gid, {})
        # opponent is the other team in that game
        opp_pts = None
        for otid, opt in d.items():
            if otid != tid:
                opp_pts = opt
                break
        pts_against.append(opp_pts)

    out = team_logs.copy()
    out["pts_against"] = pd.to_numeric(pts_against, errors="coerce")
    return out

def compute_rest_and_b2b(df_team_desc: pd.DataFrame, game_date: str):
    """
    rest_days = (game_date - last_game_date).days - 1
    b2b = 1 if (game_date - last_game_date).days == 1 else 0
    """
    if df_team_desc is None or df_team_desc.empty:
        return (None, None)

    last_dt = df_team_desc.sort_values("game_date", ascending=False).iloc[0]["game_date"]
    gd = pd.to_datetime(game_date, errors="coerce")
    if pd.isna(last_dt) or pd.isna(gd):
        return (None, None)

    diff_days = int((gd.date() - last_dt.date()).days)
    b2b = 1 if diff_days == 1 else 0
    rest_days = max(0, diff_days - 1)
    return (rest_days, b2b)

def fetch_all_logs_for_games(sb, game_ids: list[str]):
    if not game_ids:
        return pd.DataFrame()
    resp = (
        sb.table("TeamGameLogs")
        .select("nba_game_id,game_date,team_id,team_abbr,is_home,wl,pts,season_type")
        .in_("nba_game_id", list(game_ids))
        .eq("season_type", "Regular Season")
        .execute()
    )
    rows = resp.data or []
    df = pd.DataFrame(rows)
    if df.empty:
        return df
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df["pts"] = pd.to_numeric(df["pts"], errors="coerce")
    df["is_home"] = df["is_home"].astype(bool)
    df["wl"] = df["wl"].astype(str)
    return df

def compute_team_features(sb, team_id: str, game_date: str):
    """
    Returns dict with all needed features for one team before a game_date.
    """
    # pull more than 10 to allow splits & season-to-date
    df_desc = fetch_team_gamelogs_before(sb, team_id, game_date, limit_rows=250)
    if df_desc.empty:
        return None

    # last10 base info (ids)
    base10 = compute_lastN_features(df_desc, N=10, home_away_filter=None)
    home10 = compute_lastN_features(df_desc, N=10, home_away_filter=True)
    away10 = compute_lastN_features(df_desc, N=10, home_away_filter=False)

    if base10 is None:
        return None

    # we need pts_against for last10 and splits => join using game_ids
    need_game_ids = set(base10["game_ids"])
    if home10: need_game_ids |= set(home10["game_ids"])
    if away10: need_game_ids |= set(away10["game_ids"])

    all_logs = fetch_all_logs_for_games(sb, list(need_game_ids))
    df_last = df_desc[df_desc["nba_game_id"].astype(str).isin(list(need_game_ids))].copy()
    df_last["team_id"] = df_last["team_id"].astype(str)

    df_last = add_pts_against_from_opponent(df_last, all_logs)

    # helper to compute against/net for a subset of game_ids
    def pts_against_and_net(game_ids):
        d = df_last[df_last["nba_game_id"].astype(str).isin(list(game_ids))].copy()
        if d.empty:
            return (np.nan, np.nan)
        pa = float(np.nanmean(d["pts_against"].values)) if "pts_against" in d.columns else np.nan
        pf = float(np.nanmean(d["pts"].values))
        net = pf - pa if (not np.isnan(pf) and not np.isnan(pa)) else np.nan
        return (pa, net)

    base_pa, base_net = pts_against_and_net(base10["game_ids"])
    home_pa, _home_net = (np.nan, np.nan)
    away_pa, _away_net = (np.nan, np.nan)
    if home10:
        home_pa, _ = pts_against_and_net(home10["game_ids"])
    if away10:
        away_pa, _ = pts_against_and_net(away10["game_ids"])

    # season-to-date win pct: all games before date
    wins_total = (df_desc["wl"].str.upper() == "W").sum()
    season_win_pct = float(wins_total) / float(len(df_desc)) if len(df_desc) else None

    rest_days, b2b = compute_rest_and_b2b(df_desc, game_date)

    return {
        "win_pct_last10": base10["win_pct"],
        "pts_for_last10": base10["pts_for"],
        "pts_against_last10": base_pa,
        "net_last10": base_net,
        "home_win_pct_last10": (home10["win_pct"] if home10 else None),
        "home_pts_for_last10": (home10["pts_for"] if home10 else None),
        "home_pts_against_last10": (home_pa if home10 else None),
        "away_win_pct_last10": (away10["win_pct"] if away10 else None),
        "away_pts_for_last10": (away10["pts_for"] if away10 else None),
        "away_pts_against_last10": (away_pa if away10 else None),
        "season_win_pct_to_date": season_win_pct,
        "rest_days": rest_days,
        "b2b": b2b,
        "n_games_season": int(len(df_desc)),
    }

def fetch_team_availability(sb, report_date: str, team_id: str):
    resp = (
        sb.table("TeamAvailability")
        .select("missing_top3_expected,missing_top5_expected")
        .eq("report_date", str(report_date))
        .eq("team_id", str(team_id))
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        return {"missing_top3_expected": None, "missing_top5_expected": None}
    return rows[0]

def build_game_row(sb, g: dict):
    """
    Returns row with identifiers + all FEATURE_COLS_V3 if possible, else None.
    """
    nba_game_id = str(g.get("nba_game_id"))
    home_team_id = str(g.get("home_team_id"))
    away_team_id = str(g.get("away_team_id"))
    home_abbr = str(g.get("homeTeam") or "")
    away_abbr = str(g.get("awayTeam") or "")

    # report_date = date of game (YYYY-MM-DD)
    dt = pd.to_datetime(g.get("date") or g.get("startTime"), errors="coerce", utc=True)
    if pd.isna(dt):
        return None
    report_date = str(dt.date())

    # team features
    home_f = compute_team_features(sb, home_team_id, report_date)
    away_f = compute_team_features(sb, away_team_id, report_date)
    if home_f is None or away_f is None:
        print(f"⚠️ skip game {nba_game_id}: missing team history (home_ok={home_f is not None} away_ok={away_f is not None})")
        return None

    # availability (missing top3/top5)
    ha = fetch_team_availability(sb, report_date, home_team_id)
    aa = fetch_team_availability(sb, report_date, away_team_id)

    row = {
        "nba_game_id": nba_game_id,
        "game_date": report_date,
        "start_time_utc": parse_start_time_utc(g.get("startTime")),
        "home_team_id": home_team_id,
        "away_team_id": away_team_id,
        "home_team_abbr": home_abbr,
        "away_team_abbr": away_abbr,

        # v3 features:
        "home_win_pct_last10": home_f["win_pct_last10"],
        "away_win_pct_last10": away_f["win_pct_last10"],
        "home_pts_for_last10": home_f["pts_for_last10"],
        "away_pts_for_last10": away_f["pts_for_last10"],
        "home_pts_against_last10": home_f["pts_against_last10"],
        "away_pts_against_last10": away_f["pts_against_last10"],
        "home_net_last10": home_f["net_last10"],
        "away_net_last10": away_f["net_last10"],
        "home_home_win_pct_last10": home_f["home_win_pct_last10"],
        "home_home_pts_for_last10": home_f["home_pts_for_last10"],
        "home_home_pts_against_last10": home_f["home_pts_against_last10"],
        "away_away_win_pct_last10": away_f["away_win_pct_last10"],
        "away_away_pts_for_last10": away_f["away_pts_for_last10"],
        "away_away_pts_against_last10": away_f["away_pts_against_last10"],
        "home_season_win_pct_to_date": home_f["season_win_pct_to_date"],
        "away_season_win_pct_to_date": away_f["season_win_pct_to_date"],
        "home_rest_days": home_f["rest_days"],
        "away_rest_days": away_f["rest_days"],
        "home_b2b": home_f["b2b"],
        "away_b2b": away_f["b2b"],
        "home_top3_missing": ha.get("missing_top3_expected"),
        "away_top3_missing": aa.get("missing_top3_expected"),
        "home_top5_missing": ha.get("missing_top5_expected"),
        "away_top5_missing": aa.get("missing_top5_expected"),
    }

    return row

def predict_and_write(sb, model_path: str, model_name: str, rows: list[dict], margin: float):
    if not rows:
        print(f"⚠️ No rows to predict for {model_name}")
        return

    model = joblib.load(model_path)

    df = pd.DataFrame(rows).copy()

    # ensure numeric
    for c in FEATURE_COLS_V3:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # simple NA handling: fill with column medians
    # (isto si vjerojatno radio u train skripti; ako želiš 1:1, reci i uskladimo)
    fill_vals = df[FEATURE_COLS_V3].median(numeric_only=True)
    X = df[FEATURE_COLS_V3].fillna(fill_vals)

    # predict proba home win
    if hasattr(model, "predict_proba"):
        p_home = model.predict_proba(X)[:, 1]
    else:
        # fallback (rijetko)
        p_home = model.predict(X)

    if not np.isfinite(p_home).all():
        raise RuntimeError("Model returned non-finite probabilities")
    p_home = np.clip(p_home, 1e-6, 1 - 1e-6)
    p_away = 1.0 - p_home

    # apply margin (overround)
    overround = 1.0 + float(margin)
    p_home_adj = p_home * overround
    p_away_adj = p_away * overround

    odds_home = 1.0 / p_home_adj
    odds_away = 1.0 / p_away_adj

    out = []
    for i in range(len(df)):
        out.append({
            "nba_game_id": df.loc[i, "nba_game_id"],
            "game_date": df.loc[i, "game_date"],
            "start_time_utc": df.loc[i, "start_time_utc"],
            "home_team_id": df.loc[i, "home_team_id"],
            "away_team_id": df.loc[i, "away_team_id"],
            "home_team_abbr": df.loc[i, "home_team_abbr"],
            "away_team_abbr": df.loc[i, "away_team_abbr"],
            "p_home": float(p_home[i]),
            "p_away": float(p_away[i]),
            "odds_home_decimal": float(odds_home[i]),
            "odds_away_decimal": float(odds_away[i]),
            "margin": float(margin),
            "model_name": model_name,
        })

    sb.table("GameOdds").upsert(out, on_conflict="nba_game_id,model_name").execute()
    print(f"Upserted {len(out)} predictions for {model_name}")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--margin", type=float, default=0.05)
    ap.add_argument("--lr_path", default="models/lr_moneyline_final.joblib")
    ap.add_argument("--xgb_path", default="models/xgb_moneyline_final.joblib")
    ap.add_argument("--sleep", type=float, default=0.05)
    args = ap.parse_args()

    sb = sb_client()

    games = fetch_upcoming_games(sb, limit=args.limit)
    print("Upcoming games:", len(games))

    rows = []
    for idx, g in enumerate(games, start=1):
        r = build_game_row(sb, g)
        if r is None:
            continue
        rows.append(r)

        if idx % 10 == 0:
            print(f"Built rows: {len(rows)}/{idx}")
        time.sleep(args.sleep)

    print("Ready for prediction rows:", len(rows))

    # quick debug preview
    if rows:
        sample = pd.DataFrame(rows).head(3)[["nba_game_id","game_date","home_team_abbr","away_team_abbr","home_top5_missing","away_top5_missing"]]
        print("Sample rows:\n", sample.to_string(index=False))

    # predict + write
    predict_and_write(sb, args.lr_path, "lr_moneyline_final", rows, args.margin)
    predict_and_write(sb, args.xgb_path, "xgb_moneyline_final", rows, args.margin)

if __name__ == "__main__":
    main()
