/* Settings window (the Settings word button in the top bar; cloned from Inquire's settings.js).
   A sub-window that opens in front of the app; the app behind it fogs and eases back (body.set-open).
   Sections: Appearance (12 themes), Display & comfort, Shortcuts, Usage, Data & backups, About.
   Shortcuts are rebindable (Shortcuts tab): KEYACTS below, combos like "Alt+KeyN" (modifiers + KeyboardEvent.code) in
   S.keys (overrides of the defaults; "" = off). Esc always closes windows; by default it also opens Settings.
   Two sizes: uiScale = zoom on #app (whole interface); textSize = --ts on :root, which scaleText() multiplies into every
   px font size / line height in the stylesheets (CSSOM rewrite, only once a size other than 100% is chosen).
   Stored per computer in localStorage "notepath.settings" . Themes only change
   surfaces (backgrounds, panels, lines, frame accent); the content colours c1–c5 keep their meaning in every theme.
   Also opens documents (the EULA, web/src/eula.js) in the same kind of window: InquireSettings.openDoc("eula"). */
(function () {
"use strict";
const KEY = "notepath.settings";
// tabs: colours of the My notes, My Code and My Music buttons on the Main Menu (amber-orange, blue, magenta); only their glyphs take them
const TABDEF = { notes: "#F2B84B", code: "#4FA3F7", music: "#D97AE6" };
const DEF = { theme: "capsuleer", uiScale: 1, textSize: 1, reduceMotion: false, escKey: true, invertScroll: false, noteLink: "#B49BFF", indent: "#B5D65A", tabs: TABDEF };
const load = () => {
  let o = {}; try { o = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
  if (o.uiScale == null && typeof o.textScale === "number") o.uiScale = o.textScale; // the old single "Text & interface size" was a zoom
  delete o.textScale;
  if (o.escKey === false && !(o.keys && "settings" in o.keys)) o.keys = Object.assign({}, o.keys, { settings: "" }); // the old "Esc opens Settings" switch
  const pr = Array.isArray(o.presets) ? o.presets.slice(0, 3) : []; while (pr.length < 3) pr.push(null);
  return Object.assign({}, DEF, o, { keys: Object.assign({}, o.keys), presets: pr, tabs: Object.assign({}, TABDEF, o.tabs) });
};
let S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- themes ----------
   bg = primary (window background), surface = secondary (panels), accent = detail (frames, glows).
   tint = second background glow. glass = translucent, blurred panels over a stronger glow. */
const THEMES = [
  { id: "capsuleer", fam: "Dark", name: "Deep Space", bg: "#070A10", surface: "#111827", accent: "#5CC8E0", tint: "#B49BFF", note: "The original console, out among the stars" },
  { id: "obsidian", fam: "Dark", name: "Obsidian", bg: "#050506", surface: "#151517", accent: "#F2B84B", tint: "#8A6A22", text: "#E8E4DC", note: "Neutral black, brass trim" },
  { id: "old-growth", fam: "Nature", name: "Old Growth", bg: "#060D09", surface: "#11211A", accent: "#7BD88F", tint: "#3F7A4F", text: "#DCEBDF", note: "Deep forest canopy" },
  { id: "moss", fam: "Nature", name: "Moss & Lichen", bg: "#0B0F08", surface: "#1C2515", accent: "#B5D65A", tint: "#C9B458", text: "#E5EAD8", note: "Olive, moss and sunlit lichen" },
  { id: "abyssal", fam: "Water", name: "Abyssal", bg: "#030B14", surface: "#0B1F32", accent: "#4FC3F7", tint: "#2C5DA8", text: "#D8E8F4", note: "Open ocean at depth" },
  { id: "tidepool", fam: "Water", name: "Tidepool", bg: "#04110F", surface: "#0D2927", accent: "#5EE0C8", tint: "#3B8FA8", text: "#D6EFEA", note: "Teal shallows and sea glass" },
  { id: "ember", fam: "Earth", name: "Ember", bg: "#0F0606", surface: "#251111", accent: "#E5675B", tint: "#F2B84B", text: "#F1E0DB", note: "Banked coals, warm red" },
  { id: "canyon", fam: "Earth", name: "Canyon Clay", bg: "#120B07", surface: "#2B1B12", accent: "#E0975A", tint: "#B5653A", text: "#F1E4D7", note: "Terracotta and desert stone" },
  { id: "mist", fam: "Airy", name: "Morning Mist", bg: "#1D2734", surface: "#2C3B50", accent: "#A6D8F4", tint: "#E3EEF8", text: "#F0F4FA", muted: "#B6C3D5", faint: "#8796AC", note: "Soft blue-grey, lighter" },
  { id: "dusk", fam: "Airy", name: "Lavender Dusk", bg: "#231E31", surface: "#372F4C", accent: "#D4BBFF", tint: "#F3C6E0", text: "#F3EFFB", muted: "#C0B6D6", faint: "#9187A9", note: "Pale violet evening sky" },
  { id: "frost", fam: "Glass", name: "Frosted Glass", bg: "#0A1424", surface: "#1C2D48", accent: "#C4E8FF", tint: "#B49BFF", glow: "#5CC8E0", glass: true, note: "Clear panels over blue light" },
  { id: "aurora", fam: "Glass", name: "Aurora Glass", bg: "#06100F", surface: "#15282B", accent: "#9CF0C8", tint: "#D97AE6", glow: "#4FD1A5", glass: true, note: "Smoked glass, northern lights" }
];
const FAMS = [["Dark", "Darker tones"], ["Nature", "Nature tones"], ["Water", "Watery tones"], ["Earth", "Red & earthy tones"], ["Airy", "Lighter, airy tones"], ["Glass", "Glassy tones"]];
const VARS = ["--void", "--ink", "--panel", "--panel-2", "--panel-3", "--line", "--line-2", "--text", "--muted", "--faint", "--tint-1", "--tint-2",
  "--chrome-1", "--chrome-2", "--win-1", "--win-2", "--slot-1", "--slot-2", "--slot-h1", "--slot-h2", "--wash", "--sky", "--stage-sky", "--frame", "--blur", "--glow",
  "--node-1", "--node-2", "--node-line", "--node-line-2", "--node-text", "--orb-1", "--orb-2", "--era-1", "--era-2"];

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const toHex = c => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const rgba = (h, a) => `rgba(${hex(h).join(",")},${a})`;
function themeVars(t) {
  const text = t.text || "#DDE4EF", W = "#FFFFFF", g = !!t.glass, al = g ? .5 : .92;
  const panel2 = mix(t.surface, W, .035), panel3 = mix(t.surface, W, .07);
  return {
    "--void": t.bg, "--ink": mix(t.bg, t.surface, .3), "--panel": t.surface, "--panel-2": panel2, "--panel-3": panel3,
    "--line": mix(t.surface, text, .13), "--line-2": mix(t.surface, text, .23), "--text": text,
    "--muted": t.muted || mix(text, t.bg, .38), "--faint": t.faint || mix(text, t.bg, .6),
    "--tint-1": rgba(t.glow || t.accent, g ? .34 : .11), "--tint-2": rgba(t.tint, g ? .3 : .09),
    "--chrome-1": g ? rgba(mix(t.bg, t.surface, .6), .55) : mix(t.bg, t.surface, .6), "--chrome-2": g ? rgba(mix(t.bg, t.surface, .2), .6) : mix(t.bg, t.surface, .2),
    "--win-1": rgba(panel2, al), "--win-2": rgba(mix(t.bg, t.surface, .4), al + .02),
    "--slot-1": rgba(panel3, g ? .45 : .85), "--slot-2": rgba(mix(t.bg, t.surface, .5), g ? .5 : .9),
    "--slot-h1": rgba(mix(panel3, t.accent, .14), g ? .6 : .9), "--slot-h2": rgba(mix(t.bg, t.surface, .55), g ? .6 : .95),
    "--wash": rgba(mix(t.bg, t.surface, .3), g ? .45 : .75), "--sky": mix(mix(t.bg, t.surface, .3), t.accent, .05), "--stage-sky": mix(panel2, t.accent, .05),
    "--frame": t.accent, "--blur": g ? "14px" : "0px", "--glow": rgba(t.accent, .35),
    // neutral tree nodes (locked / planned), node orbs and the era bar take the theme's surface, lightly tinted with its accent
    "--node-1": mix(mix(t.surface, text, .06), t.accent, .05), "--node-2": mix(t.bg, t.surface, .7), "--node-line": mix(mix(t.surface, text, .22), t.accent, .1),
    "--node-line-2": mix(mix(t.surface, text, .3), t.accent, .12), "--node-text": mix(text, t.surface, .3),
    "--orb-1": mix(mix(t.surface, text, .17), t.accent, .14), "--orb-2": mix(t.bg, t.surface, .35),
    "--era-1": rgba(mix(mix(t.surface, text, .05), t.accent, .1), g ? .8 : .95), "--era-2": rgba(mix(t.bg, t.surface, .6), g ? .8 : .95)
  };
}
/* Your colours (Appearance → Your colours): S.custom = { bg, surface, accent, glass } is the live "custom" theme while you
   pick; S.presets = 3 × (null | { name, bg, surface, accent, glass }) are saved as themes "preset-1" … "preset-3".
   Text, lines and the second glow are derived; a light secondary colour gets dark text. */
const lum = c => { const [r, g, b] = hex(c).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
function userTheme(c, id, name) {
  if (!c || !hexOk(c.bg) || !hexOk(c.surface) || !hexOk(c.accent)) return null;
  const light = lum(c.surface) > .4;
  return { id, fam: "Custom", name, bg: c.bg, surface: c.surface, accent: c.accent, tint: mix(c.accent, light ? "#000000" : c.surface, .45), glass: !!c.glass,
    text: light ? "#151A22" : lum(c.surface) > .18 ? "#F6F8FB" : undefined, note: id === "custom" ? "Not saved yet" : "Your preset" };
}
function findTheme(id) {
  const m = /^preset-([123])$/.exec(id || "");
  if (m) { const p = S.presets[m[1] - 1]; return userTheme(p, id, p ? p.name : "") || THEMES[0]; }
  if (id === "custom") return userTheme(S.custom, "custom", "Custom") || THEMES[0];
  return THEMES.find(x => x.id === id) || THEMES[0];
}
function applyTheme(id) {
  const t = findTheme(id), st = document.documentElement.style;
  if (t.id === "capsuleer") VARS.forEach(v => st.removeProperty(v)); // default look = the stylesheet's own values
  else { const v = themeVars(t); VARS.forEach(k => st.setProperty(k, v[k])); }
  document.documentElement.dataset.theme = t.id;
  document.documentElement.toggleAttribute("data-glass", !!t.glass);
}
/* Text size: every px font size and px line height in the stylesheets becomes calc(… * var(--ts, 1)).
   Font shorthands that use var(--ui) keep their text form in the CSSOM, so the size token is rewritten in place. */
const PX = /(\d*\.?\d+)px/, scaled = new WeakSet(), tsCalc = v => `calc(${v}px * var(--ts, 1))`;
function scaleDecl(st) {
  const f = st.getPropertyValue("font");
  if (f && PX.test(f) && !f.includes("--ts"))
    st.setProperty("font", f.replace(/(\d*\.?\d+)px(?:\s*\/\s*(\d*\.?\d+)px)?/, (m, a, b) => tsCalc(a) + (b ? " / " + tsCalc(b) : "")), st.getPropertyPriority("font"));
  ["font-size", "line-height"].forEach(k => {
    const v = st.getPropertyValue(k).trim(), m = /^(\d*\.?\d+)px$/.exec(v);
    if (m) st.setProperty(k, tsCalc(m[1]), st.getPropertyPriority(k));
  });
}
function scaleRules(rules) {
  for (const r of rules) {
    if (r.style) scaleDecl(r.style);
    if (r.cssRules) scaleRules(r.cssRules);
  }
}
function scaleText() {
  for (const sh of document.styleSheets) {
    if (scaled.has(sh)) continue;
    try { scaleRules(sh.cssRules); scaled.add(sh); } catch (e) {} // cross-origin sheets (fonts) are skipped
  }
}
let textOn = false;
function applySizes() {
  const app = document.getElementById("app");
  if (app) app.style.zoom = S.uiScale === 1 ? "" : String(S.uiScale);
  if (S.textSize !== 1) textOn = true;
  if (textOn) scaleText();
  document.documentElement.style.setProperty("--ts", String(S.textSize));
}
window.addEventListener("inquire:route", () => { if (textOn) scaleText(); }); // style sheets a screen or lab adds later
const LINKCOL = [["#B49BFF", "Violet"], ["#5CC8E0", "Cyan"], ["#F2B84B", "Amber"], ["#F07CA0", "Pink"], ["#7BD88F", "Green"], ["#D97AE6", "Magenta"], ["#B5D65A", "Lime"], ["#FFFFFF", "White"]];
const hexOk = c => /^#[0-9a-f]{6}$/i.test(c);
function applyAll() {
  applyTheme(S.theme);
  document.documentElement.style.setProperty("--note-link", hexOk(S.noteLink) ? S.noteLink : DEF.noteLink);
  document.documentElement.style.setProperty("--note-indent", hexOk(S.indent) ? S.indent : DEF.indent); // indented notes (notes.js)
  Object.keys(TABDEF).forEach(k => document.documentElement.style.setProperty("--tab-" + k, hexOk(S.tabs[k]) ? S.tabs[k] : TABDEF[k]));
  applySizes();
  document.documentElement.toggleAttribute("data-reduce-motion", !!S.reduceMotion);
  window.dispatchEvent(new CustomEvent("inquire:theme")); // canvases that paint with the theme (Note Office) repaint
}
applyAll();

/* ---------- window ---------- */
const TABS = [["look", "Appearance"], ["display", "Display & comfort"], ["keys", "Shortcuts"], ["usage", "Usage"], ["code", "Code"], ["data", "Data & backups"], ["about", "About"]];
const ov = document.createElement("div");
ov.className = "set-ov"; ov.hidden = true;
ov.innerHTML = `<div class="set-win win" role="dialog" aria-modal="true" aria-labelledby="set-title">
  <header class="set-h"><span class="dot"></span><h2 id="set-title">Settings</h2><button type="button" class="set-x" aria-label="Close settings">✕</button></header>
  <div class="set-body"><nav class="set-tabs" role="tablist" aria-label="Settings sections"></nav><section class="set-pane" tabindex="-1"></section></div>
</div>`;
document.body.appendChild(ov);
const win = ov.querySelector(".set-win"), tabsEl = ov.querySelector(".set-tabs"), pane = ov.querySelector(".set-pane"), titleEl = ov.querySelector("#set-title");
let tab = "look", lastFocus = null, mode = "settings";
TABS.forEach(([id, label]) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "set-tab"; b.setAttribute("role", "tab"); b.dataset.tab = id; b.textContent = label;
  b.onclick = () => show(id);
  tabsEl.appendChild(b);
});
function open(which) {
  mode = "settings"; win.classList.remove("is-doc"); titleEl.textContent = "Settings"; tabsEl.hidden = false;
  if (!ov.hidden) { show(which || tab); return; }
  lastFocus = document.activeElement;
  ov.hidden = false; requestAnimationFrame(() => { if (!ov.hidden) document.body.classList.add("set-open"); });
  show(which || tab);
  setTimeout(() => (tabsEl.querySelector('[aria-selected="true"]') || win).focus({ preventScroll: true }), 30);
}
function openDoc(id) {
  const d = (window.InquireDocs || {})[id]; if (!d) return;
  const was = !ov.hidden;
  if (!was) lastFocus = document.activeElement;
  mode = "doc"; win.classList.add("is-doc"); titleEl.textContent = d.title; tabsEl.hidden = true;
  pane.innerHTML = `<div class="set-doc">${d.html}</div>` + (was ? `<p class="set-row"><button type="button" class="btn-s" data-back>◀ Back to settings</button></p>` : "");
  const bk = pane.querySelector("[data-back]"); if (bk) bk.onclick = () => open("about");
  ov.hidden = false; requestAnimationFrame(() => { if (!ov.hidden) document.body.classList.add("set-open"); });
  pane.scrollTop = 0; setTimeout(() => pane.focus({ preventScroll: true }), 30);
}
function close() {
  document.body.classList.remove("set-open"); ov.hidden = true;
  if (lastFocus && document.contains(lastFocus)) try { lastFocus.focus({ preventScroll: true }); } catch (e) {}
}
ov.querySelector(".set-x").onclick = close;
ov.addEventListener("pointerdown", e => { if (e.target === ov) close(); });
document.addEventListener("keydown", e => {
  if (recording) { recordKey(e); return; }
  const combo = comboOf(e), act = e.repeat || e.defaultPrevented ? null : actionFor(combo);
  if (ov.hidden) {
    if (e.key === "Escape" && !e.defaultPrevented) {
      // Esc closes the smallest thing first: a popup (it handles Esc itself), then My notes
      if (document.querySelector(".tm-menu, .nk-pick, .nr-panel, .ask-ov, .nv-pop, .np-pop, .np-holo, .np-ind")) return;
      if (document.querySelector(".mw-ov:not(.out)") && window.InquireApp) { e.preventDefault(); e.stopPropagation(); InquireApp.closeWin(); return; }
    }
    if (!act || document.querySelector(".ask-ov")) return;
    if (typing(e) && !e.ctrlKey && !e.metaKey && combo !== "Escape") return; // plain and Alt keys belong to the text field
    e.preventDefault(); e.stopPropagation(); runAction(act); return;
  }
  if (e.key === "Escape" || act === "settings") { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (e.key === "Tab") { // keep focus inside the window
    const f = [...win.querySelectorAll('button:not([disabled]),input:not([disabled]),select,a[href],[tabindex="0"]')].filter(el => el.offsetParent);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  e.stopPropagation();
}, true);

function show(id) {
  tab = id;
  tabsEl.querySelectorAll(".set-tab").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
  pane.innerHTML = ""; pane.scrollTop = 0;
  ({ look: paneLook, display: paneDisplay, keys: paneKeys, usage: paneUsage, code: paneCode, data: paneData, about: paneAbout })[id]();
}
const h = html => { const d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; };
const msgEl = () => h(`<p class="set-msg" role="status" aria-live="polite"></p>`);
const say = (el, t, ok) => { el.textContent = t; el.classList.toggle("ok", !!ok); };

/* Appearance */
function swatch(t) {
  return `<span class="set-sw${t.glass ? " set-glass" : ""}" style="--p:${t.bg};--s:${t.surface};--d:${t.accent};--t:${t.glow || t.tint}" aria-hidden="true">
    <i class="set-swp"></i><i class="set-sws"></i><i class="set-swd"></i></span>`;
}
function paneLook() {
  const wrap = h(`<div><p class="set-lede">Pick the colours of the console. Each square shows the theme's <b>primary</b> (background), <b>secondary</b> (panels) and <b>detail</b> (frames and glow) colours. Topic colours stay the same in every theme so diagrams keep their meaning. To make your own, scroll to <b>Your colours</b> below.</p></div>`);
  FAMS.forEach(([fam, label]) => {
    const g = h(`<div class="set-thfam"><h3>${label}</h3><div class="set-thgrid" role="radiogroup" aria-label="${label}"></div></div>`);
    THEMES.filter(t => t.fam === fam).forEach(t => {
      const b = h(`<button type="button" class="set-th" role="radio" aria-checked="${S.theme === t.id}" data-id="${t.id}">
        ${swatch(t)}<span class="set-thname">${esc(t.name)}</span><span class="set-thnote">${esc(t.note)}</span>
        <span class="set-thchips"><i style="background:${t.bg}" title="Primary ${t.bg}"></i><i style="background:${t.surface}" title="Secondary ${t.surface}"></i><i style="background:${t.accent}" title="Detail ${t.accent}"></i></span></button>`);
      b.onclick = () => { S.theme = t.id; save(); applyTheme(t.id); wrap.querySelectorAll(".set-th").forEach(x => x.setAttribute("aria-checked", String(x.dataset.id === t.id))); if (wrap._cust) wrap._cust(t); };
      g.querySelector(".set-thgrid").appendChild(b);
    });
    wrap.appendChild(g);
  });
  wrap.appendChild(customLook(wrap));
  // colour of linked words in notes (links to other notes)
  const lc = h(`<div class="set-thfam"><h3>Note links</h3><div class="set-item set-lcitem"><div><p>Colour of linked words in your notes: words that open another note.
      <span class="set-lcdemo">Example: see <a class="nlink" tabindex="-1">my shopping list</a>.</span></p></div>
    <div class="set-lc" role="radiogroup" aria-label="Note link colour">${LINKCOL.map(([c, n]) => `<button type="button" role="radio" class="set-lcs" data-c="${c}" aria-checked="${S.noteLink.toLowerCase() === c.toLowerCase()}" title="${n}" aria-label="${n}" style="--c:${c}"></button>`).join("")}
      <label class="set-lcs set-lcpick" title="Any colour" aria-label="Any colour"><input type="color" value="${hexOk(S.noteLink) ? S.noteLink : DEF.noteLink}"></label></div></div></div>`);
  const mark = () => lc.querySelectorAll(".set-lcs[data-c]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.c.toLowerCase() === S.noteLink.toLowerCase())));
  lc.querySelectorAll(".set-lcs[data-c]").forEach(b => b.onclick = () => { S.noteLink = b.dataset.c; save(); applyAll(); mark(); lc.querySelector('input[type="color"]').value = S.noteLink; });
  const pick = lc.querySelector('input[type="color"]');
  pick.oninput = () => { S.noteLink = pick.value; applyAll(); mark(); };
  pick.onchange = () => { S.noteLink = pick.value; save(); };
  wrap.appendChild(lc);
  // colour of indented notes (your own notes under the words they explain)
  const ic = h(`<div class="set-thfam"><h3>Indented notes</h3><div class="set-item set-lcitem"><div><p>Colour of the notes you indent under words in a note (↳ at the bottom right of a note).
      <span class="set-lcdemo set-inddemo">Example: <span class="set-indw">photosynthesis</span><span class="set-indt">how plants turn light into food</span></span></p></div>
    <div class="set-lc" role="radiogroup" aria-label="Indented notes colour">${LINKCOL.map(([c, n]) => `<button type="button" role="radio" class="set-lcs" data-c="${c}" aria-checked="${String(S.indent).toLowerCase() === c.toLowerCase()}" title="${n}" aria-label="${n}" style="--c:${c}"></button>`).join("")}
      <label class="set-lcs set-lcpick" title="Any colour" aria-label="Any colour"><input type="color" value="${hexOk(S.indent) ? S.indent : DEF.indent}"></label></div></div></div>`);
  const imark = () => ic.querySelectorAll(".set-lcs[data-c]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.c.toLowerCase() === String(S.indent).toLowerCase())));
  ic.querySelectorAll(".set-lcs[data-c]").forEach(b => b.onclick = () => { S.indent = b.dataset.c; save(); applyAll(); imark(); ic.querySelector('input[type="color"]').value = S.indent; });
  const ipick = ic.querySelector('input[type="color"]');
  ipick.oninput = () => { S.indent = ipick.value; applyAll(); imark(); };
  ipick.onchange = () => { S.indent = ipick.value; save(); };
  wrap.appendChild(ic);
  // colours of the My notes / My Code / My Music Main Menu buttons
  const tc = h(`<div class="set-thfam"><h3>Main Menu colours</h3><div class="set-item"><div><p>Colours of the My notes, My Code and My Music buttons on the Main Menu. Only their icons change colour; the rest keeps your theme.</p></div>
    <div class="set-tabc">${[["notes", "My notes"], ["code", "My Code"], ["music", "My Music"]].map(([k, n]) => `<label class="set-tabcl" style="--c:${S.tabs[k]}"><input type="color" data-tab="${k}" value="${hexOk(S.tabs[k]) ? S.tabs[k] : TABDEF[k]}" aria-label="${n} tab colour"><span>${n}</span></label>`).join("")}
      <button type="button" class="btn-s" data-a="tabreset" title="Back to orange, blue and magenta">Reset</button></div></div></div>`);
  tc.querySelectorAll('input[type="color"]').forEach(inp => {
    inp.oninput = () => { S.tabs[inp.dataset.tab] = inp.value; inp.parentElement.style.setProperty("--c", inp.value); applyAll(); };
    inp.onchange = () => { S.tabs[inp.dataset.tab] = inp.value; save(); };
  });
  tc.querySelector('[data-a="tabreset"]').onclick = () => { S.tabs = Object.assign({}, TABDEF); save(); applyAll(); tc.querySelectorAll('input[type="color"]').forEach(inp => { inp.value = TABDEF[inp.dataset.tab]; inp.parentElement.style.setProperty("--c", inp.value); }); };
  wrap.appendChild(tc);
  pane.appendChild(wrap);
}

/* Your colours: three pickers (live), a preview square, and three preset slots drawn like the theme cards */
const CFIELDS = [["bg", "Primary", "Background"], ["surface", "Secondary", "Panels"], ["accent", "Detail", "Frames & glow"]];
function customLook(wrap) {
  const cur = () => { const t = findTheme(S.theme); return { bg: t.bg, surface: t.surface, accent: t.accent, glass: !!t.glass }; };
  let C = S.theme === "custom" && S.custom ? Object.assign({}, S.custom) : cur();
  const card = (p, i) => {
    const id = "preset-" + (i + 1), t = userTheme(p, id, p && p.name);
    if (!t) return `<div class="set-pwrap"><div class="set-th set-pempty"><span class="set-sw set-swempty" aria-hidden="true">${i + 1}</span><span class="set-thname">Preset ${i + 1}</span><span class="set-thnote">Empty. Pick colours above, then save them here.</span></div></div>`;
    return `<div class="set-pwrap"><button type="button" class="set-th" role="radio" aria-checked="${S.theme === id}" data-id="${id}">
      ${swatch(t)}<span class="set-thname">${esc(t.name)}</span><span class="set-thnote">Your preset · slot ${i + 1}</span>
      <span class="set-thchips"><i style="background:${t.bg}" title="Primary ${t.bg}"></i><i style="background:${t.surface}" title="Secondary ${t.surface}"></i><i style="background:${t.accent}" title="Detail ${t.accent}"></i></span></button>
      <button type="button" class="set-pdel" data-del="${i}" title="Delete preset ${i + 1}" aria-label="Delete preset ${esc(t.name)}">✕</button></div>`;
  };
  const el = h(`<div class="set-thfam set-cust"><h3>Your colours</h3>
    <p class="set-cl">Choose your own <b>primary</b>, <b>secondary</b> and <b>detail</b> colours; the console changes as you pick. Save a look into one of three presets to come back to it.</p>
    <div class="set-cedit"><span class="set-cprev"></span>
      <div class="set-cfields">${CFIELDS.map(([k, n, d]) => `<div class="set-cf"><span class="set-cfl">${n}<small>${d}</small></span>
        <label class="set-cpick" style="--c:${C[k]}"><input type="color" data-c="${k}" value="${C[k]}" aria-label="${n} colour"></label>
        <input class="set-hex" data-h="${k}" value="${C[k].toUpperCase()}" maxlength="7" spellcheck="false" autocomplete="off" aria-label="${n} colour, hex"></div>`).join("")}
        <label class="set-cglass"><input type="checkbox" data-glass${C.glass ? " checked" : ""}> Glass panels <small>translucent, blurred</small></label></div></div>
    <div class="set-csave"><input class="set-cname" maxlength="24" placeholder="Name this look" aria-label="Preset name">
      <span class="set-cto">Save to</span>${[0, 1, 2].map(i => `<button type="button" class="btn-s" data-save="${i}">Preset ${i + 1}</button>`).join("")}<span class="set-msg" role="status"></span></div>
    <div class="set-thgrid set-presets" role="radiogroup" aria-label="Your presets">${S.presets.map(card).join("")}</div></div>`);
  const msg = el.querySelector(".set-msg");
  const prev = () => { el.querySelector(".set-cprev").innerHTML = swatch({ bg: C.bg, surface: C.surface, accent: C.accent, tint: mix(C.accent, C.surface, .45), glass: C.glass }); };
  const fill = () => { CFIELDS.forEach(([k]) => { el.querySelector(`[data-c="${k}"]`).value = C[k]; el.querySelector(`[data-h="${k}"]`).value = C[k].toUpperCase(); el.querySelector(`[data-c="${k}"]`).parentNode.style.setProperty("--c", C[k]); }); el.querySelector("[data-glass]").checked = !!C.glass; prev(); };
  const mark = () => wrap.querySelectorAll(".set-th[data-id]").forEach(x => x.setAttribute("aria-checked", String(x.dataset.id === S.theme)));
  const live = keep => { S.custom = Object.assign({}, C); S.theme = "custom"; applyTheme("custom"); mark(); prev(); if (keep) save(); };
  CFIELDS.forEach(([k]) => {
    const col = el.querySelector(`[data-c="${k}"]`), hx = el.querySelector(`[data-h="${k}"]`);
    col.oninput = () => { C[k] = col.value; hx.value = col.value.toUpperCase(); col.parentNode.style.setProperty("--c", col.value); live(false); };
    col.onchange = () => live(true);
    hx.oninput = () => { let v = hx.value.trim(); if (!v.startsWith("#")) v = "#" + v; if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + v.slice(1).split("").map(x => x + x).join("");
      if (hexOk(v)) { C[k] = v.toLowerCase(); col.value = C[k]; col.parentNode.style.setProperty("--c", C[k]); hx.classList.remove("bad"); live(true); } else hx.classList.add("bad"); };
    hx.onblur = () => { hx.value = C[k].toUpperCase(); hx.classList.remove("bad"); };
  });
  el.querySelector("[data-glass]").onchange = e => { C.glass = e.target.checked; live(true); };
  let armed = null;
  el.querySelectorAll("[data-save]").forEach(b => b.onclick = () => {
    const i = +b.dataset.save, had = S.presets[i];
    if (had && armed !== b) { if (armed) armed.textContent = "Preset " + (+armed.dataset.save + 1); armed = b; b.textContent = "Replace?"; say(msg, `Preset ${i + 1} holds “${had.name}”. Click Replace? to save over it.`); return; }
    armed = null;
    const name = el.querySelector(".set-cname").value.trim() || "Preset " + (i + 1);
    S.presets[i] = { name, bg: C.bg, surface: C.surface, accent: C.accent, glass: !!C.glass }; S.theme = "preset-" + (i + 1); save(); applyTheme(S.theme);
    redraw(`Saved “${name}” as preset ${i + 1}.`);
  });
  el.querySelector(".set-presets").addEventListener("click", e => {
    const d = e.target.closest("[data-del]");
    if (d) { const i = +d.dataset.del; if (d.dataset.armed !== "1") { d.dataset.armed = "1"; d.textContent = "Delete?"; d.classList.add("armed"); return; }
      const nm = S.presets[i].name; S.presets[i] = null; if (S.theme === "preset-" + (i + 1)) { S.custom = Object.assign({}, C); S.theme = "custom"; } save(); applyTheme(S.theme); redraw(`Deleted “${nm}”.`); return; }
    const b = e.target.closest(".set-th[data-id]"); if (!b) return;
    S.theme = b.dataset.id; save(); applyTheme(S.theme); mark();
    const p = S.presets[+b.dataset.id.slice(7) - 1]; C = { bg: p.bg, surface: p.surface, accent: p.accent, glass: !!p.glass }; fill(); el.querySelector(".set-cname").value = p.name;
  });
  function redraw(note) { const y = pane.scrollTop; show("look"); pane.scrollTop = y; const m2 = pane.querySelector(".set-cust .set-msg"); if (m2 && note) say(m2, note, true); }
  wrap._cust = t => { C = { bg: t.bg, surface: t.surface, accent: t.accent, glass: !!t.glass }; fill(); }; // a built-in theme picked: start from its colours
  prev();
  return el;
}

/* Display & comfort */
function fader(key, label, desc, min, max, step, marks) {
  const v = S[key], pct = x => Math.round(x * 100) + "%";
  return `<div class="set-item set-faditem" data-fader="${key}"><div><h3>${label}</h3><p>${desc}</p></div>
    <div class="set-fader">
      <div class="set-fadrow"><button type="button" class="set-fstep" data-d="-1" aria-label="Smaller ${label.toLowerCase()}">−</button>
        <div class="set-frange"><input type="range" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${label}" aria-valuetext="${pct(v)}" style="--f:${(v - min) / (max - min) * 100}%;--n:${Math.round((max - min) / step)}">
          <div class="set-fmarks" aria-hidden="true">${marks.map(m => `<span style="left:${(m - min) / (max - min) * 100}%">${pct(m)}</span>`).join("")}</div></div>
        <button type="button" class="set-fstep" data-d="1" aria-label="Larger ${label.toLowerCase()}">+</button>
        <output class="set-fval">${pct(v)}</output>
        <button type="button" class="set-freset" title="Back to 100%"${v === 1 ? " disabled" : ""}>Reset</button></div>
    </div></div>`;
}
function paneDisplay() {
  const w = h(`<div>
    ${fader("textSize", "Text size", "Only the words: notes, menus and labels. Layout keeps its size.", .8, 1.5, .05, [.8, 1, 1.25, 1.5])}
    ${fader("uiScale", "Interface size", "Scales the whole console: panels, buttons and lists, with their text.", .75, 1.4, .05, [.75, 1, 1.2, 1.4])}
    <div class="set-item"><div><h3>Reduce motion</h3><p>Turns off animations, fades and slides.</p></div>
      <label class="set-tog"><input type="checkbox" data-k="reduceMotion"${S.reduceMotion ? " checked" : ""}><span></span></label></div>
  </div>`);
  w.querySelectorAll("[data-fader]").forEach(row => {
    const key = row.dataset.fader, r = row.querySelector("input"), out = row.querySelector("output"), rs = row.querySelector(".set-freset");
    const min = +r.min, max = +r.max, step = +r.step;
    const set = (v, commit) => {
      v = Math.round(Math.min(max, Math.max(min, v)) / step) * step; v = Math.round(v * 100) / 100;
      r.value = v; r.style.setProperty("--f", (v - min) / (max - min) * 100 + "%");
      out.textContent = Math.round(v * 100) + "%"; r.setAttribute("aria-valuetext", out.textContent); rs.disabled = v === 1;
      S[key] = v; applySizes(); if (commit) save();
    };
    r.oninput = () => set(+r.value, false);
    r.onchange = () => set(+r.value, true);
    row.querySelectorAll(".set-fstep").forEach(b => b.onclick = () => set(S[key] + step * +b.dataset.d, true));
    rs.onclick = () => set(1, true);
  });
  w.querySelectorAll(".set-tog input").forEach(i => i.onchange = () => { S[i.dataset.k] = i.checked; save(); applyAll(); });
  pane.appendChild(w);
}

/* Usage */
function paneUsage() {
  const w = h(`<div>
    <p class="set-lede">How the mouse wheel and trackpad move things.</p>
    <div class="set-item"><div><h3>Invert scroll direction</h3><p>Off: NotePath scrolls the way your computer is set. On: the wheel or trackpad scrolls the other way (down ⇄ up) in notes, lists and menus. Try it in the box below.</p></div>
      <label class="set-tog"><input type="checkbox" data-k="invertScroll"${S.invertScroll ? " checked" : ""}><span></span></label></div>
    <div class="set-scrolltry" tabindex="0" aria-label="Scroll test area">${Array.from({ length: 12 }, (_, i) => `<p>Line ${i + 1}: try scrolling here.</p>`).join("")}</div>
  </div>`);
  w.querySelector('[data-k="invertScroll"]').onchange = e => { S.invertScroll = e.target.checked; save(); };
  // the desktop app: stay in the tray (Windows / Linux) and start at sign-in, so My Tasks reminders keep arriving
  const D = window.inquireDesktop;
  if (D && D.prefs) D.prefs().then(p => {
    if (!p || (!p.trayAvailable && !p.loginAvailable) || !w.isConnected) return;
    const box = h(`<div><p class="set-lede set-run">Keeping NotePath running lets <b>My Tasks</b> reminders arrive even when its window is closed.</p>
      ${p.trayAvailable ? `<div class="set-item"><div><h3>Keep running in the system tray</h3><p>On: closing the window hides NotePath in the notification area (by the clock), and reminders still pop up. Quit it from the tray icon's menu. Off: closing the window quits NotePath.</p></div>
        <label class="set-tog"><input type="checkbox" data-p="tray"${p.tray ? " checked" : ""}><span></span></label></div>` : ""}
      ${p.loginAvailable ? `<div class="set-item"><div><h3>Start NotePath when I sign in</h3><p>${p.trayAvailable ? "It starts quietly in the tray" : "It opens when you sign in to your Mac"}, so reminders arrive after a restart too.</p></div>
        <label class="set-tog"><input type="checkbox" data-p="login"${p.login ? " checked" : ""}><span></span></label></div>` : ""}</div>`);
    box.querySelectorAll("[data-p]").forEach(c => c.onchange = () => D.setPrefs({ [c.dataset.p]: c.checked }));
    w.appendChild(box);
  });
  pane.appendChild(w);
}

/* Code (My Code of My notes, code.js): where ▶ Run sends code, and the AI status */
function paneCode() {
  const C = window.NPCode; if (!C) return;
  const c = C.settings();
  const w = h(`<div>
    <p class="set-lede">The <b>Code</b> tab of My notes runs <b>Python, C, C++ and Java</b> on a run service: your code is sent over the internet, compiled and run there, and the output comes back. <b>JavaScript</b> runs right here, on this computer.</p>
    <div class="set-thfam"><h3>Run service</h3><div class="set-svcs" role="radiogroup" aria-label="Run service">${C.SERVICES.map(x => `<label class="set-svc"><input type="radio" name="svc" value="${x.k}"${c.service === x.k ? " checked" : ""}><span><b>${esc(x.name)}</b><small>${esc(x.note)}</small></span></label>`).join("")}</div>
      <div class="set-item"><div><h3>Address</h3><p>Leave empty for the service's usual address.</p></div><input class="set-in" data-k="url" type="url" spellcheck="false" autocomplete="off" aria-label="Run service address"></div>
      <div class="set-item"><div><h3>Key</h3><p>Only if the service needs one. Kept on this computer.</p></div><input class="set-in" data-k="key" type="password" spellcheck="false" autocomplete="off" aria-label="Run service key"></div>
      <div class="set-item"><div><h3>Run JavaScript on this computer</h3><p>On: JavaScript runs inside NotePath, even offline. Off: it goes to the run service (Node.js) like the other languages.</p></div>
        <label class="set-tog"><input type="checkbox" data-k="jsHere"${c.jsHere !== false ? " checked" : ""}><span></span></label></div>
      <div class="set-item"><div><h3>Test the run service</h3><p>Runs a one-line Python program there.</p></div><button type="button" class="btn-s" data-a="test">Test</button></div></div>
    <div class="set-thfam"><h3>AI</h3><div class="set-item"><div><h3>Translate code (⇄ in My Code)</h3><p class="set-ai">Checking…</p></div></div></div>
  </div>`);
  const m = msgEl(); w.appendChild(m);
  const url = w.querySelector('[data-k="url"]'), key = w.querySelector('[data-k="key"]');
  const fill = () => { const x = C.settings(), sv = C.SERVICES.find(v => v.k === x.service) || C.SERVICES[0]; url.value = x.url || ""; url.placeholder = sv.url; key.value = x.key || ""; };
  fill();
  const changed = p => { C.setSettings(p); window.dispatchEvent(new CustomEvent("np:code-settings")); };
  w.querySelectorAll('input[name="svc"]').forEach(r => r.onchange = () => { changed({ service: r.value, url: "" }); fill(); say(m, "", true); });
  url.onchange = () => changed({ url: url.value.trim() }); key.onchange = () => changed({ key: key.value.trim() });
  w.querySelector('[data-k="jsHere"]').onchange = e => changed({ jsHere: e.target.checked });
  w.querySelector('[data-a="test"]').onclick = async e => {
    const b = e.currentTarget; b.disabled = true; say(m, "Running print(\"Hello from NotePath\")…", true);
    try { const r = await C.run("python", 'print("Hello from NotePath")\n', ""); say(m, /Hello from NotePath/.test(r.out) ? "The run service works: it printed “Hello from NotePath”." : "The run service answered, but not as expected: " + (r.err || r.status), /Hello/.test(r.out)); }
    catch (err) { say(m, err.message || "The run service did not answer."); }
    b.disabled = false;
  };
  C.ai.status().then(st => { const p = w.querySelector(".set-ai"); if (!p) return;
    p.innerHTML = st && st.configured ? `Ready${st.model ? ` (${esc(st.model)})` : ""}. ⇄ Translate in My Code turns a file into another language.`
      : `Not set up in this copy yet. The AI key goes into NotePath itself (not here), so it stays hidden; once it is in, ⇄ Translate works with no setup.`; });
  pane.appendChild(w);
}

/* Invert scroll: every wheel event is swapped for a copy with deltaY reversed. Handlers that take the wheel themselves
   (tree panning, labs) get the copy; if none of them cancels it, the nearest scrollable box is scrolled by hand. */
const synthWheel = new WeakSet();
function scrollBox(el, dx, dy) {
  for (let n = el instanceof Element ? el : null; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const canY = dy && /(auto|scroll|overlay)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1 && (dy < 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1);
    const canX = dx && /(auto|scroll|overlay)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1 && (dx < 0 ? n.scrollLeft > 0 : n.scrollLeft + n.clientWidth < n.scrollWidth - 1);
    if (canY || canX) { n.scrollBy({ top: canY ? dy : 0, left: canX ? dx : 0 }); return; }
  }
  (document.scrollingElement || document.documentElement).scrollBy({ top: dy, left: dx });
}
window.addEventListener("wheel", e => {
  if (!S.invertScroll || synthWheel.has(e) || e.ctrlKey || !e.deltaY) return; // ctrl+wheel = pinch zoom, left alone
  e.preventDefault(); e.stopImmediatePropagation();
  const c = new WheelEvent("wheel", { bubbles: true, cancelable: true, composed: true, view: window,
    deltaX: e.deltaX, deltaY: -e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
    shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey, buttons: e.buttons });
  synthWheel.add(c);
  e.target.dispatchEvent(c);
  if (c.defaultPrevented) return;
  const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight * .9 : 1;
  let dx = e.deltaX * unit, dy = -e.deltaY * unit;
  if (e.shiftKey && !e.deltaX) { dx = dy; dy = 0; } // shift + wheel scrolls sideways
  scrollBox(e.target, dx, dy);
}, { capture: true, passive: false });

/* Shortcuts: every action can be rebound (or turned off). Combos are modifiers + KeyboardEvent.code ("Alt+KeyN"), so they
   work whatever letter Alt types on a Mac keyboard. Plain and Alt combos never fire while typing in a text field. */
const KEYACTS = [
  ["settings", "Open or close Settings", "Escape", "Esc always closes an open window first."],
  ["menu", "Main Menu", "Alt+KeyM"],
  ["notes", "My notes", "Alt+KeyN"],
  ["newnote", "New note", "Alt+Shift+KeyN"],
  ["favs", "Favourite notes", "Alt+KeyF"],
  ["tasks", "My Tasks", "Alt+KeyT"],
  ["back", "Back", "Alt+Backspace", "Closes My notes when it is open."]
];
const KDEF = Object.fromEntries(KEYACTS.map(a => [a[0], a[2]]));
const binding = id => (S.keys && id in S.keys ? S.keys[id] : KDEF[id]) || "";
const actionFor = c => c ? (KEYACTS.find(a => binding(a[0]) === c) || [null])[0] : null;
const MODS = ["Control", "Alt", "Shift", "Meta", "CapsLock", "Fn", "OS", "Hyper", "Super"];
function comboOf(e) {
  if (!e.code || MODS.includes(e.key)) return "";
  return (e.ctrlKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + (e.metaKey ? "Meta+" : "") + e.code;
}
const MAC = /Mac/.test(navigator.platform);
const KEYNAMES = { Escape: "Esc", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", Backspace: "⌫", Delete: "Del", Space: "Space", Enter: "Enter", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Backquote: "`" };
function keyLabel(c) {
  if (!c) return ["Off"];
  return c.split("+").map(p => p === "Ctrl" ? (MAC ? "⌃" : "Ctrl") : p === "Alt" ? (MAC ? "⌥" : "Alt") : p === "Shift" ? (MAC ? "⇧" : "Shift") : p === "Meta" ? (MAC ? "⌘" : "Win")
    : KEYNAMES[p] || p.replace(/^Key|^Digit|^Numpad/, ""));
}
const typing = e => { const t = e.target; return !!(t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')); };
function runAction(a) {
  const App = window.InquireApp;
  if (a === "settings") return open();
  if (App && App.shortcut) App.shortcut(a);
}
// keys the app or the system needs; they cannot be taken
function refused(c) {
  if (["Tab", "Shift+Tab", "Enter", "Space", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(c)) return "is used to move around and press buttons";
  if (/^(Ctrl|Meta)\+(Key[ACVXZYQWRP]|Shift\+KeyZ)$/.test(c)) return "is a system shortcut (copy, paste, undo, quit…)";
  if (/^(Shift\+)?Key[A-Z]$|^(Shift\+)?Digit\d$/.test(c)) return "types a letter; add Alt, Ctrl or " + (MAC ? "⌘" : "Win");
  return "";
}
let recording = null;
function recordKey(e) {
  if (MODS.includes(e.key)) return;
  e.preventDefault(); e.stopPropagation();
  const r = recording, c = comboOf(e);
  if (e.code === "Backspace" && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey || e.code === "Delete") return r.done("", "");
  const bad = refused(c);
  if (bad) return r.done(null, keyLabel(c).join(" + ") + " " + bad + ".");
  r.done(c, "");
}
function paneKeys() {
  const kb = c => keyLabel(c).map(k => `<kbd class="set-kbd">${esc(k)}</kbd>`).join("");
  const w = h(`<div>
    <p class="set-lede">Click a shortcut, then press the keys you want. <b>Backspace</b> turns a shortcut off. Shortcuts with only Alt or no modifier pause while you type in a text box.</p>
    <div class="set-binds" role="list"></div>
    <div class="set-row"><button type="button" class="btn-s" data-a="kreset">Reset all to defaults</button><span class="set-msg" role="status"></span></div>
    <h3 class="set-fixh">Fixed keys</h3>
    <dl class="set-keys">${[[["Alt", "↑", "↓"], "In My notes, move the selected note or folder up or down in your own order."], [["Enter"], "Open the focused note in the notes list."],
      [["Tab"], "Move between buttons and fields; inside Settings, focus stays in the window."], [["Esc"], "Close the window or popup that is open: menus, My notes, Settings."]]
      .map(([ks, d]) => `<div><dt>${ks.map(k => `<kbd class="set-kbd">${k}</kbd>`).join("")}</dt><dd>${d}</dd></div>`).join("")}</dl>
  </div>`);
  const list = w.querySelector(".set-binds"), msg = w.querySelector(".set-msg");
  const draw = () => {
    list.innerHTML = KEYACTS.map(([id, label, def, note]) => { const c = binding(id);
      return `<div class="set-bind" role="listitem"><div><h3>${esc(label)}</h3>${note ? `<p>${esc(note)}</p>` : ""}</div>
        <button type="button" class="set-bk${c ? "" : " off"}" data-k="${id}" aria-label="${esc(label)}: ${esc(keyLabel(c).join(" "))}. Click to change">${kb(c)}</button>
        <button type="button" class="set-bx" data-r="${id}" title="Back to ${esc(keyLabel(def).join(" + "))}" aria-label="Reset ${esc(label)}"${c === def ? " disabled" : ""}>↺</button></div>`; }).join("");
  };
  const set = (id, c) => {
    S.keys = Object.assign({}, S.keys);
    let note = "";
    if (c) KEYACTS.forEach(([o, label]) => { if (o !== id && binding(o) === c) { S.keys[o] = ""; note = `${keyLabel(c).join(" + ")} was on “${label}”, which is now off.`; } });
    if (c === KDEF[id]) delete S.keys[id]; else S.keys[id] = c;
    save(); draw(); say(msg, note || "Saved.", !note);
  };
  list.addEventListener("click", e => {
    const r = e.target.closest("[data-r]"); if (r) { set(r.dataset.r, KDEF[r.dataset.r]); return; }
    const b = e.target.closest("[data-k]"); if (!b) return;
    if (recording) { const same = recording.id === b.dataset.k; recording.cancel(); if (same) return; }
    b.classList.add("rec"); b.innerHTML = `<span class="set-rec">Press keys…</span>`;
    const cancel = () => { recording = null; document.removeEventListener("pointerdown", out, true); draw(); };
    const out = ev => { if (!ev.target.closest || ev.target.closest("[data-k]") !== b) { cancel(); } };
    recording = { id: b.dataset.k, cancel, done: (c, err) => { cancel(); if (err) say(msg, err); else if (c !== null) set(b.dataset.k, c); } };
    setTimeout(() => document.addEventListener("pointerdown", out, true), 0);
  });
  w.querySelector('[data-a="kreset"]').onclick = () => { S.keys = {}; save(); draw(); say(msg, "All shortcuts are back to their defaults.", true); };
  draw();
  pane.appendChild(w);
}

/* Data & backups */
/* Backups (format 3, same shape as Inquire's): { app: "NotePath", kind: "notes-backup", version: 3, data: { notes, folders, images, settings } }.
   Restoring merges notes and folders by id (a note with the same id is replaced; others are kept, so nothing written since
   is lost), restores the photos under their own ids and replaces the settings. */
const K = () => window.InquireKeys || { notes: () => "notepath.notes._local" };
const readJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
function paneData() {
  const nn = readJ(K().notes(), []).length, NS0 = window.InquireNotes, nf = NS0 ? NS0.readFolders().length : 0;
  const w = h(`<div>
    <p class="set-lede">Saved on this computer: <b>${nn}</b> note${nn === 1 ? "" : "s"} in <b>${nf}</b> folder${nf === 1 ? "" : "s"}.</p>
    <div class="set-item"><div><h3>Back up</h3><p>Saves your notes (with their folders, photos, code boxes, music charts and videos up to 25 MB), code files, tasks (with their pictures and files up to 25 MB) and settings to one file. Bigger video files stay on this computer only: the backup tells you which.</p></div><button type="button" class="btn-s" data-a="exp">Export…</button></div>
    <div class="set-item"><div><h3>Restore a backup</h3><p>Loads a file made with Export, on this or another computer. Adds the backup's notes, folders and photos to yours and restores its settings.</p></div><label class="btn-s set-file">Import…<input type="file" accept=".json,application/json" hidden></label></div>
  </div>`);
  const m = msgEl(); w.appendChild(m);
  w.querySelector('[data-a="exp"]').onclick = async e => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = "Saving…";
    const NS = window.InquireNotes, notes = readJ(K().notes(), []);
    const T = window.NPTasks, tasks = T ? T.readRaw() : [];
    // the tasks' pictures and files go in with the notes' photos (as if one note held them all)
    const holders = NS ? NS.list().concat(tasks.length ? [{ title: "My Tasks", html: T.media().map(i => `data-img="${i}"`).join(" ") }] : []) : [];
    let images = {}, skipped = []; try { if (NS) ({ map: images, skipped } = await NS.exportMedia(holders)); } catch (err) {}
    const data = { notes, folders: NS ? NS.readFolders() : [], tasks, images, settings: readJ("notepath.settings", {}) };
    btn.disabled = false; btn.textContent = "Export…";
    const blob = new Blob([JSON.stringify({ app: "NotePath", kind: "notes-backup", version: 3, saved: new Date().toISOString(), data })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "notepath-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    const np = Object.keys(images).length;
    say(m, `Backup saved: ${notes.length} notes${np ? `, ${np} photo${np === 1 ? "" : "s"} and video${np === 1 ? "" : "s"}` : ""}.`
      + (skipped.length ? ` Not included (over 25 MB): ${skipped.length === 1 ? "a video" : skipped.length + " videos"} in ${[...new Set(skipped.map(x => "“" + x.note + "”"))].join(", ")} (${skipped.map(x => x.mb + " MB").join(", ")}). Keep those video files somewhere safe yourself.` : ""), !skipped.length);
    m.classList.toggle("warn", skipped.length > 0);
  };
  w.querySelector('input[type="file"]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || j.app !== "NotePath" || !j.data) throw new Error();
      const d = j.data, notes = d.notes || [], set = d.settings;
      if (!Array.isArray(notes)) throw new Error();
      const mine = readJ(K().notes(), []), ids = new Set(notes.map(x => x && x.id));
      const safe = notes.filter(x => x && x.id && typeof x.body === "string").map(x => (typeof x.html === "string" && window.InquireNotes ? Object.assign({}, x, { html: InquireNotes.sanitize(x.html) }) : x)); // never trust markup from a file
      localStorage.setItem(K().notes(), JSON.stringify(mine.filter(x => !ids.has(x.id)).concat(safe)));
      if (set && typeof set === "object") localStorage.setItem("notepath.settings", JSON.stringify(set));
      const NS = window.InquireNotes; let np = 0;
      if (NS && Array.isArray(d.folders)) { const have = NS.readFolders(), fids = new Set(have.map(f => f.id)); NS.writeFolders(have.concat(d.folders.filter(f => f && f.id && f.name && !fids.has(f.id)))); }
      if (Array.isArray(d.tasks) && window.NPTasks) { const have = NPTasks.readRaw(), tids = new Set(d.tasks.map(t => t && t.id)); NPTasks.writeRaw(have.filter(t => !tids.has(t.id)).concat(d.tasks.filter(t => t && t.id && typeof t.title === "string"))); }
      if (NS && d.images && typeof d.images === "object") np = await NS.importImages(d.images);
      S = load(); applyAll(); window.dispatchEvent(new CustomEvent("inquire:notes-changed"));
      show("data"); say(pane.querySelector(".set-msg") || m, `Backup restored: ${notes.length} notes${np ? `, ${np} photo${np === 1 ? "" : "s"}` : ""}.`, true);
    } catch (err) { say(m, "That file is not a NotePath backup."); }
    e.target.value = "";
  };
  pane.appendChild(w);
}

/* About */
function paneAbout() {
  const D = window.inquireDesktop;
  const w = h(`<div>
    <p class="set-lede"><b>NotePath</b> <span class="set-ver">${D ? "" : "web preview"}</span>: a notes console for everything you would use a notepad for.</p>
    ${D ? `<div class="set-item set-upd"><div><h3>Updates</h3><p class="set-upd-msg">NotePath checks at launch and every 4 hours.</p></div><div class="set-upd-btns"></div></div>` : ""}
    <div class="set-item"><div><h3>End-user licence agreement</h3><p>The terms for using NotePath.</p></div><button type="button" class="btn-s" data-a="eula">Read</button></div>
    <div class="set-item"><div><h3>Source &amp; release notes</h3><p>github.com/InquiringOwl/notepath-desktop</p></div><a class="btn-s" href="https://github.com/InquiringOwl/notepath-desktop/releases" target="_blank" rel="noopener">Open ↗</a></div>
    <p class="set-small">Fonts: STIX Two Text, IBM Plex Sans &amp; Mono, Saira Semi Condensed (SIL Open Font License).</p>
  </div>`);
  if (D) {
    D.version().then(v => { const el = w.querySelector(".set-ver"); if (el) el.textContent = "v" + v; }).catch(() => {});
    drawUpd(w.querySelector(".set-upd"));
  }
  w.querySelector('[data-a="eula"]').onclick = () => openDoc("eula");
  pane.appendChild(w);
}

/* Updates: live status in About, with Install & Relaunch once a download is ready  */
let UPD = { status: "idle" };
const UPD_IDLE = "NotePath checks at launch and every 4 hours.";
function drawUpd(box) {
  const D = window.inquireDesktop; if (!box || !D) return;
  const s = UPD, v = s.version ? esc(s.version) : "", msg = box.querySelector(".set-upd-msg"), btns = box.querySelector(".set-upd-btns");
  const check = `<button type="button" class="btn-s" data-u="check">Check now</button>`;
  let m = UPD_IDLE, b = check;
  if (s.status === "checking") { m = "Checking for updates…"; b = `<button type="button" class="btn-s" disabled>Checking…</button>`; }
  else if (s.status === "current") m = "NotePath is up to date.";
  else if (s.status === "downloading") { m = `Downloading NotePath ${v}… ${s.percent || 0}%`; b = ""; }
  else if (s.status === "ready") { m = `NotePath ${v} is downloaded and ready to install.`; b = `<button type="button" class="btn good" data-u="go">Install &amp; Relaunch</button>`; }
  else if (s.status === "installing") { m = `Installing NotePath ${v}…`; b = ""; }
  else if (s.status === "installed") m = `Updated to NotePath ${v}.`;
  else if (s.status === "blocked") { m = `macOS blocked the update. NotePath ${v} is in your Downloads folder: drag it into Applications and replace the old copy.`; b = `<button type="button" class="btn-s" data-u="rev">Show in Finder</button>`; }
  else if (s.status === "error" && s.message) m = "Update problem: " + esc(s.message);
  msg.innerHTML = m; btns.innerHTML = b;
  box.classList.toggle("is-ready", s.status === "ready");
  const c = btns.querySelector('[data-u="check"]'); if (c) c.onclick = () => { UPD = { status: "checking" }; drawUpd(box); Promise.resolve(D.checkForUpdates()).catch(() => {}); setTimeout(() => { if (UPD.status === "checking" && D.updateState) D.updateState().then(st => { if (st && UPD.status === "checking") { UPD = Object.assign({}, st, st.status === "checking" ? { status: "idle" } : {}); drawUpd(pane.querySelector(".set-upd")); } }).catch(() => {}); }, 20000); };
  const g = btns.querySelector('[data-u="go"]'); if (g) g.onclick = () => { g.disabled = true; g.textContent = "Relaunching…"; D.installUpdate(); };
  const r = btns.querySelector('[data-u="rev"]'); if (r) r.onclick = () => D.revealUpdate();
}
function updTab() { // a dot on the About tab while an update waits to be installed
  const t = tabsEl.querySelector('[data-tab="about"]'); if (t) t.classList.toggle("has-upd", UPD.status === "ready");
}
if (window.inquireDesktop) {
  const D = window.inquireDesktop;
  D.onUpdate(s => { UPD = Object.assign({}, s); updTab(); if (!ov.hidden) drawUpd(pane.querySelector(".set-upd")); });
  if (D.updateState) D.updateState().then(s => { if (s && UPD.status === "idle") { UPD = Object.assign({}, s); updTab(); } }).catch(() => {});
}

/* top-bar gear */
const gear = document.getElementById("gear");
if (gear) gear.onclick = () => open();
window.InquireSettings = { open, openDoc, close, get: () => Object.assign({}, S), themes: THEMES };
})();
