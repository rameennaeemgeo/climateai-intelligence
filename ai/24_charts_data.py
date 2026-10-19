import json
from pathlib import Path

import numpy as np
import pandas as pd

root = Path(__file__).resolve().parent.parent
out = root / "10_Web_Export"
df = pd.read_csv(out / "ml_table_islamabad_100m.csv").dropna()
df["EXPOSURE"] = df["EXPOSURE"].astype(int)

IND = {
    "LST": ("Land surface temperature", "deg C"),
    "NDVI": ("Vegetation (NDVI)", "index"),
    "NDBI": ("Built-up index (NDBI)", "index"),
    "BUILTUP": ("Built-up probability", "probability"),
    "DEM": ("Elevation", "m"),
    "POP": ("Population density", "people/km2"),
}
r3 = lambda v: round(float(v), 3)

hist, summary = {}, []
for k, (label, unit) in IND.items():
    v = df[k].to_numpy()
    lo, hi = np.percentile(v, [1, 99])
    counts, edges = np.histogram(v[(v >= lo) & (v <= hi)], bins=30, range=(lo, hi))
    hist[k] = {"label": label, "unit": unit,
               "centers": [r3((edges[i] + edges[i + 1]) / 2) for i in range(30)],
               "pct": [round(100 * float(c) / len(v), 2) for c in counts]}
    p = np.percentile(v, [5, 50, 95])
    summary.append({"key": k, "label": label, "unit": unit, "n": int(len(v)),
                    "mean": r3(v.mean()), "median": r3(p[1]), "std": r3(v.std()),
                    "min": r3(v.min()), "p5": r3(p[0]), "p95": r3(p[2]), "max": r3(v.max())})

relations = {}
for k in ["NDVI", "NDBI", "BUILTUP", "DEM"]:
    lo, hi = np.percentile(df[k], [2, 98])
    edges = np.linspace(lo, hi, 13)
    idx = np.digitize(df[k], edges[1:-1])
    xs, ys = [], []
    for b in range(12):
        sel = df.loc[idx == b, "LST"]
        if len(sel) >= 50:
            xs.append(r3((edges[b] + edges[b + 1]) / 2))
            ys.append(round(float(sel.mean()), 2))
    relations[k] = {"label": IND[k][0], "x": xs, "lst": ys}

cols = list(IND.keys())
corr = df[cols].corr().round(2)
correlation = {"labels": cols, "matrix": corr.values.tolist()}

names = {0: "Other areas", 1: "Hot (top 25% LST)", 2: "Hotspot"}
classes = []
for c, g in df.groupby("EXPOSURE"):
    classes.append({"label": names.get(c, str(c)), "n": int(len(g)),
                    "LST": round(float(g["LST"].mean()), 2), "NDVI": round(float(g["NDVI"].mean()), 3),
                    "NDBI": round(float(g["NDBI"].mean()), 3), "BUILTUP": round(float(g["BUILTUP"].mean()), 3),
                    "POP": int(round(float(g["POP"].mean())))})

(out / "charts.json").write_text(json.dumps({
    "histograms": hist, "summary": summary, "relations": relations,
    "correlation": correlation, "classes": classes}, indent=1), encoding="utf-8")
print("Saved:", out / "charts.json")
print("Pixels used:", len(df))