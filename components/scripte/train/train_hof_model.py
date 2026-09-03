import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.naive_bayes import GaussianNB
from sklearn.metrics import classification_report, accuracy_score
import pickle

# === 1. Učitavanje podataka ===
df = pd.read_csv("HOF_Training_Dataset_ALL_TRUE_HOF.csv")

# === 2. Filtriraj samo umirovljene igrače ===
df = df[df["ROSTER_STATUS"] == "Retired"]

# === 3. Ukloni redove s NaN vrijednostima ===
df = df.dropna()

# === 4. Filtriraj samo igrače s minimalno 4 sezone igranja (npr. 200+ utakmica i 5000+ minuta) ===
df = df[(df["GP"] >= 200) & (df["MIN"] >= 5000)]

# === 5. Definiraj značajke i ciljnu varijablu (bez GP i MIN) ===
features = ["Player_Rating", "PTS", "REB", "AST", "MIN", "TS_PCT1"]
X = df[features]
y = df["HOF"]

# === 6. Standardizacija značajki ===
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# === 7. Podjela na trening i test skup ===
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

# === 8. Treniraj Naive Bayes model ===
model = GaussianNB()
model.fit(X_train, y_train)

# === 9. Evaluacija ===
y_pred = model.predict(X_test)
print("=== Rezultati evaluacije ===")
print("Accuracy:", accuracy_score(y_test, y_pred))
print(classification_report(y_test, y_pred))

# === 10. Spremi model i scaler ===
with open("hof_model.pkl", "wb") as f:
    pickle.dump(model, f)

with open("hof_scaler.pkl", "wb") as f:
    pickle.dump(scaler, f)

print("✅ Model i scaler su uspješno spremljeni.")
