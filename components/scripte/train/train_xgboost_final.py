import os
import time
import argparse
import numpy as np
import pandas as pd
from supabase import create_client
import joblib

from xgboost import XGBClassifier
from sklearn.metrics import log_loss, brier_score_loss, roc_auc_score, accuracy_score

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"

TABLE = "TrainingDataset_v3"

FEATURES_V3 = [
    "home_win_pct_last10","away_win_pct_last10",
    "home_pts_for_last10","away_pts_for_last10",
    "home_pts_against_last10","away_pts_against_last10",
    "home_net_last10","away_net_last10",
    "home_home_win_pct_last10","home_home_pts_for_last10","home_home_pts_against_last10",
    "away_away_win_pct_last10","away_away_pts_for_last10","away_away_pts_against_last10",
    "home_season_win_pct_to_date","away_season_win_pct_to_date",
    "home_rest_days","away_rest_days","home_b2b","away_b2b",
    "home_top3_missing","away_top3_missing",
    "home_top5_missing","away_top5_missing",
]

def fetch_all(sb, table: str, cols="*", page_size=1000):
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        resp = sb.table(table).select(cols).range(start, end).execute()
        data = resp.data or []
        all_rows.extend(data)
        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)
    return pd.DataFrame(all_rows)

def time_split(df: pd.DataFrame, date_col="game_date", test_frac=0.15):
    df = df.sort_values([date_col, "nba_game_id"]).copy()
    n = len(df)
    n_test = int(round(n * test_frac))
    n_train = n - n_test
    train = df.iloc[:n_train].copy()
    test = df.iloc[n_train:].copy()
    return train, test

def calc_metrics(y_true, p):
    p = np.clip(p, 1e-6, 1-1e-6)
    pred = (p >= 0.5).astype(int)
    return {
        "logloss": float(log_loss(y_true, np.column_stack([1-p, p]))),
        "brier": float(brier_score_loss(y_true, p)),
        "auc": float(roc_auc_score(y_true, p)),
        "accuracy": float(accuracy_score(y_true, pred)),
    }

def log_modelrun(sb, model_name, run_tag, n_train, n_test, m_test, train_seasons, feature_set, notes=""):
    payload = {
        "model_name": model_name,
        "run_tag": run_tag,
        "n_train": int(n_train),
        "n_test": int(n_test),
        "logloss": float(m_test["logloss"]),
        "brier": float(m_test["brier"]),
        "auc": float(m_test["auc"]),
        "accuracy": float(m_test["accuracy"]),
        "train_seasons": str(train_seasons),
        "feature_set": str(feature_set),
        "notes": str(notes),
    }
    sb.table("ModelRuns").insert(payload).execute()
    print("Logged ModelRun ✅")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out_path", default="models/xgb_moneyline_final.joblib")
    ap.add_argument("--model_name", default="xgb_moneyline_final")
    ap.add_argument("--run_tag", default="final")
    ap.add_argument("--test_frac", type=float, default=0.15)
    ap.add_argument("--max_rows", type=int, default=0)
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.out_path), exist_ok=True)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    df = fetch_all(sb, TABLE)
    print("Rows fetched:", len(df))
    if df.empty:
        print("❌ Empty dataset.")
        return

    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["nba_game_id","game_date","home_win"])
    df["home_win"] = pd.to_numeric(df["home_win"], errors="coerce").astype(int)

    keep = ["nba_game_id","game_date","season","home_win"] + FEATURES_V3
    df = df[[c for c in keep if c in df.columns]].copy()

    for c in FEATURES_V3:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=FEATURES_V3)

    if args.max_rows and args.max_rows > 0:
        df = df.sort_values(["game_date","nba_game_id"]).head(args.max_rows).copy()

    train, test = time_split(df, "game_date", test_frac=args.test_frac)

    print("=== XGBoost FINAL (v3 features) ===")
    print("n_train:", len(train))
    print("n_test:", len(test))

    X_train = train[FEATURES_V3].values
    y_train = train["home_win"].values
    X_test = test[FEATURES_V3].values
    y_test = test["home_win"].values

    model = XGBClassifier(
        n_estimators=600,
        max_depth=4,
        learning_rate=0.03,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        reg_alpha=0.0,
        min_child_weight=1.0,
        gamma=0.0,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=4,
        random_state=42,
    )

    model.fit(X_train, y_train)

    p_test = model.predict_proba(X_test)[:, 1]
    m_test = calc_metrics(y_test, p_test)
    print("TEST:", m_test)

    # print top importances
    try:
        imp = pd.Series(model.feature_importances_, index=FEATURES_V3).sort_values(ascending=False)
        print("\nTop feature importances:")
        print(imp.head(15))
    except Exception:
        pass


    joblib.dump(model, args.out_path)
    print("Saved model:", args.out_path)

    train_seasons = ", ".join(sorted(train["season"].dropna().astype(str).unique()))
    feature_set = "v3_injuries_proxy"
    notes = f"Saved: {args.out_path} | features={len(FEATURES_V3)} | xgb n_estimators=600 depth=4 lr=0.03"

    log_modelrun(
        sb,
        model_name=args.model_name,
        run_tag=args.run_tag,
        n_train=len(train),
        n_test=len(test),
        m_test=m_test,
        train_seasons=train_seasons,
        feature_set=feature_set,
        notes=notes
    )

if __name__ == "__main__":
    main()
