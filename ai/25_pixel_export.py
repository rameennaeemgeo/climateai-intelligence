import json
from pathlib import Path

import numpy as np
import pandas as pd

root = Path(__file__).resolve().parent.parent
out = root / "10_Web_Export"
df = pd.read_csv(out / "ml_table_islamabad_100m.csv").dropna()

STEP = 0.0001  # about 11 m, finer than the 100 m pixels
lon0 = float(np.floor(df["lon"].min() / STEP) * STEP)
lat0 = float(np.floor(df["lat"].min() / STEP) * STEP)

cols = [
    (np.round((df["lon"] - lon0) / STEP), "<u2"),
    (np.round((df["lat"] - lat0) / STEP), "<u2"),
    (np.round(df["LST"] * 100), "<u2"),
    (np.round(df["NDVI"] * 1000), "<i2"),
    (np.round(df["NDBI"] * 1000), "<i2"),
    (np.round(df["BUILTUP"] * 1000), "<u2"),
    (np.round(df["DEM"]), "<u2"),
    (np.round(df["POP"]), "<u2"),
    (df["EXPOSURE"].astype(int), "u1"),
]
blob = b"".join(np.asarray(v).astype(t).tobytes() for v, t in cols)
(out / "pixels.bin").write_bytes(blob)
(out / "pixels_meta.json").write_text(json.dumps({
    "n": int(len(df)), "lon0": lon0, "lat0": lat0, "step": STEP,
    "pixel_km2": 0.01,
}), encoding="utf-8")
print(f"Saved pixels.bin ({len(blob)/1e6:.2f} MB) and pixels_meta.json, pixels: {len(df):,}")