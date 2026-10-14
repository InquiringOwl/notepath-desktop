/* NotePath in other languages (v0.5.8, Devon): window.NPI18N.
   The app is written in English; this layer translates what is on screen. A MutationObserver walks every text node and the
   attributes people see or hear (title, aria-label, placeholder, data-label, alt) and swaps the English for the chosen
   language from a dictionary (app/i18n/<code>.json, made from web/i18n by build-web.js), so no call site had to change.
   Keys are the English with numbers as {1}, {2}… and anything in “curly quotes” as {q1}… (names, titles), so "3 notes" and
   "Export 60 notes as Markdown" find their sentence; the numbers and names are put back. Your own words are never touched:
   the note editor (except the chrome of widgets), titles, names and anything typed in a field are skipped (SKIP / own()).
   English keeps the page as it is and costs nothing. The chosen language is S.lang in notepath.settings (Settings → Display
   & comfort → Language); its dictionary is cached in localStorage so the next start is translated from the first paint.
   NPI18N.t("…") translates a string for code that draws text itself. Collecting the strings for the dictionaries:
   tools/i18n-collect.js (window.__npCollect). */
(function () {
"use strict";
const LANGS = [["en", "English", "English"], ["es", "Español", "Spanish"], ["fr", "Français", "French"], ["de", "Deutsch", "German"],
  ["pt", "Português (Brasil)", "Portuguese (Brazil)"], ["ru", "Русский", "Russian"], ["zh", "中文（简体）", "Chinese (Simplified)"], ["ja", "日本語", "Japanese"],
  ["nl", "Nederlands", "Dutch"], ["ar", "العربية", "Arabic"], ["ko", "한국어", "Korean"]];
const HTML_LANG = { pt: "pt-BR", zh: "zh-CN" };
const VER = window.NP_I18N_V || {}; // build-web.js: { code: hash of its dictionary }
const ATTRS = ["title", "aria-label", "placeholder", "data-label", "alt", "aria-roledescription"];
// never translated (and never walked into): your own words and code
const SKIP = "script, style, textarea, input, .io-sel, code, pre, .monaco-editor, .nc-edhost, .no-i18n, [translate='no'], .nb-title, .nb-t, .mnote-b, .nb-fd.user .nb-fnm, .nb-cfd .nb-fnm, .nb-sfd .nb-fnm, .nb-fnt, .nb-tname, .mnote-t, .nt-name, .nt-tt, .np-hl-t, .np-peek-b, .np-peek-t, .nw-code, .nw-cmp, .nw-annv, .nw-ta, .ns-by, .nann-layer, .nb-lnk, .nb-spath, .nb-recs b, .office-canvas, canvas";
const own = el => { const r = el.closest(".nb-rich, .nw"); return !!r && r.classList.contains("nb-rich"); }; // in a note, outside any widget = your words
let code = "en", dict = null, obs = null, busy = false;
const ORIG = new WeakMap(), AORIG = new WeakMap();
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };

// "Export 60 notes as “Week 3”" → key "Export {1} notes as “{q1}”", nums ["60"], quotes ["Week 3"]; colour codes (#5cc8e0) → {c1}
const AZ = "abcdefghijklmnopqrstuvwxyz";
function norm(s) {
  const nums = [], qs = [], cs = [];
  let k = String(s).replace(/\s+/g, " ").trim();
  k = k.replace(/“([^”]*)”/g, (m, a) => { qs.push(a); return "“\u0001" + AZ[qs.length - 1] + "”"; }); // names first, so their digits stay theirs
  k = k.replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi, m => { cs.push(m); return "\u0002" + AZ[cs.length - 1]; });
  k = k.replace(/\d+(?:[.,:/]\d+)*/g, m => { nums.push(m); return "{" + nums.length + "}"; });
  k = k.replace(/\u0001([a-z])/g, (m, c) => "{q" + (AZ.indexOf(c) + 1) + "}").replace(/\u0002([a-z])/g, (m, c) => "{c" + (AZ.indexOf(c) + 1) + "}");
  return { k, nums, qs, cs };
}
// patterns: keys with {s1}, {s2}… (a name or a value the app puts in: "Delete {s1}") match a whole string; indexed by first word
let PAT = new Map();
const firstWord = k => (k.match(/^[^\s{]+/) || [""])[0];
function compile(d) {
  PAT = new Map();
  for (const k of Object.keys(d)) {
    if (!/\{s\d+\}/.test(k) || !d[k]) continue;
    const order = [], src = "^" + k.split(/(\{s\d+\})/).map(p => { const m = p.match(/^\{s(\d+)\}$/); if (m) { order.push(+m[1]); return "(.*?)"; } return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("") + "$";
    let re; try { re = new RegExp(src); } catch (e) { continue; }
    const w = /^\{s\d+\}/.test(k) ? "" : firstWord(k); if (!PAT.has(w)) PAT.set(w, []); PAT.get(w).push({ re, order, tpl: d[k] });
  }
}
const slot = v => { const x = dict[v]; return typeof x === "string" && x && !/\{/.test(v) ? x : v; }; // a value that is itself a word of the app is translated
function fill(tpl, n) {
  return tpl.replace(/\{([qc]?)(\d+)\}/g, (m, q, i) => { const v = (q === "q" ? n.qs : q === "c" ? n.cs : n.nums)[+i - 1]; return v == null ? m : q === "q" ? slot(v) : v; });
}
function lookup(core) {
  if (!dict) return null;
  const n = norm(core), tpl = dict[n.k];
  if (typeof tpl === "string" && tpl) return fill(tpl, n);
  const cands = (PAT.get(firstWord(n.k)) || []).concat(PAT.get("") || []);
  for (const p of cands) { const m = p.re.exec(n.k); if (!m) continue;
    const out = p.tpl.replace(/\{s(\d+)\}/g, (x, i) => { const at = p.order.indexOf(+i); return at < 0 ? x : slot(m[at + 1]); });
    return fill(out, n); }
  return null;
}
function t(s) { if (code === "en" || !dict || !s) return s; const m = String(s).match(/^(\s*)([\s\S]*?)(\s*)$/); const o = lookup(m[2]); return o == null ? s : m[1] + o + m[3]; }
const hasLetter = s => /\p{L}/u.test(s);

/* the walk: every visible English string, with where it is (for the collector) */
function walk(root, onText, onAttr) {
  if (!root) return;
  if (root.nodeType === 3) { const p = root.parentElement; if (p && !p.closest(SKIP) && !own(p)) onText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  if (root.nodeType === 1 && root.closest(SKIP)) { if (root.matches("input, select, textarea, canvas")) attrs(root, onAttr); return; }
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: x => {
    if (x.nodeType === 1) { if (x.matches(SKIP)) { if (x.matches("input, select, textarea, canvas")) attrs(x, onAttr); return NodeFilter.FILTER_REJECT; } return NodeFilter.FILTER_ACCEPT; }
    return NodeFilter.FILTER_ACCEPT; } });
  if (root.nodeType === 1) attrs(root, onAttr);
  let x; while ((x = tw.nextNode())) { if (x.nodeType === 1) attrs(x, onAttr); else if (x.parentElement && !own(x.parentElement)) onText(x); }
}
function attrs(el, onAttr) {
  if (!onAttr || !el.getAttribute) return;
  for (const a of ATTRS) { if (!el.hasAttribute(a)) continue; if (a === "alt" && el.closest(".nb-rich") && !el.closest(".nw")) continue; if (a !== "placeholder" && own(el)) continue; onAttr(el, a); }
}

/* translate / restore */
function trText(n) {
  const d = n.data; if (!hasLetter(d)) return;
  const rec = ORIG.get(n);
  const orig = rec && rec.out === d ? rec.orig : d; // the app changed it since: the new English is the original
  const out = code === "en" ? orig : t(orig);
  if (out !== d) { busy = true; n.data = out; busy = false; }
  if (out !== orig) ORIG.set(n, { orig, out }); else ORIG.delete(n);
}
function trAttr(el, a) {
  const v = el.getAttribute(a); if (v == null || !hasLetter(v)) return;
  let m = AORIG.get(el); const rec = m && m[a];
  const orig = rec && rec.out === v ? rec.orig : v, out = code === "en" ? orig : t(orig);
  if (out !== v) { busy = true; el.setAttribute(a, out); busy = false; }
  if (out !== orig) { if (!m) AORIG.set(el, m = {}); m[a] = { orig, out }; } else if (m) delete m[a];
}
function all() { walk(document.body, trText, trAttr); if (document.title) document.title = t(document.title.replace(/^.*$/, s => s)); }
function observe() {
  if (obs) return;
  obs = new MutationObserver(list => {
    if (busy) return;
    for (const r of list) {
      if (r.type === "childList") r.addedNodes.forEach(n => walk(n, trText, trAttr));
      else if (r.type === "characterData") { const p = r.target.parentElement; if (p && !p.closest(SKIP) && !own(p)) trText(r.target); }
      else if (r.type === "attributes" && r.target.nodeType === 1 && !r.target.closest(SKIP)) trAttr(r.target, r.attributeName);
    }
  });
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/* the dictionaries: cached per language with the build's hash, fetched from app/i18n/ */
async function fetchDict(c) {
  const cacheK = "notepath.i18n.cache", ver = VER[c] || "";
  try { const o = JSON.parse(lsGet(cacheK) || "null"); if (o && o.c === c && o.v === ver && o.d) return o.d; } catch (e) {}
  const r = await fetch("i18n/" + c + ".json", { cache: "no-cache" }); if (!r.ok) throw new Error("no dictionary for " + c);
  const j = await r.json(), d = j.strings || j;
  lsSet(cacheK, JSON.stringify({ c, v: ver, d }));
  return d;
}
function cached(c) { try { const o = JSON.parse(lsGet("notepath.i18n.cache") || "null"); return o && o.c === c && o.v === (VER[c] || "") ? o.d : null; } catch (e) { return null; } }
function mark() { const h = document.documentElement; h.lang = code === "en" ? "en" : (HTML_LANG[code] || code); h.dataset.lang = code; h.dir = code === "ar" ? "rtl" : "ltr"; }
async function set(c) {
  c = LANGS.some(l => l[0] === c) ? c : "en";
  if (c === "en") { code = "en"; dict = null; mark(); all(); window.dispatchEvent(new CustomEvent("np:lang", { detail: c })); return true; }
  const d = cached(c) || await fetchDict(c);
  code = c; dict = d; compile(d); mark(); observe(); all();
  window.dispatchEvent(new CustomEvent("np:lang", { detail: c }));
  return true;
}
// start: the saved language, from the cache at once (no English flash), or fetched
const start = (() => { try { return (JSON.parse(lsGet("notepath.settings") || "{}") || {}).lang || "en"; } catch (e) { return "en"; } })();
let ready = Promise.resolve(true);
if (start !== "en" && LANGS.some(l => l[0] === start)) {
  const d = cached(start);
  if (d) { code = start; dict = d; compile(d); mark(); observe(); document.addEventListener("DOMContentLoaded", all); }
  else ready = set(start).catch(() => false);
}
/* the collector (tools/i18n-collect.js): every key the walk meets, once */
if (typeof window.__npCollect === "function" || lsGet("notepath.i18n.collect")) {
  const seen = new Set(); let q = [], tm = 0;
  const push = (s, where) => { if (!hasLetter(s)) return; const k = norm(s).k; if (!k || seen.has(k)) return; seen.add(k); q.push([k, where]); if (!tm) tm = setTimeout(() => { tm = 0; const b = q; q = []; try { window.__npCollect && window.__npCollect(b); } catch (e) {} }, 200); };
  const ctx = el => { const p = el.closest("[class]"); return p ? (p.className.baseVal != null ? p.className.baseVal : p.className).split(" ")[0] : ""; };
  const colText = n => push(n.data, ctx(n.parentElement)), colAttr = (el, a) => push(el.getAttribute(a), a + "@" + ctx(el));
  const go = () => { walk(document.body, colText, colAttr); new MutationObserver(list => list.forEach(r => { if (r.type === "childList") r.addedNodes.forEach(n => walk(n, colText, colAttr)); else if (r.type === "characterData") { const p = r.target.parentElement; if (p && !p.closest(SKIP) && !own(p)) colText(r.target); } else if (r.type === "attributes" && !r.target.closest(SKIP)) colAttr(r.target, r.attributeName); }))
    .observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); };
  if (document.body) go(); else document.addEventListener("DOMContentLoaded", go);
}
window.NPI18N = { LANGS, set, t, norm, lang: () => code, get ready() { return ready; }, translateAll: all };
})();
