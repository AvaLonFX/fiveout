import time
import numpy as np
import pandas as pd
from supabase import create_client

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, brier_score_loss, roc_auc_score, accuracy_score
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

MODEL_NAME = "lr_moneyline_v2"
MODEL_PATH = "lr_moneyline_v2_scaled.joblib"

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

def time_split(df: pd.DataFrame, frac_train=0.85):
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date"]).sort_values("game_date").reset_index(drop=True)
    split_idx = int(len(df) * frac_train)
    return df.iloc[:split_idx].copy(), df.iloc[split_idx:].copy()

def main():
    cols = "nba_game_id,game_date,season," + ",".join(FEATURES) + "," + TARGET
    df = fetch_paged("TrainingDataset_v2", cols)
    print("Rows:", len(df))

    df = df.dropna(subset=FEATURES + [TARGET]).copy()

    train_df, test_df = time_split(df, 0.85)

    X_train = train_df[FEATURES].astype(float).values
    y_train = train_df[TARGET].astype(int).values
    X_test = test_df[FEATURES].astype(float).values
    y_test = test_df[TARGET].astype(int).values

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegression(max_iter=10000, solver="lbfgs"))
    ])

    model.fit(X_train, y_train)

    p = model.predict_proba(X_test)[:, 1]
    pred = (p >= 0.5).astype(int)

    print("=== LogReg v2 (scaled) ===")
    print("n_train:", len(train_df))
    print("n_test:", len(test_df))
    print("logloss:", log_loss(y_test, p))
    print("brier:", brier_score_loss(y_test, p))
    print("auc:", roc_auc_score(y_test, p))
    print("accuracy:", accuracy_score(y_test, pred))

    joblib.dump(model, MODEL_PATH)
    print(f"Saved model: {MODEL_PATH}")

if __name__ == "__main__":
    main()
