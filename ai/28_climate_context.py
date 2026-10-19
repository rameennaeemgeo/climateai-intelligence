import json
from pathlib import Path

import ee
import numpy as np

import config

root = Path(__file__).resolve().parent.parent
out = root / "10_Web_Export"
config.init()

START, END = "2026-05-29", "2026-07-09"  # same window as the satellite layers (end date is exclusive)
SCENES = ["2026-05-29", "2026-06-06", "2026-06-14", "2026-06-30", "2026-07-08"]  # Landsat LST scene dates

# Islamabad District polygon from your own boundary file
gj = json.loads((root / "02_Boundaries" / "twin_cities_districts.geojson").read_text(encoding="utf-8"))
feat = next(f for f in gj["features"] if "Islamabad" in str(f["properties"].get("ADM2_NAME", "")))
geom = ee.Geometry(feat["geometry"])

era = ee.ImageCollection("ECMWF/ERA5_LAND/DAILY_AGGR").select(["temperature_2m", "temperature_2m_min", "temperature_2m_max"])
chirps = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY").select("precipitation")
hourly = ee.ImageCollection("ECMWF/ERA5_LAND/HOURLY").select("temperature_2m")


def mean_of(img, band, scale):
    return img.reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=scale, bestEffort=True).get(band)


# 1. daily series for the study window
print("ERA5-Land days:", era.filterDate(START, END).size().getInfo(), "| CHIRPS days:", chirps.filterDate(START, END).size().getInfo())


def daily(img):
    v = img.reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=11132, bestEffort=True)
    return ee.Feature(None, v).set("date", img.date().format("YYYY-MM-dd"))


def daily_rain(img):
    v = img.reduceRegion(reducer=ee.Reducer.mean(), geometry=geom, scale=5566, bestEffort=True)
    return ee.Feature(None, v).set("date", img.date().format("YYYY-MM-dd"))


t_feats = ee.FeatureCollection(era.filterDate(START, END).map(daily)).getInfo()["features"]
r_feats = ee.FeatureCollection(chirps.filterDate(START, END).map(daily_rain)).getInfo()["features"]
rain_by_date = {f["properties"]["date"]: f["properties"].get("precipitation") for f in r_feats}
daily_rows = []
for f in sorted(t_feats, key=lambda x: x["properties"]["date"]):
    p = f["properties"]
    if p.get("temperature_2m") is None:
        continue
    r = rain_by_date.get(p["date"])
    daily_rows.append({"date": p["date"], "t_mean": round(p["temperature_2m"] - 273.15, 2),
                       "t_min": round(p["temperature_2m_min"] - 273.15, 2),
                       "t_max": round(p["temperature_2m_max"] - 273.15, 2),
                       "rain": round(r, 2) if r is not None else None})
if not daily_rows:
    raise SystemExit("No ERA5-Land data returned for the study window. Paste the messages above to Claude.")

# 2. the same 29 May to 8 Jul window in every year, 1991 to 2026
def per_year(y):
    y = ee.Number(y)
    s, e = ee.Date.fromYMD(y, 5, 29), ee.Date.fromYMD(y, 7, 9)
    t = mean_of(era.select("temperature_2m").filterDate(s, e).mean(), "temperature_2m", 11132)
    r = mean_of(chirps.filterDate(s, e).sum(), "precipitation", 5566)
    return ee.Feature(None, {"year": y, "t": t, "rain": r})


yrs = ee.FeatureCollection(ee.List.sequence(1991, 2026).map(per_year)).getInfo()["features"]
years = []
for f in yrs:
    p = f["properties"]
    years.append({"year": int(p["year"]),
                  "t": round(p["t"] - 273.15, 2) if p.get("t") is not None else None,
                  "rain": round(p["rain"], 1) if p.get("rain") is not None else None})
years.sort(key=lambda d: d["year"])


def normal(key):
    v = [d[key] for d in years if 1991 <= d["year"] <= 2020 and d[key] is not None]
    return float(np.mean(v))


cur = next(d for d in years if d["year"] == 2026)
n_t, n_r = normal("t"), normal("rain")
tx = [(d["year"], d["t"]) for d in years if d["year"] <= 2025 and d["t"] is not None]
slope = float(np.polyfit([a for a, _ in tx], [b for _, b in tx], 1)[0]) * 10

# 3. surface temperature vs air temperature at the satellite overpass time (06:00 UTC, about 11:00 in Pakistan)
air = []
for d in SCENES:
    t0 = ee.Date(d).advance(6, "hour")
    img = hourly.filterDate(t0, t0.advance(1, "hour")).first()
    v = mean_of(img, "temperature_2m", 11132).getInfo()
    if v is not None:
        air.append(v - 273.15)
lst_mean = json.loads((out / "stats.json").read_text(encoding="utf-8"))["layers"]["LST"]["mean"]
air_mean = float(np.mean(air)) if air else None

res = {
    "window": {"start": "2026-05-29", "end": "2026-07-08"},
    "daily": daily_rows,
    "summary": {
        "days": len(daily_rows),
        "t_mean": round(float(np.mean([d["t_mean"] for d in daily_rows])), 1),
        "t_max_peak": round(max(d["t_max"] for d in daily_rows), 1),
        "rain_total": round(sum(d["rain"] or 0 for d in daily_rows), 1)},
    "years": years,
    "normal": {"period": "1991-2020", "t": round(n_t, 2), "rain": round(n_r, 1)},
    "anomaly_2026": {"t_diff": round(cur["t"] - n_t, 2) if cur["t"] is not None else None,
                     "rain_pct": round(100 * cur["rain"] / n_r) if cur["rain"] is not None and n_r else None},
    "trend": {"t_per_decade": round(slope, 2), "years": "1991-2025"},
    "surface_vs_air": {"lst_mean": lst_mean, "air_at_overpass": round(air_mean, 1) if air_mean is not None else None,
                       "diff": round(lst_mean - air_mean, 1) if air_mean is not None else None, "scenes": len(air)},
    "notes": ("Air temperature: ERA5-Land reanalysis (about 11 km grid), averaged over Islamabad District. "
              "Rainfall: CHIRPS (about 5 km grid), averaged over the district. These are model and satellite-gauge "
              "products, not weather-station measurements."),
}
(out / "climate.json").write_text(json.dumps(res, indent=1), encoding="utf-8")

print("Saved:", out / "climate.json")
print(f"Window air temp: mean {res['summary']['t_mean']} C, hottest day max {res['summary']['t_max_peak']} C, rain {res['summary']['rain_total']} mm over {len(daily_rows)} days")
print(f"2026 vs 1991-2020 normal: temperature {res['anomaly_2026']['t_diff']} C, rainfall {res['anomaly_2026']['rain_pct']}% of normal")
print(f"Trend 1991-2025: {res['trend']['t_per_decade']} C per decade")
print("Surface vs air at overpass:", res["surface_vs_air"])