import time
import numpy as np
import pandas as pd
from supabase import create_client

from sklearn.metrics import log_loss, brier_score_loss, roc_auc_score, accuracy_score
from xgboost import XGBClassifier
import joblib

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

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
TARGET = "home_win"

def fetch_training(page_size=1000):
    all_rows = []
    start = 0
    cols = "nba_game_id,game_date,season," + ",".join(FEATURES) + "," + TARGET

    while True:
        end = start + page_size - 1
        resp = supabase.table("TrainingDataset").select(cols).range(start, end).execute()
        data = resp.data or []
        all_rows.extend(data)
        print(f"Fetched {start}-{end}: got {len(data)} (total {len(all_rows)})")
        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)

    df = pd.DataFrame(all_rows)
    return df

def time_split(df: pd.DataFrame, frac_train=0.85):
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date"]).sort_values("game_date")
    split_idx = int(len(df) * frac_train)
    return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()

def main():
    df = fetch_training()
    print("Rows:", len(df))

    df = df.dropna(subset=FEATURES + [TARGET]).copy()

    train_df, test_df = time_split(df, 0.85)
    X_train = train_df[FEATURES].astype(float).values
    y_train = train_df[TARGET].astype(int).values
    X_test = test_df[FEATURES].astype(float).values
    y_test = test_df[TARGET].astype(int).values

    # XGBoost baseline config (solid starting point)
    model = XGBClassifier(
        n_estimators=600,
        learning_rate=0.03,
        max_depth=4,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_lambda=1.0,
        min_child_weight=2,
        gamma=0.0,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=-1,
        random_state=42
    )

    model.fit(X_train, y_train)

    p_test = model.predict_proba(X_test)[:, 1]
    pred_test = (p_test >= 0.5).astype(int)

    metrics = {
        "n_train": int(len(train_df)),
        "n_test": int(len(test_df)),
        "logloss": float(log_loss(y_test, p_test)),
        "brier": float(brier_score_loss(y_test, p_test)),
        "auc": float(roc_auc_score(y_test, p_test)),
        "accuracy": float(accuracy_score(y_test, pred_test)),
    }

    print("=== XGBoost v1 ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")

    # Feature importance (gain-based in XGB)
    importances = model.feature_importances_
    imp = pd.Series(importances, index=FEATURES).sort_values(ascending=False)
    print("\nFeature importance:")
    print(imp)

    joblib.dump(model, "xgb_moneyline_v1.joblib")
    print("Saved model: xgb_moneyline_v1.joblib")

if __name__ == "__main__":
    main()
