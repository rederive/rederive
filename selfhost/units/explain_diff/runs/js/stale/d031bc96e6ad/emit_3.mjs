const OPEN = new Set([" ", "\t", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const REF_TAIL = /[.,;:)\]]+$/;

function spans(s) {
  const out = [];
  let prevEnd = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPEN.has(s[i - 1]) || i === prevEnd)) {
      let j = i + 1;
      let found = false;
      while (j < s.length) {
        if (s[j] === "\\") {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp === undefined ? 1 : cp > 0xffff ? 2 : 1);
        } else if (s[j] === '"') { found = true; break; } else j++;
      }
      if (!found) break;
      out.push([i, j]);
      prevEnd = j + 1;
      i = j + 1;
    } else i++;
  }
  return out;
}
const inside = (sp, p) => sp.some(([a, b]) => p > a && p < b);

function splitAttrs(piece) {
  const sp = spans(piece);
  const marks = [];
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(piece)) !== null) {
    const kwStart = m.index + m[0].length - m[1].length;
    if (inside(sp, kwStart)) continue;
    marks.push({ idx: m.index, kw: m[1], end: m.index + m[0].length });
  }
  const trim = (t) => t.replace(/^[ \t]+|[ \t]+$/g, "");
  if (!marks.length) return { body: trim(piece), attrs: [] };
  const attrs = marks.map((mk, k) => ({
    kw: mk.kw,
    value: trim(piece.slice(mk.end, k + 1 < marks.length ? marks[k + 1].idx : piece.length)),
  }));
  return { body: trim(piece.slice(0, marks[0].idx)), attrs };
}

function parse(text) {
  const dirs = [];
  let cur = null;
  for (let line of text.split(/\r\n|\r|\n/)) {
    const lead = line.match(/^[ \t﻿]*/)[0];
    line = lead.replace(/﻿/g, "") + line.slice(lead.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = line.match(/^[ \t]*/)[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") continue;
    const sp = spans(content);
    let code = content;
    for (let k = 1; k < content.length; k++) {
      if (content[k] === "#" && (content[k - 1] === " " || content[k - 1] === "\t") &&
          (k + 1 === content.length || content[k + 1] === " " || content[k + 1] === "\t") && !inside(sp, k)) {
        code = content.slice(0, k).replace(/[ \t]+$/, "");
        break;
      }
    }
    let isCont = indent.length > 0;
    let name = "", rest = "";
    if (!isCont) {
      const w = code.search(/[ \t]/);
      name = w < 0 ? code : code.slice(0, w);
      rest = w < 0 ? "" : code.slice(w);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (!(/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED")) isCont = true;
    }
    if (isCont) {
      if (!cur) continue;
      const r = splitAttrs(" " + code);
      for (const a of r.attrs) cur.attrs.push(a);
      if (r.body !== "") cur.pieces.push(r.body);
    } else {
      const r = splitAttrs(rest);
      cur = { name, args: r.body, pieces: [], attrs: r.attrs.slice() };
      dirs.push(cur);
    }
  }
  return dirs;
}

function readable(t) {
  return t
    .replace(/\bR(\d+)\s*[-–]\s*R?(\d+)\b/g, "rules $1–$2")
    .replace(/\bR(\d+)\b/g, "rule $1");
}

const PIN_KINDS = new Map(Object.entries({
  regex: "pattern", charset: "character set", grammar: "grammar", text: "exact text", set: "set",
  const: "constant", constant: "constant", names: "names", number: "number", chars: "characters",
  order: "order", map: "mapping", bytes: "bytes",
}));
const OTHER = new Map(Object.entries({
  "ORACLE": "The tests (file and fingerprint)", "ORACLE-CLASS": "Kind of tests", "STATE": "What it changes in place",
  "SEAM": "Export shape", "TRACE-SEAM": "Effect boundary", "SRC": "Source location", "EFFECT": "Effect",
  "SURFACE": "Module surface", "EMIT": "Emits", "REQUEST": "Requests", "BRANCH": "Branch", "ON-ERROR": "On error",
  "PAR": "Unordered window", "RING": "Token ring", "LIFECYCLE": "Resource lifecycle", "REACH": "Off-path unit",
  "TRIGGER": "Trigger", "EARNED": "Earned rule", "BEHAVIOR": "Behavior header",
}));
const KNOWN = new Set(["SIR", "VARIANT", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "NOTES", "GUARD-PINNED", "LANG", "PRIMARY-SHA256", "ABI", "MECHANISM"]);
const LANGS = new Map(Object.entries({ js: "JavaScript", ts: "TypeScript", rust: "Rust" }));

const lab = (m) => (d) => m.get(d.name);
const SECTIONS = [
  { title: "What kind of unit it is", tested: true, names: ["UNIT", "KIND", "FIDELITY", "ANCHOR"], label: lab(new Map([["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]])) },
  { title: "What it is for", tested: false, names: ["DESCRIPTION"], label: () => null },
  { title: "What it accepts", tested: true, names: ["SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN"], label: lab(new Map([["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]])) },
  { title: "What it does", tested: true, rule: true, label: (d) => "Rule " + d.name.slice(1) },
  { title: "Exact definitions", tested: true, names: ["PINNED"], label: null },
  { title: "Decision table", tested: true, names: ["TABLE"], label: () => null },
  { title: "Data it carries", tested: true, names: ["CARRIED"], label: (d) => { const f = d.args.split(/[ \t]+/).filter((x) => x !== ""); return f.length ? f[0] : "Carried data"; } },
  { title: "What it depends on", tested: true, names: ["DEPENDS-ON"], label: () => null },
  { title: "Other parts of the contract", tested: true, other: true, label: (d) => OTHER.has(d.name) ? OTHER.get(d.name) : KNOWN.has(d.name) ? d.name : d.name + " (not in the SIR vocabulary)" },
  { title: "Should always hold", tested: false, names: ["INVARIANT"], label: () => null },
  { title: "In and out of scope", tested: false, names: ["SCOPE"], label: () => null },
  { title: "Background", tested: false, names: ["NOTE", "RATIONALE", "PROVENANCE"], label: lab(new Map([["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]])) },
];
const NAMED = new Set();
for (const s of SECTIONS) if (s.names) for (const n of s.names) NAMED.add(n);
const isRule = (n) => /^R[0-9]+$/.test(n);

function items(text) {
  const dirs = parse(text);
  const out = [];
  const counts = new Map();
  for (const sec of SECTIONS) {
    let list = [];
    if (sec.rule) list = dirs.filter((d) => isRule(d.name));
    else if (sec.other) list = dirs.filter((d) => !NAMED.has(d.name) && !isRule(d.name));
    else for (const n of sec.names) list.push(...dirs.filter((d) => d.name === n));
    for (const d of list) {
      const raw = [d.args, ...d.pieces].filter((x) => x !== "").join(" ");
      if (d.name === "BEHAVIOR" && raw === "" && d.attrs.length === 0) continue;
      let shown = raw, base = d.name, label;
      if (d.name === "PINNED") {
        const eq = d.args.indexOf("=");
        const head = eq < 0 ? d.args : d.args.slice(0, eq);
        const val = eq < 0 ? "" : d.args.slice(eq + 1);
        const f = head.split(/[ \t]+/).filter((x) => x !== "");
        const kind = (f[0] || "").trim(), name = (f[1] || "").trim();
        shown = [val.trim(), ...d.pieces].filter((x) => x !== "").join(" ");
        base = name === "" ? "PIN" : "PIN:" + name;
        const phrase = PIN_KINDS.has(kind) ? PIN_KINDS.get(kind) : kind !== "" ? kind : "no kind";
        label = (name === "" ? "(unnamed pin)" : name) + " (" + phrase + ")";
      } else {
        label = sec.label(d);
        if (d.name === "DEPENDS-ON" && /^none$/i.test(raw)) shown = "Nothing. No other package is involved.";
      }
      const c = (counts.get(base) || 0) + 1;
      counts.set(base, c);
      const attrs = d.attrs;
      out.push({
        section: sec.title, tested: sec.tested, id: c === 1 ? base : base + " #" + c, label,
        raw, text: readable(shown),
        cits: attrs.map((a) => (a.value === "" ? a.kw : a.kw + " " + a.value)),
        why: attrs.map((a) => readable(a.kw === "CITED" ? a.value : a.kw === "EARNED" ? "added after a failed test (" + a.value + ")" : "anchored to " + a.value)),
      });
    }
  }
  return { dirs, list: out };
}

function diff(a, b) {
  const ta = a.split(/(\s+)/), tb = b.split(/(\s+)/);
  const n = ta.length, m = tb.length;
  const L = [];
  for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = ta[i] === tb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const s1 = [];
  const emit = (op, text) => {
    const last = s1[s1.length - 1];
    if (last && last.op === op) last.text += text; else s1.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (ta[i] === tb[j]) { emit("=", ta[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { emit("-", ta[i]); i++; }
    else { emit("+", tb[j]); j++; }
  }
  while (i < n) emit("-", ta[i++]);
  while (j < m) emit("+", tb[j++]);
  const out = [];
  let p = 0;
  while (p < s1.length) {
    if (s1[p].op === "=") { out.push(s1[p]); p++; continue; }
    let del = "", ins = "", last = p, q = p;
    while (q < s1.length) {
      const e = s1[q];
      if (e.op === "-") { del += e.text; last = q; }
      else if (e.op === "+") { ins += e.text; last = q; }
      else {
        const t = e.text.trim();
        const glue = q + 1 < s1.length && (t === "" || t.split(/\s+/).length <= 2);
        if (!glue) break;
        del += e.text; ins += e.text;
      }
      q++;
    }
    if (del !== "") out.push({ op: "-", text: del });
    if (ins !== "") out.push({ op: "+", text: ins });
    p = last + 1;
  }
  return out.filter((e) => e.text !== "");
}

const sameList = (a, b) => a.length === b.length && a.every((x, k) => x === b[k]);

export function explain_diff(before, after, oracleChanged, langs) {
  const B = items(before), A = items(after);
  const groupOf = (it) => it.section + "\n" + it.id.replace(/\s#\d+$/, "");
  const groups = new Map();
  const slot = (k) => { if (!groups.has(k)) groups.set(k, { b: [], a: [] }); return groups.get(k); };
  for (const it of B.list) slot(groupOf(it)).b.push(it);
  for (const it of A.list) slot(groupOf(it)).a.push(it);
  const pairOf = new Map();
  const pairedB = new Set();
  const unpairedB = [];
  for (const g of groups.values()) {
    const usedA = new Set();
    const leftB = [];
    for (const b of g.b) {
      const a = g.a.find((x) => !usedA.has(x) && x.raw === b.raw && sameList(x.cits, b.cits));
      if (a) { usedA.add(a); pairOf.set(a, b); pairedB.add(b); } else leftB.push(b);
    }
    const leftA = g.a.filter((x) => !usedA.has(x));
    let k = 0;
    for (const b of leftB) {
      if (k < leftA.length) { pairOf.set(leftA[k], b); k++; } else unpairedB.push(b);
    }
  }
  const unitD = A.dirs.find((d) => d.name === "UNIT");
  const unit = unitD && unitD.args !== "" ? unitD.args : "(unnamed)";

  const changes = [];
  const meta = [];
  const mk = (it, kind) => ({ section: it.section, id: it.id, label: it.label == null ? it.section : it.label, kind, checked: it.tested });
  for (const a of A.list) {
    const b = pairOf.get(a);
    if (!b) {
      const c = mk(a, "added"); c.text = a.text; changes.push(c); meta.push(a);
    } else if (!(a.raw === b.raw && sameList(a.cits, b.cits))) {
      const c = mk(a, "changed");
      let d = diff(b.text, a.text);
      if (!d.some((e) => e.op !== "=")) d = diff(b.raw, a.raw);
      c.diff = d;
      c.whyDiff = sameList(a.cits, b.cits) ? null : diff(b.cits.join("; "), a.cits.join("; "));
      changes.push(c); meta.push(a);
    }
  }
  for (const b of unpairedB) {
    const c = mk(b, "removed"); c.text = b.text; changes.push(c); meta.push(b);
  }

  const warnings = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((c) => c.kind));
    const verbs = ["changed", "added", "removed"].filter((v) => kinds.has(v)).join(" or ");
    const labels = [...new Set(tested.map((c) => c.label))].join(", ");
    warnings.push({ level: "stop", kind: "untested-change", text: N + (N === 1 ? " tested part was " : " tested parts were ") + verbs + " (" + labels + "), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one." });
  }
  const firstOf = (L, n) => L.dirs.find((d) => d.name === n);
  const fb = firstOf(B, "FIDELITY"), fa = firstOf(A, "FIDELITY");
  if ((fb && fb.args === "package") || (fa && fa.args === "package")) {
    const refs = [];
    for (const V of [B, A]) {
      const an = firstOf(V, "ANCHOR");
      if (an && an.args !== "") {
        const f = an.args.split(/[ \t]+/).filter((x) => x !== "");
        if (f.length && f[0].includes("@")) refs.push(f[0]);
      }
    }
    const citing = [];
    changes.forEach((c, k) => {
      if (!c.checked || c.kind !== "changed") return;
      const it = meta[k];
      const idx = it.cits.findIndex((e) => e.includes("FIDELITY package") ||
        e.split(/[ \t]+/).filter((x) => x !== "").some((t) => refs.includes(t.replace(REF_TAIL, ""))));
      if (idx >= 0) citing.push({ label: c.label, why: it.why[idx] });
    });
    if (citing.length) {
      let q = citing[0].why;
      if (q.startsWith("FIDELITY package — ")) q = q.slice("FIDELITY package — ".length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join("") + "…";
      warnings.push({ level: "stop", kind: "citation", text: "This contract promises to match the original package exactly, and " + citing.map((c) => c.label).join(" and ") + " still " + (citing.length === 1 ? "cites" : "cite") + " that package as the reason for the old behavior (\"" + q + "\"). The edit contradicts its own citation." });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: "ok", kind: "prose-only", text: "Only unchecked prose changed. The code is held to exactly what it was held to before." });
  }
  const stale = [...new Set(langs.filter((l) => l !== ""))];
  if (N > 0 && stale.length) {
    const names = stale.map((l) => (LANGS.has(l) ? LANGS.get(l) : l)).join(", ");
    const tail = stale.length === 1
      ? " file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it."
      : " files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.";
    warnings.push({ level: "note", kind: "stale-langs", text: "The " + names + tail });
  }
  return { unit, changes, warnings };
}

export default explain_diff;
