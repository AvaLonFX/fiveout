import pandas as pd
import pickle

# === 1. Učitaj model i scaler ===
with open("hof_model.pkl", "rb") as f:
    model = pickle.load(f)

with open("hof_scaler.pkl", "rb") as f:
    scaler = pickle.load(f)

# === 2. Učitaj dataset ===
df = pd.read_csv("HOF_Training_Dataset_ALL_TRUE_HOF.csv")

# === 3. Filtriraj samo aktivne igrače ===
active_df = df[df["ROSTER_STATUS"].astype(str).str.strip() == "1.0"].copy()


# === 5. Koristi TOČNO ISTE FEATURE-E kao u treningu ===
features = ["Player_Rating", "PTS", "REB", "AST","MIN", "TS_PCT1"]
X = active_df[features]

# === 6. Skaliraj ulazne podatke ===
X_scaled = scaler.transform(X)

# === 7. Napravi predikciju ===
probs = model.predict_proba(X_scaled)[:, 1]
active_df["HOF_Probability"] = (probs * 100).round(2)

# === 8. Sortiraj i spremi rezultat ===
result = active_df[["PLAYER_FIRST_NAME", "PLAYER_LAST_NAME", "Player_Rating", "HOF_Probability"]]
result = result.sort_values(by="HOF_Probability", ascending=False)

# Spremi kao CSV
result.to_csv("Active_Players_HOF_Predictions.csv", index=False)
print("✅ Spremno: Active_Players_HOF_Predictions.csv")
