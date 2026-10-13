/* Map widget (NotePath v0.5.6, Devon): <div class="nw" data-w="map" data-src='{"title","q","label","lat","lon","zoom"}'>.
   Search an address or place (OpenStreetMap Nominatim: the same lookup as My Tasks' Place, through main.js "dict:lookup"),
   pick one of the answers and the widget keeps it: the place, a small map (OpenStreetMap tiles, ＋ / −, the zoom is kept)
   and links to Apple Maps, Google Maps and OpenStreetMap. "Change" searches again. Places picked before are offered as
   chips (store notepath.places, the last 8) so a place used once is one click away. Uses NPTasks.geocode / mapView at
   run time (tasks.js loads later). Loaded after notes-widgets.js. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const DEF = { title: "", q: "", label: "", lat: null, lon: null, zoom: 16 };
const RECENT = "notepath.places", MAXR = 8;
const recent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT) || "[]"); return Array.isArray(a) ? a.filter(p => p && p.label && isFinite(p.lat) && isFinite(p.lon)).slice(0, MAXR) : []; } catch (e) { return []; } };
function remember(p) {
  try { const a = recent().filter(x => x.label !== p.label); a.unshift({ label: p.label, lat: p.lat, lon: p.lon }); localStorage.setItem(RECENT, JSON.stringify(a.slice(0, MAXR))); } catch (e) {}
}
const has = d => d && d.label && isFinite(d.lat) && isFinite(d.lon) && d.lat !== null;
const short = label => String(label || "").split(",")[0].trim();
const links = d => ({
  apple: `https://maps.apple.com/?ll=${d.lat},${d.lon}&q=${encodeURIComponent(short(d.label))}`,
  google: `https://www.google.com/maps/search/?api=1&query=${d.lat},${d.lon}`,
  osm: `https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=${d.zoom || 16}/${d.lat}/${d.lon}`
});
function text(d) {
  d = Object.assign({}, DEF, d || {});
  if (!has(d)) return "\n⌖ " + (d.title ? d.title + ": " : "") + "(no place yet)\n";
  return "\n⌖ " + (d.title ? d.title + ": " : "") + d.label + " (" + (+d.lat).toFixed(5) + ", " + (+d.lon).toFixed(5) + ") " + links(d).osm + "\n";
}
function mount(el) {
  const read = () => { try { return Object.assign({}, DEF, JSON.parse(el.dataset.src || "{}")); } catch (e) { return Object.assign({}, DEF); } };
  let d = read(), view = null, results = null, busy = false, err = "";
  const save = () => { el.dataset.src = JSON.stringify({ title: d.title, q: d.q, label: d.label, lat: d.lat, lon: d.lon, zoom: d.zoom }); el.dispatchEvent(new Event("input", { bubbles: true })); };
  const T = () => window.NPTasks;
  el.classList.add("nm");
  // the head (title, ✕) is drawn once; only the body below it is redrawn
  el.innerHTML = `<div class="nm-head"><span class="nm-ic" aria-hidden="true">⌖</span><input class="nm-title" maxlength="80" placeholder="Map" aria-label="Map title" value="${esc(d.title)}"><button type="button" class="nw-b nw-del" data-a="del" title="Remove this map" aria-label="Remove map">✕</button></div><div class="nm-body"></div>`;
  const body = el.querySelector(".nm-body"), title = el.querySelector(".nm-title");
  title.addEventListener("input", e => { e.stopPropagation(); d.title = title.value.trim(); save(); });
  title.addEventListener("keydown", e => e.stopPropagation());
  function draw(focus) {
    if (view) { view.destroy(); view = null; }
    const picking = !has(d) || results || busy || err || el._change;
    const rec = recent().filter(p => !has(d) || p.label !== d.label);
    body.innerHTML = (picking ? `<form class="nm-search"><input class="nm-q" type="search" maxlength="200" placeholder="Search for an address or a place…" aria-label="Address or place" value="${esc(d.q)}"><button type="submit" class="btn-s">Search</button>${has(d) ? `<button type="button" class="btn-s" data-a="keep">Cancel</button>` : ""}</form>`
        + (busy ? `<p class="nm-msg">Looking for it…</p>` : err ? `<p class="nm-msg bad">${esc(err)}</p>` : "")
        + (results ? (results.length ? `<ul class="nm-res" role="listbox" aria-label="Places found">${results.map((r, i) => `<li><button type="button" data-pick="${i}">${esc(r.label)}</button></li>`).join("")}</ul>` : `<p class="nm-msg">Nothing found. Try the street and the town, or a postcode.</p>`) : "")
        + (rec.length && !results ? `<div class="nm-rec"><span>Places you used before</span>${rec.map((p, i) => `<button type="button" class="nm-chip" data-rec="${i}" title="${esc(p.label)}">⌖ ${esc(short(p.label))}</button>`).join("")}</div>` : "")
      : "")
      + (has(d) && !picking ? `<div class="nm-placer"><p class="nm-place" title="${esc(d.label)}">${esc(d.label)}</p><button type="button" class="btn-s nm-change" data-a="change">Change</button></div><div class="nt-map nm-map"></div>
        <p class="nm-links"><a href="${links(d).apple}" target="_blank" rel="noopener">Apple Maps</a> · <a href="${links(d).google}" target="_blank" rel="noopener">Google Maps</a> · <a href="${links(d).osm}" target="_blank" rel="noopener">OpenStreetMap</a></p>` : "");
    const f = body.querySelector(".nm-search");
    if (f) {
      const q = f.querySelector(".nm-q");
      q.addEventListener("input", e => e.stopPropagation());
      q.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape" && has(d)) { e.preventDefault(); el._change = false; results = null; err = ""; draw(); } });
      f.onsubmit = async e => {
        e.preventDefault(); const v = q.value.trim(); if (!v || busy) return;
        if (!T()) { err = "Maps are not available here."; draw(); return; }
        d.q = v; busy = true; err = ""; results = null; draw();
        try { results = (await T().geocode(v)).slice(0, 5); } catch (x) { err = x && x.message ? x.message : "Could not reach the map service."; }
        busy = false; if (el.isConnected) draw(true);
      };
      if (focus) setTimeout(() => { const b = body.querySelector("[data-pick]") || q; b.focus({ preventScroll: true }); }, 0);
    }
    body.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => pick(results[+b.dataset.pick]));
    body.querySelectorAll("[data-rec]").forEach(b => b.onclick = () => pick(rec[+b.dataset.rec]));
    const keep = body.querySelector('[data-a="keep"]'); if (keep) keep.onclick = () => { el._change = false; results = null; err = ""; draw(); };
    const ch = body.querySelector('[data-a="change"]'); if (ch) ch.onclick = () => { el._change = true; draw(true); };
    const host = body.querySelector(".nm-map");
    if (host && T() && T().mapView) view = T().mapView(host, d, { zoom: d.zoom, onZoom: z => { d.zoom = z; save(); } });
  }
  function pick(p) {
    if (!p) return;
    d.label = p.label; d.lat = +p.lat; d.lon = +p.lon; d.zoom = d.zoom || 16; results = null; err = ""; el._change = false;
    remember(p); save(); draw();
  }
  el.addEventListener("mousedown", e => e.stopPropagation());
  draw();
}
window.NPMap = { mount, text, DEF, recent };
})();
