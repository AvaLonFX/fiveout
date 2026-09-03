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
    "home_win_pct_last10","away_win_pct_last10",
    "home_pts_for_last10","away_pts_for_last10",
    "home_pts_against_last10","away_pts_against_last10",
    "home_net_last10","away_net_last10",
    "home_home_win_pct_last10","home_home_pts_for_last10","home_home_pts_against_last10",
    "away_away_win_pct_last10","away_away_pts_for_last10","away_away_pts_against_last10",
    "home_season_win_pct_to_date","away_season_win_pct_to_date",
    "home_rest_days","away_rest_days","home_b2b","away_b2b",
]
TARGET = "home_win"

MODEL_NAME = "xgb_moneyline_v3"
MODEL_PATH = "xgb_moneyline_v3.joblib"

def fetch_paged(table: str, cols: str, page_size=1000):
    all_rows = []
    start = 0
    while True:
        end = start + page_size - 1
        resp = supabase.table(table).select(cols).range(start, end).execute()
        data = resp.data or []
        all_rows.extend(data)
        print(f"Fetched {start}-{end}: got {len(data)} (total {len(all_rows)})")
        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)
    return pd.DataFrame(all_rows)

def time_split_3(df: pd.DataFrame, train_frac=0.70, val_frac=0.15):
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date"]).sort_values("game_date").reset_index(drop=True)
    n = len(df)
    i_train = int(n * train_frac)
    i_val = int(n * (train_frac + val_frac))
    return df.iloc[:i_train].copy(), df.iloc[i_train:i_val].copy(), df.iloc[i_val:].copy()

def metrics(y_true, p):
    pred = (p >= 0.5).astype(int)
    return {
        "logloss": float(log_loss(y_true, p)),
        "brier": float(brier_score_loss(y_true, p)),
        "auc": float(roc_auc_score(y_true, p)),
        "accuracy": float(accuracy_score(y_true, pred)),
    }

def main():
    cols = "nba_game_id,game_date,season," + ",".join(FEATURES) + "," + TARGET
    df = fetch_paged("TrainingDataset_v2", cols)
    print("Rows:", len(df))

    df = df.dropna(subset=FEATURES + [TARGET]).copy()

    train_df, val_df, test_df = time_split_3(df, 0.70, 0.15)

    X_train = train_df[FEATURES].astype(float).values
    y_train = train_df[TARGET].astype(int).values

    X_val = val_df[FEATURES].astype(float).values
    y_val = val_df[TARGET].astype(int).values

    X_test = test_df[FEATURES].astype(float).values
    y_test = test_df[TARGET].astype(int).values

    # NOTE: no early_stopping_rounds because your xgboost wrapper doesn't support it.
    # We'll use a conservative config to reduce overfitting.
    model = XGBClassifier(
        n_estimators=1200,
        learning_rate=0.03,
        max_depth=3,
        subsample=0.9,
        colsample_bytree=0.9,
        min_child_weight=5,
        reg_lambda=3.0,
        gamma=0.2,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=-1,
        random_state=42,
    )

    model.fit(X_train, y_train)

    p_val = model.predict_proba(X_val)[:, 1]
    p_test = model.predict_proba(X_test)[:, 1]

    val_m = metrics(y_val, p_val)
    test_m = metrics(y_test, p_test)

    print("=== XGBoost v3 (no early stopping; v2 features) ===")
    print(f"n_train: {len(train_df)} | n_val: {len(val_df)} | n_test: {len(test_df)}")
    print("VAL:", val_m)
    print("TEST:", test_m)

    joblib.dump(model, MODEL_PATH)
    print(f"Saved model: {MODEL_PATH}")

if __name__ == "__main__":
    main()
