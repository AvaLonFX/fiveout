import requests
import pandas as pd
from io import StringIO

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
}

URL = "https://www.espn.com/nba/injuries"

def main():
    print("Fetching ESPN injuries...")

    r = requests.get(URL, headers=HEADERS, timeout=30)
    r.raise_for_status()

    # Parsiranje tablica
    tables = pd.read_html(StringIO(r.text))
    print("Tables found:", len(tables))

    dfs = []
    for t in tables:
        cols = [str(c).lower() for c in t.columns]

        # ESPN injury tablice obično imaju ove stupce
        if any("name" in c or "player" in c for c in cols) and any("status" in c for c in cols):
            dfs.append(t)

    if not dfs:
        print("❌ No injury tables parsed. ESPN likely blocked the request.")
        print("First 300 chars of response:")
        print(r.text[:300])
        return

    # Spoji sve u jedan dataframe
    out = pd.concat(dfs, ignore_index=True)

    print("\nColumns detected:", list(out.columns))
    print("Total rows:", len(out))

    # Traži Jokića kroz sve kolone (robustno)
    jokic = out[
        out.astype(str)
        .apply(lambda col: col.str.contains("trent jr", case=False, na=False))
        .any(axis=1)
    ]

    print("\n=== JOKIC RESULT ===")
    if jokic.empty:
        print("❌ Jokic not found in injury report (vjerojatno healthy).")
    else:
        print(jokic)

    # Spremi CSV
    out.to_csv("espn_nba_injuries.csv", index=False)
    print("\nSaved full table to: espn_nba_injuries.csv")

if __name__ == "__main__":
    main()
