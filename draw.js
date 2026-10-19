(async () => {
  const css = document.createElement("style");
  css.textContent = `#area-panel .hint,#area-panel small{color:var(--mute)}
  #area-panel table{width:100%;border-collapse:collapse;font-size:.93rem;margin:.6rem 0}
  #area-panel th,#area-panel td{border-bottom:1px solid var(--line);padding:.4rem .6rem;text-align:right}
  #area-panel th:first-child,#area-panel td:first-child{text-align:left}
  #area-panel th{color:var(--teal);font-weight:600}
  #area-panel .name{font:700 1.2rem Sora,sans-serif;margin:0 0 .2rem}
  .inspect-btn{background:#fff;color:#0a1424;border:2px solid rgba(0,0,0,.25);border-radius:4px;padding:6px 10px;font:600 13px "Source Sans 3",sans-serif;cursor:pointer}
  .inspect-btn.on{background:#1d6fd8;color:#fff}
  .map-inspect{cursor:crosshair!important}
  .pp{font:13px/1.4 "Source Sans 3",sans-serif;min-width:210px}.pp b.n{font-size:14px}.pp table{width:100%;border-collapse:collapse}.pp td{padding:1px 0}.pp td:last-child{text-align:right;font-weight:600}
  .srch{background:#fff;border-radius:8px;box-shadow:0 1px 6px rgba(0,0,0,.3);width:300px;padding:6px}.srch input{width:70%;border:1px solid #c5d0e0;border-radius:6px;padding:6px;font:14px 'Source Sans 3',sans-serif;color:#0b2447}.srch button{width:26%;border:0;background:#0b2d6b;color:#fff;border-radius:6px;padding:6px;cursor:pointer;font:600 13px 'Source Sans 3',sans-serif}
  #sr div{padding:6px;font:13px 'Source Sans 3',sans-serif;color:#0b2447;border-bottom:1px solid #eef2f8}#sr .sri{cursor:pointer}#sr .sri:hover{background:#eaf1fb}`;
  document.head.appendChild(css);

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.id = "area-panel";
  panel.innerHTML = `<h2>Explore any place</h2><div id="area-out" class="hint">Click <b>Click to inspect</b> on the map, then click any place in Islamabad to see its name and all layer values. Or use the draw tools to outline a whole area.</div>`;
  document.querySelector(".mapwrap").insertAdjacentElement("afterend", panel);
  const out = document.getElementById("area-out");

  let meta, P = {};
  try {
    meta = await fetch("data/pixels_meta.json").then(r => r.json());
    const buf = await fetch("data/pixels.bin").then(r => r.arrayBuffer());
    const n = meta.n; let off = 0;
    const take = (T, b) => { const a = new T(buf, off, n); off += n * b; return a; };
    const lonQ = take(Uint16Array, 2), latQ = take(Uint16Array, 2);
    P.lst = take(Uint16Array, 2); P.ndvi = take(Int16Array, 2); P.ndbi = take(Int16Array, 2);
    P.built = take(Uint16Array, 2); P.dem = take(Uint16Array, 2); P.pop = take(Uint16Array, 2);
    P.ex = new Uint8Array(buf, off, n);
    P.lon = new Float64Array(n); P.lat = new Float64Array(n);
    for (let i = 0; i < n; i++) { P.lon[i] = meta.lon0 + lonQ[i] * meta.step; P.lat[i] = meta.lat0 + latQ[i] * meta.step; }
  } catch (e) {
    out.textContent = "Area data could not be loaded. Check that data/pixels.bin and data/pixels_meta.json exist.";
    return;
  }

  try {
    const bx = await fetch("data/pixels_extra.bin").then(r => { if (!r.ok) throw new Error("none"); return r.arrayBuffer(); });
    P.air = new Uint16Array(bx, 0, meta.n); P.rain = new Uint16Array(bx, meta.n * 2, meta.n);
  } catch (e) { /* optional file */ }
  const SC = { lst: 100, ndvi: 1000, ndbi: 1000, built: 1000, dem: 1, pop: 1 };
  if (P.air) { SC.air = 100; SC.rain = 10; }
  const keys = Object.keys(SC);
  const NAMES = ["Other areas", "Hot (top 25% LST)", "Hotspot"];
  const fmt = (v, d) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  const sums = idx => {
    const s = { n: 0, lst: 0, ndvi: 0, ndbi: 0, built: 0, dem: 0, pop: 0, air: 0, rain: 0, ex: [0, 0, 0], exPop: [0, 0, 0] };
    idx.forEach(i => { s.n++; keys.forEach(k => s[k] += P[k][i] / SC[k]); s.ex[P.ex[i]]++; s.exPop[P.ex[i]] += P.pop[i] * meta.pixel_km2; });
    return s;
  };
  const all = []; for (let i = 0; i < meta.n; i++) all.push(i);
  const base = sums(all); keys.forEach(k => base[k] /= base.n);

  // spatial index for fast nearest-pixel lookup (cells of 0.001 deg, about 100 m)
  const CELL = 0.001, grid = new Map();
  const cellOf = (lat, lon) => Math.floor((lon - meta.lon0) / CELL) * 10000 + Math.floor((lat - meta.lat0) / CELL);
  for (let i = 0; i < meta.n; i++) { const k = cellOf(P.lat[i], P.lon[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  function nearest(lat, lon) {
    const ci = Math.floor((lon - meta.lon0) / CELL), cj = Math.floor((lat - meta.lat0) / CELL);
    const kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110574;
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = grid.get((ci + a) * 10000 + (cj + b)); if (!list) continue;
      for (const i of list) { const d = Math.hypot((P.lon[i] - lon) * kx, (P.lat[i] - lat) * ky); if (d < bd) { bd = d; best = i; } }
    }
    return bd <= 100 ? best : -1;
  }

  let token = 0;
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const km = (aLat, aLon, bLat, bLon) => Math.hypot((aLon - bLon) * Math.cos(aLat * Math.PI / 180) * 111.32, (aLat - bLat) * 110.574);
  const compass = (aLat, aLon, bLat, bLon) => {
    const ang = Math.atan2((bLon - aLon) * Math.cos(aLat * Math.PI / 180), bLat - aLat) * 180 / Math.PI;
    return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(((ang + 360) % 360) / 45) % 8];
  };
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const PLACE = ["neighbourhood", "suburb", "quarter", "city_block", "village", "hamlet", "locality", "town"];
  const rank = t => PLACE.includes(t.place) ? 100 - PLACE.indexOf(t.place)
    : /residential|commercial|industrial|retail/.test(t.landuse || "") ? 50
    : t.boundary === "administrative" ? (+t.admin_level || 0) : -1;

  async function placeInfo(lat, lon) {
    const nom = withTimeout(fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=en&lat=${lat}&lon=${lon}`).then(x => x.json()), 8000).catch(() => null);
    const q = `[out:json][timeout:12];is_in(${lat},${lon})->.a;(area.a["name"];node(around:3000,${lat},${lon})["place"]["name"];);out body 80;`;
    const ovp = withTimeout(fetch("https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(q)).then(x => x.json()), 12000).catch(() => null);
    const [r, o] = await Promise.all([nom, ovp]);
    const els = (o && o.elements) || [], a = (r && r.address) || {};
    const inArea = els.filter(e => e.type === "area" && e.tags && e.tags.name && rank(e.tags) >= 0).sort((x, y) => rank(y.tags) - rank(x.tags))[0];
    const seen = new Set();
    const near = els.filter(e => e.type === "node" && e.tags && e.tags.name)
      .map(e => ({ name: e.tags.name, d: km(lat, lon, e.lat, e.lon), dir: compass(lat, lon, e.lat, e.lon) }))
      .sort((x, y) => x.d - y.d).filter(n => !seen.has(n.name) && seen.add(n.name));
    const local = inArea ? inArea.tags.name : (a.neighbourhood || a.suburb || a.quarter || a.village || a.hamlet || "");
    const parts = [a.road, local].filter(Boolean);
    if (!local && near[0]) parts.push(`Near ${near[0].name} (${near[0].d.toFixed(1)} km ${near[0].dir})`);
    parts.push("Islamabad");
    const nearby = near.length ? "Nearby named places: " + near.slice(0, 3).map(n => `${n.name} (${n.d.toFixed(1)} km ${n.dir})`).join(", ") : "";
    return { name: [...new Set(parts)].join(", "), full: [nearby, r && r.display_name].filter(Boolean).join(" | ") };
  }

  const pin = L.circleMarker([0, 0], { radius: 7, color: "#fff", weight: 2, fillColor: "#1d6fd8", fillOpacity: 1 });
  const popup = L.popup({ autoPan: false, maxWidth: 300 });
  map.on("popupclose", () => map.removeLayer(pin));

  async function inspectAt(ll, title) {
    const my = ++token;
    const i = nearest(ll.lat, ll.lng);
    map.flyTo(ll, Math.max(map.getZoom(), 15), { duration: 0.8 });
    if (i < 0) {
      popup.setLatLng(ll).setContent("<div class='pp'>No data here. Click on the coloured area (Islamabad District).</div>").openOn(map);
      out.innerHTML = "<p>No data at this location. It is outside the Islamabad District study area.</p>";
      return;
    }
    const v = {}; keys.forEach(k => v[k] = P[k][i] / SC[k]);
    const cls = NAMES[P.ex[i]];
    const rows = [["Land surface temperature", "lst", 1, " °C"], ["Vegetation (NDVI)", "ndvi", 3, ""], ["Built-up index (NDBI)", "ndbi", 3, ""],
      ["Built-up probability", "built", 3, ""], ["Elevation", "dem", 0, " m"], ["Population density", "pop", 0, " /km²"]];
    if (P.air) rows.push(["Air temperature (ERA5-Land)", "air", 1, " °C"], ["Rainfall, 29 May to 8 Jul", "rain", 0, " mm"]);
    const people = v.pop * meta.pixel_km2;
    const pp = nm => `<div class="pp"><b class="n">${esc(nm)}</b><table>${rows.map(r => `<tr><td>${r[0]}</td><td>${fmt(v[r[1]], r[2])}${r[3]}</td></tr>`).join("")}<tr><td>Heat class</td><td>${cls}</td></tr></table></div>`;
    popup.setLatLng(ll).setContent(pp("Looking up place name...")).openOn(map);
    pin.setLatLng(ll).addTo(map);
    out.innerHTML = `<p class="name">Looking up place name...</p>`;
    const info = title ? { name: title, full: "" } : await placeInfo(ll.lat, ll.lng);
    if (my !== token) return;
    popup.setContent(pp(info.name));
    out.innerHTML = `<p class="name">${esc(info.name)}</p><small>${esc(info.full)}</small>
      <p>Location: ${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} &middot; Heat class: <b>${cls}</b> &middot; Estimated people in this 100 m cell: <b>${fmt(people, 0)}</b></p>
      <table><tr><th>Indicator</th><th>At this place</th><th>Islamabad average</th><th>Difference</th></tr>
      ${rows.map(r => `<tr><td>${r[0]}</td><td>${fmt(v[r[1]], r[2])}${r[3]}</td><td>${fmt(base[r[1]], r[2])}${r[3]}</td><td>${v[r[1]] - base[r[1]] >= 0 ? "+" : ""}${fmt(v[r[1]] - base[r[1]], r[2])}</td></tr>`).join("")}</table>
      <p class="hint">Each value is for the 100 m cell nearest to your click (May to July 2026 season). Names come from OpenStreetMap and are only as detailed as its map data.</p>`;
  }

  // "Click to inspect" button on the map
  let inspecting = false, btn;
  const setInspect = on => {
    inspecting = on;
    btn.classList.toggle("on", on);
    btn.textContent = on ? "Inspecting: click the map" : "Click to inspect";
    map.getContainer().classList.toggle("map-inspect", on);
    if (!on) { map.closePopup(); map.removeLayer(pin); }
  };
  const Ctl = L.Control.extend({ options: { position: "topleft" }, onAdd() {
    btn = L.DomUtil.create("button", "inspect-btn"); btn.textContent = "Click to inspect"; btn.type = "button";
    L.DomEvent.disableClickPropagation(btn); btn.onclick = () => setInspect(!inspecting); return btn; } });
  map.addControl(new Ctl());
  map.on("click", e => { if (inspecting) inspectAt(e.latlng); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") setInspect(false); });
  const SearchCtl = L.Control.extend({ options: { position: "topright" }, onAdd() {
    const box = L.DomUtil.create("div", "srch"); box.innerHTML = '<input id="sq" placeholder="Search a place in Islamabad..." autocomplete="off"><button id="sg2" type="button">Search</button><div id="sr"></div>';
    L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box); return box; } });
  map.addControl(new SearchCtl());
  const sq = document.getElementById("sq"), sr = document.getElementById("sr");
  const doSearch = async () => { const q = sq.value.trim(); if (!q) return; sr.innerHTML = "<div>Searching...</div>";
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=en&viewbox=72.7,33.9,73.5,33.4&bounded=1&q=" + encodeURIComponent(q)).then(x => x.json());
      sr.innerHTML = r.length ? "" : "<div>No place found. Try a sector, road, mall or area name.</div>";
      r.forEach(p => { const it = document.createElement("div"); it.className = "sri"; const t = p.display_name.split(",").slice(0, 3).join(",").trim(); it.textContent = t;
        it.onclick = () => { sr.innerHTML = ""; setInspect(false); inspectAt(L.latLng(+p.lat, +p.lon), t); }; sr.appendChild(it); });
    } catch (e) { sr.innerHTML = "<div>Search needs an internet connection.</div>"; } };
  sq.onkeydown = e => { if (e.key === "Enter") doSearch(); }; document.getElementById("sg2").onclick = doSearch;

  // draw tools for whole areas
  const inside = (lat, lon, ring) => {
    let c = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.lat > lat) !== (b.lat > lat) && lon < (b.lng - a.lng) * (lat - a.lat) / (b.lat - a.lat) + a.lng) c = !c;
    }
    return c;
  };
  async function analyse(layer) {
    const my = ++token;
    const ring = layer.getLatLngs()[0], b = layer.getBounds(), idx = [];
    for (let i = 0; i < meta.n; i++) {
      if (P.lat[i] < b.getSouth() || P.lat[i] > b.getNorth() || P.lon[i] < b.getWest() || P.lon[i] > b.getEast()) continue;
      if (inside(P.lat[i], P.lon[i], ring)) idx.push(i);
    }
    if (idx.length < 5) { out.innerHTML = "<p>The outlined shape has no study-area pixels (or is too small). Draw a larger shape over the coloured map area.</p>"; return; }
    const s = sums(idx), m = {}; keys.forEach(k => m[k] = s[k] / s.n);
    const c = b.getCenter();
    out.innerHTML = `<p class="name">Looking up the area name...</p>`;
    const info = await placeInfo(c.lat, c.lng);
    if (my !== token) return;
    const row = (lab, k, d, u) => `<tr><td>${lab}</td><td>${fmt(m[k], d)}${u}</td><td>${fmt(base[k], d)}${u}</td><td>${m[k] - base[k] >= 0 ? "+" : ""}${fmt(m[k] - base[k], d)}</td></tr>`;
    out.innerHTML = `<p class="name">${esc(info.name)}</p>
      <p>Analysed area: <b>${fmt(s.n * meta.pixel_km2, 2)} km²</b> (${fmt(s.n, 0)} pixels of 100 m) &middot; Estimated population: <b>${fmt(s.pop * meta.pixel_km2, 0)}</b></p>
      <table><tr><th>Indicator</th><th>This area</th><th>Islamabad average</th><th>Difference</th></tr>
        ${row("Land surface temperature", "lst", 1, " °C")}${row("Vegetation (NDVI)", "ndvi", 3, "")}${row("Built-up index (NDBI)", "ndbi", 3, "")}
        ${row("Built-up probability", "built", 3, "")}${row("Elevation", "dem", 0, " m")}${row("Population density", "pop", 0, " /km²")}${P.air ? row("Air temperature (ERA5-Land)", "air", 1, " °C") + row("Rainfall, 29 May to 8 Jul", "rain", 0, " mm") : ""}</table>
      <table><tr><th>Heat exposure class</th><th>Share of area</th><th>People</th></tr>
        ${[0, 1, 2].map(k => `<tr><td>${NAMES[k]}</td><td>${fmt(100 * s.ex[k] / s.n, 1)}%</td><td>${fmt(s.exPop[k], 0)}</td></tr>`).join("")}</table>
      <p class="hint">The name is looked up for the centre of your shape. Values are averages over 100 m pixels (May to July 2026).</p>`;
  }
  const drawn = new L.FeatureGroup().addTo(map);
  const shape = { color: "#1d6fd8", weight: 2 };
  map.addControl(new L.Control.Draw({
    draw: { polygon: { allowIntersection: false, showArea: false, shapeOptions: shape }, rectangle: { shapeOptions: shape },
            polyline: false, circle: false, marker: false, circlemarker: false },
    edit: { featureGroup: drawn }
  }));
  map.on(L.Draw.Event.DRAWSTART, () => setInspect(false));
  map.on(L.Draw.Event.CREATED, e => { drawn.clearLayers(); drawn.addLayer(e.layer); map.closePopup(); map.removeLayer(pin); analyse(e.layer); });
  map.on(L.Draw.Event.EDITED, e => e.layers.eachLayer(analyse));
  map.on(L.Draw.Event.DELETED, () => { out.innerHTML = "Click <b>Click to inspect</b> and then click the map, or draw an area."; });

  // Priority zones for greening (top 10 cells from data/priority.json)
  try {
    const pr = await fetch("data/priority.json").then(r => r.json());
    const st = document.createElement("style");
    st.textContent = `#priority-panel table{width:100%;border-collapse:collapse;font-size:.93rem;margin:.6rem 0}
    #priority-panel th,#priority-panel td{border-bottom:1px solid var(--line);padding:.45rem .6rem;text-align:right;vertical-align:top}
    #priority-panel th:first-child,#priority-panel td:first-child,#priority-panel td.nm,#priority-panel th.nm{text-align:left}
    #priority-panel th{color:var(--teal);font-weight:600}
    #priority-panel button{background:var(--blue);color:#fff;border:0;border-radius:6px;padding:.3rem .7rem;font:inherit;cursor:pointer}
    #priority-panel .sc{overflow-x:auto}#priority-panel .hint{color:var(--mute)}`;
    document.head.appendChild(st);
    const sec = document.createElement("section");
    sec.className = "panel"; sec.id = "priority-panel";
    sec.innerHTML = `<h2>Priority zones for greening</h2><p class="hint">${esc(pr.method)}</p>
      <div class="sc"><table><tr><th>Rank</th><th class="nm">Place</th><th>Surface temp.</th><th>NDVI</th><th>People</th><th>Est. cooling if NDVI +0.10</th><th></th></tr>
      ${pr.zones.map(z => `<tr><td>${z.rank}</td><td class="nm" id="pz-n${z.rank}">Click "Show on map"</td><td>${fmt(z.mean_lst, 1)} °C</td><td>${fmt(z.mean_ndvi, 2)}</td><td>${fmt(z.people, 0)}</td><td>-${fmt(z.cooling_c, 2)} °C</td><td><button data-r="${z.rank}">Show on map</button></td></tr>`).join("")}</table></div>
      <p><button class="btn" id="pz-clear" style="background:#3b8cff;color:#fff;border:0;border-radius:6px;padding:.4rem .8rem;cursor:pointer">Clear zone from map</button></p><p class="hint">Scores use one summer season (May to July 2026) and WorldPop 2020 population.</p>`;
    document.getElementById("area-panel").insertAdjacentElement("afterend", sec);
    let cur = null;
    document.getElementById("pz-clear").onclick = () => { if (cur) { map.removeLayer(cur); cur = null; } map.closePopup(); };
    sec.querySelectorAll("button[data-r]").forEach(b => b.onclick = async () => {
      const z = pr.zones.find(q => q.rank === +b.dataset.r);
      if (cur) map.removeLayer(cur);
      setInspect(false);
      cur = L.rectangle([[z.south, z.west], [z.north, z.east]], { color: "#fd8d3c", weight: 3, fillOpacity: 0.12 }).addTo(map);
      map.flyToBounds(cur.getBounds(), { maxZoom: 15, duration: 0.8 });
      map.getContainer().scrollIntoView({ behavior: "smooth", block: "center" });
      const cell = document.getElementById("pz-n" + z.rank);
      if (cell.dataset.done !== "1") {
        cell.textContent = "Looking up name...";
        const info = await placeInfo(z.lat, z.lon);
        cell.textContent = info.name; cell.dataset.done = "1";
      }
      cur.bindPopup(`<div class="pp"><b class="n">Priority zone ${z.rank}: ${esc(cell.textContent)}</b><table><tr><td>Surface temperature</td><td>${fmt(z.mean_lst, 1)} °C</td></tr><tr><td>NDVI</td><td>${fmt(z.mean_ndvi, 2)}</td></tr><tr><td>People</td><td>${fmt(z.people, 0)}</td></tr><tr><td>Est. cooling (NDVI +0.10)</td><td>-${fmt(z.cooling_c, 2)} °C</td></tr></table></div>`).openPopup();
      const r = cur; r.on("popupclose", () => { if (cur === r) { map.removeLayer(r); cur = null; } });
    });
  } catch (e) { /* priority.json not available: skip this panel */ }
})();
