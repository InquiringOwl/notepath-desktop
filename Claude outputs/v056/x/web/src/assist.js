/* AI Chat and Grammar check (NotePath v0.5.6, Devon). window.NPAssist: the parts with no page layout, so tools/unit.js can
   check them; the two boxes at the bottom right of a note are drawn by renderNotes in app.js, and the right-click
   "Ask AI…" box by textmenu.js.
   - AI: the same key and provider as My Code's ⇄ Translate (main.js "ai:ask"; the key never reaches the page). ask() goes
     through NPCode.ai so the tests can stand in for it. A chat sends the whole conversation (messages), and the note when
     "Read this note" is ticked.
   - Grammar: LanguageTool's free public service (api.languagetool.org, no key; the desktop app posts through main.js
     "grammar:check"). The kind of note sets how strict the check is (GTYPES: which rule categories are left out, and
     "picky" for formal writing). textMap() turns the editor into plain text with a map back to its text nodes, so a
     suggestion can be put straight into the note. */
(function () {
"use strict";
/* ---------- AI ---------- */
const AI_SYS = "You are the assistant inside NotePath, a notes app. Be clear, friendly and brief. Reply in plain text; short lists with '- ' are fine. Do not use Markdown headings or tables.";
const SEL_SYS = "You help with a piece of text the user selected in a note in NotePath. Follow the request. When the request changes the text (rewrite, shorten, fix, translate, turn into a list…), reply with ONLY the new text: no introduction, no quotes, no notes. When it asks a question about the text, answer briefly in plain text.";
const NOTE_MAX = 30000, TURNS = 30;
function aiApi() { return window.NPCode && NPCode.ai ? NPCode.ai : { status: async () => ({ configured: false }), ask: async () => { throw new Error("AI is not available here."); } }; }
async function aiStatus() { try { return (await aiApi().status()) || { configured: false }; } catch (e) { return { configured: false }; } }
// a chat turn: msgs = [{ role: "user" | "assistant", content }], note = { title, text } or null
function chatRequest(msgs, note) {
  const keep = msgs.filter(m => m && (m.role === "user" || m.role === "assistant") && m.content).slice(-TURNS).map(m => ({ role: m.role, content: String(m.content).slice(0, 20000) }));
  while (keep.length && keep[0].role !== "user") keep.shift();
  const system = AI_SYS + (note ? `\n\nThe user has this note open. Use it when the question is about it.\nTitle: ${note.title || "Untitled note"}\n<note>\n${String(note.text || "").slice(0, NOTE_MAX)}\n</note>` : "");
  const prompt = keep.map(m => (m.role === "user" ? "User: " : "Assistant: ") + m.content).join("\n\n"); // for a main process without messages support
  return { system, messages: keep, prompt };
}
function selRequest(request, text) {
  return { system: SEL_SYS, prompt: `Request: ${String(request).trim()}\n\nSelected text:\n"""\n${String(text).slice(0, NOTE_MAX)}\n"""` };
}
async function ask(req) { return String(await aiApi().ask(req) || "").trim(); }
// strip a wrapper the model sometimes adds around a rewritten text
const cleanEdit = t => String(t || "").trim().replace(/^```[a-z]*\n([\s\S]*?)\n```$/i, "$1").replace(/^"""\n?([\s\S]*?)\n?"""$/, "$1").replace(/^"([^"\n]+)"$/, "$1").trim();
// AI text → note html: one line per line, "- " lines as a bulleted list, **bold**
function toHTML(t) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  const out = []; let ul = null;
  String(t || "").replace(/\r/g, "").split("\n").forEach(line => {
    const m = line.match(/^\s*[-*•]\s+(.*)$/);
    if (m) { (ul = ul || []).push(`<li>${inline(m[1])}</li>`); return; }
    if (ul) { out.push(`<ul>${ul.join("")}</ul>`); ul = null; }
    out.push(line.trim() ? `<div>${inline(line)}</div>` : "<div><br></div>");
  });
  if (ul) out.push(`<ul>${ul.join("")}</ul>`);
  return out.join("");
}

/* ---------- Grammar (LanguageTool) ---------- */
const GT_URL = "https://api.languagetool.org/v2/check", GT_MAX = 18000;
// [key, name, what it checks, LanguageTool categories left out, picky]
const GTYPES = [
  ["quick", "Quick note", "Spelling and clear grammar mistakes only", ["PUNCTUATION", "CASING", "STYLE", "TYPOGRAPHY", "REDUNDANCY", "PLAIN_ENGLISH", "WIKIPEDIA", "MISC", "SEMANTICS", "GENDER_NEUTRALITY", "COLLOCATIONS"], false],
  ["school", "School & study", "Spelling, grammar, punctuation, capitals and mixed-up words", ["STYLE", "PLAIN_ENGLISH", "WIKIPEDIA", "GENDER_NEUTRALITY", "TYPOGRAPHY"], false],
  ["work", "Work & business", "Everything for school, plus clear and professional style", ["WIKIPEDIA", "TYPOGRAPHY"], false],
  ["creative", "Creative writing", "Spelling and grammar, but your style is left alone (fragments, repetition, capitals)", ["STYLE", "PLAIN_ENGLISH", "WIKIPEDIA", "REDUNDANCY", "TYPOGRAPHY", "GENDER_NEUTRALITY", "CASING", "SEMANTICS"], false],
  ["formal", "Formal & academic", "The strictest check: every rule, including picky style rules", [], true]];
const GLANGS = [["en-US", "English (US)"], ["en-GB", "English (UK)"], ["en-CA", "English (Canada)"], ["en-AU", "English (Australia)"], ["auto", "Detect the language"]];
const gtype = k => GTYPES.find(t => t[0] === k) || GTYPES[1];
function grammarBody(text, type, lang) {
  const t = gtype(type), p = new URLSearchParams();
  p.set("text", String(text).slice(0, GT_MAX)); p.set("language", GLANGS.some(l => l[0] === lang) ? lang : "en-US");
  if (t[4]) p.set("level", "picky");
  if (t[3].length) p.set("disabledCategories", t[3].join(","));
  return p.toString();
}
// LanguageTool's matches → the ones this kind of note wants, in order, each { id, offset, length, bad, message, cat, reps }
function grammarMatches(body, text, type) {
  const t = gtype(type), off = new Set(t[3]);
  const ms = body && Array.isArray(body.matches) ? body.matches : [];
  return ms.filter(m => m && Number.isFinite(m.offset) && Number.isFinite(m.length) && m.length > 0 && !(m.rule && m.rule.category && off.has(m.rule.category.id)))
    .map((m, i) => ({ id: "g" + i, offset: m.offset, length: m.length, bad: String(text).substr(m.offset, m.length), message: String(m.message || m.shortMessage || "Check this"),
      cat: m.rule && m.rule.category ? String(m.rule.category.name || m.rule.category.id || "") : "", kind: m.rule && m.rule.issueType === "misspelling" ? "spelling" : m.rule && /style|typographical/.test(m.rule.issueType || "") ? "style" : "grammar",
      reps: (m.replacements || []).map(r => String(r && r.value != null ? r.value : "")).filter((v, j, a) => a.indexOf(v) === j).slice(0, 4) }))
    .sort((a, b) => a.offset - b.offset);
}
async function grammarCheck(text, type, lang) {
  const body = grammarBody(text, type, lang), D = window.inquireDesktop;
  let res;
  if (D && D.grammar) { try { res = await D.grammar({ body }); } catch (e) { res = { status: 0 }; } }
  else { try { const r = await fetch(GT_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }); res = { status: r.status, body: r.ok ? await r.json() : null }; } catch (e) { res = { status: 0 }; } }
  if (!res || res.status !== 200 || !res.body) throw new Error(!res || !res.status ? "Could not reach the grammar service. Check your internet connection." : res.status === 429 ? "The free grammar service is busy. Wait a minute and check again." : `The grammar service answered ${res.status}.`);
  return { matches: grammarMatches(res.body, text, type), cut: String(text).length > GT_MAX };
}
// shift the matches after an edit at `at` that turned `was` characters into `now`
function shiftMatches(list, at, was, now) { const d = now - was; return list.map(m => m.offset > at ? Object.assign({}, m, { offset: m.offset + d }) : m); }

/* the editor as plain text, with where each piece came from (widgets and the paranotes layer are left out) */
const BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE|PRE|TR|TABLE)$/;
function textMap(root) {
  let text = ""; const segs = [];
  const nl = () => { if (text && !text.endsWith("\n")) text += "\n"; };
  (function walk(n) {
    for (let c = n.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) { if (c.data) { segs.push({ node: c, start: text.length }); text += c.data; } continue; }
      if (c.nodeType !== 1) continue;
      if (c.classList.contains("nw") || c.classList.contains("nann-layer") || c.getAttribute("contenteditable") === "false" || /^(SCRIPT|STYLE)$/.test(c.tagName)) { nl(); continue; }
      if (c.tagName === "BR") { text += "\n"; continue; }
      const b = BLOCK.test(c.tagName); if (b) nl();
      walk(c);
      if (b) nl();
    }
  })(root);
  return { text, segs };
}
function rangeAt(map, offset, length) {
  const at = pos => { for (let i = map.segs.length - 1; i >= 0; i--) { const s = map.segs[i]; if (pos >= s.start && pos <= s.start + s.node.data.length) return [s.node, pos - s.start]; } return null; };
  const a = at(offset), b = at(offset + length); if (!a || !b) return null;
  const r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); return r;
}
// find a match again after other edits: at its offset, or the nearest place with the same words
function locate(map, m) {
  if (map.text.substr(m.offset, m.length) === m.bad) return m.offset;
  let best = -1, from = 0, i;
  while ((i = map.text.indexOf(m.bad, from)) !== -1) { if (best < 0 || Math.abs(i - m.offset) < Math.abs(best - m.offset)) best = i; from = i + 1; }
  return best;
}

window.NPAssist = { aiStatus, ask, chatRequest, selRequest, cleanEdit, toHTML, GTYPES, GLANGS, gtype, grammarBody, grammarMatches, grammarCheck, shiftMatches, textMap, rangeAt, locate, GT_URL, GT_MAX };
})();
