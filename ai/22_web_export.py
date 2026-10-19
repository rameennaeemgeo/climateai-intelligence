import json
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap
from affine import Affine
from rasterio.features import rasterize
from rasterio.transform import array_bounds, xy
from rasterio.warp import (Resampling, calculate_default_transform,
                           reproject, transform, transform_geom)

root = Path(__file__).resolve().parent.parent
pdata = root / "04_Processed_Data"
out = root / "10_Web_Export"
(out / "layers").mkdir(parents=True, exist_ok=True)


def find(prefix):
    return next(f for f in sorted(pdata.glob(prefix + "*.tif")) if "WRONG" not in f.name)


# ---- reference grid: DEM 100 m ----
with rasterio.open(find("DEM_100m")) as ref:
    REF_TR, REF_CRS, H, W = ref.transform, ref.crs, ref.height, ref.width
PIX_KM2 = abs(REF_TR.a * REF_TR.e) / 1e6


def load(prefix, band=1, nodata=np.nan, method=Resampling.average):
    with rasterio.open(find(prefix)) as src:
        dst = np.full((H, W), np.nan, dtype="float32")
        reproject(rasterio.band(src, band), dst,
                  src_transform=src.transform, src_crs=src.crs, src_nodata=nodata,
                  dst_transform=REF_TR, dst_crs=REF_CRS, dst_nodata=np.nan,
                  resampling=method)
    return dst


# ---- Islamabad mask (smaller of the two districts) ----
gj = json.loads((root / "02_Boundaries" / "twin_cities_districts.geojson").read_text(encoding="utf-8"))
cands = []
for ft in gj["features"]:
    g = transform_geom("EPSG:4326", REF_CRS, ft["geometry"])
    m = rasterize([(g, 1)], out_shape=(H, W), transform=REF_TR, fill=0, dtype="uint8").astype(bool)
    cands.append((m.sum() * PIX_KM2, ft.get("properties", {}), m))
for a, p, _ in cands:
    print(f"feature {p} -> {a:.1f} km2")
area_km2, props, mask = min(cands, key=lambda c: c[0])
print(f"\nSelected study area: {area_km2:.1f} km2 (expected about 896 for Islamabad)\n")

rows, cols = np.where(mask)
r0, r1, c0, c1 = rows.min(), rows.max() + 1, cols.min(), cols.max() + 1
TR = REF_TR * Affine.translation(c0, r0)


def prep(a):
    a = a.copy()
    a[~mask] = np.nan
    return a[r0:r1, c0:c1]


data = {
    "LST": prep(load("LST_5scene", 1)),
    "NDVI": prep(load("NDVI_NDBI_8dates", 1)),
    "NDBI": prep(load("NDVI_NDBI_8dates", 2)),
    "BUILTUP": prep(load("BUILTUP_prob")),
    "DEM": prep(load("DEM_100m")),
    "POP": prep(load("POP_density_2020_100m")),
    "EXPOSURE": prep(load("exposure_classes", 1, 255, Resampling.nearest)),
}

# key: (label, unit, colormap)
META = {
    "LST": ("Land Surface Temperature", "deg C", "YlOrRd"),
    "NDVI": ("Vegetation (NDVI)", "index", "YlGn"),
    "NDBI": ("Built-up index (NDBI)", "index", "PuOr_r"),
    "BUILTUP": ("Built-up probability", "probability", "magma"),
    "DEM": ("Elevation", "m", "terrain"),
    "POP": ("Population density (2020)", "people/km2", "YlOrBr"),
}
# CHECK: confirm what classes 0, 1, 2 mean in your 20_exposure.py
EXPOSURE_LABELS = {0: "Other areas", 1: "Hot (top 25% LST)", 2: "Hotspot"}
EXPOSURE_COLORS = ["#2ecc71", "#f39c12", "#e74c3c"]


# ---- PNG overlays in EPSG:4326 ----
h, w = data["LST"].shape
dst_tr, dw, dh = calculate_default_transform(
    REF_CRS, "EPSG:4326", w, h, *array_bounds(h, w, TR), resolution=0.0009)
west, north = dst_tr.c, dst_tr.f
east, south = west + dw * dst_tr.a, north + dh * dst_tr.e


def to_png(arr, name, cmap, vmin, vmax, categorical=False):
    dst = np.full((dh, dw), np.nan, dtype="float32")
    reproject(arr.astype("float32"), dst, src_transform=TR, src_crs=REF_CRS, src_nodata=np.nan,
              dst_transform=dst_tr, dst_crs="EPSG:4326", dst_nodata=np.nan,
              resampling=Resampling.nearest if categorical else Resampling.bilinear)
    norm = np.clip((dst - vmin) / (vmax - vmin), 0, 1)
    rgba = cmap(np.nan_to_num(norm))
    rgba[np.isnan(dst), 3] = 0
    plt.imsave(out / "layers" / f"{name}.png", rgba)


stats = {}
for key, (label, unit, cmap_name) in META.items():
    a = data[key]
    v = a[np.isfinite(a)]
    p2, p98 = float(np.percentile(v, 2)), float(np.percentile(v, 98))
    to_png(a, key, matplotlib.colormaps[cmap_name], p2, p98)
    stats[key] = {
        "label": label, "unit": unit, "file": f"layers/{key}.png", "colormap": cmap_name,
        "mean": round(float(v.mean()), 3), "min": round(float(v.min()), 3),
        "max": round(float(v.max()), 3), "p2": round(p2, 3), "p98": round(p98, 3),
    }

to_png(data["EXPOSURE"], "EXPOSURE", ListedColormap(EXPOSURE_COLORS), 0, 2, categorical=True)

# ---- population and exposure statistics ----
pop_pix = data["POP"] * PIX_KM2  # people per pixel
total_pop = float(np.nansum(pop_pix))
exposure = {}
ex = data["EXPOSURE"]
n_ex = int(np.isfinite(ex).sum())
for k, lab in EXPOSURE_LABELS.items():
    sel = ex == k
    exposure[str(k)] = {
        "label": lab,
        "area_km2": round(float(sel.sum() * PIX_KM2), 1),
        "pct": round(100 * float(sel.sum()) / n_ex, 1),
        "population": int(round(float(np.nansum(pop_pix[sel])))),
    }

summary = {
    "study_area": {"name": "Islamabad District", "area_km2": round(float(area_km2), 1),
                   "pixel_size_m": 100, "source_crs": "EPSG:32643"},
    "bounds": {"south": south, "west": west, "north": north, "east": east},
    "population_total_2020": int(round(total_pop)),
    "layers": stats,
    "exposure": exposure,
    "data_note": ("Derived from the author's UrbanSense university project: Landsat 8/9 LST "
                  "(5 scenes), Sentinel-2 NDVI/NDBI (8 dates), 29 May - 8 Jul 2026; "
                  "WorldPop 2020; DEM. Single-season snapshot."),
}
(out / "stats.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")

# ---- table for the AI model ----
valid = np.ones(data["LST"].shape, dtype=bool)
for k in ["LST", "NDVI", "NDBI", "BUILTUP", "DEM", "POP"]:
    valid &= np.isfinite(data[k])
rr, cc = np.where(valid)
xs, ys = xy(TR, rr, cc)
lon, lat = transform(REF_CRS, "EPSG:4326", xs, ys)
df = pd.DataFrame({
    "lon": lon, "lat": lat,
    "LST": data["LST"][rr, cc], "NDVI": data["NDVI"][rr, cc], "NDBI": data["NDBI"][rr, cc],
    "BUILTUP": data["BUILTUP"][rr, cc], "DEM": data["DEM"][rr, cc], "POP": data["POP"][rr, cc],
    "EXPOSURE": data["EXPOSURE"][rr, cc],
})
df.to_csv(out / "ml_table_islamabad_100m.csv", index=False)

print("DONE")
print(f"Population (2020 est.): {total_pop:,.0f}")
print(f"LST mean: {stats['LST']['mean']} C | NDVI mean: {stats['NDVI']['mean']} | Built-up mean: {stats['BUILTUP']['mean']}")
print("Exposure:", json.dumps(exposure))
print(f"Table rows for ML: {len(df):,}")
print(f"Output folder: {out}")