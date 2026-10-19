import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

root = Path(__file__).resolve().parent.parent
out = root / "10_Web_Export"
df = pd.read_csv(out / "ml_table_islamabad_100m.csv").dropna().reset_index(drop=True)
F = ["NDVI", "NDBI", "BUILTUP", "DEM", "POP"]
X, y = df[F], df["LST"]

# same honest split as the main model: whole 2 km blocks are held out for testing
block = (np.floor(df["lon"] / 0.02).astype(int).astype(str) + "_" + np.floor(df["lat"] / 0.02).astype(int).astype(str))
tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42).split(X, y, groups=block))

r = lambda v, d=4: round(float(v), d)
trees = lambda ts: [{"l": t.children_left.tolist(), "r": t.children_right.tolist(), "f": t.feature.tolist(),
                     "t": [r(v) for v in t.threshold], "v": [r(v[0][0], 3) for v in t.value]} for t in ts]

models = {
    "Linear regression": LinearRegression(),
    "Random forest": RandomForestRegressor(n_estimators=30, max_depth=8, min_samples_leaf=20, n_jobs=-1, random_state=42),
    "Gradient boosting": GradientBoostingRegressor(n_estimators=60, max_depth=3, learning_rate=0.1, random_state=42),
}
samp = np.random.RandomState(0).choice(te, 300, replace=False)
res = {"features": F, "n_train": int(len(tr)), "n_test": int(len(te)), "models": {}, "scatter": {}}
for name, m in models.items():
    m.fit(X.iloc[tr], y.iloc[tr])
    p = m.predict(X.iloc[te])
    if name == "Linear regression":
        exp = {"type": "lin", "c": [r(c, 6) for c in m.coef_], "b": r(m.intercept_, 5)}
    elif name == "Random forest":
        exp = {"type": "rf", "trees": trees([e.tree_ for e in m.estimators_])}
    else:
        exp = {"type": "gb", "init": r(m.init_.predict(X.iloc[:1])[0], 4), "lr": 0.1, "trees": trees([e[0].tree_ for e in m.estimators_])}
    res["models"][name] = {"r2": r(r2_score(y.iloc[te], p), 3), "rmse": r(np.sqrt(mean_squared_error(y.iloc[te], p)), 2),
                           "mae": r(mean_absolute_error(y.iloc[te], p), 2), "model": exp}
    res["scatter"][name] = [[r(o, 1), r(q, 1)] for o, q in zip(y.iloc[samp], m.predict(X.iloc[samp]))]
    print(f"{name}: R2 {res['models'][name]['r2']}  RMSE {res['models'][name]['rmse']}  MAE {res['models'][name]['mae']}")

rf = models["Random forest"]
sub = np.random.RandomState(1).choice(te, 4000, replace=False)
pi = permutation_importance(rf, X.iloc[sub], y.iloc[sub], n_repeats=3, random_state=0, n_jobs=-1)
imp = np.clip(pi.importances_mean, 0, None); imp = imp / imp.sum()
res["importance"] = {f: r(v, 3) for f, v in zip(F, imp)}

base = X.iloc[np.random.RandomState(2).choice(te, 1500, replace=False)]
res["ranges"], res["pdp"] = {}, {}
for f in F:
    lo, hi = np.percentile(X[f], [2, 98])
    res["ranges"][f] = [r(lo, 3), r(hi, 3)]
    grid = np.linspace(lo, hi, 20)
    ys = []
    for g in grid:
        b = base.copy(); b[f] = g
        ys.append(r(rf.predict(b).mean(), 2))
    res["pdp"][f] = {"x": [r(g, 3) for g in grid], "y": ys}

green = X[X["NDVI"] >= X["NDVI"].quantile(0.9)].mean()
res["presets"] = {"Islamabad average": [r(v) for v in X.mean()],
                  "Hotspot average": [r(v) for v in df[df["EXPOSURE"] == 2][F].mean()],
                  "Green area (top 10% NDVI)": [r(v) for v in green]}
(out / "ai_models.json").write_text(json.dumps(res, separators=(",", ":")), encoding="utf-8")
print("Saved:", out / "ai_models.json", f"({(out / 'ai_models.json').stat().st_size / 1e3:.0f} KB)")