/* Notes toolbar and widgets (loaded after notes.js; notes.js calls InquireWidgets.toolbar() and .mount()).
   Toolbar: Bold / Italic / Underline, a font menu (span[data-f]), a numeric size menu (span[data-s="18"]), one spectrum colour picker
   (span[data-c="#rrggbb"]; old notes keep the house-palette keys), a panel with an Emoji tab and a
   Symbols tab (Greek, maths, alchemical + planetary signs; alchemical glyphs come from the bundled Noto Sans Symbols subset),
   and two widgets:
   - Code box  <div class="nw" data-w="code" data-src='{"lang","title","src"}'>: editable code with line numbers and
     highlighting (Python uses CSRules.tokens from kit-cs.js), Tab indents, Copy.
   - Music chart <div class="nw" data-w="music" data-src='{"title","clef","time","tempo","seq"}'>: a short score typed as
     notation ("C4/q E4 G4 [C4 E4 G4]/h r/q Am7/h") or built with the keyboard and duration buttons, drawn on an SVG staff
     (vector clefs from kit-music's shapes) and played with a small Web Audio synth. Chord symbols use MusicTheory.up().
   Widgets keep their data in data-src only; notes.js strips their inner UI when saving and rebuilds it here. */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const MT = () => window.MusicTheory;
const changed = el => el.dispatchEvent(new Event("input", { bubbles: true }));
const readSrc = (el, def) => { try { return Object.assign({}, def, JSON.parse(el.dataset.src || "{}")); } catch (e) { return Object.assign({}, def); } };
const writeSrc = (el, o) => { el.dataset.src = JSON.stringify(o); changed(el); };

/* ---------- colours ---------- */
const COLORS = [["amber", "#F2B84B", "Amber"], ["cyan", "#5CC8E0", "Cyan"], ["pink", "#F07CA0", "Pink"], ["violet", "#B49BFF", "Violet"], ["green", "#7BD88F", "Green"],
  ["magenta", "#D97AE6", "Magenta"], ["lime", "#B5D65A", "Lime"], ["red", "#E5675B", "Red"], ["muted", "#8B97AE", "Grey"]];
const CLEAR = "#010203";

/* ---------- emoji + symbols ---------- */
const EMOJI = [
  ["Faces", "😀 😃 😄 😁 😆 😅 😂 🙂 😉 😊 😇 🥰 😍 🤩 😎 🤓 🧐 🤔 🤨 😐 😴 😮 😲 🤯 😬 😢 😭 😤 😡 🥳 😌 🙃 🫡 🤗 🙌 👏 👍 👎 👋 💪"],
  ["Study", "📚 📖 📝 ✏️ 🖊️ 📐 📏 📎 📌 🗂️ 📅 ⏰ ⌛ 💡 🧠 🎓 🏫 🔍 🔬 🔭 🧪 ⚗️ 🧬 🧮 💻 ⌨️ 📊 📈 📉 ✅ ❌ ⚠️ ❓ ❗ 💯 ⭐ 🌟 🔥 🎯 🏆"],
  ["Nature", "🌍 🌙 ☀️ 🌈 ⚡ ❄️ 🌊 🌋 🌱 🌳 🌸 🍀 🍎 🐾 🐱 🐶 🦉 🐝 🦋 🐢"],
  ["Music & art", "🎵 🎶 🎼 🎹 🎸 🎻 🥁 🎺 🎷 🎤 🎧 🎨 🎭 ✍️ 📷"],
  ["Symbols", "❤️ 💙 💚 💛 💜 🖤 ✨ 💬 🔗 🔒 🔑 ➕ ➖ ✖️ ➗ ♻️ 🔁 ▶️ ⏸️ ⏹️ ⬆️ ⬇️ ⬅️ ➡️"]
];
const GREEK_L = "α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω ϑ ϕ ϵ ϖ", GREEK_U = "Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω";
const GREEK_N = { α: "alpha", β: "beta", γ: "gamma", δ: "delta", ε: "epsilon", ζ: "zeta", η: "eta", θ: "theta", ι: "iota", κ: "kappa", λ: "lambda", μ: "mu", ν: "nu", ξ: "xi", ο: "omicron", π: "pi", ρ: "rho", σ: "sigma", ς: "final sigma", τ: "tau", υ: "upsilon", φ: "phi", χ: "chi", ψ: "psi", ω: "omega", ϑ: "theta (variant)", ϕ: "phi (variant)", ϵ: "epsilon (lunate)", ϖ: "pi (variant)" };
const MATH = "± ∓ × ÷ · ≠ ≈ ≡ ≤ ≥ ≪ ≫ ∝ ∞ √ ∛ ∑ ∏ ∫ ∮ ∂ ∆ ∇ ∈ ∉ ⊂ ⊆ ∪ ∩ ∅ ∀ ∃ ¬ ∧ ∨ ⇒ ⇔ → ← ↔ ↑ ↓ ° ′ ″ ‰ ℝ ℕ ℤ ℚ ℂ ⁰ ¹ ² ³ ⁴ ⁿ ₀ ₁ ₂ ₃ ½ ⅓ ¼ ¾ ∠ ⊥ ∥ △ ≅ ∼";
const PLANETS = [["☉", "Sun · gold"], ["☽", "Moon · silver"], ["☿", "Mercury · quicksilver"], ["♀", "Venus · copper"], ["♁", "Earth"], ["♂", "Mars · iron"], ["♃", "Jupiter · tin"], ["♄", "Saturn · lead"]];
const ALCH = ["Quintessence", "Air", "Fire", "Earth", "Water", "Aquafortis", "Aqua Regia", "Aqua Regia 2", "Aqua Vitae", "Aqua Vitae 2", "Vinegar", "Vinegar 2", "Vinegar 3", "Sulfur", "Philosophers Sulfur", "Black Sulfur", "Mercury Sublimate", "Mercury Sublimate 2", "Mercury Sublimate 3", "Cinnabar", "Salt", "Nitre", "Vitriol", "Vitriol 2", "Rock Salt", "Rock Salt 2", "Gold", "Silver", "Iron Ore", "Iron Ore 2", "Crocus Of Iron", "Regulus Of Iron", "Copper Ore", "Iron-Copper Ore", "Sublimate Of Copper", "Crocus Of Copper", "Crocus Of Copper 2", "Copper Antimoniate", "Salt Of Copper Antimoniate", "Sublimate Of Salt Of Copper", "Verdigris", "Tin Ore", "Lead Ore", "Antimony Ore", "Sublimate Of Antimony", "Salt Of Antimony", "Sublimate Of Salt Of Antimony", "Vinegar Of Antimony", "Regulus Of Antimony", "Regulus Of Antimony 2", "Regulus", "Regulus 2", "Regulus 3", "Regulus 4", "Alkali", "Alkali 2", "Marcasite", "Sal-Ammoniac", "Arsenic", "Realgar", "Realgar 2", "Auripigment", "Bismuth Ore", "Tartar", "Tartar 2", "Quick Lime", "Borax", "Borax 2", "Borax 3", "Alum", "Oil", "Spirit", "Tincture", "Gum", "Wax", "Powder", "Calx", "Tutty", "Caput Mortuum", "Scepter Of Jove", "Caduceus", "Trident", "Starred Trident", "Lodestone", "Soap", "Urine", "Horse Dung", "Ashes", "Pot Ashes", "Brick", "Powdered Brick", "Amalgam", "Stratum Super Stratum", "Stratum Super Stratum 2", "Sublimation", "Precipitate", "Distill", "Dissolve", "Dissolve 2", "Purify", "Putrefaction", "Crucible", "Crucible 2", "Crucible 3", "Crucible 4", "Crucible 5", "Alembic", "Bath Of Mary", "Bath Of Vapours", "Retort", "Hour", "Night", "Day-Night", "Month", "Half Dram", "Half Ounce"];
let panel = null;
function closePanel() { if (panel) { panel.remove(); panel = null; document.removeEventListener("pointerdown", outP, true); document.removeEventListener("keydown", keyP, true); } }
const outP = e => { if (panel && !panel.contains(e.target) && !e.target.closest(".nr-sym")) closePanel(); };
const keyP = e => { if (e.key === "Escape" && panel) { e.preventDefault(); e.stopPropagation(); closePanel(); } };
let symTab = "emoji";
function symbolPanel(btn, api) {
  if (panel) { closePanel(); return; }
  panel = document.createElement("div");
  panel.className = "nr-panel win"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Emoji and symbols");
  const cell = (ch, title) => `<button type="button" class="nr-ch" data-ch="${esc(ch)}" title="${esc(title || ch)}" aria-label="${esc(title || ch)}">${esc(ch)}</button>`;
  const group = (name, html) => `<div class="nr-grp"><h4>${esc(name)}</h4><div class="nr-grid">${html}</div></div>`;
  const tabs = { emoji: EMOJI.map(([n, s]) => group(n, s.split(" ").map(c => cell(c)).join(""))).join(""),
    symbols: group("Greek · lower case", GREEK_L.split(" ").map(c => cell(c, GREEK_N[c])).join(""))
      + group("Greek · capitals", GREEK_U.split(" ").map(c => cell(c, (GREEK_N[c.toLowerCase()] || "") + " (capital)")).join(""))
      + group("Maths", MATH.split(" ").map(c => cell(c)).join(""))
      + group("Planets & metals", PLANETS.map(([c, n]) => cell(c, n)).join(""))
      + group("Alchemical", ALCH.map((n, i) => cell(String.fromCodePoint(0x1F700 + i), n)).join("")) };
  panel.innerHTML = `<div class="nr-ptabs" role="tablist"><button type="button" role="tab" data-t="emoji">☺ Emoji</button><button type="button" role="tab" data-t="symbols">Ω Symbols</button><span class="nr-phint"></span><button type="button" class="nr-px" aria-label="Close">✕</button></div><div class="nr-pbody"></div>`;
  const body = panel.querySelector(".nr-pbody"), hint = panel.querySelector(".nr-phint");
  const show = t => { symTab = t; panel.querySelectorAll("[data-t]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.t === t))); body.innerHTML = tabs[t]; body.scrollTop = 0; };
  panel.addEventListener("mousedown", e => { if (!e.target.closest("input")) e.preventDefault(); }); // keep the caret in the note
  panel.addEventListener("click", e => {
    const t = e.target.closest("[data-t]"); if (t) { show(t.dataset.t); return; }
    if (e.target.closest(".nr-px")) { closePanel(); return; }
    const c = e.target.closest("[data-ch]"); if (c) api.insertText(c.dataset.ch);
  });
  panel.addEventListener("mouseover", e => { const c = e.target.closest("[data-ch]"); hint.textContent = c ? c.title : ""; });
  document.body.appendChild(panel);
  const r = btn.getBoundingClientRect(), W = Math.min(360, innerWidth - 16);
  panel.style.width = W + "px"; panel.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left)) + "px";
  panel.style.top = (r.bottom + 330 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - 336)) + "px";
  show(symTab);
  document.addEventListener("pointerdown", outP, true); document.addEventListener("keydown", keyP, true);
}

/* ---------- video: from a file or a link ---------- */
// a link → { kind: "yt" | "vimeo" | "url", … } or null. YouTube plays from youtube-nocookie.com; files are https .mp4/.webm/.ogg/.mov
function videoFrom(raw) {
  let u; try { u = new URL(String(raw || "").trim()); } catch (e) { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m|music)\./, ""), seg = u.pathname.split("/").filter(Boolean);
  const secs = t => { if (!t) return 0; if (/^\d+$/.test(t)) return +t; const m = String(t).match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0; };
  let yt = null;
  if (host === "youtu.be") yt = seg[0];
  else if (/^(youtube\.com|youtube-nocookie\.com)$/.test(host)) yt = u.searchParams.get("v") || (["embed", "shorts", "live", "v"].includes(seg[0]) ? seg[1] : null);
  if (yt) return /^[\w-]{11}$/.test(yt) ? { kind: "yt", id: yt, start: secs(u.searchParams.get("t") || u.searchParams.get("start")) } : null;
  if (host === "vimeo.com" || host === "player.vimeo.com") { const id = seg.find(x => /^\d{5,}$/.test(x)), i = seg.indexOf(id), hsh = seg[i + 1] && /^[0-9a-f]{6,}$/i.test(seg[i + 1]) ? seg[i + 1] : u.searchParams.get("h"); return id ? Object.assign({ kind: "vimeo", id }, hsh ? { h: hsh } : {}) : null; }
  if (u.protocol === "https:" && /\.(mp4|m4v|webm|ogv|ogg|mov)$/i.test(u.pathname)) return { kind: "url", url: u.href };
  return null;
}
const videoEmbed = d => d.kind === "yt" ? `https://www.youtube-nocookie.com/embed/${d.id}?rel=0&modestbranding=1${d.start ? "&start=" + d.start : ""}`
  : d.kind === "vimeo" ? `https://player.vimeo.com/video/${d.id}${d.h ? "?h=" + d.h : ""}` : "";
const videoLink = d => d.kind === "yt" ? `https://www.youtube.com/watch?v=${d.id}${d.start ? "&t=" + d.start + "s" : ""}` : d.kind === "vimeo" ? `https://vimeo.com/${d.id}${d.h ? "/" + d.h : ""}` : d.kind === "url" ? d.url : "";
function mountVideo(el) {
  const d = readSrc(el, { kind: "", title: "" });
  const link = videoLink(d), src = videoEmbed(d);
  el.innerHTML = `<div class="nw-h"><span class="nw-tag">▶</span><input class="nw-title" maxlength="80" placeholder="Video" aria-label="Video title" value="${esc(d.title)}">
      ${link ? `<a class="nw-b nw-open" href="${esc(link)}" target="_blank" rel="noopener" title="Open on the web">↗</a>` : ""}<button type="button" class="nw-b nw-del" data-a="del" title="Remove this video" aria-label="Remove video">✕</button></div>
    <div class="nw-vbox">${src ? `<iframe src="${esc(src)}" title="${esc(d.title || "Video")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe>`
      : `<video controls preload="metadata" playsinline></video>`}</div>`;
  const v = el.querySelector("video");
  if (v) {
    if (d.kind === "url") v.src = d.url;
    else if (d.kind === "file" && d.vid && window.InquireNotes) InquireNotes.imageURL(d.vid).then(u => { if (u) v.src = u; else el.querySelector(".nw-vbox").innerHTML = `<p class="nw-vmiss">This video's file is missing (videos over 25 MB are not carried in backups).</p>`; });
  }
  const ti = el.querySelector(".nw-title");
  ti.addEventListener("input", e => { e.stopPropagation(); writeSrc(el, Object.assign(readSrc(el, {}), { title: ti.value.trim() })); });
  delButton(el);
}
let vpanel = null;
function closeVPanel() { if (vpanel) { vpanel.remove(); vpanel = null; document.removeEventListener("pointerdown", outV, true); document.removeEventListener("keydown", keyV, true); } }
const outV = e => { if (vpanel && !vpanel.contains(e.target) && !e.target.closest(".nr-vid")) closeVPanel(); };
const keyV = e => { if (e.key === "Escape" && vpanel) { e.preventDefault(); e.stopPropagation(); closeVPanel(); } };
function videoPanel(btn, api) {
  if (vpanel) { closeVPanel(); return; }
  vpanel = document.createElement("div");
  vpanel.className = "nr-panel nv-pop win"; vpanel.setAttribute("role", "dialog"); vpanel.setAttribute("aria-label", "Add a video");
  vpanel.innerHTML = `<div class="nr-ptabs"><b class="nv-h">▶ Add a video</b><span class="nr-phint"></span><button type="button" class="nr-px" aria-label="Close">✕</button></div>
    <div class="nv-body"><button type="button" class="btn-s" data-a="file">Choose a video file…</button><small>MP4, WebM or MOV up to 500 MB, kept on this computer. You can also drop a video file into the note.</small>
      <form class="nv-form"><input type="text" inputmode="url" spellcheck="false" placeholder="Paste a YouTube, Vimeo or video link" aria-label="Video link"><button type="submit" class="btn-s">Insert</button></form><p class="nv-msg" aria-live="polite"></p>
      <input type="file" accept="video/*" hidden></div>`;
  const file = vpanel.querySelector('input[type="file"]'), form = vpanel.querySelector(".nv-form"), inp = form.querySelector("input"), msg = vpanel.querySelector(".nv-msg");
  vpanel.querySelector(".nr-px").onclick = closeVPanel;
  vpanel.querySelector('[data-a="file"]').onclick = () => file.click();
  file.onchange = async () => { const f = file.files[0]; if (!f) return; msg.textContent = "Adding…"; const k = await api.addFiles([f]); if (k) closeVPanel(); else msg.textContent = f.size > 500 * 1024 * 1024 ? "That video is over 500 MB." : "That file could not be added."; file.value = ""; };
  form.onsubmit = e => { e.preventDefault(); if (api.addVideoLink(inp.value)) closeVPanel(); else msg.textContent = "Use a YouTube or Vimeo link, or an https link to an .mp4, .webm or .mov file."; };
  document.body.appendChild(vpanel);
  const r = btn.getBoundingClientRect(), W = Math.min(380, innerWidth - 16);
  vpanel.style.width = W + "px"; vpanel.style.left = Math.max(8, Math.min(innerWidth - W - 8, r.left - W + r.width)) + "px";
  vpanel.style.top = (r.bottom + 200 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - 206)) + "px";
  document.addEventListener("pointerdown", outV, true); document.addEventListener("keydown", keyV, true);
  setTimeout(() => inp.focus({ preventScroll: true }), 0);
}

/* ---------- toolbar ---------- */
function toolbar(api) {
  const bar = document.createElement("div");
  bar.className = "nr-tools"; bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Formatting");
  const mod = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl+";
  bar.innerHTML = `<button type="button" data-cmd="bold" title="Bold (${mod}B)" aria-label="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic (${mod}I)" aria-label="Italic"><i>I</i></button><button type="button" data-cmd="underline" title="Underline (${mod}U)" aria-label="Underline"><u>U</u></button><button type="button" data-blk="h3" title="Heading" aria-label="Heading">H</button><button type="button" data-cmd="strikeThrough" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button>
    <span class="nr-sep"></span><button type="button" data-blk="ul" title="Bulleted list · press again to indent (Tab indents, Shift+Tab moves back, delete at the start takes the bullet off)" aria-label="Bulleted list">•≡</button><button type="button" data-blk="ol" title="Numbered list · delete at the start of a line takes the number off" aria-label="Numbered list">1.≡</button><button type="button" data-blk="ck" title="Checklist: click a box to tick an item off · press again to indent · delete at the start of a line takes the box off" aria-label="Checklist">☑</button>
    <span class="nr-sep"></span><button type="button" class="nr-dd nr-font" data-dd="font" title="Font" aria-haspopup="listbox" aria-label="Font"><span class="nr-ddv">Default</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-size" data-dd="size" title="Text size" aria-haspopup="listbox" aria-label="Text size"><span class="nr-ddv num">15</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-colb" data-dd="color" title="Text colour" aria-haspopup="dialog" aria-label="Text colour"><span class="nr-cola" aria-hidden="true">A</span><span class="nr-car" aria-hidden="true">▾</span></button>
    <span class="nr-sep"></span><button type="button" class="nr-sym" title="Emoji and symbols (Greek, maths, alchemical)" aria-haspopup="dialog">☺ Ω</button>
    <span class="nr-sep"></span><button type="button" class="nr-dd nr-wid" data-dd="widgets" title="Widgets: code box, music chart, lead sheet, graph" aria-haspopup="menu" aria-label="Widgets"><span class="nr-widg" aria-hidden="true">▦</span><span class="nr-ddv">Widgets</span><span class="nr-car" aria-hidden="true">▾</span></button>`;
  bar.addEventListener("mousedown", e => e.preventDefault()); // keep the selection in the note
  bar.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cmd) { api.focus(); document.execCommand(b.dataset.cmd); sync(); api.changed(); }
    else if (b.dataset.blk) { api.focus(); block(b.dataset.blk, api); sync(); api.changed(); }
    else if (b.dataset.dd) ddPanel(b, b.dataset.dd, api, sync);
    else if (b.classList.contains("nr-sym")) symbolPanel(b, api);
    else if (b.dataset.w) api.addWidget(b.dataset.w);
  });
  const sync = () => { if (!api.el.contains(document.activeElement) && document.activeElement !== api.el) return;
    bar.querySelectorAll("[data-cmd]").forEach(b => { let on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch (e) {} b.setAttribute("aria-pressed", String(on)); });
    const el = caretEl(api), L = el && el.closest("ul, ol"), on = { h3: !!(el && el.closest("h3")), ul: !!(L && L.tagName === "UL" && !L.hasAttribute("data-ck")), ol: !!(L && L.tagName === "OL"), ck: !!(L && L.hasAttribute("data-ck")) };
    bar.querySelectorAll("[data-blk]").forEach(b => b.setAttribute("aria-pressed", String(on[b.dataset.blk])));
    const f = fmtAt(fmtEl(api)); bar.querySelector(".nr-font .nr-ddv").textContent = f.fontName; bar.querySelector(".nr-font").style.setProperty("--ff", f.fontStack);
    bar.querySelector(".nr-size .nr-ddv").textContent = f.size; bar.querySelector(".nr-colb").style.setProperty("--c", f.color); };
  document.addEventListener("selectionchange", sync);
  bar.destroy = () => { document.removeEventListener("selectionchange", sync); closeDD(); };
  return bar;
}
/* ---------- font, size and colour menus (NotePath) ---------- */
const NOTES = () => window.InquireNotes || {};
const FSTACK = { serif: '"STIX Two Text",Georgia,serif', sans: '"IBM Plex Sans",system-ui,sans-serif', mono: '"IBM Plex Mono",ui-monospace,Menlo,monospace', cond: '"Saira Semi Condensed","Arial Narrow",sans-serif',
  georgia: "Georgia,serif", times: '"Times New Roman",Times,serif', palatino: '"Palatino Linotype",Palatino,"Book Antiqua",serif', garamond: 'Garamond,"EB Garamond","Adobe Garamond Pro",serif',
  arial: "Arial,Helvetica,sans-serif", helvetica: '"Helvetica Neue",Helvetica,Arial,sans-serif', verdana: "Verdana,Geneva,sans-serif", trebuchet: '"Trebuchet MS",sans-serif', tahoma: "Tahoma,Geneva,sans-serif",
  courier: '"Courier New",Courier,monospace', comic: '"Comic Sans MS","Comic Neue",cursive', brush: '"Brush Script MT","Snell Roundhand",cursive' };
const OLDSIZE = { s: 12, n: 15, l: 20, xl: 26 };
// the element whose formatting the toolbar shows: the first one the selection starts in
function fmtEl(api) { const s = getSelection(); if (!s.rangeCount) return null; const r = s.getRangeAt(0); let n = r.startContainer;
  if (n.nodeType === 1 && n.childNodes[r.startOffset]) { n = n.childNodes[r.startOffset]; while (n.nodeType === 1 && n.firstChild && !r.collapsed) n = n.firstChild; }
  const el = n.nodeType === 1 ? n : n.parentElement; return el && api.el.contains(el) ? el : null; }
// what the caret sits in: font, size (number) and colour, for the toolbar labels
function fmtAt(el) {
  const fsp = el && el.closest("span[data-f]"), ssp = el && el.closest("span[data-s]"), fk = fsp ? fsp.dataset.f : "";
  const nf = (NOTES().NFONTS || []).find(f => f[0] === fk);
  const sz = ssp ? (OLDSIZE[ssp.dataset.s] || +ssp.dataset.s || 15) : 15;
  return { font: fk, fontName: nf ? nf[1] : "Default", fontStack: FSTACK[fk] || "var(--sans)", size: sz, color: el ? getComputedStyle(el).color : "var(--text)" };
}
let dd = null;
function closeDD() { if (dd) { dd.remove(); dd = null; document.removeEventListener("pointerdown", outDD, true); window.removeEventListener("keydown", keyDD, true); } }
const outDD = e => { if (dd && !dd.contains(e.target) && !e.target.closest(".nr-dd")) closeDD(); };
const keyDD = e => { if (e.key === "Escape" && dd) { e.preventDefault(); e.stopPropagation(); closeDD(); } };
const RECENT_KEY = "notepath.recentcolors";
const recent = () => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); return Array.isArray(a) ? a.filter(c => /^#[0-9a-f]{6}$/.test(c)).slice(0, 10) : []; } catch (e) { return []; } };
const addRecent = c => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([c, ...recent().filter(x => x !== c)].slice(0, 10))); } catch (e) {} };
const toHex = (r, g, b) => "#" + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, "0")).join("");
const WIDGET_MENU = [["code", "&lt;/&gt;", "Code box", "Code with highlighting and line numbers"], ["music", "♪", "Music chart", "A staff, a keyboard, chords and playback"],
  ["sheet", "𝄞", "Lead sheet", "Bars with chord symbols and melody"], ["graph", "∿", "Graph", "Click points on a grid and get their equations"]];
function ddPanel(btn, kind, api, sync) {
  const was = dd && dd.dataset.kind; closeDD(); if (was === kind) return;
  const cur = fmtAt(fmtEl(api));
  dd = document.createElement("div"); dd.className = "np-pop win np-pop-" + kind; dd.dataset.kind = kind;
  // the words selected when the menu opened (typing a colour code moves the focus into the menu)
  const s0 = getSelection(), saved = s0.rangeCount && api.el.contains(s0.getRangeAt(0).commonAncestorContainer) ? s0.getRangeAt(0).cloneRange() : null;
  const apply = (k, v) => { closeDD(); if (saved) { api.el.focus({ preventScroll: true }); const s1 = getSelection(); s1.removeAllRanges(); s1.addRange(saved); } api.format(k, v); sync(); };
  if (kind === "widgets") { // one tab for every widget (Devon, Oct 2026): keeps the toolbar clean
    dd.setAttribute("role", "menu"); dd.setAttribute("aria-label", "Widgets");
    dd.innerHTML = `<div class="np-pop-h">Widgets <span>added after the line you are on</span></div><div class="np-wids">${WIDGET_MENU.map(([w, g, n, d]) => `<button type="button" role="menuitem" data-w="${w}"><span class="np-wg" aria-hidden="true">${g}</span><span><b>${n}</b><small>${d}</small></span></button>`).join("")}</div>`;
    dd.addEventListener("click", e => { const b = e.target.closest("button[data-w]"); if (!b) return; closeDD(); if (saved) { api.el.focus({ preventScroll: true }); const s1 = getSelection(); s1.removeAllRanges(); s1.addRange(saved); } api.addWidget(b.dataset.w); });
  } else if (kind === "font") {
    dd.setAttribute("role", "listbox"); dd.setAttribute("aria-label", "Font");
    const fonts = [["", "Default (IBM Plex Sans)"], ...(NOTES().NFONTS || [])];
    dd.innerHTML = `<div class="np-pop-h">Font</div><div class="np-fonts">${fonts.map(([k, n], i) => `${i === 5 ? `<div class="np-pop-sub">On this computer</div>` : i === 1 ? `<div class="np-pop-sub">Bundled with NotePath</div>` : ""}<button type="button" role="option" data-v="${k}" aria-selected="${cur.font === k}" style="font-family:${esc(FSTACK[k] || "var(--sans)")}">${esc(n)}</button>`).join("")}</div>`;
  } else if (kind === "size") {
    dd.setAttribute("role", "listbox"); dd.setAttribute("aria-label", "Text size");
    dd.innerHTML = `<div class="np-pop-h">Size <span>normal text is 15</span></div><div class="np-sizes">${(NOTES().NSIZES || []).map(n => `<button type="button" role="option" class="num" data-v="${n}" aria-selected="${cur.size === n}">${n}</button>`).join("")}</div>`;
  } else {
    dd.setAttribute("role", "dialog"); dd.setAttribute("aria-label", "Text colour");
    const rc = recent();
    dd.innerHTML = `<div class="np-pop-h">Colour <span>click or drag on the spectrum</span></div>
      <canvas class="np-spec" width="248" height="132" aria-label="Colour spectrum"></canvas><canvas class="np-grey" width="248" height="16" aria-label="Greys"></canvas>
      <div class="np-crow"><span class="np-cprev"></span><input class="np-hex" maxlength="7" spellcheck="false" aria-label="Colour code (hex)" placeholder="#RRGGBB"><button type="button" class="nw-b np-capply">Apply</button></div>
      ${rc.length ? `<div class="np-pop-sub">Recent</div><div class="np-recent">${rc.map(c => `<button type="button" data-c="${c}" style="--c:${c}" title="${c.toUpperCase()}" aria-label="Recent colour ${c.toUpperCase()}"></button>`).join("")}</div>` : ""}
      <button type="button" class="np-cnorm" data-c="">⊘ Normal colour</button>`;
    const sp = dd.querySelector(".np-spec"), gr = dd.querySelector(".np-grey"), hex = dd.querySelector(".np-hex"), prev = dd.querySelector(".np-cprev");
    const g = sp.getContext("2d", { willReadFrequently: true }), W = sp.width, H = sp.height;
    const hg = g.createLinearGradient(0, 0, W, 0); for (let i = 0; i <= 12; i++) hg.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`);
    g.fillStyle = hg; g.fillRect(0, 0, W, H);
    const vg = g.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, "rgba(255,255,255,.92)"); vg.addColorStop(.5, "rgba(255,255,255,0)"); vg.addColorStop(.5, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.88)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const gg = gr.getContext("2d", { willReadFrequently: true }), grd = gg.createLinearGradient(0, 0, gr.width, 0); grd.addColorStop(0, "#fff"); grd.addColorStop(1, "#000"); gg.fillStyle = grd; gg.fillRect(0, 0, gr.width, gr.height);
    const show = c => { prev.style.background = c; hex.value = c.toUpperCase(); dd.dataset.pick = c; };
    show(/^#[0-9a-f]{6}$/i.test(rgbHex(cur.color)) ? rgbHex(cur.color) : "#f2b84b");
    const pickAt = (cv, ctx, e) => { const r = cv.getBoundingClientRect(), x = Math.max(0, Math.min(cv.width - 1, (e.clientX - r.left) / r.width * cv.width)), y = Math.max(0, Math.min(cv.height - 1, (e.clientY - r.top) / r.height * cv.height));
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data; return toHex(d[0], d[1], d[2]); };
    [[sp, g], [gr, gg]].forEach(([cv, ctx]) => {
      cv.addEventListener("pointerdown", e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); show(pickAt(cv, ctx, e)); cv._drag = true; });
      cv.addEventListener("pointermove", e => { if (cv._drag) show(pickAt(cv, ctx, e)); });
      cv.addEventListener("pointerup", e => { if (!cv._drag) return; cv._drag = false; const c = pickAt(cv, ctx, e); addRecent(c); apply("color", c); });
    });
    hex.addEventListener("input", () => { const v = hex.value.trim().replace(/^([0-9a-f]{6})$/i, "#$1"); if (/^#[0-9a-f]{6}$/i.test(v)) { prev.style.background = v; dd.dataset.pick = v.toLowerCase(); } });
    hex.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); dd.querySelector(".np-capply").click(); } });
    dd.querySelector(".np-capply").addEventListener("click", () => { const c = dd.dataset.pick; if (c) { addRecent(c); apply("color", c); } });
  }
  dd.addEventListener("mousedown", e => { if (!e.target.closest("input")) e.preventDefault(); }); // keep the selection in the note
  dd.addEventListener("click", e => { const b = e.target.closest("button[data-v], button[data-c]"); if (!b) return; apply(kind === "color" ? "color" : kind, b.dataset.v != null ? b.dataset.v : b.dataset.c); });
  document.body.appendChild(dd);
  const r = btn.getBoundingClientRect(), w = dd.offsetWidth, h = dd.offsetHeight;
  dd.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + "px";
  dd.style.top = (r.bottom + 6 + h < innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + "px";
  const sel = dd.querySelector('[aria-selected="true"]'); if (sel) sel.scrollIntoView({ block: "nearest" });
  document.addEventListener("pointerdown", outDD, true); window.addEventListener("keydown", keyDD, true);
}
const rgbHex = c => { const m = String(c || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? toHex(+m[1], +m[2], +m[3]) : String(c || ""); };
// headings and lists (NotePath): the block the caret is in becomes a heading / list item, or back to plain text
function caretEl(api) { const s = getSelection(); if (!s.rangeCount) return null; const n = s.getRangeAt(0).startContainer, el = n.nodeType === 1 ? n : n.parentElement; return el && api.el.contains(el) ? el : null; }
// Pressing a list button again never takes the list off (Devon, Oct 2026): only delete (Backspace) at the start of an item
// does that. The bullet or checklist button again indents the item under the one above (api.indentItem); numbers again do nothing.
function block(kind, api) {
  const el = caretEl(api), list = el && el.closest("ul, ol"), inList = list && api.el.contains(list) ? list : null;
  if (kind === "h3") { document.execCommand("formatBlock", false, el && el.closest("h3") ? "div" : "h3"); return; }
  if (kind === "ol") { if (inList && inList.tagName === "OL") return; document.execCommand("insertOrderedList"); return; }
  if (kind === "ul") {
    if (inList && inList.hasAttribute("data-ck")) { inList.removeAttribute("data-ck"); return; } // checklist → bullets
    if (inList && inList.tagName === "UL") { if (api.indentItem) api.indentItem(); return; } // bullets again → indent
    document.execCommand("insertUnorderedList"); return;
  }
  // checklist: a bulleted list marked data-ck="1"
  if (inList && inList.tagName === "UL" && inList.hasAttribute("data-ck")) { if (api.indentItem) api.indentItem(); return; } // checklist again → indent
  if (inList && inList.tagName === "UL") { inList.setAttribute("data-ck", "1"); return; }
  document.execCommand("insertUnorderedList");
  // the new list (in an empty note the caret may sit on the editor itself, next to the list)
  const now = caretEl(api); let ul = now && now.closest("ul");
  if (!ul && now) { const r = getSelection().getRangeAt(0), c = r.startContainer.nodeType === 1 ? r.startContainer.childNodes[r.startOffset] || r.startContainer.childNodes[r.startOffset - 1] : null;
    ul = c && c.nodeType === 1 ? (c.tagName === "UL" ? c : c.closest("ul") || c.querySelector("ul")) : null; }
  if (ul && api.el.contains(ul)) ul.setAttribute("data-ck", "1");
}
function colorKey(hex) {
  const h = String(hex || "").toLowerCase();
  if (h === CLEAR) return "";
  const f = COLORS.find(([, c]) => c.toLowerCase() === h); return f ? f[0] : null;
}

/* ---------- code box ---------- */
const LANGS = [["python", "Python"], ["javascript", "JavaScript"], ["c", "C"], ["cpp", "C++"], ["java", "Java"], ["html", "HTML"], ["css", "CSS"], ["sql", "SQL"], ["text", "Plain text"]];
const KW = {
  javascript: "break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await true false null undefined",
  sql: "select from where and or not insert into values update set delete create table drop alter join left right inner outer on group by order having limit as distinct null is in like between union primary key foreign references count sum avg min max",
  c: "auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL include define",
  java: "abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static super switch synchronized this throw throws try void volatile while var record true false null String System",
  css: "", html: "", text: ""
};
KW.cpp = KW.c + " class namespace template typename public private protected virtual override new delete this using try catch throw nullptr auto std cout cin endl string vector";
function hlLine(line, lang) {
  if (lang === "python" && window.CSRules && CSRules.tokens) return CSRules.tokens(line).map(x => x.t === "ws" || x.t === "op" || x.t === "name" ? esc(x.s) : `<span class="${x.t}">${esc(x.s)}</span>`).join("");
  if (lang === "text") return esc(line);
  const kw = new Set((KW[lang] || "").split(" ").filter(Boolean)); let out = "", i = 0;
  while (i < line.length) {
    const r = line.slice(i); let m;
    if ((lang === "javascript" || lang === "css" || lang === "c" || lang === "cpp" || lang === "java") && (m = r.match(/^\/\/.*|^\/\*.*?(\*\/|$)/))) { out += `<span class="com">${esc(m[0])}</span>`; i += m[0].length; continue; }
    if (lang === "sql" && (m = r.match(/^--.*/))) { out += `<span class="com">${esc(m[0])}</span>`; break; }
    if (lang === "html" && (m = r.match(/^<!--.*?(-->|$)/))) { out += `<span class="com">${esc(m[0])}</span>`; i += m[0].length; continue; }
    if (lang === "html" && (m = r.match(/^<\/?[A-Za-z][\w-]*/))) { out += `<span class="kw">${esc(m[0])}</span>`; i += m[0].length; continue; }
    if ((m = r.match(/^("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/))) { out += `<span class="str">${esc(m[0])}</span>`; i += m[0].length; continue; }
    if ((m = r.match(/^#[0-9a-fA-F]{3,8}\b|^\d+(\.\d+)?(px|em|rem|%|s|ms|vh|vw)?/))) { out += `<span class="num">${esc(m[0])}</span>`; i += m[0].length; continue; }
    if ((m = r.match(/^[A-Za-z_$][\w$-]*/))) { const w = m[0]; out += kw.has(lang === "sql" ? w.toLowerCase() : w) ? `<span class="kw">${esc(w)}</span>` : lang === "css" && /^\s*:/.test(line.slice(i + w.length)) ? `<span class="bi">${esc(w)}</span>` : esc(w); i += w.length; continue; }
    out += esc(line[i]); i++;
  }
  return out;
}
// an indented note's text: [words](https://…) and bare https:// addresses become links (notes.js uses the same rules)
function annHTML(t) {
  const out = [], rest = String(t || ""), re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g; let m, at = 0;
  while ((m = re.exec(rest))) { out.push(esc(rest.slice(at, m.index))); const url = m[2] || m[3], label = m[1] || m[3];
    out.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}">${esc(label)}</a>`); at = m.index + m[0].length; }
  out.push(esc(rest.slice(at))); return out.join("").replace(/\n/g, "<br>");
}
function mountCode(el) {
  const d = readSrc(el, { lang: "python", title: "", src: "" });
  el.innerHTML = `<div class="nw-h"><span class="nw-tag">&lt;/&gt;</span><input class="nw-title" maxlength="80" placeholder="Code" aria-label="Code box title" value="${esc(d.title)}">
      <select class="nw-lang" aria-label="Language">${LANGS.map(([k, n]) => `<option value="${k}"${d.lang === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <button type="button" class="nw-b" data-a="copy" title="Copy the code">Copy</button><button type="button" class="nw-b nw-del" data-a="del" title="Remove this code box" aria-label="Remove code box">✕</button></div>
    <div class="nw-code"><div class="nw-gut" aria-hidden="true"></div><div class="nw-edit"><pre class="nw-hl" aria-hidden="true"></pre><textarea class="nw-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code"></textarea></div></div>`;
  const ta = el.querySelector(".nw-ta"), hl = el.querySelector(".nw-hl"), gut = el.querySelector(".nw-gut"), lang = el.querySelector(".nw-lang"), title = el.querySelector(".nw-title");
  ta.value = d.src;
  let anns = Array.isArray(d.anns) ? d.anns.filter(a => a && /^[a-z0-9]{4,24}$/i.test(a.id) && a.end > a.start).map(a => ({ id: a.id, start: +a.start, end: +a.end, text: String(a.text || "").slice(0, 4000) })) : [];
  const draw = () => { const ls = ta.value.split("\n"); hl.innerHTML = ls.map(l => hlLine(l, lang.value) || " ").join("\n") + "\n"; gut.innerHTML = ls.map((_, i) => `<span>${i + 1}</span>`).join(""); ta.rows = Math.max(3, Math.min(24, ls.length + 1)); annView(); };
  const save = () => writeSrc(el, Object.assign({ lang: lang.value, title: title.value.trim(), src: ta.value }, anns.length ? { anns } : {}));
  /* indented notes on code (Devon, Oct 12 2026): { id, start, end, text } over the source; they follow edits (shifted, or
     dropped when their code is deleted). While shown and the box is not being typed in, a view replaces the editor: each
     line with its number, the noted code marked, and the note under its line with a right-angled line from the middle of
     the code. Click the code to type again; the notes come back when you leave the box. */
  let prev = ta.value, showAnn = (() => { try { return localStorage.getItem("notepath.indshow") !== "false"; } catch (e) { return true; } })();
  const view = document.createElement("div"); view.className = "nw-annv"; view.hidden = true; el.querySelector(".nw-code").after(view);
  const track = () => { const v = ta.value; if (v === prev) return; let a = 0; while (a < prev.length && a < v.length && prev[a] === v[a]) a++;
    let b = 0; while (b < prev.length - a && b < v.length - a && prev[prev.length - 1 - b] === v[v.length - 1 - b]) b++;
    const oldEnd = prev.length - b, newEnd = v.length - b, delta = v.length - prev.length;
    anns = anns.map(x => { if (x.end <= a) return x; if (x.start >= oldEnd) return Object.assign({}, x, { start: x.start + delta, end: x.end + delta });
      const st = x.start < a ? x.start : (x.end > oldEnd ? newEnd : a), en = x.end > oldEnd ? x.end + delta : newEnd; return Object.assign({}, x, { start: st, end: Math.max(st, en) }); })
      .filter(x => x.end > x.start && v.slice(x.start, x.end).trim());
    prev = v; };
  function annView() {
    const on = showAnn && anns.length && document.activeElement !== ta;
    const was = el.classList.contains("nw-annon");
    el.classList.toggle("nw-annon", !!on); view.hidden = !on; if (!on) { view.innerHTML = ""; if (was) el.dispatchEvent(new Event("np:ann-layout", { bubbles: true })); return; }
    const v = ta.value, ls = v.split("\n"), starts = []; let p = 0; ls.forEach(l => { starts.push(p); p += l.length + 1; });
    const byLine = {}; anns.forEach(x => { const i = starts.findIndex((s0, k) => x.start >= s0 && x.start <= s0 + ls[k].length); if (i >= 0) (byLine[i] = byLine[i] || []).push(x); });
    view.innerHTML = ls.map((l, i) => {
      const here = (byLine[i] || []).sort((x, y) => x.start - y.start); let html = "", at = 0;
      here.forEach(x => { const a0 = Math.max(at, x.start - starts[i]), b0 = Math.min(l.length, x.end - starts[i]); if (b0 <= a0) return;
        html += hlLine(l.slice(at, a0), lang.value) + `<span class="nann-cw" data-cann="${x.id}">${hlLine(l.slice(a0, b0), lang.value)}</span>`; at = b0; });
      html += hlLine(l.slice(at), lang.value);
      return `<div class="nw-al" data-line="${i}"><span class="nw-an">${i + 1}</span><span class="nw-ac">${html || " "}</span></div>`
        + here.map(x => `<div class="nann-cblk" data-cann="${x.id}"><div class="nann-card nann-ccard" data-cann="${x.id}" title="Click to edit this indented note">${x.text ? annHTML(x.text) : '<i class="nann-empty">Empty indented note</i>'}</div></div>`).join("");
    }).join("");
    requestAnimationFrame(() => view.querySelectorAll(".nann-cblk").forEach(blk => { // the line from the middle of the noted code
      const w = view.querySelector(`.nann-cw[data-cann="${blk.dataset.cann}"]`); if (!w) return;
      const vr = view.getBoundingClientRect(), wr = w.getBoundingClientRect(), mid = wr.left + wr.width / 2 - vr.left + view.scrollLeft;
      blk.style.setProperty("--mx", mid + "px"); blk.style.setProperty("--cx", Math.min(mid + 16, Math.max(40, view.clientWidth - 220)) + "px"); }));
    el.dispatchEvent(new Event("np:ann-layout", { bubbles: true })); // notes drawn under the text below this box move with it
  }
  view.addEventListener("mousedown", e => { if (e.target.closest("a")) return; e.preventDefault(); });
  view.addEventListener("click", e => {
    if (e.target.closest("a")) return;
    const c = e.target.closest(".nann-ccard"); if (c) { el.dispatchEvent(new CustomEvent("np:ann-edit", { bubbles: true, detail: { id: c.dataset.cann } })); return; }
    const ln = e.target.closest(".nw-al"), ls = ta.value.split("\n"); let pos = ta.value.length;
    if (ln) { const i = +ln.dataset.line; pos = ls.slice(0, i).reduce((n, l) => n + l.length + 1, 0) + ls[i].length; }
    el.classList.remove("nw-annon"); view.hidden = true; ta.focus({ preventScroll: true }); ta.setSelectionRange(pos, pos);
  });
  ta.addEventListener("blur", () => setTimeout(annView, 0));
  el._ann = {
    list: () => anns.map(x => ({ id: x.id, words: ta.value.slice(x.start, x.end), text: x.text, code: true })),
    has: id => anns.some(x => x.id === id),
    add(text) { const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      if (document.activeElement !== ta && !el.contains(document.activeElement)) return { error: "Select the code first." };
      if (b <= a || !v.slice(a, b).trim()) return { error: "Select the code first." };
      if (v.slice(a, b).includes("\n")) return { error: "Select code on one line." };
      if (anns.some(x => a < x.end && b > x.start)) return { error: "That code already has an indented note." };
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); anns.push({ id, start: a, end: b, text: String(text || "") }); save(); return { id }; },
    set(id, text) { const x = anns.find(y => y.id === id); if (!x) return false; x.text = String(text || "").slice(0, 4000); save(); annView(); return true; },
    remove(id) { const n = anns.length; anns = anns.filter(y => y.id !== id); if (anns.length === n) return false; save(); annView(); return true; },
    show(on) { showAnn = !!on; annView(); },
    focus(id) { const w = view.querySelector(`.nann-cw[data-cann="${id}"]`) || el; w.scrollIntoView({ block: "nearest" }); if (w !== el) { w.classList.add("nann-hi"); setTimeout(() => w.classList.remove("nann-hi"), 900); } },
    relayout: () => annView()
  };
  ta.addEventListener("input", e => { e.stopPropagation(); track(); draw(); save(); });
  title.addEventListener("input", e => { e.stopPropagation(); save(); });
  lang.addEventListener("change", () => { draw(); save(); });
  ta.addEventListener("scroll", () => { hl.scrollLeft = ta.scrollLeft; });
  ta.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value, ls = v.lastIndexOf("\n", s - 1) + 1;
    if (e.shiftKey) { const cut = v.slice(ls).match(/^ {1,4}/); if (cut) { ta.value = v.slice(0, ls) + v.slice(ls + cut[0].length); ta.selectionStart = ta.selectionEnd = Math.max(ls, s - cut[0].length); } }
    else { ta.value = v.slice(0, s) + "    " + v.slice(en); ta.selectionStart = ta.selectionEnd = s + 4; }
    track(); draw(); save();
  });
  el.querySelector('[data-a="copy"]').onclick = e => { const b = e.currentTarget; ta.select(); let ok = false; try { ok = document.execCommand("copy"); } catch (err) {} if (!ok && navigator.clipboard) navigator.clipboard.writeText(ta.value); b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1400); };
  delButton(el);
  draw();
}
function delButton(el) {
  const b = el.querySelector('[data-a="del"]'); let armed = 0;
  b.onclick = () => {
    if (!armed) { b.textContent = "Remove?"; b.classList.add("armed"); armed = setTimeout(() => { armed = 0; b.textContent = "✕"; b.classList.remove("armed"); }, 3000); return; }
    clearTimeout(armed); const host = el.parentNode; el.remove(); if (host) changed(host);
  };
}

/* ---------- music chart ---------- */
// notation: tokens separated by spaces. Pitch with octave = one note (C4, F#3, Bb5); [C4 E4 G4] = notes together;
// a chord symbol without octave = that chord (C, Am, G7, Fmaj7, Bdim, Dsus4, C/E); r = rest. "/q" sets the length
// (w whole, h half, q quarter, e eighth, s sixteenth; "." dotted) and it carries on to the next tokens.
const QUAL = { "": ["P1", "M3", "P5"], M: ["P1", "M3", "P5"], maj: ["P1", "M3", "P5"], m: ["P1", "m3", "P5"], min: ["P1", "m3", "P5"], dim: ["P1", "m3", "d5"], "°": ["P1", "m3", "d5"],
  aug: ["P1", "M3", "A5"], "+": ["P1", "M3", "A5"], "7": ["P1", "M3", "P5", "m7"], maj7: ["P1", "M3", "P5", "M7"], M7: ["P1", "M3", "P5", "M7"], m7: ["P1", "m3", "P5", "m7"], min7: ["P1", "m3", "P5", "m7"],
  m7b5: ["P1", "m3", "d5", "m7"], "ø": ["P1", "m3", "d5", "m7"], "ø7": ["P1", "m3", "d5", "m7"], dim7: ["P1", "m3", "d5", "d7"], "°7": ["P1", "m3", "d5", "d7"],
  sus2: ["P1", "M2", "P5"], sus4: ["P1", "P4", "P5"], "7sus4": ["P1", "P4", "P5", "m7"], "6": ["P1", "M3", "P5", "M6"], m6: ["P1", "m3", "P5", "M6"],
  "9": ["P1", "M3", "P5", "m7", "M9"], maj9: ["P1", "M3", "P5", "M7", "M9"], m9: ["P1", "m3", "P5", "m7", "M9"], add9: ["P1", "M3", "P5", "M9"] };
const UNITS = { w: 64, h: 32, q: 16, e: 8, s: 4 };
const toAsc = s => s.replace(/♯/g, "#").replace(/♭/g, "b");
function chordNotes(sym, clef) {
  const m = toAsc(sym).match(/^([A-G])(#|b)?([^/]*)(?:\/([A-G])(#|b)?)?$/); if (!m || !(m[3] in QUAL)) return null;
  const oct = clef === "bass" ? 3 : 4, root = m[1] + (m[2] || "") + oct;
  const ns = QUAL[m[3]].map(iv => MT().name(MT().up(root, iv), { ascii: true }));
  if (m[4]) ns.unshift(m[4] + (m[5] || "") + (oct - 1));
  return ns;
}
function parseSeq(str, clef) {
  const ev = [], errs = []; let d = "q", dots = 0;
  const toks = String(str || "").match(/\[[^\]]*\](?:\/\S+)?|\S+/g) || [];
  for (const tok of toks) {
    let head = tok, dur = null; const k = tok.lastIndexOf("/");
    if (k > 0 && /^[whqes]\.{0,2}$/.test(tok.slice(k + 1))) { head = tok.slice(0, k); dur = tok.slice(k + 1); }
    else if (/^\/[whqes]\.{0,2}$/.test(tok)) { head = ""; dur = tok.slice(1); }
    if (dur) { d = dur[0]; dots = dur.length - 1; }
    if (!head) continue;
    const e = { d, dots };
    try {
      if (/^r$/i.test(head)) e.r = 1;
      else if (head[0] === "[") { e.n = head.slice(1, -1).split(/[\s,]+/).filter(Boolean).map(p => { if (!/\d/.test(p)) throw 0; return MT().name(MT().parse(toAsc(p)), { ascii: true }); }); if (!e.n.length) throw 0; }
      else if (/^[A-Ga-g](#|b|♯|♭|x|bb)?-?\d$/.test(head)) e.n = [MT().name(MT().parse(toAsc(head[0].toUpperCase() + head.slice(1))), { ascii: true })];
      else { const c = chordNotes(head, clef); if (!c) throw 0; e.n = c; e.sym = head; }
      ev.push(e);
    } catch (x) { errs.push(tok); }
  }
  return { ev, errs };
}
const len = e => UNITS[e.d] * (e.dots === 2 ? 1.75 : e.dots === 1 ? 1.5 : 1);
// SVG staff
const G_CLEF = [[0.08,0.1],[0.5,0.05],[0.62,-0.42],[0.25,-0.86],[-0.38,-0.82],[-0.78,-0.3],[-0.72,0.45],[-0.25,1.15],[0.32,1.85],[0.6,2.6],[0.52,3.35],[0.22,3.75],[-0.08,3.45],[-0.2,2.7],[-0.08,1.6],[0.12,0.3],[0.28,-1.2],[0.3,-2.05],[0.05,-2.55],[-0.35,-2.55]];
const F_CLEF = [[0,0],[0.18,0.5],[0.7,0.72],[1.18,0.42],[1.3,-0.25],[1.05,-1.0],[0.5,-1.65],[-0.15,-2.1]];
function splinePath(pts, X, Y) {
  let d = `M${X(pts[0][0]).toFixed(1)} ${Y(pts[0][1]).toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${X(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${Y(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${X(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${Y(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${X(p2[0]).toFixed(1)} ${Y(p2[1]).toFixed(1)}`; }
  return d;
}
function staffSVG(o, ev, playing) {
  const sp = 10, top = 46, base = top + 4 * sp, Y = pos => base - pos * sp / 2;
  const [tn, tb] = String(o.time || "4/4").split("/").map(Number), bar = tn * (64 / tb);
  let x = 0; const parts = [];
  // clef + time signature
  if (o.clef === "bass") { const X = a => 22 + a * sp, Yc = b => Y(6) - b * sp;
    parts.push(`<path d="${splinePath(F_CLEF, X, Yc)}" class="ms-ink" fill="none" stroke-width="1.8"/><circle cx="${X(0.02)}" cy="${Yc(0)}" r="3" class="ms-fill"/><circle cx="${X(1.72)}" cy="${Yc(0.5)}" r="1.4" class="ms-fill"/><circle cx="${X(1.72)}" cy="${Yc(-0.5)}" r="1.4" class="ms-fill"/>`); }
  else { const X = a => 28 + a * sp * 1.12, Yc = b => Y(2) - b * sp * 1.12;
    parts.push(`<path d="${splinePath(G_CLEF, X, Yc)}" class="ms-ink" fill="none" stroke-width="1.7"/><circle cx="${X(-0.32)}" cy="${Yc(-2.28)}" r="2.8" class="ms-fill"/>`); }
  parts.push(`<text x="56" y="${Y(6) + 6}" class="ms-time">${tn}</text><text x="56" y="${Y(2) + 6}" class="ms-time">${tb}</text>`);
  x = 84; let acc = 0, bars = 0;
  ev.forEach((e, i) => {
    const w = { w: 62, h: 44, q: 32, e: 26, s: 22 }[e.d] + (e.dots ? 8 : 0) + (e.n && e.n.some(p => MT().parse(p).a) ? 10 : 0);
    const cx = x + (e.n && e.n.some(p => MT().parse(p).a) ? 12 : 4), hot = playing === i ? " ms-hot" : "";
    if (e.sym) parts.push(`<text x="${cx - 4}" y="${top - 22}" class="ms-sym${hot}">${esc(e.sym)}</text>`);
    if (e.r) {
      const ry = Y(4);
      if (e.d === "w") parts.push(`<rect x="${cx - 5}" y="${Y(6)}" width="11" height="5" class="ms-fill${hot}"/>`);
      else if (e.d === "h") parts.push(`<rect x="${cx - 5}" y="${Y(4) - 5}" width="11" height="5" class="ms-fill${hot}"/>`);
      else if (e.d === "q") parts.push(`<path d="M${cx - 2} ${ry - 14} l6 7 -5 6 6 7 c-6 -2 -9 2 -4 7" class="ms-ink${hot}" fill="none" stroke-width="2.2" stroke-linejoin="round"/>`);
      else { const n = e.d === "e" ? 1 : 2; for (let k = 0; k < n; k++) parts.push(`<circle cx="${cx - 2 - k * 2}" cy="${ry - 6 + k * 8}" r="2.4" class="ms-fill${hot}"/><path d="M${cx - 1 - k * 2} ${ry - 5 + k * 8} q4 1 6 -3" class="ms-ink${hot}" fill="none" stroke-width="1.6"/>`); parts.push(`<path d="M${cx + 5} ${ry - 9} l-6 ${14 + 8 * (n - 1)}" class="ms-ink${hot}" stroke-width="1.6"/>`); }
      if (e.dots) parts.push(`<circle cx="${cx + 11}" cy="${ry - 2}" r="1.8" class="ms-fill${hot}"/>`);
    } else {
      const ps = e.n.map(p => ({ p, pos: MT().staffPos(p, o.clef === "bass" ? "bass" : "treble"), a: MT().parse(p).a })).sort((a, b) => a.pos - b.pos);
      const avg = ps.reduce((s, q) => s + q.pos, 0) / ps.length, down = avg >= 4, hollow = e.d === "w" || e.d === "h";
      let prev = null; ps.forEach(q => { q.dx = prev && q.pos - prev.pos === 1 && !prev.dx ? 11 : 0; prev = q; });
      ps.forEach(q => {
        MT().ledgers(q.pos).forEach(l => parts.push(`<line x1="${cx - 9 + q.dx}" x2="${cx + 9 + q.dx}" y1="${Y(l)}" y2="${Y(l)}" class="ms-line"/>`));
        if (q.a) parts.push(`<text x="${cx - 18}" y="${Y(q.pos) + 4.5}" class="ms-acc${hot}">${q.a > 0 ? (q.a > 1 ? "𝄪" : "♯") : (q.a < -1 ? "♭♭" : "♭")}</text>`);
        parts.push(`<ellipse cx="${cx + q.dx}" cy="${Y(q.pos)}" rx="5.8" ry="4.1" transform="rotate(-20 ${cx + q.dx} ${Y(q.pos)})" class="${hollow ? "ms-hollow" : "ms-fill"}${hot}"/>`);
        if (e.dots) parts.push(`<circle cx="${cx + 11 + q.dx}" cy="${Y(q.pos) - (q.pos % 2 === 0 ? sp / 2 : 0)}" r="1.8" class="ms-fill${hot}"/>`);
      });
      if (e.d !== "w") {
        const lo = ps[0], hi = ps[ps.length - 1], sx = down ? cx - 5.4 : cx + 5.4;
        const y1 = down ? Y(hi.pos) : Y(lo.pos), y2 = down ? Y(lo.pos) + 3.5 * sp : Y(hi.pos) - 3.5 * sp;
        parts.push(`<line x1="${sx}" x2="${sx}" y1="${y1}" y2="${y2}" class="ms-ink${hot}" stroke-width="1.3"/>`);
        const flags = e.d === "e" ? 1 : e.d === "s" ? 2 : 0;
        for (let k = 0; k < flags; k++) { const fy = y2 + (down ? -k * 7 : k * 7); parts.push(`<path d="M${sx} ${fy} c1 ${down ? -6 : 6} 9 ${down ? -8 : 8} 7 ${down ? -16 : 16}" class="ms-ink${hot}" fill="none" stroke-width="1.6"/>`); }
      }
    }
    x += w; acc += len(e);
    if (acc >= bar - 1e-9) { parts.push(`<line x1="${x - 6}" x2="${x - 6}" y1="${Y(8)}" y2="${Y(0)}" class="ms-line${acc > bar + 1e-9 ? " ms-over" : ""}"/>`); acc = acc > bar + 1e-9 ? acc - bar : 0; bars++; }
  });
  const W = Math.max(x + 24, 320);
  const lines = [0, 2, 4, 6, 8].map(p => `<line x1="8" x2="${W - 8}" y1="${Y(p)}" y2="${Y(p)}" class="ms-line"/>`).join("");
  const end = `<line x1="${W - 12}" x2="${W - 12}" y1="${Y(8)}" y2="${Y(0)}" class="ms-line"/><line x1="${W - 8}" x2="${W - 8}" y1="${Y(8)}" y2="${Y(0)}" class="ms-ink" stroke-width="3"/>`;
  return `<svg class="ms" width="${W}" height="${base + 46}" viewBox="0 0 ${W} ${base + 46}" role="img" aria-label="Music: ${ev.length} events">${lines}${parts.join("")}${end}</svg>`;
}
// a small synth (soft triangle + sine, low-pass), only from the Play button
let AC = null, playStop = null;
function synthPlay(ev, tempo, onStep, onEnd) {
  const A = window.AudioContext || window.webkitAudioContext; if (!A) return () => {};
  if (!AC) AC = new A();
  if (AC.state === "suspended") AC.resume();
  const out = AC.createGain(); out.gain.value = 0.32; const lp = AC.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(out); out.connect(AC.destination);
  const q = 60 / Math.max(30, Math.min(240, tempo || 90)); let t = AC.currentTime + 0.06; const timers = [];
  ev.forEach((e, i) => {
    const dur = len(e) / 16 * q;
    timers.push(setTimeout(() => onStep(i), (t - AC.currentTime) * 1000));
    if (!e.r) e.n.forEach(p => {
      const f = MT().freq(p);
      [["triangle", 1, .55], ["sine", 2, .12]].forEach(([type, mul, amp]) => {
        const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = f * mul; g.gain.value = 0;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp / Math.sqrt(e.n.length), t + 0.012); g.gain.exponentialRampToValueAtTime(Math.max(1e-4, amp * 0.35 / Math.sqrt(e.n.length)), t + Math.min(0.35, dur * 0.6));
        g.gain.setTargetAtTime(0, t + dur * 0.92, 0.04);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + dur + 0.3);
      });
    });
    t += dur;
  });
  const endT = setTimeout(() => { onEnd(); out.disconnect(); }, (t - AC.currentTime) * 1000 + 120);
  return () => { timers.forEach(clearTimeout); clearTimeout(endT); try { out.gain.setTargetAtTime(0, AC.currentTime, 0.03); setTimeout(() => out.disconnect(), 200); } catch (e) {} onEnd(); };
}
const KEYS = [["C", 0], ["C#", 1], ["D", 2], ["D#", 3], ["E", 4], ["F", 5], ["F#", 6], ["G", 7], ["G#", 8], ["A", 9], ["A#", 10], ["B", 11]];
function mountMusic(el) {
  if (!MT()) { el.innerHTML = `<div class="nw-h"><span class="nw-tag">♪</span><span>Music charts need the music kit.</span></div>`; return; }
  const d = readSrc(el, { title: "", clef: "treble", time: "4/4", tempo: 90, seq: "" });
  let oct = d.clef === "bass" ? 3 : 4, dur = "q", dot = 0, chordMode = false, playing = -1;
  el.innerHTML = `<div class="nw-h"><span class="nw-tag">♪</span><input class="nw-title" maxlength="80" placeholder="Music" aria-label="Music chart title" value="${esc(d.title)}">
      <select class="nw-clef" aria-label="Clef"><option value="treble"${d.clef !== "bass" ? " selected" : ""}>Treble clef</option><option value="bass"${d.clef === "bass" ? " selected" : ""}>Bass clef</option></select>
      <select class="nw-time" aria-label="Time signature">${["4/4", "3/4", "2/4", "6/8", "2/2", "5/4", "12/8"].map(t => `<option${d.time === t ? " selected" : ""}>${t}</option>`).join("")}</select>
      <label class="nw-tempo" title="Tempo in quarter notes per minute">♩=<input type="number" min="30" max="240" step="2" value="${d.tempo}" aria-label="Tempo"></label>
      <button type="button" class="nw-b nw-play" data-a="play">▶ Play</button><button type="button" class="nw-b nw-del" data-a="del" title="Remove this music chart" aria-label="Remove music chart">✕</button></div>
    <div class="nw-staff"></div>
    <div class="nw-mtools">
      <div class="nw-durs" role="radiogroup" aria-label="Note length">${[["w", "𝅝", "Whole"], ["h", "𝅗𝅥", "Half"], ["q", "♩", "Quarter"], ["e", "♪", "Eighth"], ["s", "𝅘𝅥𝅯", "Sixteenth"]].map(([k, g, n]) => `<button type="button" role="radio" data-dur="${k}" title="${n} note" aria-label="${n}">${g}<small>${n}</small></button>`).join("")}<button type="button" data-a="dot" aria-pressed="false" title="Dotted (½ longer)">•<small>Dot</small></button></div>
      <div class="nw-keys"><button type="button" class="nw-b" data-a="odown" aria-label="Octave down">◀</button><div class="nw-piano" role="group" aria-label="Keyboard: click a key to add the note"></div><button type="button" class="nw-b" data-a="oup" aria-label="Octave up">▶</button></div>
      <div class="nw-row"><button type="button" class="nw-b" data-a="rest">Rest</button><button type="button" class="nw-b" data-a="chord" aria-pressed="false" title="On: keys add to the last chord instead of a new note">Chord: off</button>
        <form class="nw-chordf"><input class="nw-chord" placeholder="Chord symbol: Am7" aria-label="Chord symbol" maxlength="10"><button type="submit" class="nw-b">Add chord</button></form>
        <button type="button" class="nw-b" data-a="undo">Undo</button><button type="button" class="nw-b" data-a="clear">Clear</button></div>
      <label class="nw-nota"><span>Notation <small>C4/q E4 G4 · [C4 E4 G4]/h · Am7/h · r/q · dotted q.</small></span><textarea class="nw-seq" rows="2" spellcheck="false" aria-label="Notation"></textarea></label>
      <p class="nw-msg" aria-live="polite"></p>
    </div>`;
  const $ = s => el.querySelector(s), seq = $(".nw-seq"), staff = $(".nw-staff"), msg = $(".nw-msg");
  seq.value = d.seq;
  const cur = () => ({ title: $(".nw-title").value.trim(), clef: $(".nw-clef").value, time: $(".nw-time").value, tempo: +$(".nw-tempo input").value || 90, seq: seq.value.trim() });
  const draw = () => {
    const o = cur(), r = parseSeq(o.seq, o.clef);
    staff.innerHTML = staffSVG(o, r.ev, playing);
    msg.textContent = r.errs.length ? "Not understood: " + r.errs.join(" ") : r.ev.length ? `${r.ev.length} event${r.ev.length === 1 ? "" : "s"}` : "Click keys below, add a chord, or type notation.";
    msg.classList.toggle("bad", !!r.errs.length);
    return r;
  };
  const save = () => { writeSrc(el, cur()); draw(); };
  const tokDur = () => "/" + dur + ".".repeat(dot);
  const append = tok => { seq.value = (seq.value.trim() + " " + tok).trim(); save(); };
  const piano = () => { $(".nw-piano").innerHTML = KEYS.map(([n, s]) => `<button type="button" class="${n.includes("#") ? "bk" : "wk"}" data-k="${n}${oct}" title="${n}${oct}"><span>${n.includes("#") ? "" : n + (n === "C" ? oct : "")}</span></button>`).join("") + `<button type="button" class="wk" data-k="C${oct + 1}" title="C${oct + 1}"><span>C${oct + 1}</span></button>`; };
  const marks = () => { el.querySelectorAll("[data-dur]").forEach(b => b.setAttribute("aria-checked", String(b.dataset.dur === dur))); $('[data-a="dot"]').setAttribute("aria-pressed", String(!!dot)); const c = $('[data-a="chord"]'); c.setAttribute("aria-pressed", String(chordMode)); c.textContent = "Chord: " + (chordMode ? "on" : "off"); };
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || !el.contains(b)) return;
    if (b.dataset.dur) { dur = b.dataset.dur; marks(); return; }
    if (b.dataset.k) {
      const p = b.dataset.k;
      preview(p);
      if (chordMode && seq.value.trim()) {
        const toks = seq.value.trim().match(/\[[^\]]*\](?:\/\S+)?|\S+/g), last = toks.pop();
        const m = last.match(/^(\[[^\]]*\]|[^/\s]+)(\/\S+)?$/);
        if (m && !/^r$/i.test(m[1]) && /\d/.test(m[1])) { const inner = m[1][0] === "[" ? m[1].slice(1, -1).trim() : m[1]; toks.push(`[${inner} ${p}]${m[2] || ""}`); seq.value = toks.join(" "); save(); return; }
      }
      append(p + tokDur()); return;
    }
    const a = b.dataset.a;
    if (a === "dot") { dot = dot ? 0 : 1; marks(); }
    else if (a === "chord") { chordMode = !chordMode; marks(); }
    else if (a === "rest") append("r" + tokDur());
    else if (a === "undo") { const toks = seq.value.trim().match(/\[[^\]]*\](?:\/\S+)?|\S+/g) || []; toks.pop(); seq.value = toks.join(" "); save(); }
    else if (a === "clear") { if (b.dataset.armed) { seq.value = ""; save(); delete b.dataset.armed; b.textContent = "Clear"; } else { b.dataset.armed = 1; b.textContent = "Clear all?"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Clear"; }, 2500); } }
    else if (a === "oup" || a === "odown") { oct = Math.max(1, Math.min(6, oct + (a === "oup" ? 1 : -1))); piano(); }
    else if (a === "play") {
      if (playStop) { playStop(); return; }
      const r = draw(); if (!r.ev.length) return;
      b.textContent = "■ Stop";
      playStop = synthPlay(r.ev, cur().tempo, i => { playing = i; draw(); }, () => { playStop = null; playing = -1; draw(); b.textContent = "▶ Play"; });
    }
  });
  const preview = p => { const s = synthPlay([{ n: [p], d: "e", dots: 0 }], 120, () => {}, () => {}); };
  $(".nw-chordf").addEventListener("submit", e => { e.preventDefault(); const v = $(".nw-chord").value.trim(); if (!v) return; if (!chordNotes(v, cur().clef)) { msg.textContent = `“${v}” is not a chord symbol I know (try C, Am, G7, Fmaj7, Bdim, Dsus4, C/E).`; msg.classList.add("bad"); return; } append(v + tokDur()); $(".nw-chord").value = ""; });
  [".nw-title", ".nw-seq", ".nw-tempo input", ".nw-chord"].forEach(s => $(s).addEventListener("input", e => { e.stopPropagation(); if (s !== ".nw-chord") save(); }));
  [".nw-clef", ".nw-time"].forEach(s => $(s).addEventListener("change", () => { if (s === ".nw-clef") { oct = $(s).value === "bass" ? 3 : 4; piano(); } save(); }));
  delButton(el);
  piano(); marks(); draw();
}

/* ---------- mount (called by notes.js hydrate) ---------- */
function mount(el) {
  if (el._nw) return; el._nw = true;
  el.contentEditable = "false";
  if (el.dataset.w === "code") mountCode(el); else if (el.dataset.w === "music") mountMusic(el); else if (el.dataset.w === "video") mountVideo(el);
  else if (el.dataset.w === "graph" && window.NPGraph) { NPGraph.mount(el); delButton(el); }
  else if (el.dataset.w === "sheet" && window.NPSheet) NPSheet.mount(el);
}
function create(type, data) {
  const el = document.createElement("div"); el.className = "nw"; el.dataset.w = type;
  el.dataset.src = JSON.stringify(type === "sheet" ? Object.assign({}, window.NPSheet ? NPSheet.DEF : {}, data || {}) : type === "graph" ? Object.assign({}, window.NPGraph ? NPGraph.DEF : {}, data || {}) : type === "video" ? Object.assign({ title: "" }, data || {}) : type === "code" ? Object.assign({ lang: "python", title: "", src: "" }, data || {}) : { title: "", clef: "treble", time: "4/4", tempo: 90, seq: "" });
  return el;
}
// plain-text version for search, previews and .md export
function text(el) {
  const d = readSrc(el, {});
  if (el.dataset.w === "code") return "\n```" + (d.lang && d.lang !== "text" ? d.lang : "") + (d.title ? " " + d.title : "") + "\n" + (d.src || "") + "\n```\n";
  if (el.dataset.w === "graph") return window.NPGraph ? NPGraph.text(d) : "";
  if (el.dataset.w === "sheet") return window.NPSheet ? NPSheet.text(el) : "";
  if (el.dataset.w === "video") { const l = videoLink(d); return "\n▶ " + (d.title || "Video") + (l ? " (" + l + ")" : "") + "\n"; }
  if (el.dataset.w === "music") return "\n♪ " + (d.title ? d.title + ": " : "") + (d.seq || "(empty)") + (d.time ? " [" + d.time + ", " + (d.clef || "treble") + " clef]" : "") + "\n";
  return "";
}
window.InquireWidgets = { toolbar, mount, create, text, colorKey, COLORS, parseSeq, chordNotes, videoFrom, videoPanel,
  kit: { splinePath, G_CLEF, F_CLEF, delButton, len, UNITS } }; // shared with notes-sheet.js
})();
