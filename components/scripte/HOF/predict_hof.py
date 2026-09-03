import pickle
import pandas as pd

# Učitaj model i scaler
with open("hof_model.pkl", "rb") as f:
    model = pickle.load(f)

with open("hof_scaler.pkl", "rb") as f:
    scaler = pickle.load(f)

def predict_hof_chance(player_data: dict) -> float:
    features = ["Player_Rating", "PTS", "REB", "AST", "MIN", "TS_PCT1"]
    df = pd.DataFrame([player_data])[features]
    df_scaled = scaler.transform(df)
    proba = model.predict_proba(df_scaled)[0][1]
    return round(proba * 100, 2)


# Test primjer
if __name__ == "__main__":
    klay = {
    "Player_Rating": 37.98,
    "PTS": 15957,
    "REB": 2899.0,
    "AST": 1900,
    "TS_PCT1": 490,         # ⚠️ krivo – stvarna vrijednost je oko 0.58–0.60
    "GP": 823,
    "MIN": 26677.0
}




    chance = predict_hof_chance(klay)
    print(f"Šansa za Hall of Fame: {chance}%")
