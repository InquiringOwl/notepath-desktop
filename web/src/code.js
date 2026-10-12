/* Code tab of My notes (NotePath, Oct 2026): a code editor in the spirit of Visual Studio Code, in NotePath's console look.
   window.NPCode:
   - LANGS: the languages that run today (Python, C, C++, JavaScript, Java); SOON: languages shown as "Coming soon".
   - pane(el, note, o): fills a My notes editor pane with a code file: ☆ · language · ▶ Run · ⇄ Translate · Save file · Delete,
     the title (with the ⧉ side-by-side drop spot), the editor, an Output / Input panel and a status bar.
     The editor is Monaco (the editor inside VS Code), loaded from vendor/monaco/vs (copied there by tools/build-web.js);
     if it cannot load, a plain code box takes its place so nothing is ever lost.
   - run(lang, src, stdin): JavaScript runs on this computer in a Web Worker (no network); the other languages go to the
     run service chosen in Settings → Code (Judge0 by default; Piston also works). In the desktop app the request is made
     by the main process (preload: inquireDesktop.codeHttp), so the page's CSP stays closed.
   - ai: the AI hook (translate code between languages). The key is never in this page: the desktop main process reads it
     (main.js "ai:*", ai.config.json or NOTEPATH_AI_KEY). ai.status() → { configured, provider, model }; ai.ask({ system, prompt }) → text.
   - settings() / setSettings(o): the run service (localStorage "notepath.code"). */
(function () {
"use strict";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, r) => r.querySelector(s);

const LANGS = [
  { k: "python", name: "Python", short: "PY", ext: "py", monaco: "python", judge: /^Python \(3\./, judgeId: 71, piston: "python",
    hello: 'name = input("What is your name? ")\nprint(f"Hello, {name}!")\n' },
  { k: "c", name: "C", short: "C", ext: "c", monaco: "c", judge: /^C \((GCC|Clang)/, judgeId: 50, piston: "c",
    hello: '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, world!\\n");\n    return 0;\n}\n' },
  { k: "cpp", name: "C++", short: "C++", ext: "cpp", monaco: "cpp", judge: /^C\+\+ \((GCC|Clang)/, judgeId: 54, piston: "c++",
    hello: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, world!" << std::endl;\n    return 0;\n}\n' },
  { k: "javascript", name: "JavaScript", short: "JS", ext: "js", monaco: "javascript", judge: /^JavaScript \(Node/, judgeId: 63, piston: "javascript",
    hello: 'console.log("Hello, world!");\n' },
  { k: "java", name: "Java", short: "JAVA", ext: "java", monaco: "java", judge: /^Java \((OpenJDK|JDK)/, judgeId: 62, piston: "java",
    hello: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, world!");\n    }\n}\n' }];
const SOON = ["TypeScript", "Go", "Rust", "C#", "Kotlin", "Swift", "Ruby", "PHP", "Lua", "R", "SQL", "Bash"];
const L = k => LANGS.find(x => x.k === k) || LANGS[0];

/* ---------- settings: the run service ---------- */
const SKEY = "notepath.code";
const SERVICES = [
  { k: "judge0", name: "Judge0 CE (free public server)", url: "https://ce.judge0.com", note: "Free, no account. Shared and rate-limited: fine for practice, slower at busy times." },
  { k: "rapidapi", name: "Judge0 on RapidAPI (your key)", url: "https://judge0-ce.p.rapidapi.com", note: "Judge0's hosted plans: paste your RapidAPI key. The free plan allows a set number of runs a day." },
  { k: "piston", name: "Piston (your server or key)", url: "https://emkc.org/api/v2/piston", note: "Piston needs a key from its maintainer, or your own Piston server's address." }];
const DEFS = { service: "judge0", url: "", key: "", jsHere: true };
function settings() { let o = {}; try { o = JSON.parse(localStorage.getItem(SKEY) || "{}") || {}; } catch (e) {} return Object.assign({}, DEFS, o); }
function setSettings(p) { const o = Object.assign(settings(), p); try { localStorage.setItem(SKEY, JSON.stringify(o)); } catch (e) {} return o; }
const svc = c => SERVICES.find(s => s.k === c.service) || SERVICES[0];
const baseURL = c => String(c.url || svc(c).url).replace(/\/+$/, "");

/* ---------- running code ---------- */
const b64 = s => btoa(unescape(encodeURIComponent(String(s || ""))));
const unb64 = s => { if (!s) return ""; try { return decodeURIComponent(escape(atob(s))); } catch (e) { return String(s); } };
// one HTTPS request: through the desktop main process when there is one (no CORS, no CSP), else the page's own fetch (browser preview, tests)
async function http(req) {
  if (window.inquireDesktop && inquireDesktop.codeHttp) return inquireDesktop.codeHttp(req);
  const r = await fetch(req.url, { method: req.method || "GET", headers: req.headers || {}, body: req.body });
  let body = null; try { body = await r.json(); } catch (e) {}
  return { status: r.status, body };
}
let judgeLangs = null;
async function judgeId(c, lang) {
  const l = L(lang);
  if (!judgeLangs) {
    try { const r = await http({ url: baseURL(c) + "/languages", headers: hdrs(c) }); judgeLangs = r.status === 200 && Array.isArray(r.body) ? r.body : []; } catch (e) { judgeLangs = []; }
  }
  const ver = n => (String(n).match(/\d+(\.\d+)*/) || ["0"])[0].split(".").map(Number);
  const newer = (a, b) => { const x = ver(a.name), y = ver(b.name); for (let i = 0; i < 4; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0); } return 0; };
  const m = judgeLangs.filter(x => x && l.judge.test(String(x.name || ""))).sort(newer);
  return m.length ? m[0].id : l.judgeId;
}
function hdrs(c) {
  const h = { "Content-Type": "application/json", Accept: "application/json" };
  if (c.service === "rapidapi" && c.key) { h["X-RapidAPI-Key"] = c.key; h["X-RapidAPI-Host"] = new URL(baseURL(c)).host; }
  else if (c.service === "piston" && c.key) h.Authorization = c.key;
  else if (c.key) h["X-Auth-Token"] = c.key;
  return h;
}
async function runJudge0(c, lang, src, stdin) {
  const id = await judgeId(c, lang), base = baseURL(c);
  const r = await http({ url: base + "/submissions?base64_encoded=true&wait=true", method: "POST", headers: hdrs(c), body: JSON.stringify({ source_code: b64(src), language_id: id, stdin: b64(stdin) }) });
  let d = r.body;
  if (r.status === 401 || r.status === 403) throw new Error("The run service refused the request (" + r.status + "). Check the key in Settings → Code.");
  if (r.status === 429) throw new Error("The run service is busy (too many runs). Wait a minute and try again, or add your own key in Settings → Code.");
  if (!d || (r.status !== 200 && r.status !== 201)) throw new Error("The run service did not answer (" + (r.status || "no connection") + ").");
  // servers that do not wait: ask again until it is done (up to ~20 s)
  for (let i = 0; d.token && (!d.status || d.status.id <= 2) && i < 40; i++) {
    await new Promise(res => setTimeout(res, 500));
    const g = await http({ url: base + "/submissions/" + encodeURIComponent(d.token) + "?base64_encoded=true", headers: hdrs(c) }); if (g.body) d = g.body;
  }
  const st = d.status || {};
  return { out: unb64(d.stdout), err: [unb64(d.compile_output), unb64(d.stderr), d.message ? unb64(d.message) : ""].filter(Boolean).join("\n"),
    ok: st.id === 3, status: st.description || "Finished", time: d.time != null ? +d.time : null, where: svc(c).k === "rapidapi" ? "Judge0 (RapidAPI)" : "Judge0" };
}
async function runPiston(c, lang, src, stdin) {
  const l = L(lang);
  const r = await http({ url: baseURL(c) + "/execute", method: "POST", headers: hdrs(c), body: JSON.stringify({ language: l.piston, version: "*", files: [{ name: (l.k === "java" ? "Main" : "main") + "." + l.ext, content: src }], stdin: stdin || "" }) });
  if (r.status === 401 || r.status === 403) throw new Error("Piston refused the request (" + r.status + "). It needs a key or your own server: Settings → Code.");
  if (r.status !== 200 || !r.body) throw new Error("The run service did not answer (" + (r.status || "no connection") + ").");
  const d = r.body, run = d.run || {}, comp = d.compile || {};
  const err = [comp.stderr || (comp.code ? comp.output : ""), run.stderr].filter(Boolean).join("\n");
  return { out: run.stdout || "", err, ok: !comp.code && run.code === 0, status: comp.code ? "Compilation error" : run.signal ? "Stopped (" + run.signal + ")" : "Exit code " + run.code, time: null, where: "Piston" };
}
// JavaScript on this computer: the source becomes a Web Worker of its own (no eval), console.* and prompt() are wired to the panel
function runJS(src, stdin, onOut) {
  return new Promise(res => {
    const pre = `"use strict";var __in=${JSON.stringify(String(stdin || "").split("\n"))},__i=0;const __f=a=>a.map(x=>{if(typeof x==="string")return x;try{return JSON.stringify(x)}catch(e){return String(x)}}).join(" ");
const __p=(k,a)=>postMessage({k,s:__f(a)});self.console={log:(...a)=>__p("out",a),info:(...a)=>__p("out",a),debug:(...a)=>__p("out",a),warn:(...a)=>__p("err",a),error:(...a)=>__p("err",a),table:(...a)=>__p("out",a)};
self.prompt=q=>{if(q)__p("out",[String(q)]);return __i<__in.length?__in[__i++]:null};self.addEventListener("unhandledrejection",e=>{__p("err",["Uncaught (in promise) "+(e.reason&&e.reason.stack||e.reason)]);});
`;
    let url = null, w = null, done = false, out = "", err = "", idle = 0, t1 = 0;
    const t0 = performance.now();
    const fin = (status, ok) => { if (done) return; done = true; clearTimeout(hard); clearTimeout(idle); try { w.terminate(); } catch (e) {} URL.revokeObjectURL(url); res({ out, err, ok, status, time: ((t1 || performance.now()) - t0) / 1000, where: "this computer" }); };
    const hard = setTimeout(() => fin("Stopped after 10 s (still running)", false), 10000);
    try { url = URL.createObjectURL(new Blob([pre, src, "\n;postMessage({k:\"end\"});"], { type: "text/javascript" })); w = new Worker(url); }
    catch (e) { res({ out: "", err: "JavaScript could not start here: " + e.message, ok: false, status: "Not run", time: 0, where: "this computer" }); return; }
    w.onmessage = e => {
      const m = e.data || {};
      if (m.k === "out") { out += m.s + "\n"; if (onOut) onOut("out", m.s + "\n"); }
      else if (m.k === "err") { err += m.s + "\n"; if (onOut) onOut("err", m.s + "\n"); }
      else if (m.k === "end") t1 = performance.now();
      clearTimeout(idle); idle = setTimeout(() => fin("Finished", !err), m.k === "end" ? 400 : 1500); // timers and promises get a moment after the last line
    };
    w.onerror = e => { e.preventDefault(); const s = (e.message || "Error") + (e.lineno ? " (line " + Math.max(1, e.lineno - pre.split("\n").length + 1) + ")" : ""); err += s + "\n"; if (onOut) onOut("err", s + "\n"); fin("Error", false); };
  });
}
async function run(lang, src, stdin, onOut) {
  const c = settings();
  if (lang === "javascript" && c.jsHere !== false) return runJS(src, stdin, onOut);
  if (!navigator.onLine && !(window.inquireDesktop && inquireDesktop.codeHttp)) throw new Error("You are offline. Running " + L(lang).name + " needs the run service (Settings → Code).");
  return c.service === "piston" ? runPiston(c, lang, src, stdin) : runJudge0(c, lang, src, stdin);
}

/* ---------- AI (translate code). Devon plugs the key into the desktop main process; this page only asks it. ---------- */
const ai = {
  async status() {
    try { if (window.inquireDesktop && inquireDesktop.ai) return await inquireDesktop.ai.status(); } catch (e) {}
    return { configured: false };
  },
  async ask(req) {
    if (!(window.inquireDesktop && inquireDesktop.ai)) throw new Error("AI features work in the NotePath app once its AI key is set up.");
    const r = await inquireDesktop.ai.ask(req);
    if (!r || r.error) throw new Error(r && r.error || "The AI service did not answer.");
    return String(r.text || "");
  }
};
async function translate(src, from, to) {
  const a = L(from).name, b = L(to).name;
  const text = await ai.ask({ task: "translate-code",
    system: "You translate source code between programming languages. Reply with only the translated program: no explanations, no Markdown fences.",
    prompt: `Translate this ${a} program into idiomatic ${b} with the same behaviour, input and output.${to === "java" ? " Put it in a public class named Main." : ""} Keep comments, translated where they mention ${a}.\n\n${src}` });
  return text.replace(/^\s*```[\w+#-]*\s*\n/, "").replace(/\n```\s*$/, "").trimEnd() + "\n";
}

/* ---------- Monaco (the editor inside VS Code) ---------- */
let monacoP = null;
function loadMonaco() {
  if (window.monaco && monaco.editor) return Promise.resolve(window.monaco);
  if (monacoP) return monacoP;
  const base = String(window.NP_MONACO_BASE || "").replace(/\/+$/, "");
  if (!base) return Promise.reject(new Error("no editor files"));
  monacoP = new Promise((res, rej) => {
    const abs = new URL(base + "/", location.href).href, cross = new URL(abs).origin !== location.origin;
    window.MonacoEnvironment = { getWorkerUrl: () => cross
      ? "data:text/javascript;charset=utf-8," + encodeURIComponent(`self.MonacoEnvironment={baseUrl:${JSON.stringify(abs + "../")}};importScripts(${JSON.stringify(abs + "base/worker/workerMain.js")});`)
      : abs + "base/worker/workerMain.js" };
    const s = document.createElement("script"); s.src = abs + "loader.js";
    const t = setTimeout(() => rej(new Error("the editor took too long to load")), 20000);
    s.onload = () => { const amd = window.require; if (!amd || !amd.config) { clearTimeout(t); rej(new Error("no loader")); return; }
      amd.config({ paths: { vs: abs.replace(/\/$/, "") } });
      amd(["vs/editor/editor.main"], () => { clearTimeout(t); theme(window.monaco); res(window.monaco); }, e => { clearTimeout(t); rej(e); }); };
    s.onerror = () => { clearTimeout(t); rej(new Error("the editor files are missing")); };
    document.head.appendChild(s);
  });
  monacoP.catch(() => {});
  return monacoP;
}
// the editor's colours follow the NotePath theme (Settings → Appearance)
const cx = document.createElement("canvas").getContext("2d");
function hexA(v, a) { cx.fillStyle = "#000"; cx.fillStyle = String(v || "").trim() || "#000"; let s = cx.fillStyle;
  const m = s.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (m) s = "#" + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join("") + (m[4] != null ? Math.round(+m[4] * 255).toString(16).padStart(2, "0") : "");
  if (a != null) s = s.slice(0, 7) + Math.round(a * 255).toString(16).padStart(2, "0");
  return s; }
function theme(m) {
  if (!m) return;
  const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
  const bg = hexA(v("--ink") || "#070A10"), fr = v("--frame") || "#5CC8E0";
  m.editor.defineTheme("notepath", { base: "vs-dark", inherit: true,
    rules: [{ token: "comment", foreground: hexA(v("--faint") || "#6b7790").slice(1, 7), fontStyle: "italic" }, { token: "keyword", foreground: "B49BFF" }, { token: "string", foreground: "7BD88F" },
      { token: "number", foreground: "F2B84B" }, { token: "type", foreground: "5CC8E0" }, { token: "type.identifier", foreground: "5CC8E0" }, { token: "delimiter", foreground: hexA(v("--muted") || "#a0aec0").slice(1, 7) },
      { token: "regexp", foreground: "F07CA0" }, { token: "annotation", foreground: "D97AE6" }],
    colors: { "editor.background": bg, "editor.foreground": hexA(v("--text") || "#e6edf7"), "editorLineNumber.foreground": hexA(v("--faint") || "#56627a"),
      "editorLineNumber.activeForeground": hexA(fr), "editorCursor.foreground": hexA(fr), "editor.selectionBackground": hexA(fr, .28), "editor.inactiveSelectionBackground": hexA(fr, .14),
      "editor.lineHighlightBackground": "#ffffff08", "editor.lineHighlightBorder": "#00000000", "editorIndentGuide.background1": "#ffffff12", "editorIndentGuide.activeBackground1": hexA(fr, .45),
      "editorWidget.background": hexA(v("--panel") || "#111827"), "editorWidget.border": hexA(v("--line-2") || "#2a3446"), "editorSuggestWidget.selectedBackground": hexA(fr, .22),
      "minimap.background": bg, "scrollbarSlider.background": "#ffffff14", "scrollbarSlider.hoverBackground": hexA(fr, .3), "editorBracketMatch.border": hexA(fr, .7) } });
  m.editor.setTheme("notepath");
}
window.addEventListener("inquire:theme", () => { if (window.monaco && monaco.editor) theme(window.monaco); });

// one editor: Monaco when it loads, else a plain code box (textarea with line numbers). o: { value, lang, onChange, onCursor, onRun }
function editor(host, o) {
  let val = String(o.value || ""), lang = o.lang, ed = null, ta = null, dead = false;
  const ev = { ready: [] };
  host.classList.add("nc-ed"); host.innerHTML = `<div class="nc-loading">Loading the code editor…</div>`;
  const plain = why => {
    if (dead) return;
    host.innerHTML = `<div class="nc-plain"><div class="nc-gut" aria-hidden="true"></div><textarea class="nc-ta" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code"></textarea></div>`;
    host.dataset.kind = "plain"; host.title = why ? "Simple editor (" + why + ")" : "";
    ta = $(".nc-ta", host); const gut = $(".nc-gut", host);
    ta.value = val;
    const lines = () => { gut.innerHTML = ta.value.split("\n").map((_, i) => `<span>${i + 1}</span>`).join(""); };
    const cur = () => { const b = ta.value.slice(0, ta.selectionStart).split("\n"); if (o.onCursor) o.onCursor(b.length, b[b.length - 1].length + 1); };
    lines();
    ta.addEventListener("input", () => { val = ta.value; lines(); if (o.onChange) o.onChange(val); cur(); });
    ta.addEventListener("scroll", () => { gut.scrollTop = ta.scrollTop; });
    ta.addEventListener("keyup", cur); ta.addEventListener("click", cur);
    ta.addEventListener("keydown", e => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (o.onRun) o.onRun(); return; }
      if (e.key !== "Tab") return; e.preventDefault();
      const s = ta.selectionStart; ta.setRangeText("    ", s, ta.selectionEnd, "end"); ta.dispatchEvent(new Event("input"));
    });
    host.dataset.ready = "1"; ev.ready.forEach(f => f());
  };
  loadMonaco().then(m => {
    if (dead) return;
    host.innerHTML = ""; host.dataset.kind = "monaco";
    ed = m.editor.create(host, { value: val, language: L(lang).monaco, theme: "notepath", automaticLayout: true, fontFamily: '"IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace',
      fontSize: 13.5, lineHeight: 21, tabSize: lang === "javascript" ? 2 : 4, insertSpaces: true, minimap: { enabled: true, scale: 1, renderCharacters: false }, scrollBeyondLastLine: false,
      smoothScrolling: true, cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on", bracketPairColorization: { enabled: true }, guides: { bracketPairs: true, indentation: true },
      renderLineHighlight: "all", padding: { top: 10, bottom: 10 }, fixedOverflowWidgets: true, stickyScroll: { enabled: true }, wordWrap: "off", mouseWheelZoom: true, ariaLabel: "Code" });
    ed.onDidChangeModelContent(() => { val = ed.getValue(); if (o.onChange) o.onChange(val); });
    ed.onDidChangeCursorPosition(e => { if (o.onCursor) o.onCursor(e.position.lineNumber, e.position.column); });
    ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => { if (o.onRun) o.onRun(); });
    host.dataset.ready = "1"; ev.ready.forEach(f => f());
  }, e => plain(e && e.message));
  const api = {
    get kind() { return host.dataset.kind || "loading"; },
    getValue: () => (ed ? ed.getValue() : ta ? ta.value : val),
    setValue: v => { val = String(v); if (ed) ed.setValue(val); else if (ta) { ta.value = val; ta.dispatchEvent(new Event("input")); } },
    setLang: k => { lang = k; if (ed && window.monaco) { monaco.editor.setModelLanguage(ed.getModel(), L(k).monaco); ed.updateOptions({ tabSize: k === "javascript" ? 2 : 4 }); } },
    focus: () => { if (ed) ed.focus(); else if (ta) ta.focus({ preventScroll: true }); else ev.ready.push(() => api.focus()); },
    layout: () => { if (ed) ed.layout(); },
    onReady: f => { if (host.dataset.ready) f(); else ev.ready.push(f); },
    destroy: () => { dead = true; if (ed) { const md = ed.getModel(); ed.dispose(); if (md) md.dispose(); ed = null; } }
  };
  return api;
}

/* ---------- the pane: one code file in My notes → Code ----------
   o: { NS (store), main (true in the main pane: ☆, Delete and the ⧉ drop spot), msg(text), onSaved(), onTitle(text), onFav(), onDelete(), openSide(id), focus } */
const soonOpts = `<optgroup label="Coming soon">${SOON.map(n => `<option disabled>${esc(n)} · coming soon</option>`).join("")}</optgroup>`;
function langSelect(cur, cls, label) { return `<select class="${cls}" aria-label="${label}">${LANGS.map(l => `<option value="${l.k}"${l.k === cur ? " selected" : ""}>${esc(l.name)}</option>`).join("")}${soonOpts}</select>`; }
function pane(el, n, o) {
  const NS = o.NS;
  let code = Object.assign({ lang: "python", src: "", stdin: "" }, n.code || {});
  el.classList.add("nc-pane");
  el.innerHTML = `${o.main ? `<div class="nb-bar nc-bar"><button type="button" class="nb-favb${n.fav ? " on" : ""}" data-a="fav" aria-pressed="${n.fav}" title="${n.fav ? "Remove from favourites" : "Add to favourites"}">${n.fav ? "★" : "☆"}</button>` : `<div class="nb-bar nc-bar">`}
      ${langSelect(code.lang, "nc-lang", "Language")}
      <button type="button" class="nc-run" data-a="run" title="Run (${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}Enter)"><span aria-hidden="true">▶</span> Run</button>
      <button type="button" class="btn-s nb-bar-r" data-a="tr" title="Translate this code into another language (AI)" aria-haspopup="menu">⇄ Translate</button>
      <button type="button" class="btn-s" data-a="dl" title="Save this code as a file on your computer">Save file</button>
      ${o.main ? `<button type="button" class="btn-s set-warn" data-a="del">Delete</button>` : ""}</div>
    <div class="nb-trow"><span class="nc-badge" data-lang="${code.lang}">${esc(L(code.lang).short)}</span><input class="nb-title" value="${esc(n.title)}" aria-label="File name" maxlength="140">${o.main ? `<div class="nb-split" aria-hidden="true" title="Drop a code file here to open it beside this one"><span class="nb-split-ic">⧉</span><span>Drop to open side by side</span></div>` : ""}</div>
    <div class="nc-edhost"></div>
    <div class="nc-panel" data-open="1"><div class="nc-ptabs" role="tablist"><button type="button" role="tab" class="nc-pt" data-p="out" aria-selected="true">Output</button><button type="button" role="tab" class="nc-pt" data-p="in" aria-selected="false">Input</button>
        <span class="nc-pst num"></span><button type="button" class="nc-pb" data-a="clear" title="Clear the output" aria-label="Clear the output">⌫</button><button type="button" class="nc-pb" data-a="fold" title="Hide the panel" aria-label="Hide the panel">▾</button></div>
      <pre class="nc-out" role="log" aria-live="polite" tabindex="0"><span class="nc-o-dim">Press ▶ Run to see what your program prints.</span></pre>
      <textarea class="nc-in" hidden spellcheck="false" placeholder="What your program reads (input(), scanf, cin, Scanner…): one line per answer." aria-label="Program input"></textarea></div>
    <div class="nc-status num"><span class="nc-s-lang"></span><span class="nc-s-pos">Ln 1, Col 1</span><span>${code.lang === "javascript" ? "Spaces: 2" : "Spaces: 4"}</span><span>UTF-8</span><span class="nc-s-run"></span></div>`;
  const q = s => $(s, el), out = q(".nc-out"), inp = q(".nc-in"), st = q(".nc-pst"), langSel = q(".nc-lang"), ti = q(".nb-title");
  { const tr = q(".nb-trow"); if (tr && o.main && window.InquireApp && InquireApp.coverButton) tr.prepend(InquireApp.coverButton(NS, n.id, () => o.onSaved && o.onSaved())); } // cover photo (v0.5.4)
  inp.value = code.stdin || "";
  let t = null, tt = null;
  const flush = () => { if (t) { clearTimeout(t); t = null; NS.update(n.id, { code: { lang: code.lang, src: ed.getValue(), stdin: inp.value } }); if (o.onSaved) o.onSaved(); }
    if (tt) { clearTimeout(tt); tt = null; NS.update(n.id, { title: ti.value.trim() || "Untitled code", quiet: true }); if (o.onTitle) o.onTitle(ti.value.trim() || "Untitled code"); } };
  const save = () => { clearTimeout(t); t = setTimeout(() => { t = 1; flush(); }, 500); };
  const runLbl = () => { const c = settings(); return code.lang === "javascript" && c.jsHere !== false ? "Runs on this computer" : "Runs on " + svc(c).name.replace(/ \(.*$/, ""); };
  const paintLang = () => { q(".nc-s-lang").textContent = L(code.lang).name; q(".nc-s-run").textContent = runLbl(); const b = q(".nc-badge"); b.textContent = L(code.lang).short; b.dataset.lang = code.lang; };
  paintLang();
  const ed = editor(q(".nc-edhost"), { value: code.src, lang: code.lang, onChange: () => save(), onCursor: (l, c) => { q(".nc-s-pos").textContent = `Ln ${l}, Col ${c}`; }, onRun: () => doRun() });
  langSel.onchange = () => { code.lang = langSel.value; ed.setLang(code.lang); paintLang(); t = 1; flush(); };
  inp.addEventListener("input", save);
  ti.oninput = () => { clearTimeout(tt); tt = setTimeout(() => { tt = 1; flush(); }, 400); };
  // the Output / Input panel
  const panel = q(".nc-panel");
  const tab = p => { el.querySelectorAll(".nc-pt").forEach(b => b.setAttribute("aria-selected", String(b.dataset.p === p))); out.hidden = p !== "out"; inp.hidden = p !== "in"; panel.dataset.open = "1"; q('[data-a="fold"]').textContent = "▾"; };
  el.querySelectorAll(".nc-pt").forEach(b => b.onclick = () => { tab(b.dataset.p); if (b.dataset.p === "in") inp.focus(); });
  q('[data-a="fold"]').onclick = e => { const open = panel.dataset.open !== "1"; panel.dataset.open = open ? "1" : "0"; e.currentTarget.textContent = open ? "▾" : "▴"; e.currentTarget.title = open ? "Hide the panel" : "Show the panel"; ed.layout(); };
  q('[data-a="clear"]').onclick = () => { out.innerHTML = ""; st.textContent = ""; };
  const put = (k, s) => { const sp = document.createElement("span"); sp.className = "nc-o-" + k; sp.textContent = s; out.appendChild(sp); out.scrollTop = out.scrollHeight; };
  // ▶ Run
  let running = false;
  async function doRun() {
    if (running) return; flush(); running = true;
    const rb = q('[data-a="run"]'); rb.disabled = true; rb.classList.add("busy");
    tab("out"); out.innerHTML = ""; st.textContent = "";
    const l = L(code.lang), name = (l.k === "java" ? "Main" : "main") + "." + l.ext;
    put("dim", `▶ ${name} · ${runLbl().replace(/^Runs/, "running")}…\n`);
    let streamed = false;
    try {
      const r = await run(code.lang, ed.getValue(), inp.value, (k, s) => { streamed = true; put(k, s); });
      if (!streamed) { if (r.out) put("out", r.out.endsWith("\n") ? r.out : r.out + "\n"); if (r.err) put("err", r.err.endsWith("\n") ? r.err : r.err + "\n"); }
      if (!r.out && !r.err) put("dim", "(no output)\n");
      put(r.ok ? "ok" : "bad", `■ ${r.status}${r.time != null ? " · " + (+r.time).toFixed(2) + " s" : ""} · ${r.where}\n`);
      st.textContent = r.ok ? "✓" : "✕"; st.className = "nc-pst num " + (r.ok ? "ok" : "bad");
    } catch (e) { put("err", (e && e.message || "Could not run the code") + "\n"); st.textContent = "✕"; st.className = "nc-pst num bad"; }
    running = false; rb.disabled = false; rb.classList.remove("busy");
  }
  q('[data-a="run"]').onclick = doRun;
  // ⇄ Translate: pick a language → a new code file beside this one (AI)
  q('[data-a="tr"]').onclick = e => {
    const b = e.currentTarget; document.querySelectorAll(".nc-trpop").forEach(x => x.remove());
    const pop = document.createElement("div"); pop.className = "np-pop nc-trpop win"; pop.setAttribute("role", "menu");
    pop.innerHTML = `<p class="nc-trh">Translate ${esc(L(code.lang).name)} into…</p>${LANGS.filter(l => l.k !== code.lang).map(l => `<button type="button" role="menuitem" data-to="${l.k}"><span class="nc-badge" data-lang="${l.k}">${esc(l.short)}</span>${esc(l.name)}</button>`).join("")}<p class="nc-trnote">Uses NotePath's AI. The original stays as it is; the translation opens beside it as a new file.</p>`;
    document.body.appendChild(pop);
    const r = b.getBoundingClientRect(); pop.style.top = Math.min(innerHeight - pop.offsetHeight - 8, r.bottom + 6) + "px"; pop.style.left = Math.max(8, Math.min(innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + "px";
    const close = () => { pop.remove(); document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); };
    const away = ev => { if (!pop.contains(ev.target) && ev.target !== b) close(); };
    const key = ev => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); b.focus(); } };
    document.addEventListener("pointerdown", away, true); document.addEventListener("keydown", key, true);
    pop.querySelectorAll("[data-to]").forEach(x => x.onclick = () => { close(); doTranslate(x.dataset.to); });
    const f = pop.querySelector("button"); if (f) f.focus();
  };
  async function doTranslate(to) {
    flush(); tab("out"); out.innerHTML = "";
    const s = await ai.status();
    if (!s || !s.configured) { put("err", "AI translation is not set up in this copy of NotePath yet. Once the AI key is installed (see Settings → Code), ⇄ Translate turns this file into " + L(to).name + ".\n"); if (o.msg) o.msg("AI translation is not set up yet"); return; }
    put("dim", `⇄ Translating into ${L(to).name}…\n`);
    try {
      const src2 = await translate(ed.getValue(), code.lang, to);
      const m = NS.create({ title: (ti.value.trim() || "Untitled code").replace(/\.[a-z+]+$/i, "") + " (" + L(to).name + ")", folder: NS.get(n.id) ? NS.get(n.id).folder : null, code: { lang: to, src: src2 } });
      put("ok", `■ Done: “${m.title}” opens beside this file.\n`);
      if (o.openSide) o.openSide(m.id);
    } catch (e2) { put("err", (e2 && e2.message || "Translation failed") + "\n"); }
  }
  // Save file: the code as main.py / main.c / Main.java …
  q('[data-a="dl"]').onclick = () => {
    flush(); const l = L(code.lang), base = l.k === "java" ? "Main" : (ti.value.trim().replace(/\.[a-z+]+$/i, "").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "main");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ed.getValue()], { type: "text/plain" })); a.download = base + "." + l.ext;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
  if (o.main) {
    q('[data-a="fav"]').onclick = e => { const m = NS.update(n.id, { fav: !NS.get(n.id).fav, quiet: true }); const b = e.currentTarget; b.classList.toggle("on", m.fav); b.textContent = m.fav ? "★" : "☆"; b.setAttribute("aria-pressed", String(m.fav)); b.title = m.fav ? "Remove from favourites" : "Add to favourites"; if (o.onFav) o.onFav(); };
    q('[data-a="del"]').onclick = () => { if (o.onDelete) o.onDelete(); };
  }
  const onCfg = () => paintLang(); window.addEventListener("np:code-settings", onCfg);
  if (o.focus) ed.onReady(() => ed.focus());
  return { id: n.id, flush, focus: () => ed.focus(), editor: ed, run: doRun,
    destroy: () => { flush(); ed.destroy(); window.removeEventListener("np:code-settings", onCfg); document.querySelectorAll(".nc-trpop").forEach(x => x.remove()); } };
}

window.NPCode = { LANGS, SOON, lang: L, SERVICES, settings, setSettings, run, ai, translate, pane, editor, loadMonaco, langSelect };
})();
