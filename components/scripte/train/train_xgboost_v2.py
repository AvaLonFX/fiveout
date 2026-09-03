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

MODEL_NAME = "xgb_moneyline_v2"
MODEL_PATH = "xgb_moneyline_v2.joblib"

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

def time_split_3(df: pd.DataFrame, train_frac=0.70, val_frac=0.15):
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date"]).sort_values("game_date").reset_index(drop=True)

    n = len(df)
    i_train = int(n * train_frac)
    i_val = int(n * (train_frac + val_frac))

    train_df = df.iloc[:i_train].copy()
    val_df = df.iloc[i_train:i_val].copy()
    test_df = df.iloc[i_val:].copy()

    return train_df, val_df, test_df

def metrics_dict(y_true, p):
    pred = (p >= 0.5).astype(int)
    return {
        "logloss": float(log_loss(y_true, p)),
        "brier": float(brier_score_loss(y_true, p)),
        "auc": float(roc_auc_score(y_true, p)),
        "accuracy": float(accuracy_score(y_true, pred)),
    }

def main():
    df = fetch_training()
    print("Rows:", len(df))

    df = df.dropna(subset=FEATURES + [TARGET]).copy()

    train_df, val_df, test_df = time_split_3(df, 0.70, 0.15)

    X_train = train_df[FEATURES].astype(float).values
    y_train = train_df[TARGET].astype(int).values

    X_val = val_df[FEATURES].astype(float).values
    y_val = val_df[TARGET].astype(int).values

    X_test = test_df[FEATURES].astype(float).values
    y_test = test_df[TARGET].astype(int).values

    # v2: malo jednostavnije + early stopping
    model = XGBClassifier(
        n_estimators=4000,          # veliki broj, ali early stopping zaustavi
        learning_rate=0.02,
        max_depth=3,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_lambda=2.0,
        min_child_weight=4,
        gamma=0.5,
        objective="binary:logistic",
        eval_metric="logloss",
        n_jobs=-1,
        random_state=42
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False
    )

    # NOTE: ako tvoja xgboost verzija podržava early_stopping_rounds u fit,
    # možeš dodati early_stopping_rounds=100. Ako baci error, javi i prilagodim.
    # model.fit(..., early_stopping_rounds=100, ...)

    p_val = model.predict_proba(X_val)[:, 1]
    p_test = model.predict_proba(X_test)[:, 1]

    val_m = metrics_dict(y_val, p_val)
    test_m = metrics_dict(y_test, p_test)

    print("=== XGBoost v2 ===")
    print(f"n_train: {len(train_df)} | n_val: {len(val_df)} | n_test: {len(test_df)}")
    print("VAL:", val_m)
    print("TEST:", test_m)

    # save model
    joblib.dump(model, MODEL_PATH)
    print(f"Saved model: {MODEL_PATH}")

    # log run to Supabase
    run = {
        "model_name": MODEL_NAME,
        "run_tag": "xgb_v2_tuned_no_earlystop_param",
        "n_train": int(len(train_df)),
        "n_test": int(len(test_df)),
        "logloss": float(test_m["logloss"]),
        "brier": float(test_m["brier"]),
        "auc": float(test_m["auc"]),
        "accuracy": float(test_m["accuracy"]),
        "train_seasons": "2019-20..2024-25",
        "feature_set": "home/away win_pct_last10, pts_for_last10, pts_against_last10, rest_days, b2b",
        "notes": "XGB v2: depth=3, stronger regularization, val split. Consider enabling early_stopping_rounds if supported."
    }

    supabase.table("ModelRuns").insert(run).execute()
    print("Logged ModelRun ✅")

if __name__ == "__main__":
    main()
