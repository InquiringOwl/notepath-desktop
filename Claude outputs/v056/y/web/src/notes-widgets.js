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
  bar.innerHTML = `<button type="button" data-cmd="bold" title="Bold (${mod}B)" aria-label="Bold"><b>B</b></button><button type="button" data-cmd="italic" title="Italic (${mod}I)" aria-label="Italic"><i>I</i></button><button type="button" data-cmd="underline" title="Underline (${mod}U)" aria-label="Underline"><u>U</u></button><button type="button" data-cmd="strikeThrough" title="Strikethrough" aria-label="Strikethrough"><s>S</s></button>
    <span class="nr-sep"></span><button type="button" data-blk="ul" title="Bulleted list · press again to indent (Tab indents, Shift+Tab moves back, delete at the start takes the bullet off)" aria-label="Bulleted list">•≡</button><button type="button" data-blk="ol" title="Numbered list · delete at the start of a line takes the number off" aria-label="Numbered list">1.≡</button><button type="button" data-blk="ck" title="Checklist: click a box to tick an item off · press again to indent · delete at the start of a line takes the box off" aria-label="Checklist">☑</button>
    <span class="nr-sep"></span><button type="button" class="nr-dd nr-font" data-dd="font" title="Font" aria-haspopup="listbox" aria-label="Font"><span class="nr-ddv">Default</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-size" data-dd="size" title="Text size" aria-haspopup="listbox" aria-label="Text size"><span class="nr-ddv num">15</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-colb" data-dd="color" title="Text colour" aria-haspopup="dialog" aria-label="Text colour"><span class="nr-cola" aria-hidden="true">A</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-hlb" data-dd="hilite" title="Highlight colour" aria-haspopup="dialog" aria-label="Highlight colour"><span class="nr-hla" aria-hidden="true">ab</span><span class="nr-car" aria-hidden="true">▾</span></button>
    <span class="nr-sep"></span><button type="button" class="nr-dd nr-head" data-dd="heads" title="Titles and headings: Title, Subtitle, Heading 1, 2, 3" aria-haspopup="menu" aria-label="Titles and headings" aria-pressed="false"><span class="nr-ddv">H</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-alb" data-dd="align" title="Align &amp; indent: nothing selected = the whole note, words selected = only those" aria-haspopup="menu" aria-label="Align and indent"><span class="nr-ali" aria-hidden="true">${ALIGN_IC.left}</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-dd nr-spb" data-dd="spacing" title="Line &amp; paragraph spacing" aria-haspopup="menu" aria-label="Line and paragraph spacing"><span class="nr-ali" aria-hidden="true">${SPACE_IC}</span><span class="nr-car" aria-hidden="true">▾</span></button><button type="button" class="nr-clr" data-a="clear" title="Clear formatting: nothing selected = the whole note, words selected = only those" aria-label="Clear formatting">${CLEAR_IC}</button>
    <span class="nr-sep"></span><button type="button" class="nr-sym" title="Emoji and symbols (Greek, maths, alchemical)" aria-haspopup="dialog">☺ Ω</button>
    `;
  bar.addEventListener("mousedown", e => e.preventDefault()); // keep the selection in the note
  bar.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.cmd) { api.focus(); document.execCommand(b.dataset.cmd); sync(); api.changed(); }
    else if (b.dataset.blk) { api.focus(); block(b.dataset.blk, api); sync(); api.changed(); }
    else if (b.dataset.a === "clear") { closeDD(); if (api.clearFormat) { const all = api.clearFormat(); sync(); if (window.InquireNotes && InquireNotes.toast) InquireNotes.toast(all ? "Formatting cleared from the whole note." : "Formatting cleared from the selected words.", null, 2500); } }
    else if (b.dataset.dd) ddPanel(b, b.dataset.dd, api, sync);
    else if (b.classList.contains("nr-sym")) symbolPanel(b, api);
    else if (b.dataset.w) api.addWidget(b.dataset.w);
  });
  const sync = () => { if (!api.el.contains(document.activeElement) && document.activeElement !== api.el) return;
    bar.querySelectorAll("[data-cmd]").forEach(b => { let on = false; try { on = document.queryCommandState(b.dataset.cmd); } catch (e) {} b.setAttribute("aria-pressed", String(on)); });
    const el = caretEl(api), L = el && el.closest("ul, ol"), on = { h3: !!(el && el.closest("h3")), ul: !!(L && L.tagName === "UL" && !L.hasAttribute("data-ck")), ol: !!(L && L.tagName === "OL"), ck: !!(L && L.hasAttribute("data-ck")) };
    bar.querySelectorAll("[data-blk]").forEach(b => b.setAttribute("aria-pressed", String(on[b.dataset.blk])));
    const hs = headAt(el), hb = bar.querySelector(".nr-head"); hb.setAttribute("aria-pressed", String(!!hs)); hb.querySelector(".nr-ddv").textContent = hs ? hs[3] : "H"; hb.title = hs ? hs[1] + ": choose another style, or Normal text" : "Titles and headings: Title, Subtitle, Heading 1, 2, 3";
    const f = fmtAt(fmtEl(api)); bar.querySelector(".nr-font .nr-ddv").textContent = f.fontName; bar.querySelector(".nr-font").style.setProperty("--ff", f.fontStack);
    bar.querySelector(".nr-size .nr-ddv").textContent = f.size; bar.querySelector(".nr-colb").style.setProperty("--c", f.color);
    const hb2 = bar.querySelector(".nr-hlb"); if (f.hl) hb2.style.setProperty("--h", f.hl); else hb2.style.removeProperty("--h"); hb2.classList.toggle("on", !!f.hl);
    if (api.layoutAt) { const L = api.layoutAt(); bar.querySelector(".nr-alb .nr-ali").innerHTML = ALIGN_IC[L.al || "left"]; bar.querySelector(".nr-alb").classList.toggle("on", !!(L.al || L.in)); bar.querySelector(".nr-spb").classList.toggle("on", !!(L.lh || L.ps)); } };
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
  const hsp = el && el.closest("span[data-h]"), hl = hsp && /^#[0-9a-f]{6}$/i.test(hsp.dataset.h) ? hsp.dataset.h : "";
  return { font: fk, fontName: nf ? nf[1] : "Default", fontStack: FSTACK[fk] || "var(--sans)", size: sz, color: el ? getComputedStyle(el).color : "var(--text)", hl };
}
let dd = null;
function closeDD() { if (dd) { dd.remove(); dd = null; document.removeEventListener("pointerdown", outDD, true); window.removeEventListener("keydown", keyDD, true); } }
const outDD = e => { if (dd && !dd.contains(e.target) && !e.target.closest(".nr-dd")) closeDD(); };
const keyDD = e => { if (e.key === "Escape" && dd) { e.preventDefault(); e.stopPropagation(); closeDD(); } };
// recent colours: text in notepath.recentcolors, highlights in notepath.recenthl (v0.5.4)
const RECENT_KEY = { color: "notepath.recentcolors", hilite: "notepath.recenthl" };
const recent = (k = "color") => { try { const a = JSON.parse(localStorage.getItem(RECENT_KEY[k]) || "[]"); return Array.isArray(a) ? a.filter(c => /^#[0-9a-f]{6}$/.test(c)).slice(0, 10) : []; } catch (e) { return []; } };
const addRecent = (c, k = "color") => { try { localStorage.setItem(RECENT_KEY[k], JSON.stringify([c, ...recent(k).filter(x => x !== c)].slice(0, 10))); } catch (e) {} };
/* colour presets (v0.5.4, Devon): your own swatches under the spectrum, one set for text and one for highlights, kept in
   notepath.colorpresets; ＋ saves the colour shown beside the code, Edit (or a right-click) takes one away */
const PRESET_KEY = "notepath.colorpresets", PRESET_MAX = 18;
const PRESET_DEF = { color: ["#f2b84b", "#5cc8e0", "#f07ca0", "#b49bff", "#7bd88f", "#e5675b"], hilite: ["#ffe066", "#8ce99a", "#66d9e8", "#faa2c1", "#ffc078", "#b197fc"] };
const presets = k => { try { const o = JSON.parse(localStorage.getItem(PRESET_KEY) || "null"); const a = o && Array.isArray(o[k]) ? o[k] : PRESET_DEF[k]; return a.filter(c => /^#[0-9a-f]{6}$/.test(c)).slice(0, PRESET_MAX); } catch (e) { return PRESET_DEF[k].slice(); } };
const setPresets = (k, a) => { try { const o = JSON.parse(localStorage.getItem(PRESET_KEY) || "null") || {}; ["color", "hilite"].forEach(x => { if (!Array.isArray(o[x])) o[x] = PRESET_DEF[x].slice(); }); o[k] = a.slice(0, PRESET_MAX); localStorage.setItem(PRESET_KEY, JSON.stringify(o)); } catch (e) {} };
/* align & indent, line & paragraph spacing (v0.5.4): icons and choices for the two tabs; the work is api.blockStyle in notes.js */
const AL_PATH = { left: "M2 3h12M2 6.5h8M2 10h12M2 13.5h7", center: "M2 3h12M4 6.5h8M2 10h12M4.5 13.5h7", right: "M2 3h12M6 6.5h8M2 10h12M7 13.5h7", "": "M2 3h12M2 6.5h12M2 10h12M2 13.5h12" };
const svgI = d => `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">${d}</svg>`;
const ALIGN_IC = Object.fromEntries(Object.entries(AL_PATH).map(([k, d]) => [k, svgI(`<path d="${d}"/>`)]));
const CLEAR_IC = svgI('<path d="M3 3.5h8M7 3.5l-2.2 9.5"/><path d="M9.5 9.5l4 4M13.5 9.5l-4 4"/>');
const SPACE_IC = svgI('<path d="M7 3.5h7M7 8h7M7 12.5h7M3 2.5v11M1.5 4l1.5-1.5L4.5 4M1.5 12l1.5 1.5 1.5-1.5"/>');
const IND_IC = { "+": svgI('<path d="M7 3h7M7 6.5h7M7 10h7M2 13.5h12M2 4.5l2.5 2-2.5 2"/>'), "-": svgI('<path d="M7 3h7M7 6.5h7M7 10h7M2 13.5h12M4.5 4.5l-2.5 2 2.5 2"/>'), "0": svgI('<path d="M2 3h12M2 6.5h12M2 10h12M2 13.5h12"/>') };
const ALIGNS = [["", "None", "As the note normally is"], ["left", "Left", "Lines start at the left"], ["center", "Middle", "Lines are centred"], ["right", "Right", "Lines end at the right"]];
const INDENTS = [["-", "Less", "Move back out one step"], ["+", "More", "Move in one step"], ["0", "No indent", "Back to the left edge"]];
const LINE_SP = [["", "Normal"], ["1", "1.0"], ["1.15", "1.15"], ["1.5", "1.5"], ["2", "2.0"], ["2.5", "2.5"], ["3", "3.0"]];
const PARA_SP = [["", "Normal"], ["0", "None"], ["6", "Small"], ["12", "Medium"], ["24", "Large"]];
const toHex = (r, g, b) => "#" + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, "0")).join("");
/* ---------- titles and headings (v0.5.4, Devon): the H tab. [tag, name, what it is for, short label on the H button] ----------
   Title h1 · Subtitle h6 · Heading 1 h2 · Heading 2 h3 (the H heading before 0.5.4) · Heading 3 h4; Normal text = a plain line */
const HEADS = [["h1", "Title", "The biggest line, for the top of the note", "T"], ["h6", "Subtitle", "Under a title: lighter, in italics", "Sub"],
  ["h2", "Heading 1", "Starts a section", "H1"], ["h3", "Heading 2", "A part of a section", "H2"], ["h4", "Heading 3", "A smaller heading", "H3"]];
const HTAGS = HEADS.map(x => x[0].toUpperCase()).join(",");
function headAt(el) { const h = el && el.closest(HTAGS); return h ? HEADS.find(x => x[0] === h.tagName.toLowerCase()) : null; }
/* v0.5.6 (Devon): the Music chart left the menu (the Lead sheet does more); Music charts already in notes still open and play */
const WIDGET_MENU = [["code", "&lt;/&gt;", "Code box", "Code to show and explain: highlight lines, before / after, present it, copy it as a picture"],
  ["sheet", "𝄞", "Lead sheet", "Bars with chord symbols and melody"], ["graph", "∿", "Graph", "Click points on a grid and get their equations"], ["map", "⌖", "Map", "Search an address and keep it on a map"]];
function ddPanel(btn, kind, api, sync) {
  const was = dd && dd.dataset.kind; closeDD(); if (was === kind) return;
  const cur = fmtAt(fmtEl(api));
  dd = document.createElement("div"); dd.className = "np-pop win np-pop-" + kind; dd.dataset.kind = kind;
  // the words selected when the menu opened (typing a colour code moves the focus into the menu)
  const s0 = getSelection(), saved = s0.rangeCount && api.el.contains(s0.getRangeAt(0).commonAncestorContainer) ? s0.getRangeAt(0).cloneRange() : null;
  const apply = (k, v) => { closeDD(); if (saved) { api.el.focus({ preventScroll: true }); const s1 = getSelection(); s1.removeAllRanges(); s1.addRange(saved); } api.format(k, v); sync(); };
  if (kind === "align" || kind === "spacing") {
    const L = api.layoutAt ? api.layoutAt() : { whole: true }, scope = L.whole ? "nothing selected: the whole note" : "only the selected words";
    const run = (prop, v) => { closeDD(); if (saved) { api.el.focus({ preventScroll: true }); const s1 = getSelection(); s1.removeAllRanges(); s1.addRange(saved); } else api.focus(); api.blockStyle(prop, v); sync(); };
    dd.setAttribute("role", "menu"); dd.setAttribute("aria-label", kind === "align" ? "Align and indent" : "Line and paragraph spacing");
    const chips = (prop, list, cur, ic) => `<div class="np-lay" role="group">${list.map(([v, n, d]) => `<button type="button" role="menuitemradio" data-p="${prop}" data-v2="${v}" aria-checked="${prop !== "in" && String(cur || "") === v}"${d ? ` title="${esc(d)}"` : ""}>${ic ? `<span class="np-layi" aria-hidden="true">${ic[v]}</span>` : ""}<span>${esc(n)}</span></button>`).join("")}</div>`;
    dd.innerHTML = kind === "align"
      ? `<div class="np-pop-h">Align &amp; indent <span>${scope}</span></div><div class="np-pop-sub">Align</div>${chips("al", ALIGNS, L.al, ALIGN_IC)}<div class="np-pop-sub">Indent${L.in ? ` <b class="num">${L.in}</b>` : ""}</div>${chips("in", INDENTS, "", IND_IC)}`
      : `<div class="np-pop-h">Line &amp; paragraph spacing <span>${scope.replace("words", "lines")}</span></div><div class="np-pop-sub">Line spacing</div>${chips("lh", LINE_SP, L.lh)}<div class="np-pop-sub">Space after each paragraph</div>${chips("ps", PARA_SP, L.ps)}`;
    dd.addEventListener("click", e => { const b = e.target.closest("button[data-p]"); if (b) run(b.dataset.p, b.dataset.v2); });
  } else if (kind === "heads") { // titles and headings: the line the caret is on (or every line selected) takes the style
    const curH = headAt(caretEl(api)), ck = curH ? curH[0] : "div";
    dd.setAttribute("role", "menu"); dd.setAttribute("aria-label", "Titles and headings");
    dd.innerHTML = `<div class="np-pop-h">Titles &amp; headings <span>for the line you are on</span></div><div class="np-heads">${[["div", "Normal text", "A plain line", ""], ...HEADS].map(([t, n, d]) => `<button type="button" role="menuitemradio" data-h="${t}" aria-checked="${t === ck}" title="${esc(d)}"><span class="np-hs np-hs-${t}">${esc(n)}</span><small>${esc(d)}</small></button>`).join("")}</div>`;
    dd.addEventListener("click", e => { const b = e.target.closest("button[data-h]"); if (!b) return; closeDD(); if (saved) { api.el.focus({ preventScroll: true }); const s1 = getSelection(); s1.removeAllRanges(); s1.addRange(saved); } else api.focus();
      block(b.dataset.h === "div" ? "p" : b.dataset.h, api); sync(); api.changed(); });
  } else if (kind === "widgets") { // one tab for every widget (Devon, Oct 2026): keeps the toolbar clean
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
  } else { // text colour and highlight colour (v0.5.4): the same panel; presets under the spectrum
    const HL = kind === "hilite", what = HL ? "Highlight" : "Colour";
    dd.setAttribute("role", "dialog"); dd.setAttribute("aria-label", HL ? "Highlight colour" : "Text colour");
    const rc = recent(kind);
    dd.innerHTML = `<div class="np-pop-h">${what} <span>click or drag on the spectrum</span></div>
      <canvas class="np-spec" width="248" height="132" aria-label="${what} spectrum"></canvas><canvas class="np-grey" width="248" height="16" aria-label="Greys"></canvas>
      <div class="np-pop-sub np-psub">Presets <button type="button" class="np-pedit" aria-pressed="false" title="Take presets away">Edit</button></div><div class="np-presets" role="group" aria-label="${what} presets"></div>
      <div class="np-crow"><span class="np-cprev"></span><input class="np-hex" maxlength="7" spellcheck="false" aria-label="Colour code (hex)" placeholder="#RRGGBB"><button type="button" class="nw-b np-capply">Apply</button></div>
      ${rc.length ? `<div class="np-pop-sub">Recent</div><div class="np-recent">${rc.map(c => `<button type="button" data-c="${c}" style="--c:${c}" title="${c.toUpperCase()}" aria-label="Recent ${HL ? "highlight" : "colour"} ${c.toUpperCase()}"></button>`).join("")}</div>` : ""}
      <button type="button" class="np-cnorm" data-c="">${HL ? "⊘ No highlight" : "⊘ Normal colour"}</button>`;
    const pbox = dd.querySelector(".np-presets"), pedit = dd.querySelector(".np-pedit");
    const drawP = () => { const ps = presets(kind), ed = pedit.getAttribute("aria-pressed") === "true"; pbox.classList.toggle("editing", ed);
      pbox.innerHTML = ps.map(c => `<button type="button" class="np-pre" data-pc="${c}" style="--c:${c}" title="${ed ? "Take away " : ""}${c.toUpperCase()}${ed ? "" : " · right-click to take it away"}" aria-label="${ed ? "Take away preset" : "Preset"} ${c.toUpperCase()}">${ed ? "✕" : ""}</button>`).join("")
        + (ed ? "" : `<button type="button" class="np-padd" title="${ps.length >= PRESET_MAX ? "Presets are full: take one away first" : "Save the colour shown below as a preset"}" aria-label="Save the colour as a preset"${ps.length >= PRESET_MAX ? " disabled" : ""}>＋</button>`)
        + (!ps.length && !ed ? `<span class="np-pnone">Pick a colour, then ＋ keeps it here</span>` : ""); };
    pedit.addEventListener("click", () => { pedit.setAttribute("aria-pressed", String(pedit.getAttribute("aria-pressed") !== "true")); pedit.textContent = pedit.getAttribute("aria-pressed") === "true" ? "Done" : "Edit"; drawP(); });
    pbox.addEventListener("click", e => {
      const add = e.target.closest(".np-padd"); if (add) { const c = dd.dataset.pick; if (c && /^#[0-9a-f]{6}$/.test(c)) { setPresets(kind, [...presets(kind).filter(x => x !== c), c]); drawP(); } return; }
      const b = e.target.closest(".np-pre"); if (!b) return;
      if (pbox.classList.contains("editing")) { setPresets(kind, presets(kind).filter(x => x !== b.dataset.pc)); drawP(); return; }
      addRecent(b.dataset.pc, kind); apply(kind, b.dataset.pc); });
    pbox.addEventListener("contextmenu", e => { const b = e.target.closest(".np-pre"); if (!b) return; e.preventDefault(); e.stopPropagation(); setPresets(kind, presets(kind).filter(x => x !== b.dataset.pc)); drawP(); });
    drawP();
    const sp = dd.querySelector(".np-spec"), gr = dd.querySelector(".np-grey"), hex = dd.querySelector(".np-hex"), prev = dd.querySelector(".np-cprev");
    const g = sp.getContext("2d", { willReadFrequently: true }), W = sp.width, H = sp.height;
    const hg = g.createLinearGradient(0, 0, W, 0); for (let i = 0; i <= 12; i++) hg.addColorStop(i / 12, `hsl(${i * 30},100%,50%)`);
    g.fillStyle = hg; g.fillRect(0, 0, W, H);
    const vg = g.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, "rgba(255,255,255,.92)"); vg.addColorStop(.5, "rgba(255,255,255,0)"); vg.addColorStop(.5, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,.88)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const gg = gr.getContext("2d", { willReadFrequently: true }), grd = gg.createLinearGradient(0, 0, gr.width, 0); grd.addColorStop(0, "#fff"); grd.addColorStop(1, "#000"); gg.fillStyle = grd; gg.fillRect(0, 0, gr.width, gr.height);
    const show = c => { prev.style.background = c; hex.value = c.toUpperCase(); dd.dataset.pick = c; };
    show(HL ? (cur.hl || rc[0] || "#ffe066") : /^#[0-9a-f]{6}$/i.test(rgbHex(cur.color)) ? rgbHex(cur.color) : "#f2b84b");
    const pickAt = (cv, ctx, e) => { const r = cv.getBoundingClientRect(), x = Math.max(0, Math.min(cv.width - 1, (e.clientX - r.left) / r.width * cv.width)), y = Math.max(0, Math.min(cv.height - 1, (e.clientY - r.top) / r.height * cv.height));
      const d = ctx.getImageData(x | 0, y | 0, 1, 1).data; return toHex(d[0], d[1], d[2]); };
    [[sp, g], [gr, gg]].forEach(([cv, ctx]) => {
      cv.addEventListener("pointerdown", e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); show(pickAt(cv, ctx, e)); cv._drag = true; });
      cv.addEventListener("pointermove", e => { if (cv._drag) show(pickAt(cv, ctx, e)); });
      cv.addEventListener("pointerup", e => { if (!cv._drag) return; cv._drag = false; const c = pickAt(cv, ctx, e); addRecent(c, kind); apply(kind, c); });
    });
    hex.addEventListener("input", () => { const v = hex.value.trim().replace(/^([0-9a-f]{6})$/i, "#$1"); if (/^#[0-9a-f]{6}$/i.test(v)) { prev.style.background = v; dd.dataset.pick = v.toLowerCase(); } });
    hex.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); dd.querySelector(".np-capply").click(); } });
    dd.querySelector(".np-capply").addEventListener("click", () => { const c = dd.dataset.pick; if (c) { addRecent(c, kind); apply(kind, c); } });
  }
  dd.addEventListener("mousedown", e => { if (!e.target.closest("input")) e.preventDefault(); }); // keep the selection in the note
  dd.addEventListener("click", e => { const b = e.target.closest("button[data-v], button[data-c]"); if (!b) return; apply(kind, b.dataset.v != null ? b.dataset.v : b.dataset.c); });
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
  if (kind === "p") { if (headAt(el)) document.execCommand("formatBlock", false, "div"); return; } // Normal text
  if (/^h[12346]$/.test(kind)) { // a title or heading; the same one again makes it a normal line (the old H did that too)
    document.execCommand("formatBlock", false, el && el.closest(kind) ? "div" : kind); return; }
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
// a paranote's text: [words](https://…) and bare https:// addresses become links (notes.js uses the same rules)
function annHTML(t) {
  const out = [], rest = String(t || ""), re = /\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g; let m, at = 0;
  while ((m = re.exec(rest))) { out.push(esc(rest.slice(at, m.index))); const url = m[2] || m[3], label = m[1] || m[3];
    out.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(url)}">${esc(label)}</a>`); at = m.index + m[0].length; }
  out.push(esc(rest.slice(at))); return out.join("").replace(/\n/g, "<br>");
}
/* ---------- code box for showing code to people (v0.5.6, Devon): My Code is where code is written and run; the Code box is
   for illustrating, giving examples and explaining code to business and personal associates. On top of highlighting, line
   numbers, Copy and paranotes on code: highlighted lines (click a line number, or type "3-5, 9"), a file-name tab, a caption,
   a look (like the app, dark, light, high contrast), a text size, line numbers on or off, Before / after with a Compare view
   (side by side, or only the changes with + / −), ⤢ Present (full window, big text, ← / → step through the highlighted
   lines), and Copy as a picture (a PNG for slides, email or chat). All of it is kept in the box's data-src. ---------- */
const CODE_LOOKS = [["theme", "Like the app"], ["dark", "Dark"], ["light", "Light"], ["contrast", "High contrast"]];
const CODE_SIZES = [["s", 12, "Small"], ["m", 13.5, "Normal"], ["l", 16, "Large"], ["xl", 19, "Extra large"]];
// "3-5, 9" → Set {3, 4, 5, 9} (1-based line numbers; at most `max` when given)
function parseLines(s, max) {
  const out = new Set();
  String(s || "").replace(/\s*[-–—]\s*/g, "-").split(/[\s,;]+/).forEach(p => { const m = p.match(/^(\d+)(?:-(\d+))?$/); if (!m) return;
    let a = +m[1], b = m[2] ? +m[2] : a; if (a > b) [a, b] = [b, a]; for (let i = Math.max(1, a); i <= Math.min(b, a + 999); i++) if (!max || i <= max) out.add(i); });
  return out;
}
// Set {3, 4, 5, 9} → [[3, 5], [9, 9]] and "3-5, 9"
const lineGroups = set => { const g = []; [...set].sort((a, b) => a - b).forEach(n => { const l = g[g.length - 1]; if (l && n === l[1] + 1) l[1] = n; else g.push([n, n]); }); return g; };
const formatLines = set => lineGroups(set).map(([a, b]) => a === b ? String(a) : a + "-" + b).join(", ");
// line diff (longest common subsequence): [{ t: "=" | "-" | "+", a: line in before, b: line in after }] (0-based)
function lineDiff(before, after) {
  const A = String(before).split("\n"), B = String(after).split("\n");
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let e = 0; while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e++;
  const a = A.slice(s, A.length - e), b = B.slice(s, B.length - e), ops = [];
  for (let i = 0; i < s; i++) ops.push({ t: "=", a: i, b: i });
  if (a.length * b.length > 4e6) { a.forEach((_, i) => ops.push({ t: "-", a: s + i })); b.forEach((_, j) => ops.push({ t: "+", b: s + j })); }
  else {
    const L = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) { ops.push({ t: "=", a: s + i, b: s + j }); i++; j++; }
      else if (i < a.length && (j >= b.length || L[i + 1][j] >= L[i][j + 1])) { ops.push({ t: "-", a: s + i }); i++; } // removed lines before added ones
      else { ops.push({ t: "+", b: s + j }); j++; }
    }
  }
  for (let k = 0; k < e; k++) ops.push({ t: "=", a: A.length - e + k, b: B.length - e + k });
  return ops;
}
// the diff as rows side by side: removed and added lines next to each other where they replace each other
function diffRows(ops) {
  const rows = []; let k = 0;
  while (k < ops.length) {
    if (ops[k].t === "=") { rows.push({ a: ops[k].a, b: ops[k].b, t: "=" }); k++; continue; }
    const del = [], add = []; while (k < ops.length && ops[k].t !== "=") { (ops[k].t === "-" ? del : add).push(ops[k]); k++; }
    for (let i = 0; i < Math.max(del.length, add.length); i++) rows.push({ a: del[i] ? del[i].a : null, b: add[i] ? add[i].b : null, t: "~" });
  }
  return rows;
}
const LOOK_COLORS = {
  dark: { bg: "#0d1117", text: "#e6edf3", kw: "#d2a8ff", bi: "#ffa657", str: "#a5d6ff", num: "#79c0ff", com: "#8b949e", gut: "#6e7681", band: "rgba(255,214,102,.16)", bar: "#161b22" },
  light: { bg: "#fbfbfd", text: "#1d2330", kw: "#7a3fd1", bi: "#0b6f8a", str: "#1f7a3a", num: "#a35c00", com: "#7d8592", gut: "#9aa1ad", band: "rgba(255,196,0,.22)", bar: "#eceef3" },
  contrast: { bg: "#000000", text: "#ffffff", kw: "#ff9de2", bi: "#7fdcff", str: "#9dff9d", num: "#ffd166", com: "#c8c8c8", gut: "#c8c8c8", band: "rgba(255,255,0,.28)", bar: "#1a1a1a" } };
function themeColors(el) {
  const cs = getComputedStyle(el), v = k => cs.getPropertyValue(k).trim();
  return { bg: v("--panel") || "#141b26", text: v("--text") || "#e8edf5", kw: v("--violet") || "#B49BFF", bi: v("--cyan") || "#5CC8E0", str: v("--green") || "#7BD88F", num: v("--amber") || "#F2B84B", com: v("--faint") || "#7d8798", gut: v("--faint") || "#7d8798", band: "rgba(242,184,75,.16)", bar: v("--panel-2") || "#1b2330" };
}
function mountCode(el) {
  const d = readSrc(el, { lang: "python", title: "", src: "" });
  const sizeOf = k => (CODE_SIZES.find(x => x[0] === k) || CODE_SIZES[1]);
  let srcText = String(d.src || ""), beforeText = String(d.before || ""), cur = d.diff ? (d.tab === "compare" ? "compare" : "after") : "after";
  const opt = { hl: String(d.hl || ""), file: String(d.file || ""), cap: String(d.cap || ""), look: CODE_LOOKS.some(x => x[0] === d.look) ? d.look : "theme", size: sizeOf(d.size)[0], nums: d.nums !== false, diff: !!d.diff, cmp: d.cmp === "unified" ? "unified" : "split" };
  el.innerHTML = `<div class="nw-h"><span class="nw-tag">&lt;/&gt;</span><input class="nw-title" maxlength="80" placeholder="Code" aria-label="Code box title" value="${esc(d.title)}">
      <select class="nw-lang" aria-label="Language">${LANGS.map(([k, n]) => `<option value="${k}"${d.lang === k ? " selected" : ""}>${n}</option>`).join("")}</select>
      <button type="button" class="nw-b" data-a="copy" title="Copy the code">Copy</button><button type="button" class="nw-b" data-a="img" title="Copy the code as a picture, to paste into slides, an email or a chat">Picture</button><button type="button" class="nw-b" data-a="present" title="Present the code: full window, big text; ← / → step through the highlighted lines">⤢ Present</button><button type="button" class="nw-b nw-optb" data-a="opts" aria-expanded="false" title="File name, highlighted lines, look, size, line numbers, before / after">⚙ Options</button><button type="button" class="nw-b nw-del" data-a="del" title="Remove this code box" aria-label="Remove code box">✕</button></div>
    <div class="nw-opts" hidden>
      <label class="nw-o"><span>File name</span><input class="nw-file" maxlength="80" placeholder="e.g. app.py" value="${esc(opt.file)}"></label>
      <label class="nw-o"><span>Highlight lines</span><input class="nw-hlin" maxlength="120" placeholder="e.g. 3-5, 9" value="${esc(opt.hl)}"></label>
      <label class="nw-o"><span>Look</span><select class="nw-look">${CODE_LOOKS.map(([k, n]) => `<option value="${k}"${opt.look === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="nw-o"><span>Text size</span><select class="nw-size">${CODE_SIZES.map(([k, , n]) => `<option value="${k}"${opt.size === k ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="nw-ck"><input type="checkbox" class="nw-nums"${opt.nums ? " checked" : ""}> Line numbers</label>
      <label class="nw-ck"><input type="checkbox" class="nw-diffon"${opt.diff ? " checked" : ""}> Before / after</label>
      <p class="nw-opth">Tip: click a line number to highlight that line. A caption goes under the code.</p></div>
    <div class="nw-tabs" role="tablist" aria-label="Before and after" hidden><button type="button" role="tab" data-tab="before">Before</button><button type="button" role="tab" data-tab="after">After</button><button type="button" role="tab" data-tab="compare">Compare</button>
      <select class="nw-cmpm" aria-label="How to compare"><option value="split">Side by side</option><option value="unified">Changes only (+ / −)</option></select><span class="nw-dsum num"></span></div>
    <div class="nw-ftab" hidden></div>
    <div class="nw-code"><div class="nw-gut" aria-label="Line numbers: click one to highlight the line"></div><div class="nw-edit"><div class="nw-bands" aria-hidden="true"></div><pre class="nw-hl" aria-hidden="true"></pre><textarea class="nw-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code"></textarea></div></div>
    <div class="nw-cmp" hidden></div>
    <input class="nw-cap" maxlength="200" placeholder="Add a caption under the code…" aria-label="Caption" value="${esc(opt.cap)}">`;
  const $q = s => el.querySelector(s);
  const ta = $q(".nw-ta"), hl = $q(".nw-hl"), gut = $q(".nw-gut"), lang = $q(".nw-lang"), title = $q(".nw-title"), bands = $q(".nw-bands"), cmp = $q(".nw-cmp"), tabs = $q(".nw-tabs"), ftab = $q(".nw-ftab"), cap = $q(".nw-cap"), opts = $q(".nw-opts");
  ta.value = cur === "before" ? beforeText : srcText;
  let anns = Array.isArray(d.anns) ? d.anns.filter(a => a && /^[a-z0-9]{4,24}$/i.test(a.id) && a.end > a.start).map(a => ({ id: a.id, start: +a.start, end: +a.end, text: String(a.text || "").slice(0, 4000) })) : [];
  const marked = () => parseLines(opt.hl, srcText.split("\n").length);
  const look = () => { el.dataset.look = opt.look; el.style.setProperty("--nw-fs", sizeOf(opt.size)[1] + "px"); el.classList.toggle("nw-nonums", !opt.nums); el.classList.toggle("has-cap", !!opt.cap); ftab.hidden = !opt.file; ftab.textContent = opt.file; };
  const drawBands = () => {
    if (cur === "before") { bands.innerHTML = ""; return; }
    const cs = getComputedStyle(hl), lh = parseFloat(cs.lineHeight) || 21, pt = parseFloat(cs.paddingTop) || 10;
    bands.innerHTML = lineGroups(marked()).map(([a, b]) => `<i style="top:${pt + (a - 1) * lh - ta.scrollTop}px;height:${(b - a + 1) * lh}px"></i>`).join("");
  };
  const diffHTML = () => {
    const A = beforeText.split("\n"), B = srcText.split("\n"), ops = lineDiff(beforeText, srcText), L = lang.value;
    const add = ops.filter(o => o.t === "+").length, del = ops.filter(o => o.t === "-").length;
    $q(".nw-dsum").textContent = add || del ? `+${add} −${del} line${add + del === 1 ? "" : "s"}` : "No changes yet";
    if (opt.cmp === "unified") return `<div class="nw-cu">${ops.map(o => `<div class="nw-cr ${o.t === "+" ? "add" : o.t === "-" ? "del" : ""}"><span class="nw-cn">${o.a != null ? o.a + 1 : ""}</span><span class="nw-cn">${o.b != null ? o.b + 1 : ""}</span><span class="nw-cm">${o.t === "+" ? "+" : o.t === "-" ? "−" : ""}</span><span class="nw-cc">${hlLine(o.t === "+" ? B[o.b] : A[o.a], L) || " "}</span></div>`).join("")}</div>`;
    return `<div class="nw-cs"><div class="nw-csh"><span></span><span>Before</span><span></span><span>After</span></div>${diffRows(ops).map(r => `<div class="nw-cr ${r.t === "~" ? "chg" : ""}"><span class="nw-cn">${r.a != null ? r.a + 1 : ""}</span><span class="nw-cc ${r.t === "~" && r.a != null ? "del" : r.t === "~" ? "gap" : ""}">${r.a != null ? hlLine(A[r.a], L) || " " : ""}</span><span class="nw-cn">${r.b != null ? r.b + 1 : ""}</span><span class="nw-cc ${r.t === "~" && r.b != null ? "add" : r.t === "~" ? "gap" : ""}">${r.b != null ? hlLine(B[r.b], L) || " " : ""}</span></div>`).join("")}</div>`;
  };
  const draw = () => {
    look();
    tabs.hidden = !opt.diff; tabs.querySelectorAll("[data-tab]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === cur))); $q(".nw-cmpm").value = opt.cmp; $q(".nw-cmpm").hidden = cur !== "compare";
    el.classList.toggle("nw-cmpon", cur === "compare"); cmp.hidden = cur !== "compare";
    if (cur === "compare") { cmp.innerHTML = diffHTML(); el.classList.remove("nw-annon"); return; }
    if (opt.diff) diffHTML(); // keeps the +/− count in the tabs up to date
    const ls = ta.value.split("\n"), mk = cur === "before" ? new Set() : marked();
    hl.innerHTML = ls.map(l => hlLine(l, lang.value) || " ").join("\n") + "\n";
    gut.innerHTML = ls.map((_, i) => `<span data-ln="${i + 1}"${mk.has(i + 1) ? ' class="on"' : ""}>${i + 1}</span>`).join("");
    ta.rows = Math.max(3, Math.min(24, ls.length + 1)); el.classList.toggle("nw-isbefore", cur === "before");
    requestAnimationFrame(drawBands); annView();
  };
  const save = () => { const o = { lang: lang.value, title: title.value.trim(), src: srcText };
    if (anns.length) o.anns = anns; if (opt.hl.trim()) o.hl = opt.hl.trim(); if (opt.file.trim()) o.file = opt.file.trim(); if (opt.cap.trim()) o.cap = opt.cap.trim();
    if (opt.look !== "theme") o.look = opt.look; if (opt.size !== "m") o.size = opt.size; if (!opt.nums) o.nums = false;
    if (opt.diff) { o.diff = true; o.before = beforeText; if (opt.cmp !== "split") o.cmp = opt.cmp; if (cur === "compare") o.tab = "compare"; }
    writeSrc(el, o); };
  /* paranotes on code (Devon, Oct 12 2026): { id, start, end, text } over the source (the After code); they follow edits
     (shifted, or dropped when their code is deleted). While shown and the box is not being typed in, a view replaces the
     editor: each line with its number, the noted code marked, and the note under its line with a right-angled line from the
     middle of the code. Click the code to type again; the notes come back when you leave the box. */
  let prev = srcText, showAnn = (() => { try { return localStorage.getItem("notepath.indshow") !== "false"; } catch (e) { return true; } })();
  const view = document.createElement("div"); view.className = "nw-annv"; view.hidden = true; $q(".nw-code").after(view);
  const track = () => { const v = ta.value; if (v === prev) return; let a = 0; while (a < prev.length && a < v.length && prev[a] === v[a]) a++;
    let b = 0; while (b < prev.length - a && b < v.length - a && prev[prev.length - 1 - b] === v[v.length - 1 - b]) b++;
    const oldEnd = prev.length - b, newEnd = v.length - b, delta = v.length - prev.length;
    anns = anns.map(x => { if (x.end <= a) return x; if (x.start >= oldEnd) return Object.assign({}, x, { start: x.start + delta, end: x.end + delta });
      const st = x.start < a ? x.start : (x.end > oldEnd ? newEnd : a), en = x.end > oldEnd ? x.end + delta : newEnd; return Object.assign({}, x, { start: st, end: Math.max(st, en) }); })
      .filter(x => x.end > x.start && v.slice(x.start, x.end).trim());
    prev = v; };
  function annView() {
    const on = showAnn && anns.length && document.activeElement !== ta && cur === "after";
    const was = el.classList.contains("nw-annon");
    el.classList.toggle("nw-annon", !!on); view.hidden = !on; if (!on) { view.innerHTML = ""; if (was) el.dispatchEvent(new Event("np:ann-layout", { bubbles: true })); return; }
    const v = srcText, ls = v.split("\n"), starts = []; let p = 0; ls.forEach(l => { starts.push(p); p += l.length + 1; });
    const mk = marked(), byLine = {}; anns.forEach(x => { const i = starts.findIndex((s0, k) => x.start >= s0 && x.start <= s0 + ls[k].length); if (i >= 0) (byLine[i] = byLine[i] || []).push(x); });
    view.innerHTML = ls.map((l, i) => {
      const here = (byLine[i] || []).sort((x, y) => x.start - y.start); let html = "", at = 0;
      here.forEach(x => { const a0 = Math.max(at, x.start - starts[i]), b0 = Math.min(l.length, x.end - starts[i]); if (b0 <= a0) return;
        html += hlLine(l.slice(at, a0), lang.value) + `<span class="nann-cw" data-cann="${x.id}">${hlLine(l.slice(a0, b0), lang.value)}</span>`; at = b0; });
      html += hlLine(l.slice(at), lang.value);
      return `<div class="nw-al${mk.has(i + 1) ? " on" : ""}" data-line="${i}"><span class="nw-an">${i + 1}</span><span class="nw-ac">${html || " "}</span></div>`
        + here.map(x => `<div class="nann-cblk" data-cann="${x.id}"><div class="nann-card nann-ccard" data-cann="${x.id}" title="Click to edit this paranote">${x.text ? annHTML(x.text) : '<i class="nann-empty">Empty paranote</i>'}</div></div>`).join("");
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
    list: () => anns.map(x => ({ id: x.id, words: srcText.slice(x.start, x.end), text: x.text, code: true })),
    has: id => anns.some(x => x.id === id),
    add(text) { if (cur !== "after") return { error: "Paranotes go on the After code: open the After tab first." };
      const a = ta.selectionStart, b = ta.selectionEnd, v = ta.value;
      if (document.activeElement !== ta && !el.contains(document.activeElement)) return { error: "Select the code first." };
      if (b <= a || !v.slice(a, b).trim()) return { error: "Select the code first." };
      if (v.slice(a, b).includes("\n")) return { error: "Select code on one line." };
      if (anns.some(x => a < x.end && b > x.start)) return { error: "That code already has a paranote." };
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7); anns.push({ id, start: a, end: b, text: String(text || "") }); save(); return { id }; },
    set(id, text) { const x = anns.find(y => y.id === id); if (!x) return false; x.text = String(text || "").slice(0, 4000); save(); annView(); return true; },
    remove(id) { const n = anns.length; anns = anns.filter(y => y.id !== id); if (anns.length === n) return false; save(); annView(); return true; },
    show(on) { showAnn = !!on; annView(); },
    focus(id) { const w = view.querySelector(`.nann-cw[data-cann="${id}"]`) || el; w.scrollIntoView({ block: "nearest" }); if (w !== el) { w.classList.add("nann-hi"); setTimeout(() => w.classList.remove("nann-hi"), 900); } },
    relayout: () => annView()
  };
  const edited = () => { if (cur === "before") beforeText = ta.value; else { track(); srcText = ta.value; } draw(); save(); };
  const stop = e => e.stopPropagation();
  ta.addEventListener("input", e => { e.stopPropagation(); edited(); });
  title.addEventListener("input", e => { e.stopPropagation(); save(); });
  lang.addEventListener("change", () => { draw(); save(); });
  ta.addEventListener("scroll", () => { hl.scrollLeft = ta.scrollLeft; drawBands(); });
  ta.addEventListener("keydown", e => {
    if (e.key !== "Tab") return;
    e.preventDefault();
    const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value, ls = v.lastIndexOf("\n", s - 1) + 1;
    if (e.shiftKey) { const cut = v.slice(ls).match(/^ {1,4}/); if (cut) { ta.value = v.slice(0, ls) + v.slice(ls + cut[0].length); ta.selectionStart = ta.selectionEnd = Math.max(ls, s - cut[0].length); } }
    else { ta.value = v.slice(0, s) + "    " + v.slice(en); ta.selectionStart = ta.selectionEnd = s + 4; }
    edited();
  });
  // options
  $q('[data-a="opts"]').onclick = e => { const open = opts.hidden; opts.hidden = !open; el.classList.toggle("nw-optson", open); e.currentTarget.setAttribute("aria-expanded", String(open)); };
  [".nw-file", ".nw-hlin", ".nw-cap"].forEach(s => { const i = $q(s); i.addEventListener("keydown", stop); i.addEventListener("input", e => { e.stopPropagation();
    if (s === ".nw-file") opt.file = i.value; else if (s === ".nw-hlin") opt.hl = i.value; else opt.cap = i.value; draw(); save(); }); });
  $q(".nw-look").onchange = e => { opt.look = e.target.value; draw(); save(); };
  $q(".nw-size").onchange = e => { opt.size = e.target.value; draw(); save(); };
  $q(".nw-nums").onchange = e => { opt.nums = e.target.checked; draw(); save(); };
  $q(".nw-diffon").onchange = e => { opt.diff = e.target.checked;
    if (opt.diff && !beforeText) beforeText = srcText; // start with the same code: change the After tab to show what changed
    if (!opt.diff && cur !== "after") { cur = "after"; ta.value = srcText; prev = srcText; }
    draw(); save(); };
  gut.addEventListener("mousedown", e => e.preventDefault());
  gut.addEventListener("click", e => { const s = e.target.closest("[data-ln]"); if (!s || cur === "before") return; const set = marked(), n = +s.dataset.ln; set.has(n) ? set.delete(n) : set.add(n);
    opt.hl = formatLines(set); $q(".nw-hlin").value = opt.hl; draw(); save(); });
  tabs.addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (!b || b.dataset.tab === cur) return;
    cur = b.dataset.tab; if (cur !== "compare") { ta.value = cur === "before" ? beforeText : srcText; prev = srcText; } draw(); save(); });
  $q(".nw-cmpm").onchange = e => { opt.cmp = e.target.value; draw(); save(); };
  $q('[data-a="copy"]').onclick = e => { const b = e.currentTarget, t = cur === "before" ? beforeText : srcText; let ok = false;
    if (cur !== "compare") { ta.select(); try { ok = document.execCommand("copy"); } catch (err) {} }
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(t); b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1400); };
  $q('[data-a="img"]').onclick = async e => { const b = e.currentTarget; b.disabled = true; try { b.textContent = (await copyPicture()) ? "Copied" : "Saved"; } catch (err) { b.textContent = "Not copied"; } setTimeout(() => { b.textContent = "Picture"; b.disabled = false; }, 1600); };
  $q('[data-a="present"]').onclick = () => present();
  const colors = () => opt.look === "theme" ? themeColors(el) : LOOK_COLORS[opt.look];
  // Copy as a picture: the code drawn on a canvas (title bar with the file name, highlighted lines, caption), as a PNG
  async function copyPicture() {
    const C = colors(), S = 2, fs = Math.max(13, sizeOf(opt.size)[1] + 1), lh = Math.round(fs * 1.6), pad = 22;
    const lines = srcText.replace(/\t/g, "    ").split("\n"), mk = marked(), font = `${fs}px "IBM Plex Mono", Menlo, Consolas, monospace`;
    const cv = document.createElement("canvas"), g = cv.getContext("2d"); g.font = font;
    const cw = g.measureText("M").width, gutW = opt.nums ? Math.ceil(String(lines.length).length * cw + 22) : 0;
    const head = 34, capH = opt.cap.trim() ? Math.round(fs * 2.4) : 0;
    const W = Math.min(2400, Math.max(420, Math.ceil(gutW + pad * 2 + Math.max(...lines.map(l => l.length)) * cw))), H = head + pad + lines.length * lh + pad + capH;
    cv.width = W * S; cv.height = H * S; g.scale(S, S);
    g.fillStyle = C.bg; g.fillRect(0, 0, W, H); g.fillStyle = C.bar; g.fillRect(0, 0, W, head);
    ["#ff5f57", "#febc2e", "#28c840"].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(18 + i * 18, head / 2, 5.5, 0, Math.PI * 2); g.fill(); });
    g.font = `600 ${Math.round(fs * .9)}px "IBM Plex Sans", system-ui, sans-serif`; g.fillStyle = C.com; g.textBaseline = "middle";
    const label = [opt.file.trim(), title.value.trim()].filter(Boolean).join("  ·  "); if (label) g.fillText(label, 80, head / 2);
    g.font = font; g.textBaseline = "alphabetic";
    lineGroups(mk).forEach(([a, b]) => { g.fillStyle = C.band; g.fillRect(0, head + pad + (a - 1) * lh, W, (b - a + 1) * lh); });
    const tpl = document.createElement("template");
    lines.forEach((l, i) => {
      const y = head + pad + i * lh + Math.round(lh * .72);
      if (opt.nums) { g.fillStyle = C.gut; g.textAlign = "right"; g.fillText(String(i + 1), gutW - 10, y); g.textAlign = "left"; }
      tpl.innerHTML = hlLine(l, lang.value); let x = gutW + pad;
      tpl.content.childNodes.forEach(nd => { const t = nd.textContent; if (!t) return; const k = nd.nodeType === 1 ? nd.className : ""; g.fillStyle = C[k] || C.text; g.fillText(t, x, y); x += g.measureText(t).width; });
    });
    if (capH) { g.font = `italic ${Math.round(fs * .95)}px "IBM Plex Sans", system-ui, sans-serif`; g.fillStyle = C.com; g.fillText(opt.cap.trim(), pad, H - capH / 2 + fs * .3); }
    const blob = await new Promise(r => cv.toBlob(r, "image/png"));
    el._picture = blob; // for the tests
    try { if (navigator.clipboard && window.ClipboardItem) { await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]); toastW("The code is copied as a picture: paste it into slides, an email or a chat."); return true; } } catch (err) {}
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = (opt.file.trim() || title.value.trim() || "code").replace(/[\\/:*?"<>|]/g, "-") + ".png"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toastW("The picture of the code is saved in your downloads."); return false;
  }
  // ⤢ Present: the code over the whole window, big; ← / → step through the highlighted lines (the rest dims); Esc closes
  function present() {
    const groups = lineGroups(marked()), ov = document.createElement("div"); let step = -1, fs = 24, show = cur === "compare" ? "compare" : "code";
    ov.className = "nw-present"; ov.dataset.look = opt.look; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-label", "Present the code"); ov.tabIndex = -1;
    const name = title.value.trim() || opt.file.trim() || "Code", lname = (LANGS.find(x => x[0] === lang.value) || ["", ""])[1];
    ov.innerHTML = `<div class="nwp-bar"><span class="nwp-t">${esc(name)}</span>${opt.file.trim() && title.value.trim() ? `<span class="nwp-f">${esc(opt.file.trim())}</span>` : ""}<span class="nwp-l">${esc(lname)}</span><span class="nwp-sp"></span>
      ${groups.length ? `<button type="button" data-p="prev" title="Previous highlighted lines (←)">←</button><span class="nwp-step num"></span><button type="button" data-p="next" title="Next highlighted lines (→)">→</button>` : ""}
      ${opt.diff ? `<button type="button" data-p="view">${show === "compare" ? "Show the code" : "Compare before / after"}</button>` : ""}
      <button type="button" data-p="smaller" title="Smaller text (−)" aria-label="Smaller text">A−</button><button type="button" data-p="bigger" title="Bigger text (+)" aria-label="Bigger text">A+</button><button type="button" data-p="close" title="Close (Esc)">✕ Close</button></div>
      <div class="nwp-body"></div>${opt.cap.trim() ? `<div class="nwp-cap">${esc(opt.cap.trim())}</div>` : ""}`;
    const body = ov.querySelector(".nwp-body");
    const render = () => {
      ov.style.setProperty("--nwp-fs", fs + "px"); const st = ov.querySelector(".nwp-step"); if (st) st.textContent = step < 0 ? `All · ${groups.length} highlighted` : `${step + 1} / ${groups.length}`;
      if (show === "compare") { body.innerHTML = `<div class="nw-cmp nwp-cmp">${diffHTML()}</div>`; return; }
      const ls = srcText.split("\n"), mk = marked(), g = step >= 0 ? groups[step] : null;
      body.innerHTML = `<div class="nwp-code${opt.nums ? "" : " nonums"}">${ls.map((l, i) => { const n = i + 1, inG = g && n >= g[0] && n <= g[1];
        return `<div class="nwp-ln${mk.has(n) ? " on" : ""}${g ? (inG ? " focus" : " dim") : ""}" data-ln="${n}"><span class="nwp-n">${n}</span><span class="nwp-c">${hlLine(l, lang.value) || " "}</span></div>`; }).join("")}</div>`;
      if (g) { const t = body.querySelector(`[data-ln="${g[0]}"]`); if (t) t.scrollIntoView({ block: "center", behavior: "smooth" }); }
    };
    const close = () => { ov.remove(); window.removeEventListener("keydown", key, true); const b = $q('[data-a="present"]'); if (b) b.focus({ preventScroll: true }); };
    const go = d2 => { if (!groups.length) return; step = step + d2; if (step >= groups.length) step = -1; else if (step < -1) step = groups.length - 1; render(); };
    const key = e => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setTimeout(close, 0); return; } // after Settings' own Esc check has seen the box
      if (e.target && e.target.closest && e.target.closest("select,input")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); go(1); } else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (e.key === "+" || e.key === "=") { fs = Math.min(48, fs + 2); render(); } else if (e.key === "-") { fs = Math.max(14, fs - 2); render(); } };
    ov.addEventListener("click", e => { const b = e.target.closest("[data-p]"); if (!b) return; const p = b.dataset.p;
      if (p === "close") close(); else if (p === "next") go(1); else if (p === "prev") go(-1); else if (p === "bigger") { fs = Math.min(48, fs + 2); render(); } else if (p === "smaller") { fs = Math.max(14, fs - 2); render(); }
      else if (p === "view") { show = show === "compare" ? "code" : "compare"; b.textContent = show === "compare" ? "Show the code" : "Compare before / after"; render(); } });
    document.body.appendChild(ov); window.addEventListener("keydown", key, true); render(); ov.focus({ preventScroll: true });
  }
  [title, cap].forEach(i => i.addEventListener("keydown", stop));
  delButton(el);
  draw();
}
const toastW = t => { if (window.InquireNotes && InquireNotes.toast) InquireNotes.toast(esc(t), null, 3500); };
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
  else if (el.dataset.w === "map" && window.NPMap) { NPMap.mount(el); delButton(el); }
}
function create(type, data) {
  const el = document.createElement("div"); el.className = "nw"; el.dataset.w = type;
  el.dataset.src = JSON.stringify(type === "sheet" ? Object.assign({}, window.NPSheet ? NPSheet.DEF : {}, data || {}) : type === "graph" ? Object.assign({}, window.NPGraph ? NPGraph.DEF : {}, data || {}) : type === "video" ? Object.assign({ title: "" }, data || {}) : type === "map" ? Object.assign({}, window.NPMap ? NPMap.DEF : {}, data || {}) : type === "code" ? Object.assign({ lang: "python", title: "", src: "" }, data || {}) : { title: "", clef: "treble", time: "4/4", tempo: 90, seq: "" });
  return el;
}
// plain-text version for search, previews and .md export
function text(el) {
  const d = readSrc(el, {});
  if (el.dataset.w === "code") return "\n```" + (d.lang && d.lang !== "text" ? d.lang : "") + (d.title || d.file ? " " + (d.title || d.file) : "") + "\n" + (d.src || "") + "\n```\n" + (d.cap ? d.cap + "\n" : "");
  if (el.dataset.w === "graph") return window.NPGraph ? NPGraph.text(d) : "";
  if (el.dataset.w === "map") return window.NPMap ? NPMap.text(d) : "";
  if (el.dataset.w === "sheet") return window.NPSheet ? NPSheet.text(el) : "";
  if (el.dataset.w === "video") { const l = videoLink(d); return "\n▶ " + (d.title || "Video") + (l ? " (" + l + ")" : "") + "\n"; }
  if (el.dataset.w === "music") return "\n♪ " + (d.title ? d.title + ": " : "") + (d.seq || "(empty)") + (d.time ? " [" + d.time + ", " + (d.clef || "treble") + " clef]" : "") + "\n";
  return "";
}
window.InquireWidgets = { WIDGETS: WIDGET_MENU, codeKit: { parseLines, formatLines, lineGroups, lineDiff, diffRows }, toolbar, mount, create, text, colorKey, COLORS, parseSeq, chordNotes, videoFrom, videoPanel,
  kit: { splinePath, G_CLEF, F_CLEF, delButton, len, UNITS } }; // shared with notes-sheet.js
})();
