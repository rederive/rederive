const VOCAB = new Set("UNIT SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM SIG ENVELOPE DEPENDS-ON DESCRIPTION BEHAVIOR INVARIANT TABLE PINNED EARNED NOTE RATIONALE SCOPE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE PROVENANCE CARRIED SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED LANG PRIMARY-SHA256 ABI MECHANISM".split(" "));
const KIND_PHRASE = new Map([
  ["FUNCTIONAL", "A pure function: the same input always gives the same output."],
  ["STATE", "Changes one of its arguments in place; the tests check the result and the changed argument."],
  ["EFFECT", "Talks to the outside world; the tests check the calls it makes, in order."],
]);
const FID_PHRASE = new Map([
  ["package", "Matches the original package exactly, quirks included."],
  ["spec", "Follows the cited standard, even where the original package does not."],
]);
const PIN_KIND = new Map(Object.entries({ regex: "pattern", charset: "character set", grammar: "grammar", text: "exact text", set: "set", const: "constant", names: "names", number: "number", constant: "constant", chars: "characters", order: "order", map: "mapping", bytes: "bytes" }));
const OTHER = new Map(Object.entries({ ORACLE: "The tests (file and fingerprint)", "ORACLE-CLASS": "Kind of tests", STATE: "What it changes in place", SEAM: "Export shape", "TRACE-SEAM": "Effect boundary", SRC: "Source location", EFFECT: "Effect", SURFACE: "Module surface", EMIT: "Emits", REQUEST: "Requests", BRANCH: "Branch", "ON-ERROR": "On error", PAR: "Unordered window", RING: "Token ring", LIFECYCLE: "Resource lifecycle", REACH: "Off-path unit", TRIGGER: "Trigger", EARNED: "Earned rule", BEHAVIOR: "Behavior header" }));
const OPENERS = new Set(["\t", " ", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);
const SECTIONS = [
  ["header", "What kind of unit it is", true, [["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]]],
  ["what", "What it is for", false, [["DESCRIPTION", null]]],
  ["inputs", "What it accepts", true, [["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]]],
  ["rules", "What it does", true, "R"],
  ["pins", "Exact definitions", true, "PINNED"],
  ["table", "Decision table", true, [["TABLE", null]]],
  ["data", "Data it carries", true, "CARRIED"],
  ["deps", "What it depends on", true, [["DEPENDS-ON", null]]],
  ["more", "Other parts of the contract", true, "MORE"],
  ["stray", "Text outside any directive", true, "STRAY"],
  ["holds", "Should always hold", false, [["INVARIANT", null]]],
  ["scope", "In and out of scope", false, [["SCOPE", null]]],
  ["notes", "Background", false, [["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]]],
];
const MEMBER = new Set();
for (const s of SECTIONS) if (Array.isArray(s[3])) for (const m of s[3]) MEMBER.add(m[0]);
MEMBER.add("PINNED"); MEMBER.add("CARRIED");
const FEFF = "﻿";
const FEFF_RUN = new RegExp("^[ \\t\\uFEFF]*");
const FEFF_ALL = new RegExp("\\uFEFF", "g");
const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const ANCHOR_DOTS = /\.+$/;

const trim = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

function spansOf(s) {
  const out = [];
  let prevClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let found = -1;
      while (j < s.length) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === '"') { found = j; break; }
        j++;
      }
      if (found < 0) break;
      out.push([i, found]);
      prevClose = found;
      i = found + 1;
    } else i++;
  }
  return out;
}
const inside = (spans, p) => spans.some(([a, b]) => p > a && p < b);

function splitAttrs(S) {
  const spans = spansOf(S);
  const hits = [];
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(S)) !== null) {
    const kw = m[1];
    const kwStart = m.index + m[0].length - kw.length;
    if (inside(spans, kwStart)) continue;
    hits.push({ idx: m.index, kw, end: m.index + m[0].length });
  }
  if (!hits.length) return { body: trim(S), pairs: [] };
  const body = trim(S.slice(0, hits[0].idx));
  const pairs = hits.map((h, k) => [h.kw, trim(S.slice(h.end, k + 1 < hits.length ? hits[k + 1].idx : S.length))]);
  return { body, pairs };
}

function trailing(content) {
  const spans = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    const p = content[i - 1];
    if (p !== " " && p !== "\t") continue;
    if (i + 1 < content.length && content[i + 1] !== " " && content[i + 1] !== "\t") continue;
    if (inside(spans, i)) continue;
    return { code: content.slice(0, i).replace(/[ \t]+$/, ""), comment: trim(content.slice(i + 1)) };
  }
  return { code: content, comment: null };
}

export function explain_contract(primaryText) {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const lines = primaryText.split(LINE_BREAK);
  const dirs = [];
  const strays = [];
  let cur = null;
  for (let k = 0; k < lines.length; k++) {
    const num = k + 1;
    let line = lines[k];
    const run = FEFF_RUN.exec(line)[0];
    line = run.replace(FEFF_ALL, "") + line.slice(run.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ line: num, text: content });
      continue;
    }
    const { code, comment } = trailing(content);
    if (indent === "") {
      const sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? "" : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED") {
        const { body, pairs } = splitAttrs(rest);
        cur = { name, line: num, args: body, cont: [], attrs: pairs, comments: comment === null ? [] : [comment], known: VOCAB.has(name) || /^R[0-9]+$/.test(name) };
        dirs.push(cur);
        continue;
      }
    }
    if (!cur) { strays.push({ line: num, text: content }); continue; }
    const { body, pairs } = splitAttrs(" " + code);
    for (const p of pairs) cur.attrs.push(p);
    if (body !== "") cur.cont.push(body);
    if (comment !== null) cur.comments.push(comment);
  }
  for (const d of dirs) {
    const pieces = [d.args, ...d.cont].filter((x) => x !== "");
    d.text = pieces.join(d.name === "TABLE" ? " ⏎ " : " ");
    let raw = pieces.join(d.name === "TABLE" ? "\n" : " ");
    for (const c of d.comments) raw += " # " + c;
    d.raw = raw;
  }
  const head = (n, legacy) => {
    const c = [...dirs.filter((d) => d.name === n), ...dirs.filter((d) => d.name === legacy)];
    return c.find((d) => d.text !== "") || c[0] || null;
  };
  const hu = head("UNIT", "SIR");
  const unit = hu && hu.text !== "" ? hu.text : "(unnamed)";
  const summary = [];
  const hk = head("KIND", "KIND");
  if (hk && hk.text !== "") summary.push(KIND_PHRASE.has(hk.text) ? KIND_PHRASE.get(hk.text) : "Kind: " + hk.text + " (not a kind SIR defines).");
  const hf = head("FIDELITY", "VARIANT");
  if (hf && hf.text !== "") summary.push(FID_PHRASE.has(hf.text) ? FID_PHRASE.get(hf.text) : "Fidelity: " + hf.text + " (not a fidelity SIR defines).");
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const t = d.text.replace(ANCHOR_DOTS, "");
    if (t !== "") { summary.push("Anchored to " + t + "."); break; }
  }
  const sigD = dirs.find((d) => d.name === "SIG");
  const sig = sigD ? sigD.text : null;

  const counts = new Map();
  const mkId = (base) => {
    const n = (counts.get(base) || 0) + 1;
    counts.set(base, n);
    return n === 1 ? base : base + " #" + n;
  };
  const whyOf = ([kw, v]) => kw === "CITED" ? (v !== "" ? v : "no reason given") : kw === "EARNED" ? (v !== "" ? "added after a failed test (" + v + ")" : "added after a failed test") : (v !== "" ? "anchored to " + v : "anchored (no reference given)");
  const mk = (d, base, label, text) => {
    const it = { id: mkId(base) };
    if (label !== null) it.label = label;
    it.text = text;
    it.why = d.attrs.map(whyOf);
    it.raw = d.raw;
    it.rawWhy = d.attrs.map(([kw, v]) => (v === "" ? kw : kw + " " + v));
    it.line = d.line;
    return it;
  };
  const sections = [];
  for (const [id, title, checked, mem] of SECTIONS) {
    const items = [];
    if (mem === "STRAY") {
      for (const s of strays) items.push({ id: mkId("STRAY"), label: "Line " + s.line, text: s.text, why: [], raw: s.text, rawWhy: [], line: s.line });
    } else if (mem === "R") {
      for (const d of dirs) if (/^R[0-9]+$/.test(d.name)) items.push(mk(d, d.name, "Rule " + d.name.slice(1), d.text));
    } else if (mem === "PINNED") {
      for (const d of dirs) {
        if (d.name !== "PINNED") continue;
        const spans = spansOf(d.args);
        let eq = -1;
        for (let i = 0; i < d.args.length; i++) if (d.args[i] === "=" && !inside(spans, i)) { eq = i; break; }
        const words = trim(eq < 0 ? d.args : d.args.slice(0, eq)).split(/[ \t]+/);
        const kind = words[0] || "";
        const nm = words[1] || "";
        let text, value = null;
        if (eq >= 0) {
          value = [trim(d.args.slice(eq + 1)), ...d.cont].filter((x) => x !== "").join(" ");
          text = value;
        } else text = d.text;
        const label = (nm || "(unnamed pin)") + " (" + (PIN_KIND.has(kind) ? PIN_KIND.get(kind) : kind || "no kind") + (eq >= 0 && value === "" ? ", empty value" : "") + ")";
        items.push(mk(d, nm === "" ? "PIN" : "PIN:" + nm, label, text));
      }
    } else if (mem === "CARRIED") {
      for (const d of dirs) {
        if (d.name !== "CARRIED") continue;
        const sp = d.args.search(/[ \t]/);
        const first = sp < 0 ? d.args : d.args.slice(0, sp);
        items.push(mk(d, "CARRIED", d.args === "" ? "Carried data" : first, d.text));
      }
    } else if (mem === "MORE") {
      for (const d of dirs) {
        if (MEMBER.has(d.name) || /^R[0-9]+$/.test(d.name)) continue;
        if (d.name === "BEHAVIOR" && d.text === "" && d.attrs.length === 0) continue;
        const label = !d.known ? d.name + " (not in the SIR vocabulary)" : OTHER.has(d.name) ? OTHER.get(d.name) : d.name;
        items.push(mk(d, d.name, label, d.text));
      }
    } else {
      for (const [n, label] of mem) {
        for (const d of dirs) {
          if (d.name !== n) continue;
          const text = n === "DEPENDS-ON" && NONE.test(d.text) ? "Nothing. No other package is involved." : d.text;
          items.push(mk(d, n, label, text));
        }
      }
    }
    if (items.length) sections.push({ id, title, checked, items });
  }
  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
