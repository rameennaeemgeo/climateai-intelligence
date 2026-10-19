const GRADS = {
  YlOrRd: "#ffffb2,#fecc5c,#fd8d3c,#f03b20,#bd0026",
  YlGn: "#ffffcc,#c2e699,#78c679,#31a354,#006837",
  PuOr_r: "#2d004b,#8073ac,#f7f7f7,#fdb863,#b35806",
  magma: "#000004,#51127c,#b73779,#fc8961,#fcfdbf",
  terrain: "#333399,#00b3b3,#7fd24a,#e6d27a,#ffffff",
  YlOrBr: "#ffffd4,#fed98e,#fe9929,#d95f0e,#993404",
  Blues: "#f7fbff,#c6dbef,#6baed6,#2171b5,#08306b",
  Spectral_r: "#5e4fa2,#66c2a5,#e6f598,#fee08b,#f46d43,#9e0142"
};
const EXPO_COLORS = ["#2ecc71", "#f39c12", "#e74c3c"];
const fmt = n => Number(n).toLocaleString("en-US");

const map = L.map("map", { zoomControl: true });
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  attribution: "Tiles &copy; Esri", maxZoom: 16
}).addTo(map);
L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16
}).addTo(map);

let overlays = {}, current = null, opacity = 0.8, stats = null;

function showLayer(key) {
  if (current) map.removeLayer(overlays[current]);
  current = key;
  overlays[key].setOpacity(opacity).addTo(map);
  document.querySelectorAll("#layer-list button").forEach(b => b.classList.toggle("on", b.dataset.key === key));
  drawLegend(key);
}

function drawLegend(key) {
  const el = document.getElementById("legend");
  if (key === "EXPOSURE") {
    el.innerHTML = Object.entries(stats.exposure).map(([k, v]) =>
      `<div><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${EXPO_COLORS[k]};margin-right:6px"></span>${v.label} exposure</div>`).join("");
    return;
  }
  if (key === "LULC") {
    el.innerHTML = "<div>Land cover (most common class)</div>" + stats.layers.LULC.classes.map(c =>
      `<div><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${c.color};margin-right:6px"></span>${c.label} (${c.pct}%)</div>`).join("");
    return;
  }
  const l = stats.layers[key];
  el.innerHTML = `<div>${l.label} (${l.unit})</div><div class="bar" style="background:linear-gradient(90deg,${GRADS[l.colormap]})"></div>` +
    `<div class="ends"><span>${l.p2}</span><span>${l.p98}</span></div>`;
}

function renderStats() {
  const s = stats, L2 = s.layers;
  document.getElementById("kpis").innerHTML = [
    [s.study_area.area_km2 + " km²", "Study area"],
    [fmt(s.population_total_2020), "Population (2020)"],
    [L2.LST.mean + " °C", "Mean surface temp."],
    [L2.NDVI.mean, "Mean NDVI"]
  ].map(([v, t]) => `<div class="kpi"><b>${v}</b><span>${t}</span></div>`).join("");

  const totalPop = Object.values(s.exposure).reduce((a, e) => a + e.population, 0);
  document.getElementById("exposure").innerHTML = Object.entries(s.exposure).map(([k, e]) =>
    `<div class="row"><span>${e.label}</span>
     <div class="track"><div class="fill" style="width:${e.pct}%;background:${EXPO_COLORS[k]}"></div></div>
     <small>${e.area_km2} km² (${e.pct}%) · ${fmt(e.population)} people (${(100 * e.population / totalPop).toFixed(1)}%)</small></div>`).join("");

  document.getElementById("note").textContent = s.data_note;
}

function renderAI(ai) {
  const el = document.getElementById("ai");
  if (!ai) {
    el.textContent = "The AI risk model results are not available yet.";
    return;
  }
  const rows = ai.feature_importance.map(f =>
    `<div class="fi"><span>${f.label}</span><div class="track"><div class="fill" style="width:${(100 * f.importance).toFixed(0)}%;background:var(--teal)"></div></div><small>${(100 * f.importance).toFixed(0)}%</small></div>`).join("");
  const w = ai.what_if, base = w[0].mean_lst_c;
  el.innerHTML = `<p>${ai.model}. Test R²: <b>${ai.r2}</b>, error: <b>${ai.rmse} °C</b>, measured on areas the model never saw.</p>
    <div>What drives surface heat</div>${rows}
    <h2 style="margin-top:1.2rem">What if vegetation increases?</h2>
    <input type="range" id="wi" min="0" max="${w.length - 1}" step="1" value="0" style="width:100%;max-width:420px">
    <p id="wi-out"></p>
    <p class="note">${ai.limits}</p>`;
  const upd = () => {
    const s = w[+document.getElementById("wi").value];
    document.getElementById("wi-out").innerHTML =
      `If NDVI rises by <b>${s.ndvi_increase}</b> everywhere, the modelled mean surface temperature is <b>${s.mean_lst_c} °C</b> (${(s.mean_lst_c - base).toFixed(2)} °C compared with now).`;
  };
  document.getElementById("wi").oninput = upd;
  upd();
}

Promise.all([
  fetch("data/stats.json").then(r => r.json()),
  fetch("data/ai_results.json").then(r => r.ok ? r.json() : null).catch(() => null)
]).then(([s, ai]) => {
  stats = s;
  const b = s.bounds, bounds = [[b.south, b.west], [b.north, b.east]];
  map.fitBounds(bounds);
  const items = Object.entries(s.layers).map(([k, l]) => [k, l.label, "data/" + l.file]);
  items.push(["EXPOSURE", "Heat exposure class", "data/layers/EXPOSURE.png"]);
  const list = document.getElementById("layer-list");
  items.forEach(([k, label, url]) => {
    overlays[k] = L.imageOverlay(url, bounds);
    const btn = document.createElement("button");
    btn.dataset.key = k; btn.textContent = label;
    btn.onclick = () => showLayer(k);
    list.appendChild(btn);
  });
  renderStats(); renderAI(ai); showLayer("LST");
}).catch(() => {
  document.getElementById("kpis").textContent = "Could not load data/stats.json. Open the site through the local server (py -m http.server 5500) and check that the data folder contains stats.json and layers.";
});

document.getElementById("opacity").oninput = e => {
  opacity = +e.target.value;
  if (current) overlays[current].setOpacity(opacity);
};
