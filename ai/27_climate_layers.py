import io
import json
import shutil
import zipfile
from pathlib import Path

import ee
import matplotlib
import numpy as np
import pandas as pd
import requests
import rasterio
from affine import Affine
from rasterio.features import rasterize
from rasterio.transform import array_bounds
from rasterio.warp import Resampling, calculate_default_transform, reproject, transform, transform_geom

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

import config  # noqa: E402

root = Path(__file__).resolve().parent.parent
pdata = root / "04_Processed_Data"
out = root / "10_Web_Export"
(out / "layers").mkdir(parents=True, exist_ok=True)

START, END = "2026-05-29", "2026-07-09"  # same window as the LST and NDVI composites (end date is exclusive)
CRS = "EPSG:32643"
TRANSFORM = [100, 0, 279000, 0, -100, 3765100]  # same 100 m grid as the DEM and population rasters
REF_TR = Affine(*TRANSFORM)
W, H = 940, 1050
PIX_KM2 = 0.01

config.init()
rect = ee.Geometry.Rectangle([279000, 3660100, 373000, 3765100], CRS, False)


def download(img, path):
    params = {"region": rect, "crs": CRS, "crs_transform": TRANSFORM, "format": "GEO_TIFF"}
    r = requests.get(img.getDownloadURL(params), timeout=600)
    r.raise_for_status()
    data = r.content
    if data[:2] == b"PK":  # sometimes returned as a zip
        data = zipfile.ZipFile(io.BytesIO(data)).read(
            next(n for n in zipfile.ZipFile(io.BytesIO(data)).namelist() if n.lower().endswith(".tif")))
    path.write_bytes(data)
    print(f"Saved {path.name} ({len(data) / 1e6:.1f} MB)")


# ---- 1. download from Earth Engine (smoothed onto the 100 m grid) ----
era = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR").filterDate(START, END).select("temperature_2m")
chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").filterDate(START, END).select("precipitation")
print("ERA5-Land days:", era.size().getInfo(), "| CHIRPS days:", chirps.size().getInfo())
air = era.map(lambda i: i.resample("bilinear")).mean().subtract(273.15).rename("air_c")
rain = chirps.map(lambda i: i.resample("bilinear")).sum().rename("rain_mm")
air_path = pdata / "AIRTEMP_ERA5Land_20260529_20260708_100m_UTM43N.tif"
rain_path = pdata / "RAIN_CHIRPS_20260529_20260708_100m_UTM43N.tif"
download(air, air_path)
download(rain, rain_path)

with rasterio.open(air_path) as s:
    air_arr = s.read(1).astype("float32")
with rasterio.open(rain_path) as s:
    rain_arr = s.read(1).astype("float32")
if air_arr.shape != (H, W) or rain_arr.shape != (H, W):
    raise SystemExit(f"Unexpected grid size {air_arr.shape} / {rain_arr.shape}, expected {(H, W)}")

# ---- 2. clip to Islamabad District (same method as 22_web_export.py) ----
gj = json.loads((root / "02_Boundaries" / "twin_cities_districts.geojson").read_text(encoding="utf-8"))
cands = []
for ft in gj["features"]:
    g = transform_geom("EPSG:4326", CRS, ft["geometry"])
    m = rasterize([(g, 1)], out_shape=(H, W), transform=REF_TR, fill=0, dtype="uint8").astype(bool)
    cands.append((m.sum() * PIX_KM2, m))
area_km2, mask = min(cands, key=lambda c: c[0])
print(f"Study area: {area_km2:.1f} km2 (expected about 895)")
rows, cols = np.where(mask)
r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
TR = REF_TR * Affine.translation(c0, r0)


def prep(a):
    a = a.copy()
    a[~mask] = np.nan
    return a[r0:r1, c0:c1]


air_p, rain_p = prep(air_arr), prep(rain_arr)
h, w = air_p.shape
dst_tr, dw_, dh_ = calculate_default_transform(CRS, "EPSG:4326", w, h, *array_bounds(h, w, TR), resolution=0.0009)
west, north = dst_tr.c, dst_tr.f
east, south = west + dw_ * dst_tr.a, north + dh_ * dst_tr.e


def make_layer(arr, name, cmap_name):
    v = arr[np.isfinite(arr)]
    p2, p98 = float(np.percentile(v, 2)), float(np.percentile(v, 98))
    dst = np.full((dh_, dw_), np.nan, dtype="float32")
    reproject(arr.astype("float32"), dst, src_transform=TR, src_crs=CRS, src_nodata=np.nan,
              dst_transform=dst_tr, dst_crs="EPSG:4326", dst_nodata=np.nan, resampling=Resampling.bilinear)
    norm = np.clip((dst - p2) / max(p98 - p2, 1e-6), 0, 1)
    rgba = matplotlib.colormaps[cmap_name](np.nan_to_num(norm))
    rgba[np.isnan(dst), 3] = 0
    plt.imsave(out / "layers" / f"{name}.png", rgba)
    return {"mean": round(float(v.mean()), 3), "min": round(float(v.min()), 3), "max": round(float(v.max()), 3),
            "p2": round(p2, 3), "p98": round(p98, 3)}


# ---- 3. PNG layers and statistics ----
stats = json.loads((out / "stats.json").read_text(encoding="utf-8"))
shutil.copy(out / "stats.json", out / "stats_before_climate_layers.json")
b = stats["bounds"]
print("Bounds match existing layers:",
      all(abs(b[k] - v) < 1e-6 for k, v in {"south": south, "west": west, "north": north, "east": east}.items()))

stats["layers"]["AIR"] = {"label": "Air temperature (ERA5-Land, about 11 km)", "unit": "deg C", "file": "layers/AIR.png",
                          "colormap": "Spectral_r", **make_layer(air_p, "AIR", "Spectral_r")}
stats["layers"]["RAIN"] = {"label": "Rainfall (CHIRPS, about 5 km)", "unit": "mm", "file": "layers/RAIN.png",
                           "colormap": "Blues", **make_layer(rain_p, "RAIN", "Blues")}
note = (" Air temperature: ERA5-Land daily mean, 29 May to 8 Jul 2026 (about 11 km grid, smoothed). "
        "Rainfall: CHIRPS daily, summed over the same dates (about 5 km grid, smoothed).")
if "ERA5-Land" not in stats.get("data_note", ""):
    stats["data_note"] = stats.get("data_note", "") + note
(out / "stats.json").write_text(json.dumps(stats, indent=2, ensure_ascii=False), encoding="utf-8")

# ---- 4. values for the click inspector (same pixel order as pixels.bin) ----
df = pd.read_csv(out / "ml_table_islamabad_100m.csv").dropna()
xs, ys = transform("EPSG:4326", CRS, df["lon"].tolist(), df["lat"].tolist())
col = np.floor((np.array(xs) - 279000) / 100).astype(int)
row = np.floor((3765100 - np.array(ys)) / 100).astype(int)
ok = (col >= 0) & (col < W) & (row >= 0) & (row < H)
print("Pixels inside the grid:", int(ok.sum()), "of", len(df))
col, row = np.clip(col, 0, W - 1), np.clip(row, 0, H - 1)
av = np.nan_to_num(air_arr[row, col])
rv = np.nan_to_num(rain_arr[row, col])
blob = np.round(av * 100).astype("<u2").tobytes() + np.round(rv * 10).astype("<u2").tobytes()
(out / "pixels_extra.bin").write_bytes(blob)

print("DONE")
a, r = stats["layers"]["AIR"], stats["layers"]["RAIN"]
print(f"Air temperature: mean {a['mean']} C, range {a['min']} to {a['max']} C")
print(f"Rainfall: mean {r['mean']} mm, range {r['min']} to {r['max']} mm")