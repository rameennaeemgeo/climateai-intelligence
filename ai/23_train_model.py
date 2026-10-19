import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

root = Path(__file__).resolve().parent.parent
out = root / "10_Web_Export"
df = pd.read_csv(out / "ml_table_islamabad_100m.csv").dropna()

FEATURES = ["NDVI", "NDBI", "BUILTUP", "DEM", "POP"]
LABELS = {"NDVI": "Vegetation (NDVI)", "NDBI": "Built-up index (NDBI)",
          "BUILTUP": "Built-up probability", "DEM": "Elevation",
          "POP": "Population density"}
X, y = df[FEATURES], df["LST"]

# spatial split: ~2 km blocks, whole blocks held out for testing (honest accuracy)
block = (np.floor(df["lon"] / 0.02).astype(int).astype(str) + "_" +
         np.floor(df["lat"] / 0.02).astype(int).astype(str))
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42).split(X, y, groups=block))

rf = RandomForestRegressor(n_estimators=150, max_depth=14, min_samples_leaf=5,
                           n_jobs=-1, random_state=42)
rf.fit(X.iloc[tr], y.iloc[tr])
pred = rf.predict(X.iloc[te])
r2 = r2_score(y.iloc[te], pred)
rmse = float(np.sqrt(mean_squared_error(y.iloc[te], pred)))

# importance measured on held-out blocks
sub = np.random.RandomState(0).choice(te, size=min(5000, len(te)), replace=False)
pi = permutation_importance(rf, X.iloc[sub], y.iloc[sub], n_repeats=3, random_state=0, n_jobs=-1)
imp = np.clip(pi.importances_mean, 0, None)
imp = imp / imp.sum()
fi = sorted([{"label": LABELS[f], "importance": round(float(v), 3)} for f, v in zip(FEATURES, imp)],
            key=lambda d: -d["importance"])

# what-if: more vegetation everywhere (model-based scenario, not a forecast)
whatif = []
for d in [0, 0.05, 0.10, 0.15]:
    Xs = X.copy()
    Xs["NDVI"] = np.clip(Xs["NDVI"] + d, -1, 1)
    whatif.append({"ndvi_increase": d, "mean_lst_c": round(float(rf.predict(Xs).mean()), 2)})

res = {
    "model": "Random Forest regression predicting land surface temperature from vegetation, built-up, elevation and population (100 m grid, spatial block validation)",
    "r2": round(float(r2), 2), "rmse": round(rmse, 2),
    "n_pixels": int(len(df)), "feature_importance": fi, "what_if": whatif,
    "limits": "Single summer season (May-Jul 2026). The model explains spatial patterns of surface heat; it does not forecast future temperatures.",
}
(out / "ai_results.json").write_text(json.dumps(res, indent=2), encoding="utf-8")

print(f"Test R2: {r2:.2f} | RMSE: {rmse:.2f} C | pixels: {len(df):,}")
for f in fi:
    print(f"  {f['label']}: {f['importance']*100:.0f}%")
print("What-if:", whatif)
print("Saved:", out / "ai_results.json")