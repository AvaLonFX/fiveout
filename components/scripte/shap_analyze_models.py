# components/scripte/shap_analyze_models.py
import os
import json
import argparse
import numpy as np
import pandas as pd

from supabase import create_client
import joblib
import shap
import matplotlib.pyplot as plt


# ----------------- PLACEHOLDERS (STAVI SVOJE) -----------------
SUPABASE_URL = "https://fdlcdiqvbldqwjbbdjhv.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZkbGNkaXF2YmxkcXdqYmJkamh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwNzQwNTcsImV4cCI6MjA3ODY1MDA1N30._ZYUsn03GY-Co6gKNCJCovjvrMkxewilL9tzYGP8jWM"
# ================================================================
# ---------------------------------------------------------------


DEFAULT_FEATURES_V3 = [
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


def get_supabase():
    if "PASTE_" in SUPABASE_URL or "PASTE_" in SUPABASE_KEY:
        raise SystemExit("❌ Stavi SUPABASE_URL i SUPABASE_KEY u skriptu (placeholdere zamijeni).")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_table(sb, table: str, columns: list[str], limit: int = 1000):
    out = []
    page = 0
    page_size = min(1000, limit)
    while len(out) < limit:
        frm = page * page_size
        to = frm + page_size - 1
        resp = sb.table(table).select(",".join(columns)).range(frm, to).execute()
        rows = resp.data or []
        if not rows:
            break
        out.extend(rows)
        if len(rows) < page_size:
            break
        page += 1
    return out[:limit]


def safe_mkdir(path: str):
    os.makedirs(path, exist_ok=True)


def extract_lr_and_scale(pipe_or_model, X_df: pd.DataFrame):
    # Pipeline -> scaler + LogisticRegression
    if hasattr(pipe_or_model, "named_steps"):
        pipe = pipe_or_model
        scaler = None
        lr = None

        for k, v in pipe.named_steps.items():
            if "scaler" in k.lower() or v.__class__.__name__.lower().endswith("scaler"):
                scaler = v
            if v.__class__.__name__.lower() == "logisticregression":
                lr = v

        if lr is None:
            raise RuntimeError(f"Pipeline nema LogisticRegression step. Steps={list(pipe.named_steps.keys())}")

        if scaler is not None:
            X_np = scaler.transform(X_df)
        else:
            X_np = X_df.to_numpy(dtype=float)

        return lr, X_np
    else:
        return pipe_or_model, X_df.to_numpy(dtype=float)


def make_explanation(shap_values_np, X_np, feature_names):
    return shap.Explanation(
        values=shap_values_np,
        data=X_np,
        feature_names=list(feature_names),
    )


def save_summary_plots(outdir: str, model_name: str, exp: shap.Explanation, max_display: int = 20):
    safe_mkdir(outdir)

    # bar
    plt.figure()
    shap.plots.bar(exp, show=False, max_display=max_display)
    bar_path = os.path.join(outdir, f"{model_name}__shap_bar.png")
    plt.tight_layout()
    plt.savefig(bar_path, dpi=160)
    plt.close()

    # beeswarm
    plt.figure()
    shap.plots.beeswarm(exp, show=False, max_display=max_display)
    bee_path = os.path.join(outdir, f"{model_name}__shap_beeswarm.png")
    plt.tight_layout()
    plt.savefig(bee_path, dpi=160)
    plt.close()

    vals = np.array(exp.values)
    mean_abs = np.mean(np.abs(vals), axis=0)
    df_imp = pd.DataFrame({"feature": exp.feature_names, "mean_abs_shap": mean_abs})
    df_imp = df_imp.sort_values("mean_abs_shap", ascending=False).reset_index(drop=True)

    top_path = os.path.join(outdir, f"{model_name}__shap_top.csv")
    df_imp.to_csv(top_path, index=False)

    return df_imp


def shap_for_logreg(lr_pipeline, X_df: pd.DataFrame):
    lr, X_np = extract_lr_and_scale(lr_pipeline, X_df)
    explainer = shap.LinearExplainer(lr, X_np, feature_names=list(X_df.columns))
    shap_vals = explainer.shap_values(X_np)
    return make_explanation(shap_vals, X_np, X_df.columns)


def shap_for_xgb_via_contribs(xgb_model, X_df: pd.DataFrame):
    """
    Robust method:
      - use native Booster.predict(pred_contribs=True)
      - avoids shap.TreeExplainer parsing issues (base_score '[...]' bug)
    """
    # xgboost is needed for DMatrix
    import xgboost as xgb

    X_np = X_df.to_numpy(dtype=float)

    # Accept XGBClassifier / Booster
    booster = None
    if hasattr(xgb_model, "get_booster"):
        booster = xgb_model.get_booster()
        model_type = "XGBClassifier(get_booster)"
    elif hasattr(xgb_model, "predict"):
        # might already be Booster
        booster = xgb_model
        model_type = "Booster"
    else:
        raise RuntimeError(f"Ne prepoznajem XGB model tip: {type(xgb_model)}")

    dm = xgb.DMatrix(X_np, feature_names=list(X_df.columns))

    # pred_contribs gives (n_rows, n_features + 1) where last is bias
    contrib = booster.predict(dm, pred_contribs=True)

    if contrib.ndim != 2 or contrib.shape[1] != (X_np.shape[1] + 1):
        raise RuntimeError(f"Neočekivan contrib shape: {contrib.shape}, expected (n, {X_np.shape[1] + 1})")

    shap_vals = contrib[:, :-1]  # drop bias term
    bias = contrib[:, -1]

    exp = make_explanation(shap_vals, X_np, X_df.columns)

    # attach bias for reference (not required for plots)
    exp.base_values = bias

    print(f"[XGB SHAP] computed via pred_contribs ({model_type}). shape={shap_vals.shape}")
    return exp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", default="TrainingDataset_v3")
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--outdir", default="models/shap")
    ap.add_argument("--features", default="", help="CSV lista featurea, inače default v3")
    ap.add_argument("--target", default="home_win")

    ap.add_argument("--lr_path", default="models/lr_moneyline_final.joblib")
    ap.add_argument("--xgb_path", default="models/xgb_moneyline_final.joblib")
    ap.add_argument("--lr_name", default="lr_moneyline_final")
    ap.add_argument("--xgb_name", default="xgb_moneyline_final")
    args = ap.parse_args()

    features = DEFAULT_FEATURES_V3 if not args.features.strip() else [c.strip() for c in args.features.split(",") if c.strip()]

    sb = get_supabase()

    cols = list(features) + [args.target]
    rows = fetch_table(sb, args.table, cols, limit=args.limit)
    if not rows:
        raise SystemExit(f"❌ Nema podataka u {args.table}")

    df = pd.DataFrame(rows)
    df = df.dropna(subset=[args.target])

    for c in features:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    df = df.dropna(subset=features)
    df = df.sample(min(len(df), args.limit), random_state=42).reset_index(drop=True)

    X = df[features].copy()
    y = df[args.target].astype(int)

    print(f"Rows used for SHAP: {len(df)} (table={args.table})")
    safe_mkdir(args.outdir)

    # ---- LOGREG ----
    print("\n=== SHAP: LOGREG ===")
    lr_pipe = joblib.load(args.lr_path)
    exp_lr = shap_for_logreg(lr_pipe, X)
    top_lr = save_summary_plots(args.outdir, args.lr_name, exp_lr)
    print("Top 15 (LogReg) mean|SHAP|:")
    print(top_lr.head(15).to_string(index=False))

    # ---- XGBOOST (robust contribs) ----
    print("\n=== SHAP: XGBOOST (pred_contribs) ===")
    xgb_model = joblib.load(args.xgb_path)
    exp_xgb = shap_for_xgb_via_contribs(xgb_model, X)
    top_xgb = save_summary_plots(args.outdir, args.xgb_name, exp_xgb)
    print("Top 15 (XGB) mean|SHAP|:")
    print(top_xgb.head(15).to_string(index=False))

    # combined summary
    summary = {
        "n_rows": int(len(df)),
        "features": features,
        "logreg_top10": top_lr.head(10).to_dict(orient="records"),
        "xgb_top10": top_xgb.head(10).to_dict(orient="records"),
    }
    with open(os.path.join(args.outdir, "shap_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(f"\n✅ Saved plots + csv in: {args.outdir}")
    print(" - *_shap_bar.png")
    print(" - *_shap_beeswarm.png")
    print(" - *_shap_top.csv")
    print(" - shap_summary.json")


if __name__ == "__main__":
    main()
