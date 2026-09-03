import time
import numpy as np
import pandas as pd
from supabase import create_client

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import log_loss, brier_score_loss, roc_auc_score, accuracy_score
import joblib

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"  # moze i anon jer ti je RLS off

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
    while True:
        end = start + page_size - 1
        resp = supabase.table("TrainingDataset").select(
            "nba_game_id,game_date,season," + ",".join(FEATURES) + "," + TARGET
        ).range(start, end).execute()

        data = resp.data or []
        all_rows.extend(data)
        print(f"Fetched {start}-{end}: got {len(data)} (total {len(all_rows)})")

        if len(data) < page_size:
            break
        start += page_size
        time.sleep(0.05)

    df = pd.DataFrame(all_rows)
    return df

def main():
    df = fetch_training()
    print("Rows:", len(df))

    # basic clean
    df = df.dropna(subset=FEATURES + [TARGET]).copy()
    X = df[FEATURES].astype(float).values
    y = df[TARGET].astype(int).values

    # time-aware split (bolje nego random): treniraj na starijem, test na novijem
    # jednostavno: sortiraj po datumu i uzmi zadnjih 15% kao test
    df["game_date"] = pd.to_datetime(df["game_date"])
    df = df.sort_values("game_date")

    split_idx = int(len(df) * 0.85)
    train_df = df.iloc[:split_idx]
    test_df = df.iloc[split_idx:]

    X_train = train_df[FEATURES].astype(float).values
    y_train = train_df[TARGET].astype(int).values
    X_test = test_df[FEATURES].astype(float).values
    y_test = test_df[TARGET].astype(int).values

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegression(
            max_iter=2000,
            solver="lbfgs"
        ))
    ])

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

    print("=== Logistic Regression baseline ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")

    # save model locally
    joblib.dump(model, "lr_moneyline_v1.joblib")
    print("Saved model: lr_moneyline_v1.joblib")

    # (opcionalno) koeficijenti za dokumentaciju
    lr = model.named_steps["lr"]
    coefs = pd.Series(lr.coef_[0], index=FEATURES).sort_values(key=np.abs, ascending=False)
    print("\nTop coefficients (abs):")
    print(coefs)

if __name__ == "__main__":
    main()
