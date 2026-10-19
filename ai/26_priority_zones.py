import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor

root = Path(__file__).resolve().parent.parent
out = root / "10_Web_Export"
df = pd.read_csv(out / "ml_table_islamabad_100m.csv").dropna().reset_index(drop=True)

# 1. same Random Forest idea as the AI panel: predict LST from the other layers
FEAT = ["NDVI", "NDBI", "BUILTUP", "DEM", "POP"]
rf = RandomForestRegressor(n_estimators=120, max_depth=14, min_samples_leaf=5,
                           n_jobs=-1, random_state=42).fit(df[FEAT], df["LST"])

# 2. cooling potential per pixel: modelled LST drop if NDVI rises by 0.10
X2 = df[FEAT].copy()
X2["NDVI"] = np.clip(X2["NDVI"] + 0.10, -1, 1)
df["cooling"] = rf.predict(df[FEAT]) - rf.predict(X2)

# 3. group pixels into cells of about 1 km
STEP = 0.01
lon0 = float(np.floor(df["lon"].min() / STEP) * STEP)
lat0 = float(np.floor(df["lat"].min() / STEP) * STEP)
df["cx"] = np.floor((df["lon"] - lon0) / STEP).astype(int)
df["cy"] = np.floor((df["lat"] - lat0) / STEP).astype(int)
df["people"] = df["POP"] * 0.01  # people per 100 m pixel
g = df.groupby(["cx", "cy"]).agg(
    n=("LST", "size"), lst=("LST", "mean"), ndvi=("NDVI", "mean"), built=("BUILTUP", "mean"),
    people=("people", "sum"), cooling=("cooling", "mean"), lon=("lon", "mean"), lat=("lat", "mean")).reset_index()
g = g[g["n"] >= 30].copy()  # ignore tiny edge fragments

# 4. priority score: equal weight of heat, lack of vegetation and number of people
rk = lambda s: s.rank(pct=True)
g["score"] = 100 * (rk(g["lst"]) + rk(-g["ndvi"]) + rk(g["people"])) / 3
top = g.sort_values("score", ascending=False).head(10).reset_index(drop=True)

zones = []
for i, r in top.iterrows():
    west = lon0 + r["cx"] * STEP
    south = lat0 + r["cy"] * STEP
    zones.append({
        "rank": i + 1, "lat": round(float(r["lat"]), 5), "lon": round(float(r["lon"]), 5),
        "west": round(west, 5), "east": round(west + STEP, 5),
        "south": round(south, 5), "north": round(south + STEP, 5),
        "mean_lst": round(float(r["lst"]), 2), "mean_ndvi": round(float(r["ndvi"]), 3),
        "built": round(float(r["built"]), 3), "people": int(round(r["people"])),
        "cooling_c": round(float(r["cooling"]), 2), "score": round(float(r["score"]), 1)})

(out / "priority.json").write_text(json.dumps({
    "method": ("Islamabad is split into cells of about 1 km. Each cell is scored from 0 to 100 as the average of three "
               "ranks: hotter surface, less vegetation, and more people. The top 10 cells are shown. 'Cooling' is the drop in "
               "mean surface temperature that the Random Forest model estimates if vegetation (NDVI) rose by 0.10 in that cell. "
               "It is a model scenario, not a forecast."),
    "zones": zones}, indent=1), encoding="utf-8")

print("Saved:", out / "priority.json")
for z in zones:
    print(f"#{z['rank']}  score {z['score']}  LST {z['mean_lst']} C  NDVI {z['mean_ndvi']}  people {z['people']:,}  cooling {z['cooling_c']} C")