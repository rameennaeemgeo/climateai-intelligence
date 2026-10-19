(() => {
const $ = (s, r = document) => r.querySelector(s);
const fmt = (v, d = 1) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
const J = u => fetch(u).then(r => { if (!r.ok) throw new Error(u + " not found"); return r.json(); });
const FN = ["NDVI", "NDBI", "BUILTUP", "DEM", "POP"];
const FL = { NDVI: "Vegetation (NDVI)", NDBI: "Built-up index (NDBI)", BUILTUP: "Built-up probability", DEM: "Elevation (m)", POP: "Population density (/km²)" };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const kmd = (aLat, aLon, bLat, bLon) => Math.hypot((aLon - bLon) * Math.cos(aLat * Math.PI / 180) * 111.32, (aLat - bLat) * 110.574);
const compass = (aLat, aLon, bLat, bLon) => ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round((((Math.atan2((bLon - aLon) * Math.cos(aLat * Math.PI / 180), bLat - aLat) * 180 / Math.PI) + 360) % 360) / 45) % 8];
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
const NOM = new Map();
const PLACE_ORDER = ["neighbourhood", "suburb", "quarter", "city_block", "village", "hamlet", "locality", "town"];
const prank = t => PLACE_ORDER.includes(t.place) ? 100 - PLACE_ORDER.indexOf(t.place) : /residential|commercial|industrial|retail/.test(t.landuse || "") ? 50 : t.boundary === "administrative" ? (+t.admin_level || 0) : -1;
async function placeName(lat, lon, quick) {
  const nk = lat.toFixed(4) + "," + lon.toFixed(4); if (!NOM.has(nk)) NOM.set(nk, withTimeout(fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=en&lat=${lat}&lon=${lon}`).then(x => x.json()), 8000).catch(() => null)); const nom = NOM.get(nk);
  const ovp = quick ? Promise.resolve(null) : withTimeout(fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(`[out:json][timeout:12];is_in(${lat},${lon})->.a;(area.a["name"];node(around:3000,${lat},${lon})["place"]["name"];);out body 80;`)).then(x => x.json()), 12000).catch(() => null);
  const [r, o] = await Promise.all([nom, ovp]);
  if (!r && !o) return "Name unavailable (needs internet)";
  const els = (o && o.elements) || [], a = (r && r.address) || {};
  const inArea = els.filter(e => e.type === "area" && e.tags && e.tags.name && prank(e.tags) >= 0).sort((x, y) => prank(y.tags) - prank(x.tags))[0];
  const seen = new Set(), near = els.filter(e => e.type === "node" && e.tags && e.tags.name).map(e => ({ name: e.tags.name, d: kmd(lat, lon, e.lat, e.lon), dir: compass(lat, lon, e.lat, e.lon) })).sort((x, y) => x.d - y.d).filter(n => !seen.has(n.name) && seen.add(n.name));
  const local = inArea ? inArea.tags.name : (a.neighbourhood || a.suburb || a.quarter || a.village || a.hamlet || "");
  const parts = [a.road, local].filter(Boolean);
  if (!local && near[0]) parts.push(`Near ${near[0].name} (${near[0].d.toFixed(1)} km ${near[0].dir})`);
  parts.push("Islamabad");
  return [...new Set(parts)].join(", ");
}
Chart.defaults.color = "#586a86"; Chart.defaults.borderColor = "#d6e0ee";
const st = document.createElement("style");
st.textContent = `.wrap{max-width:1400px;margin:auto;padding:1rem 1.5rem}.cols{display:grid;grid-template-columns:minmax(320px,430px) 1fr;gap:1rem}
@media(max-width:900px){.cols{grid-template-columns:1fr}}.box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:1rem}
.box h2{margin-bottom:.6rem}.mm{height:300px;border-radius:8px}.row2{display:flex;justify-content:space-between;gap:.5rem;font-size:.9rem;color:var(--mute);margin:.4rem 0 0}
input[type=range],select,.q{width:100%}select,.q{background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:.45rem;font:inherit}
.btn{background:var(--blue);color:#fff;border:0;border-radius:6px;padding:.4rem .8rem;font:inherit;cursor:pointer;margin:.15rem .2rem .15rem 0}
.big{font:700 2.2rem Sora,sans-serif;color:var(--teal);margin:.3rem 0}.tb{width:100%;border-collapse:collapse;font-size:.92rem;margin:.5rem 0}
.tb th,.tb td{border-bottom:1px solid var(--line);padding:.4rem .5rem;text-align:right}.tb th:first-child,.tb td:first-child{text-align:left}.tb th{color:var(--teal)}
.note{color:var(--mute);font-size:.88rem}.aint a{color:var(--teal);margin-left:1rem;white-space:nowrap}.top{flex-wrap:wrap}
.hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}.hub a{text-decoration:none;color:var(--text)}.hub .box:hover{border-color:var(--teal)}
.hub b{color:var(--teal);font:700 1.6rem Sora,sans-serif}.hub p{color:var(--mute)}.bar{height:12px;background:var(--bg);border-radius:6px;overflow:hidden}.bar i{display:block;height:100%;background:var(--teal)}
.fi{display:grid;grid-template-columns:170px 1fr 45px;gap:.6rem;align-items:center;margin:.35rem 0}.pg{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}
.msg{padding:.6rem .8rem;border-radius:8px;margin:.5rem 0;max-width:85%}.me{background:var(--blue);color:#fff;margin-left:auto}.bot{background:var(--bg);border:1px solid var(--line)}
#chat{min-height:280px;max-height:55vh;overflow:auto}
.shell{display:grid;grid-template-columns:230px 1fr;min-height:100vh}.sb{background:#0b2447;border-right:1px solid var(--line);padding:1rem;position:sticky;top:0;height:100vh}
.sb a{display:block;padding:.6rem .8rem;border-radius:8px;color:#a9c1e6;text-decoration:none;margin:.2rem 0}.sb a.on{background:rgba(255,255,255,.14);color:#fff;font-weight:600}.sb a:hover{color:#fff}
.brand{padding:.4rem .8rem 1rem}.brand b{display:block;font:700 1.2rem Sora,sans-serif;color:#fff}.brand span{color:#a9c1e6;font-size:.8rem}.sb .back{margin-top:2rem;border-top:1px solid var(--line);border-radius:0;padding-top:1rem}
@media(max-width:900px){.shell{grid-template-columns:1fr}.sb{position:static;height:auto}}
.kc{position:absolute;top:12px;left:56px;display:flex;gap:.6rem;z-index:500;pointer-events:none;flex-wrap:wrap;max-width:calc(100% - 70px)}.kc div{background:rgba(255,255,255,.95);color:#0a1424;border-radius:10px;padding:.4rem .7rem}
.kc span{display:block;font-size:.62rem;letter-spacing:.05em;text-transform:uppercase;color:#5b6b80}.kc b{font:700 1.05rem Sora,sans-serif}
.tabs{position:absolute;top:74px;left:56px;z-index:500;display:flex;background:#fff;border-radius:999px;padding:3px}.tabs button{border:0;background:none;padding:.3rem .8rem;border-radius:999px;font:600 .7rem Sora,sans-serif;cursor:pointer;color:#0a1424}.tabs button.on{background:#1d6fd8;color:#fff}
.alert{border:1px solid #7a2f2f;background:rgba(231,76,60,.12);border-radius:10px;padding:.7rem;margin-bottom:.8rem}.alert b{color:#e74c3c;font-size:.78rem;letter-spacing:.06em}.alert p{margin:.3rem 0 0;font-size:.9rem}
.strat{margin-top:1rem;border-top:1px solid var(--line);padding-top:.8rem}.strat h3{color:var(--teal);letter-spacing:.08em;font-size:.85rem}.sc{border:1px solid var(--line);border-radius:10px;padding:.7rem;margin:.5rem 0}.sc p{margin:.2rem 0;color:var(--mute);font-size:.9rem}
.tag{display:inline-block;background:rgba(59,140,255,.15);color:#1d4f9f;border-radius:6px;padding:.1rem .45rem;font-size:.7rem;font-weight:600;margin:.2rem .3rem 0 0}
.cols2{display:grid;grid-template-columns:1.1fr 1fr;gap:1rem}@media(max-width:900px){.cols2{grid-template-columns:1fr}}
@media print{:root{--bg:#fff;--panel:#fff;--line:#ccc;--text:#111;--mute:#555;--teal:#087f73}.sb,.btn{display:none}.shell{display:block}}`;
document.head.appendChild(st);

// ---------- shared data and model helpers ----------
let PX;
async function pixels() {
  if (PX) return PX;
  const meta = await J("data/pixels_meta.json"), buf = await (await fetch("data/pixels.bin")).arrayBuffer(), n = meta.n; let o = 0;
  const t = (T, b) => { const a = new T(buf, o, n); o += n * b; return a; };
  const lq = t(Uint16Array, 2), tq = t(Uint16Array, 2), a = [t(Uint16Array, 2), t(Int16Array, 2), t(Int16Array, 2), t(Uint16Array, 2), t(Uint16Array, 2), t(Uint16Array, 2)];
  const S = [100, 1000, 1000, 1000, 1, 1], f = k => Float32Array.from(a[k], v => v / S[k]);
  PX = { meta, n, lon: Float32Array.from(lq, v => meta.lon0 + v * meta.step), lat: Float32Array.from(tq, v => meta.lat0 + v * meta.step), lst: f(0), X: [1, 2, 3, 4, 5].map(f) };
  const C = .001, g = new Map(), key = (la, lo) => Math.floor((lo - meta.lon0) / C) * 10000 + Math.floor((la - meta.lat0) / C);
  for (let i = 0; i < n; i++) { const k = key(PX.lat[i], PX.lon[i]); (g.get(k) || g.set(k, []).get(k)).push(i); }
  PX.row = i => PX.X.map(c => c[i]);
  PX.km = (i, la, lo) => Math.hypot((PX.lon[i] - lo) * Math.cos(la * Math.PI / 180) * 111.32, (PX.lat[i] - la) * 110.574);
  PX.nearest = (la, lo) => {
    const ci = Math.floor((lo - meta.lon0) / C), cj = Math.floor((la - meta.lat0) / C); let best = -1, bd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of g.get((ci + a) * 10000 + cj + b) || []) { const d = PX.km(i, la, lo) * 1000; if (d < bd) { bd = d; best = i; } }
    return bd <= 100 ? best : -1;
  };
  return PX;
}
const tree = (t, x) => { let n = 0; while (t.l[n] !== -1) n = x[t.f[n]] <= t.t[n] ? t.l[n] : t.r[n]; return t.v[n]; };
const predict = (m, x) => m.type === "lin" ? m.b + m.c.reduce((s, c, i) => s + c * x[i], 0)
  : m.type === "rf" ? m.trees.reduce((s, t) => s + tree(t, x), 0) / m.trees.length : m.init + m.lr * m.trees.reduce((s, t) => s + tree(t, x), 0);
function baseMap(el) {
  const m = L.map(el, { zoomSnap: .5 }).setView([33.65, 73.1], 10);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", { attribution: "Tiles &copy; Esri", maxZoom: 16 }).addTo(m);
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}", { maxZoom: 16 }).addTo(m);
  return m;
}
function paint(b, px, fn) {
  const w = 651, h = 367, c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  for (let i = 0; i < px.n; i++) { const k = fn(i); if (!k) continue; x.fillStyle = `rgba(${k[0]},${k[1]},${k[2]},${k[3] ?? .85})`;
    x.fillRect(Math.floor((px.lon[i] - b.west) / (b.east - b.west) * w) - 1, Math.floor((b.north - px.lat[i]) / (b.north - b.south) * h) - 1, 2, 2); }
  return L.imageOverlay(c.toDataURL(), [[b.south, b.west], [b.north, b.east]]);
}
async function inputs(host, ms, onChange) {
  const [px, sj] = await Promise.all([pixels(), J("data/stats.json")]);
  const S = { v: ms.presets["Islamabad average"].slice(), obs: null, i: -1 };
  host.innerHTML = `<div class="box"><h2>1. Choose a place</h2><div class="mm" id="pm"></div><p class="row2">Click inside the coloured area, or use a preset.</p><p class="note" id="pl">Selected place: none yet (using preset values)</p><div id="pre"></div><h2 style="margin-top:1rem">2. Environmental inputs</h2><div id="sl"></div></div>`;
  const m = baseMap($("#pm", host)), b = sj.bounds, bb = [[b.south, b.west], [b.north, b.east]];
  L.imageOverlay("data/" + sj.layers.LST.file, bb, { opacity: .55 }).addTo(m); m.fitBounds(bb);
  const pin = L.circleMarker([0, 0], { radius: 7, color: "#fff", fillColor: "#1d6fd8", fillOpacity: 1 }), sl = []; let tok = 0;
  const show = () => FN.forEach((f, k) => { sl[k].value = S.v[k]; $("#v" + k, host).textContent = fmt(S.v[k], f === "DEM" || f === "POP" ? 0 : 3); });
  FN.forEach((f, k) => { const [lo, hi] = ms.ranges[f], d = document.createElement("div");
    d.innerHTML = `<div class="row2"><span>${FL[f]}</span><b id="v${k}"></b></div><input type="range" min="${lo}" max="${hi}" step="${(hi - lo) / 200}">`;
    $("#sl", host).appendChild(d); sl[k] = d.querySelector("input"); sl[k].oninput = () => { S.v[k] = +sl[k].value; show(); onChange(S); }; });
  Object.entries(ms.presets).forEach(([n, v]) => { const bt = document.createElement("button"); bt.className = "btn"; bt.textContent = n;
    bt.onclick = () => { S.v = v.slice(); S.obs = null; S.i = -1; m.removeLayer(pin); tok++; $("#pl", host).textContent = "Selected place: none (preset values: " + n + ")"; show(); onChange(S); }; $("#pre", host).appendChild(bt); });
  m.on("click", e => { const i = px.nearest(e.latlng.lat, e.latlng.lng); if (i < 0) { $("#pl", host).textContent = "No data at this spot. Click inside the coloured area."; return; }
    S.i = i; S.obs = px.lst[i]; S.v = px.row(i); pin.setLatLng(e.latlng).addTo(m); show(); onChange(S);
    const tk = ++tok, la = e.latlng.lat, lo = e.latlng.lng, c = ` <span class="note">(${la.toFixed(4)}, ${lo.toFixed(4)})</span>`;
    $("#pl", host).innerHTML = "<b>Selected place:</b> looking up the name..." + c;
    const upd = nm => { if (tk === tok) $("#pl", host).innerHTML = "<b>Selected place:</b> " + esc(nm) + c; };
    placeName(la, lo, true).then(upd).then(() => placeName(la, lo)).then(upd); });
  show(); onChange(S);
}

// ---------- pages ----------
const PAGES = {
hub(app) {
  const c = [["ai-predict", "01", "Advanced Climate Prediction", "Compare three models and predict surface temperature for any place or custom inputs."],
    ["ai-explain", "02", "Explainable AI", "See which factors drive a prediction, global importance and partial-dependence curves."],
    ["ai-simulate", "03", "Climate Simulator", "Add vegetation or built-up area and see the estimated temperature change on a map."],
    ["ai-risk", "04", "Climate Risk Intelligence", "Build a weighted heat-risk map, toggle layers and find priority areas."],
    ["ai-copilot", "05", "AI Climate Copilot", "Ask questions and get answers grounded in this project's own data and model results."]];
  app.innerHTML = `<p class="note">Select a capability to open its workspace. Every result is computed from the project's real data and models.</p><div class="hub">` +
    c.map(([u, n, t, d]) => `<a href="${u}.html"><div class="box"><b>${n}</b><h2>${t}</h2><p>${d}</p></div></a>`).join("") + `</div>`;
},
async predict(app) {
  const ms = await J("data/ai_models.json"), names = Object.keys(ms.models); let ch;
  app.innerHTML = `<div class="cols"><div id="in"></div><div><div class="box"><h2>3. Predicted surface temperature</h2><label>Model <select id="ms">${names.map(n => `<option>${n}</option>`).join("")}</select></label>
    <p class="big" id="out"></p><span class="tag" id="acc"></span><p class="row2" id="obs"></p></div><div class="box" style="margin-top:1rem"><h2>Model comparison on areas not used for training</h2><table class="tb" id="tb"></table><canvas id="sc" height="240"></canvas>
    <p class="note">Compact models that run in your browser, trained on ${fmt(ms.n_train, 0)} pixels and tested on ${fmt(ms.n_test, 0)} pixels from held-out 2 km blocks. The larger model on the map page reaches slightly higher accuracy.</p></div></div></div>`;
  $("#tb").innerHTML = "<tr><th>Model</th><th>R²</th><th>RMSE (°C)</th><th>MAE (°C)</th></tr>" + names.map(n => `<tr><td>${n}</td><td>${ms.models[n].r2}</td><td>${ms.models[n].rmse}</td><td>${ms.models[n].mae}</td></tr>`).join("");
  let last; const cols = ["#3b8cff", "#1d6fd8", "#fd8d3c"], scatter = () => { if (ch) ch.destroy(); ch = new Chart($("#sc"), { type: "scatter", data: { datasets: names.map((n, k) => ({ label: n, data: ms.scatter[n].map(([x, y]) => ({ x, y })), backgroundColor: cols[k], pointRadius: 2 })).concat([{ type: "line", label: "Perfect prediction", data: [{ x: 28, y: 28 }, { x: 50, y: 50 }], borderColor: "#0b2447", borderDash: [6, 4], pointRadius: 0 }]) },
    options: { scales: { x: { title: { display: true, text: "Observed LST (°C), click the legend to toggle models" } }, y: { title: { display: true, text: "Predicted LST (°C)" } } } } }); };
  const run = S => { last = S; const n = $("#ms").value, p = predict(ms.models[n].model, S.v); $("#out").textContent = fmt(p, 1) + " °C"; $("#acc").textContent = "R² " + ms.models[n].r2 + " ACCURACY";
    $("#obs").textContent = S.i >= 0 ? `Satellite-observed at this place: ${fmt(S.obs, 1)} °C (difference ${fmt(p - S.obs, 1)} °C)` : "Pick a place on the map to compare with the satellite value."; };
  $("#ms").onchange = () => run(last);
  scatter(); $("#ms").value = names[1]; await inputs($("#in"), ms, run);
},
async explain(app) {
  const ms = await J("data/ai_models.json"), M = ms.models["Random forest"].model, avg = ms.presets["Islamabad average"]; let lc;
  app.innerHTML = `<div class="cols"><div id="in"></div><div><div class="box"><h2>Why this prediction?</h2><p id="ex"></p><canvas id="lc" height="230"></canvas>
    <p class="note">Each bar shows how much the prediction changes when that one factor is replaced by the Islamabad average. Positive means this place's value pushes the temperature up. Bars are one-at-a-time effects and do not add up exactly.</p></div>
    <div class="box" style="margin-top:1rem"><h2>What drives surface heat overall</h2><div id="gi"></div></div></div></div><div class="box" style="margin-top:1rem"><h2>How each factor changes the prediction (others at typical values)</h2><div class="pg" id="pd"></div></div>`;
  $("#gi").innerHTML = Object.entries(ms.importance).sort((a, b) => b[1] - a[1]).map(([f, v]) => `<div class="fi"><span>${FL[f]}</span><div class="bar"><i style="width:${v * 100}%"></i></div><b>${Math.round(v * 100)}%</b></div>`).join("");
  FN.forEach(f => { const d = document.createElement("div"); d.innerHTML = `<h3 class="note">${FL[f]}</h3><canvas height="170"></canvas>`; $("#pd").appendChild(d);
    new Chart(d.querySelector("canvas"), { type: "line", data: { labels: ms.pdp[f].x, datasets: [{ data: ms.pdp[f].y, borderColor: "#fd8d3c", pointRadius: 0 }] }, options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 5 } }, y: { title: { display: true, text: "LST (°C)" } } } } }); });
  const run = S => { const base = predict(M, S.v), eff = FN.map((f, j) => { const x = S.v.slice(); x[j] = avg[j]; return base - predict(M, x); });
    const hi = eff.indexOf(Math.max(...eff)), lo = eff.indexOf(Math.min(...eff));
    $("#ex").innerHTML = `Predicted <b>${fmt(base, 1)} °C</b>. Biggest warming factor: <b>${FL[FN[hi]]}</b> (${fmt(eff[hi], 2)} °C). Biggest cooling factor: <b>${FL[FN[lo]]}</b> (${fmt(eff[lo], 2)} °C).`;
    if (lc) lc.destroy(); lc = new Chart($("#lc"), { type: "bar", data: { labels: FN.map(f => FL[f]), datasets: [{ data: eff.map(v => +v.toFixed(2)), backgroundColor: eff.map(v => v >= 0 ? "#e74c3c" : "#3b8cff") }] },
      options: { indexAxis: "y", plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: "Effect on predicted LST (°C)" } } } } }); };
  await inputs($("#in"), ms, run);
},
async simulate(app) {
  const [ms, sj, px] = await Promise.all([J("data/ai_models.json"), J("data/stats.json"), pixels()]), M = ms.models["Random forest"].model, b = sj.bounds;
  app.innerHTML = `<div class="cols"><div class="box"><div class="alert"><b>ALERT: HEAT HOTSPOTS</b><p>${sj.exposure["2"].area_km2} km² of Islamabad combine top-25% heat, sparse vegetation and dense population. About ${fmt(sj.exposure["2"].population, 0)} people live there.</p></div><h2>1. Where?</h2><select id="rad"><option value="0">Whole district</option><option value="1">1 km around the point</option><option value="2">2 km around the point</option><option value="5">5 km around the point</option></select>
    <p class="row2">For a local scenario click the map to set the point.</p><p class="note" id="sp"></p><h2 style="margin-top:1rem">2. Scenario</h2>
    ${[["dN", "Change in vegetation (NDVI)", -0.2, 0.3, 0.01, 0.1], ["dB", "Change in built-up index (NDBI)", -0.1, 0.1, 0.01, 0], ["dP", "Change in built-up probability", -0.2, 0.2, 0.02, 0]].map(([id, l, lo, hi, s, v]) =>
      `<div class="row2"><span>${l}</span><b id="${id}v">${v}</b></div><input type="range" id="${id}" min="${lo}" max="${hi}" step="${s}" value="${v}">`).join("")}
    <p><button class="btn" id="go">Run simulation</button></p><div id="res"></div>
    <p class="note">A model-based what-if using the compact Random Forest, not a forecast. NDVI and NDBI are strongly linked in reality, so changing only one is an idealised case.</p></div>
    <div class="box"><h2>Estimated change in surface temperature</h2><div style="position:relative"><div class="mm" id="sm" style="height:540px"></div><div class="kc" id="kc"></div><div class="tabs" id="tb2"></div></div><p class="note">Blue = cooler, red = warmer. Pixels outside the chosen area are not coloured.</p></div></div>`;
  const m = baseMap($("#sm")), bb = [[b.south, b.west], [b.north, b.east]]; m.fitBounds(bb); let bg;
  const showBg = k => { if (bg) m.removeLayer(bg); bg = L.imageOverlay("data/" + sj.layers[k].file, bb, { opacity: .55 }).addTo(m); bg.bringToBack(); document.querySelectorAll("#tb2 button").forEach(x => x.classList.toggle("on", x.dataset.k === k)); };
  $("#tb2").innerHTML = [["LST", "HEAT MAP"], ["NDVI", "VEGETATION"], ["BUILTUP", "BUILT AREA"]].map(([k, t]) => `<button data-k="${k}">${t}</button>`).join(""); document.querySelectorAll("#tb2 button").forEach(x => x.onclick = () => showBg(x.dataset.k)); showBg("LST");
  $("#kc").innerHTML = [["Average temperature", sj.layers.LST.mean + " °C"], ["Vegetation index", sj.layers.NDVI.mean + " NDVI"], ["Built-up probability", Math.round(sj.layers.BUILTUP.mean * 100) + " %"]].map(([t, v]) => `<div><span>${t}</span><b>${v}</b></div>`).join(""); let pt = null, ov; const pin = L.circleMarker([0, 0], { radius: 7, color: "#fff", fillColor: "#1d6fd8", fillOpacity: 1 });
  let ptk = 0; m.on("click", e => { pt = e.latlng; pin.setLatLng(pt).addTo(m); const tk = ++ptk, c = ` <span class="note">(${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)})</span>`; $("#sp").innerHTML = "<b>Point set at:</b> looking up the name..." + c;
    const upd = nm => { if (tk === ptk) $("#sp").innerHTML = "<b>Point set at:</b> " + esc(nm) + c; };
    placeName(pt.lat, pt.lng, true).then(upd).then(() => placeName(pt.lat, pt.lng)).then(upd); });
  const strat = (mean, n, ppl, dN, dB, dP) => { const imp = v => Math.abs(v) >= 1.5 ? "LARGE" : Math.abs(v) >= 0.5 ? "MODERATE" : "SMALL", o = [];
    if (dN > 0) o.push(["Urban green corridors and tree planting", `Raise vegetation (NDVI) by ${dN}`]);
    if (dB < 0 || dP < 0) o.push(["Cool roofs and reflective surfaces", "Reduce the built-up index or the built-up share"]);
    if (dN < 0 || dB > 0 || dP > 0) o.push(["Warning: development scenario", "Less vegetation or more built-up area raises surface heat"]);
    return `<div class="strat"><h3>AI STRATEGIST</h3><p class="note">Strategies that match your scenario, with the model's estimate for the area you changed.</p>` + (o.length ? o.map(([t, d]) => `<div class="sc"><b>${t}</b><p>${d}</p><span class="tag">MODELLED CHANGE: ${imp(mean)} (${mean >= 0 ? "+" : ""}${mean.toFixed(2)} °C)</span><span class="tag">AREA: ${(n * .01).toFixed(1)} km²</span><span class="tag">PEOPLE: ${fmt(ppl, 0)}</span></div>`).join("") : "<p>Change a slider to get a matching strategy.</p>") + `</div>`; };
  ["dN", "dB", "dP"].forEach(id => $("#" + id).oninput = e => $("#" + id + "v").textContent = e.target.value);
  $("#go").onclick = () => { const R = +$("#rad").value; if (R && !pt) { $("#res").textContent = "Click the map to set the point first."; return; }
    $("#res").textContent = "Running..."; setTimeout(() => {
      const dN = +$("#dN").value, dB = +$("#dB").value, dP = +$("#dP").value, d = new Float32Array(px.n).fill(NaN); let n = 0, s = 0, base = 0, ppl = 0, cool = 0;
      for (let i = 0; i < px.n; i++) { if (R && px.km(i, pt.lat, pt.lng) > R) continue; const x = px.row(i), y = [clamp(x[0] + dN, -1, 1), clamp(x[1] + dB, -1, 1), clamp(x[2] + dP, 0, 1), x[3], x[4]];
        const v = predict(M, y) - predict(M, x); d[i] = v; n++; s += v; base += px.lst[i]; ppl += x[4] * 0.01; if (v <= -0.5) cool++; }
      if (ov) m.removeLayer(ov);
      ov = paint(b, px, i => { const v = d[i]; if (isNaN(v)) return null; const t = clamp((v + 3) / 6, 0, 1); return t < .5 ? [255 * t * 2 + 59 * (1 - t * 2), 255 * t * 2 + 140 * (1 - t * 2), 255, .8] : [231 * (t - .5) * 2 + 255 * (1 - (t - .5) * 2), 76 * (t - .5) * 2 + 255 * (1 - (t - .5) * 2), 60 * (t - .5) * 2 + 255 * (1 - (t - .5) * 2), .8]; }).addTo(m);
      $("#res").innerHTML = `<table class="tb"><tr><td>Area changed</td><td>${fmt(n * 0.01, 1)} km²</td></tr><tr><td>People living there (2020 est.)</td><td>${fmt(ppl, 0)}</td></tr><tr><td>Mean surface temperature now</td><td>${fmt(base / n, 1)} °C</td></tr>
        <tr><td><b>Estimated mean change</b></td><td><b>${fmt(s / n, 2)} °C</b></td></tr><tr><td>Area cooling by 0.5 °C or more</td><td>${fmt(100 * cool / n, 0)}%</td></tr></table>${strat(s / n, n, ppl, dN, dB, dP)}`; }, 30); };
},
async risk(app) {
  const [sj, px, cl] = await Promise.all([J("data/stats.json"), pixels(), J("data/climate.json").catch(() => null)]), b = sj.bounds, n = px.n;
  const rank = a => { const idx = Uint32Array.from({ length: a.length }, (_, i) => i).sort((p, q) => a[p] - a[q]), r = new Float32Array(a.length); idx.forEach((i, k) => r[i] = k / (a.length - 1)); return r; };
  const R = [rank(px.lst), rank(px.X[0].map(v => -v)), rank(px.X[4]), rank(px.X[2])], W = [["Surface heat", 1], ["Lack of vegetation", 1], ["Population exposure", 1], ["Built-up probability", 0]];
  const COL = ["#2ecc71", "#a3d977", "#f1c40f", "#e67e22", "#e74c3c"], NAMES = ["Very low", "Low", "Moderate", "High", "Very high"], hex = c => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16));
  app.innerHTML = `${cl ? `<div class="pg" style="margin-bottom:1rem">${[["Mean air temperature", cl.summary.t_mean + " °C", "29 May to 8 Jul 2026 (ERA5-Land)"], ["Rainfall", cl.summary.rain_total + " mm", cl.anomaly_2026.rain_pct + "% of normal (CHIRPS)"],
      ["Air temperature vs normal", (cl.anomaly_2026.t_diff >= 0 ? "+" : "") + cl.anomaly_2026.t_diff + " °C", "vs 1991-2020 same dates"], ["Surface minus air", "+" + cl.surface_vs_air.diff + " °C", "at satellite overpass time"]].map(([t, v, s]) => `<div class="box"><span class="note">${t}</span><div class="big">${v}</div><span class="note">${s}</span></div>`).join("")}</div>` : ""}
    <p><button class="btn" onclick="window.print()">Export report (print or save as PDF)</button></p><div class="cols"><div class="box"><h2>Risk weights</h2><p class="note">Risk = weighted average of each pixel's rank (0 to 100) on the chosen factors.</p>${W.map(([l, v], k) => `<div class="row2"><span>${l}</span><b id="wv${k}">${v}</b></div><input type="range" id="w${k}" min="0" max="3" step="0.5" value="${v}">`).join("")}
      <h2 style="margin-top:1rem">Map layer</h2><select id="ly"><option value="risk">Computed risk map</option>${Object.entries(sj.layers).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join("")}<option value="EXPOSURE">Heat exposure class</option></select>
      <h2 style="margin-top:1rem">Risk classes</h2><p class="big" id="hv"></p><table class="tb" id="ct"></table><canvas id="dn" height="190"></canvas></div>
    <div class="box"><div class="mm" id="rm" style="height:520px"></div></div></div>
    <div class="box" style="margin-top:1rem"><h2>Top 10 priority areas (1 km cells, highest average risk)</h2><table class="tb" id="pt"></table></div>`;
  const m = baseMap($("#rm")), bb = [[b.south, b.west], [b.north, b.east]]; m.fitBounds(bb); let ov, dnc, rtk = 0, score = new Float32Array(n); const NC = new Map();
  const draw = () => { if (ov) m.removeLayer(ov); const v = $("#ly").value;
    ov = v === "risk" ? paint(b, px, i => { const c = hex(COL[Math.min(4, Math.floor(score[i] / 20))]); return [c[0], c[1], c[2], .85]; }) : L.imageOverlay("data/" + (v === "EXPOSURE" ? "layers/EXPOSURE.png" : sj.layers[v].file), bb, { opacity: .85 }); ov.addTo(m); };
  const calc = () => { const w = W.map((_, k) => +$("#w" + k).value), sw = w.reduce((a, c) => a + c, 0) || 1; W.forEach((_, k) => $("#wv" + k).textContent = w[k]);
    const cn = [0, 0, 0, 0, 0], cp = [0, 0, 0, 0, 0], cells = new Map();
    for (let i = 0; i < n; i++) { const s = 100 * (w[0] * R[0][i] + w[1] * R[1][i] + w[2] * R[2][i] + w[3] * R[3][i]) / sw; score[i] = s; const c = Math.min(4, Math.floor(s / 20)); cn[c]++; cp[c] += px.X[4][i] * 0.01;
      const k = Math.floor((px.lon[i] - px.meta.lon0) / .01) * 1000 + Math.floor((px.lat[i] - px.meta.lat0) / .01), e = cells.get(k) || { n: 0, s: 0, p: 0, t: 0, la: 0, lo: 0 }; e.n++; e.s += s; e.p += px.X[4][i] * 0.01; e.t += px.lst[i]; e.la += px.lat[i]; e.lo += px.lon[i]; cells.set(k, e); }
    $("#ct").innerHTML = "<tr><th>Class</th><th>Area (km²)</th><th>People</th></tr>" + NAMES.map((t, c) => `<tr><td><span style="color:${COL[c]}">&#9632;</span> ${t}</td><td>${fmt(cn[c] * .01, 1)}</td><td>${fmt(cp[c], 0)}</td></tr>`).join("");
    $("#hv").innerHTML = fmt(100 * (cn[3] + cn[4]) / n, 1) + '% <span class="note">of the district is High or Very high risk</span>';
    if (dnc) dnc.destroy(); dnc = new Chart($("#dn"), { type: "doughnut", data: { labels: NAMES, datasets: [{ data: cn.map(v => +(v * .01).toFixed(1)), backgroundColor: COL, borderColor: "#ffffff" }] }, options: { plugins: { legend: { position: "right" }, title: { display: true, text: "Area by risk class (km²)" } } } });
    const top = [...cells.values()].filter(e => e.n >= 30).sort((a, c) => c.s / c.n - a.s / a.n).slice(0, 10);
    $("#pt").innerHTML = "<tr><th>Rank</th><th>Place</th><th>Risk score</th><th>Surface temp.</th><th>People</th><th></th></tr>" + top.map((e, k) => `<tr><td>${k + 1}</td><td id="pn${k}">looking up...</td><td>${fmt(e.s / e.n, 0)}</td><td>${fmt(e.t / e.n, 1)} °C</td><td>${fmt(e.p, 0)}</td><td><button class="btn" data-a="${e.la / e.n}" data-o="${e.lo / e.n}">Zoom to area</button></td></tr>`).join("");
    document.querySelectorAll("#pt button").forEach(bt => bt.onclick = () => { m.setView([+bt.dataset.a, +bt.dataset.o], 13); placeName(+bt.dataset.a, +bt.dataset.o).then(nm => L.popup().setLatLng([+bt.dataset.a, +bt.dataset.o]).setContent("<b>" + esc(nm) + "</b>").openOn(m)); document.querySelector("#rm").scrollIntoView({ behavior: "smooth", block: "center" }); });
    const tk = ++rtk; (async () => { for (let k = 0; k < top.length; k++) { const la = top[k].la / top[k].n, lo = top[k].lo / top[k].n, key = la.toFixed(3) + "," + lo.toFixed(3); let nm = NC.get(key);
      if (!nm) { await new Promise(r => setTimeout(r, 1100)); if (tk !== rtk) return; nm = await placeName(la, lo, true); NC.set(key, nm); } if (tk !== rtk) return; const c = document.getElementById("pn" + k); if (c) c.textContent = nm; } })();
    if ($("#ly").value === "risk") draw(); };
  W.forEach((_, k) => $("#w" + k).oninput = calc); $("#ly").onchange = draw; calc(); draw();
},
async copilot(app) {
  const [sj, ai, ms, pr, cl, ch] = await Promise.all(["stats", "ai_results", "ai_models", "priority", "climate", "charts"].map(f => J(`data/${f}.json`).catch(() => null)));
  const ex = sj.exposure, L2 = sj.layers, cor = ch && ch.correlation.matrix;
  const rules = [
    [/accura|r2|r²|rmse|error|perform|compar|which model|how good/, () => `The main Random Forest predicts land surface temperature from vegetation, built-up, elevation and population. On areas it never saw in training it reaches R² ${ai.r2} with an error of ${ai.rmse} °C.` + (ms ? " Compact versions: " + Object.entries(ms.models).map(([n, v]) => `${n} R² ${v.r2}`).join(", ") + ". Try them on the Prediction page." : "")],
    [/driv|why|factor|import|caus|explain|reason/, () => `The biggest drivers of surface heat in the model are ${ai.feature_importance.slice(0, 3).map(f => `${f.label} (${Math.round(f.importance * 100)}%)`).join(", ")}.` + (cor ? ` Vegetation and the built-up index are strongly linked (correlation ${cor[1][2]}), so read them together.` : "") + " See the Explainable AI page for a place-by-place explanation."],
    [/hotspot|exposure|people|popul|peopl|vulnerab|live/, () => `Islamabad District has about ${fmt(sj.population_total_2020, 0)} people (WorldPop 2020 estimate). ${fmt(ex["2"].population, 0)} of them (${fmt(100 * ex["2"].population / sj.population_total_2020, 1)}%) live in hotspot areas covering ${ex["2"].area_km2} km². A hotspot is in the top 25% for heat, in the lowest 25% for vegetation and in the top 25% for population density.`],
    [/priorit|plant|tree|green|where should|first/, () => pr ? "Top priority zones for greening: " + pr.zones.slice(0, 3).map(z => `#${z.rank} near ${z.lat}, ${z.lon} (${z.mean_lst} °C, ${fmt(z.people, 0)} people, estimated cooling ${z.cooling_c} °C if vegetation rose by 0.10)`).join("; ") + ". Open the Risk Intelligence page to explore the map." : "Priority data is not available."],
    [/air|rain|climate|normal|anomal|monsoon|summer|weather/, () => cl ? `Between ${cl.window.start} and ${cl.window.end} the mean air temperature was ${cl.summary.t_mean} °C (hottest day ${cl.summary.t_max_peak} °C), ${cl.anomaly_2026.t_diff >= 0 ? "+" : ""}${cl.anomaly_2026.t_diff} °C compared with the ${cl.normal.period} normal. Rainfall was ${cl.summary.rain_total} mm, ${cl.anomaly_2026.rain_pct}% of normal. The ground was about ${cl.surface_vs_air.diff} °C hotter than the air at satellite time.` : "Climate data is not available."],
    [/what if|increase|simulat|scenario|more veg|cool/, () => `With the main model, raising NDVI everywhere by 0.05, 0.10 and 0.15 changes the mean surface temperature from ${ai.what_if[0].mean_lst_c} °C to ${ai.what_if.slice(1).map(w => w.mean_lst_c + " °C").join(", ")}. Use the Climate Simulator to test your own scenario on a map.`],
    [/vegetat|ndvi|green cover/, () => `Mean NDVI is ${L2.NDVI.mean}.` + (cor ? ` It is strongly negatively correlated with surface temperature (${cor[0][1]}): greener places are cooler.` : "")],
    [/elevat|height|altitude|margalla/, () => `Elevation ranges from about ${L2.DEM.min} to ${L2.DEM.max} m and is negatively correlated with surface temperature` + (cor ? ` (${cor[0][4]})` : "") + ", but it cannot be changed, so it is not a planning lever."],
    [/surface|lst|temperature|hot|heat/, () => `Mean land surface temperature is ${L2.LST.mean} °C, and the hottest 2% of pixels exceed ${L2.LST.p98} °C.` + (cl ? ` That is about ${cl.surface_vs_air.diff} °C above the air temperature at satellite time.` : "") + " Surface temperature is not air temperature."],
    [/data|source|dataset|satellite|landsat|sentinel/, () => sj.data_note],
    [/limit|caveat|reliab|trust|valid|forecast/, () => ai.limits + " Results are not yet checked against ground measurements, and population is a 2020 estimate."]
  ];
  const sugg = ["How accurate is the model?", "What drives surface heat?", "How many people live in hotspots?", "Where should we plant trees first?", "How hot was summer 2026 compared with normal?", "What if vegetation increases?"];
  app.innerHTML = `<div class="cols2"><div class="box"><h2>Map and data layers</h2><select id="cl">${Object.entries(sj.layers).map(([k, l]) => `<option value="${k}">${l.label}</option>`).join("")}<option value="EXPOSURE">Heat exposure class</option></select><div class="mm" id="cm" style="height:540px;margin-top:.6rem"></div></div>
    <div class="box"><p class="note">This assistant answers only from this project's own data and model results. It is rule-based: it matches your question to prepared results and does not use an external AI service. The map follows your question.</p>
    <div id="chat"></div><div id="sg">${sugg.map(q => `<button class="btn">${q}</button>`).join("")}</div>
    <p style="display:flex;gap:.5rem;margin-top:.6rem"><input class="q" id="q" placeholder="Ask about heat, people, vegetation, climate, the model..."><button class="btn" id="ask">Ask</button></p></div></div>`;
  const mp = baseMap($("#cm")), cb = [[sj.bounds.south, sj.bounds.west], [sj.bounds.north, sj.bounds.east]]; mp.fitBounds(cb); let lay, zr;
  const showL = k => { if (lay) mp.removeLayer(lay); lay = L.imageOverlay("data/" + (k === "EXPOSURE" ? "layers/EXPOSURE.png" : sj.layers[k].file), cb, { opacity: .85 }).addTo(mp); $("#cl").value = k; };
  $("#cl").onchange = e => showL(e.target.value); showL("LST");
  const add = (t, c) => { const d = document.createElement("div"); d.className = "msg " + c; d.innerHTML = t; $("#chat").appendChild(d); $("#chat").scrollTop = 1e9; };
  const esc = t => t.replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mapAct = low => { const a = [[/hotspot|exposure|live/, "EXPOSURE"], [/air/, "AIR"], [/rain/, "RAIN"], [/vegetat|ndvi/, "NDVI"], [/priorit|plant|tree/, "ZONE"], [/surface|lst|heat|temperature/, "LST"]].find(([re]) => re.test(low)); if (!a) return;
    if (zr) { mp.removeLayer(zr); zr = null; }
    if (a[1] === "ZONE" && pr) { const z = pr.zones[0]; showL("LST"); zr = L.rectangle([[z.south, z.west], [z.north, z.east]], { color: "#fd8d3c", weight: 3, fillOpacity: .1 }).addTo(mp); mp.fitBounds(zr.getBounds(), { maxZoom: 14 }); }
    else if (a[1] === "EXPOSURE" || sj.layers[a[1]]) showL(a[1]); };
  const ask = q => { if (!q.trim()) return; add(esc(q), "me"); const low = q.toLowerCase(), r = rules.find(([re]) => re.test(low));
    add(r ? r[1]() : "I can answer about model accuracy, what drives heat, people in hotspots, priority zones for greening, air temperature and rainfall, vegetation, elevation, what-if scenarios, data sources and limitations. Try one of the suggestions.", "bot"); $("#q").value = ""; mapAct(low); };
  document.querySelectorAll("#sg button").forEach(b => b.onclick = () => ask(b.textContent));
  $("#ask").onclick = () => ask($("#q").value); $("#q").onkeydown = e => { if (e.key === "Enter") ask($("#q").value); };
  add("Hello. Ask me about Islamabad's heat, people, vegetation, climate or the AI model.", "bot");
}
};
const app = $("#app"), page = document.body.dataset.page;
document.querySelectorAll(".sb a").forEach(a => a.classList.toggle("on", a.dataset.p === page));
Promise.resolve().then(() => PAGES[page](app)).catch(e => { app.innerHTML = `<div class="box"><p>Could not load this page: ${e.message}</p><p class="note">Check that the data files are in the data folder (pixels.bin, pixels_meta.json, stats.json, ai_models.json, climate.json, priority.json, ai_results.json, charts.json) and that you opened the site through the local server.</p></div>`; });
})();
