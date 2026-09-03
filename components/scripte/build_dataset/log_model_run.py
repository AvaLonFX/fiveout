from supabase import create_client

SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

runs = [
  {
    "model_name": "lr_moneyline_v2_scaled",
    "run_tag": "lr_v2_scaled",
    "n_train": 8310,
    "n_test": 1467,
    "logloss": 0.6396551883707321,
    "brier": 0.2247463130565413,
    "auc": 0.6764767388885156,
    "accuracy": 0.6278118609406953,
    "train_seasons": "2019-20..2024-25",
    "feature_set": "v2: overall last10 + net + home/away last10 + season-to-date win% + rest/b2b",
    "notes": "Best model so far. Scaled features remove convergence issues."
  },
  {
    "model_name": "xgb_moneyline_v3",
    "run_tag": "xgb_v3_no_early_stopping",
    "n_train": 6843,
    "n_test": 1467,
    "logloss": 0.662063068278541,
    "brier": 0.2343942940359547,
    "auc": 0.6478904797114113,
    "accuracy": 0.6073619631901841,
    "train_seasons": "2019-20..2024-25",
    "feature_set": "v2: overall last10 + net + home/away last10 + season-to-date win% + rest/b2b",
    "notes": "Improved vs XGB v1/v2 but still worse than LR v2; early stopping not supported in current xgboost."
  }
]

supabase.table("ModelRuns").insert(runs).execute()
print("Logged runs ✅")
