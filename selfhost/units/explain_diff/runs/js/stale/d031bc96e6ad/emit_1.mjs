const OPENERS = " \t([{,=:;|<>!&-~";
const trimST = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");
const fieldsST = (s) => s.split(/[ \t]+/).filter((x) => x !== "");
const nonempty = (x) => x !== "";

function quotedSpans(p) {
  const spans = [];
  let prevClose = -2;
  let i = 0;
  while (i < p.length) {
    if (p[i] === '"' && (i === 0 || OPENERS.includes(p[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let found = -1;
      while (j < p.length) {
        const c = p[j];
        if (c === "\\") {
          const a = p.charCodeAt(j + 1);
          const b = p.charCodeAt(j + 2);
          j += a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff ? 3 : 2;
        } else if (c === '"') {
          found = j;
          break;
        } else j++;
      }
      if (found < 0) break;
      spans.push([i, found]);
      prevClose = found;
      i = found + 1;
    } else i++;
  }
  return spans;
}

const inside = (spans, k) => spans.some(([s, e]) => k > s && k < e);

function splitAttributes(piece) {
  const spans = quotedSpans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks = [];
  let m;
  while ((m = re.exec(piece)) !== null) {
    const kwStart = m.index + m[0].length - m[1].length;
    if (!inside(spans, kwStart)) marks.push({ index: m.index, end: m.index + m[0].length, kw: m[1] });
  }
  if (!marks.length) return { body: trimST(piece), attrs: [] };
  const attrs = marks.map((mk, n) => {
    const stop = n + 1 < marks.length ? marks[n + 1].index : piece.length;
    return [mk.kw, trimST(piece.slice(mk.end, stop))];
  });
  return { body: trimST(piece.slice(0, marks[0].index)), attrs };
}

function parse(text) {
  const dirs = [];
  let cur = null;
  const lead = new RegExp("^[ \\t\\uFEFF]*");
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const l0 = lead.exec(raw)[0];
    const indent = l0.split("﻿").join("");
    let line = indent + raw.slice(l0.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const content = line.slice(indent.length);
    if (content[0] === "#") continue;
    const spans = quotedSpans(content);
    let code = content;
    for (let k = 1; k < content.length; k++) {
      if (content[k] === "#" && /[ \t]/.test(content[k - 1]) && (k + 1 === content.length || /[ \t]/.test(content[k + 1])) && !inside(spans, k)) {
        code = content.slice(0, k).replace(/[ \t]+$/, "");
        break;
      }
    }
    let isDir = false;
    if (indent === "") {
      let sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? "" : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED") {
        const r = splitAttributes(rest);
        cur = { name, args: r.body, pieces: [], attrs: r.attrs };
        dirs.push(cur);
        isDir = true;
      }
    }
    if (!isDir) {
      if (!cur) continue;
      const r = splitAttributes(" " + code);
      for (const a of r.attrs) cur.attrs.push(a);
      if (r.body !== "") cur.pieces.push(r.body);
    }
  }
  return dirs;
}

function readable(s) {
  return s
    .replace(/\bR(\d+)\s*[-–]\s*R?(\d+)\b/g, "rules $1–$2")
    .replace(/\bR(\d+)\b/g, "rule $1");
}

const PIN_KINDS = new Map([
  ["regex", "pattern"], ["charset", "character set"], ["grammar", "grammar"], ["text", "exact text"],
  ["set", "set"], ["const", "constant"], ["constant", "constant"], ["names", "names"],
  ["number", "number"], ["chars", "characters"], ["order", "order"], ["map", "mapping"], ["bytes", "bytes"],
]);
const OTHER_LABELS = new Map([
  ["ORACLE", "The tests (file and fingerprint)"], ["ORACLE-CLASS", "Kind of tests"],
  ["STATE", "What it changes in place"], ["SEAM", "Export shape"], ["TRACE-SEAM", "Effect boundary"],
  ["SRC", "Source location"], ["EFFECT", "Effect"], ["SURFACE", "Module surface"], ["EMIT", "Emits"],
  ["REQUEST", "Requests"], ["BRANCH", "Branch"], ["ON-ERROR", "On error"], ["PAR", "Unordered window"],
  ["RING", "Token ring"], ["LIFECYCLE", "Resource lifecycle"], ["REACH", "Off-path unit"],
  ["TRIGGER", "Trigger"], ["EARNED", "Earned rule"], ["BEHAVIOR", "Behavior header"],
]);
const KNOWN_OTHER = new Set(["SIR", "VARIANT", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "NOTES", "GUARD-PINNED", "LANG", "PRIMARY-SHA256", "ABI", "MECHANISM"]);
const NAMED = new Set(["UNIT", "KIND", "FIDELITY", "ANCHOR", "DESCRIPTION", "SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "PINNED", "TABLE", "CARRIED", "DEPENDS-ON", "INVARIANT", "SCOPE", "NOTE", "RATIONALE", "PROVENANCE"]);
const isRule = (n) => /^R[0-9]+$/.test(n);
const is = (n) => (d) => d.name === n;

function otherLabel(d) {
  if (OTHER_LABELS.has(d.name)) return OTHER_LABELS.get(d.name);
  if (KNOWN_OTHER.has(d.name)) return d.name;
  return d.name + " (not in the SIR vocabulary)";
}

const fixed = (s) => () => s;
const SECTIONS = [
  { title: "What kind of unit it is", tested: true, rows: [[is("UNIT"), fixed("Name")], [is("KIND"), fixed("Kind")], [is("FIDELITY"), fixed("Fidelity")], [is("ANCHOR"), fixed("Anchor")]] },
  { title: "What it is for", tested: false, rows: [[is("DESCRIPTION"), fixed(null)]] },
  { title: "What it accepts", tested: true, rows: [[is("SIG"), fixed("Signature")], [is("ENVELOPE"), fixed("Inputs it is verified on")], [is("UNGUARDED-PRECONDITION"), fixed("Assumes, without checking")], [is("OUT-OF-DOMAIN"), fixed("Not covered")]] },
  { title: "What it does", tested: true, rows: [[(d) => isRule(d.name), (d) => "Rule " + d.name.slice(1)]] },
  { title: "Exact definitions", tested: true, rows: [[is("PINNED"), null]] },
  { title: "Decision table", tested: true, rows: [[is("TABLE"), fixed(null)]] },
  { title: "Data it carries", tested: true, rows: [[is("CARRIED"), (d) => fieldsST(d.args)[0] || "Carried data"]] },
  { title: "What it depends on", tested: true, rows: [[is("DEPENDS-ON"), fixed(null)]] },
  {
    title: "Other parts of the contract", tested: true,
    rows: [[(d) => !NAMED.has(d.name) && !isRule(d.name) && (d.name !== "BEHAVIOR" || joined(d) !== "" || d.attrs.length > 0), otherLabel]],
  },
  { title: "Should always hold", tested: false, rows: [[is("INVARIANT"), fixed(null)]] },
  { title: "In and out of scope", tested: false, rows: [[is("SCOPE"), fixed(null)]] },
  { title: "Background", tested: false, rows: [[is("NOTE"), fixed("Note")], [is("RATIONALE"), fixed("Why")], [is("PROVENANCE"), fixed("Where it came from")]] },
];

function joined(d) {
  return [d.args, ...d.pieces].filter(nonempty).join(" ");
}

function makeItems(dirs) {
  const items = [];
  const counts = new Map();
  for (const sec of SECTIONS) {
    for (const [test, labelFn] of sec.rows) {
      for (const d of dirs) {
        if (!test(d)) continue;
        const raw = joined(d);
        let shown = raw;
        let base = d.name;
        let label = labelFn ? labelFn(d) : null;
        if (d.name === "PINNED" && sec.title === "Exact definitions") {
          const eq = d.args.indexOf("=");
          const head = eq < 0 ? d.args : d.args.slice(0, eq);
          const val = eq < 0 ? "" : d.args.slice(eq + 1);
          const f = fieldsST(head).map((x) => x.trim());
          const kind = f[0] || "";
          const name = f[1] || "";
          shown = [val.trim(), ...d.pieces].filter(nonempty).join(" ");
          base = name === "" ? "PIN" : "PIN:" + name;
          const phrase = PIN_KINDS.has(kind) ? PIN_KINDS.get(kind) : kind !== "" ? kind : "no kind";
          label = (name === "" ? "(unnamed pin)" : name) + " (" + phrase + ")";
        }
        if (d.name === "DEPENDS-ON" && /^none$/i.test(raw)) shown = "Nothing. No other package is involved.";
        const rawCites = d.attrs.map(([k, v]) => (v === "" ? k : k + " " + v));
        const why = d.attrs.map(([k, v]) => readable(k === "CITED" ? v : k === "EARNED" ? "added after a failed test (" + v + ")" : "anchored to " + v));
        items.push({ section: sec.title, tested: sec.tested, base, label, raw, text: readable(shown), rawCites, why });
      }
    }
  }
  for (const it of items) {
    const k = (counts.get(it.base) || 0) + 1;
    counts.set(it.base, k);
    it.id = k === 1 ? it.base : it.base + " #" + k;
    it.group = JSON.stringify([it.section, it.id.replace(/\s#\d+$/, "")]);
  }
  return items;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function diffTokens(a, b) {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  const n = A.length;
  const m = B.length;
  const L = [];
  for (let i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const emit = (op, text) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { emit("=", A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { emit("-", A[i]); i++; }
    else { emit("+", B[j]); j++; }
  }
  while (i < n) emit("-", A[i++]);
  while (j < m) emit("+", B[j++]);
  return out;
}

function diff(a, b) {
  const s1 = diffTokens(a, b);
  const out = [];
  let k = 0;
  while (k < s1.length) {
    const e = s1[k];
    if (e.op === "=") { out.push({ op: "=", text: e.text }); k++; continue; }
    let del = "";
    let ins = "";
    let last = k;
    for (let m = k; m < s1.length; m++) {
      const x = s1[m];
      if (x.op === "-") { del += x.text; last = m; }
      else if (x.op === "+") { ins += x.text; last = m; }
      else {
        const t = x.text.trim();
        const glue = m + 1 < s1.length && (t === "" || t.split(/\s+/).length <= 2);
        if (glue) { del += x.text; ins += x.text; } else break;
      }
    }
    if (del !== "") out.push({ op: "-", text: del });
    if (ins !== "") out.push({ op: "+", text: ins });
    k = last + 1;
  }
  return out.filter((e) => e.text !== "");
}

const firstDir = (dirs, n) => dirs.find((d) => d.name === n);

export function explain_diff(before, after, oracleChanged, langs) {
  const bd = parse(before);
  const ad = parse(after);
  const bi = makeItems(bd);
  const ai = makeItems(ad);

  const groups = new Map();
  for (const it of bi) {
    if (!groups.has(it.group)) groups.set(it.group, { b: [], a: [] });
    groups.get(it.group).b.push(it);
  }
  for (const it of ai) {
    if (!groups.has(it.group)) groups.set(it.group, { b: [], a: [] });
    groups.get(it.group).a.push(it);
  }
  const pairOf = new Map();
  const unpairedBefore = [];
  for (const g of groups.values()) {
    const usedA = new Set();
    const usedB = new Set();
    for (const b of g.b) {
      const a = g.a.find((x) => !usedA.has(x) && x.raw === b.raw && sameList(x.rawCites, b.rawCites));
      if (a) { usedA.add(a); usedB.add(b); pairOf.set(a, b); }
    }
    const lb = g.b.filter((x) => !usedB.has(x));
    const la = g.a.filter((x) => !usedA.has(x));
    lb.forEach((b, n) => {
      if (n < la.length) { pairOf.set(la[n], b); usedA.add(la[n]); }
      else unpairedBefore.push(b);
    });
  }

  const changes = [];
  const meta = [];
  for (const a of ai) {
    const b = pairOf.get(a);
    const lab = a.label == null ? a.section : a.label;
    if (!b) {
      changes.push({ checked: a.tested, id: a.id, kind: "added", label: lab, section: a.section, text: a.text });
      meta.push(null);
    } else if (!(a.raw === b.raw && sameList(a.rawCites, b.rawCites))) {
      let d = diff(b.text, a.text);
      if (!d.some((e) => e.op !== "=")) d = diff(b.raw, a.raw);
      const wd = sameList(a.rawCites, b.rawCites) ? null : diff(b.rawCites.join("; "), a.rawCites.join("; "));
      changes.push({ checked: a.tested, diff: d, id: a.id, kind: "changed", label: lab, section: a.section, whyDiff: wd });
      meta.push(a);
    }
  }
  for (const b of unpairedBefore) {
    changes.push({ checked: b.tested, id: b.id, kind: "removed", label: b.label == null ? b.section : b.label, section: b.section, text: b.text });
    meta.push(null);
  }

  const warnings = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = ["changed", "added", "removed"].filter((k) => tested.some((c) => c.kind === k));
    const labels = [];
    for (const c of tested) if (!labels.includes(c.label)) labels.push(c.label);
    warnings.push({
      kind: "untested-change",
      level: "stop",
      text: N + (N === 1 ? " tested part was " : " tested parts were ") + kinds.join(" or ") + " (" + labels.join(", ") + "), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.",
    });
  }

  const fb = firstDir(bd, "FIDELITY");
  const fa = firstDir(ad, "FIDELITY");
  if ((fb && fb.args === "package") || (fa && fa.args === "package")) {
    const refs = [];
    for (const dirs of [bd, ad]) {
      const an = firstDir(dirs, "ANCHOR");
      if (an) {
        const f = fieldsST(an.args)[0];
        if (f && f.includes("@")) refs.push(f);
      }
    }
    const citing = [];
    changes.forEach((c, idx) => {
      if (!c.checked || c.kind !== "changed") return;
      const it = meta[idx];
      const pos = it.rawCites.findIndex((r) => r.includes("FIDELITY package") || fieldsST(r).some((t) => refs.includes(t.replace(/[.,;:)\]]+$/, ""))));
      if (pos >= 0) citing.push({ label: c.label, why: it.why[pos] });
    });
    if (citing.length) {
      let q = citing[0].why;
      const pre = "FIDELITY package — ";
      if (q.startsWith(pre)) q = q.slice(pre.length);
      const cp = Array.from(q);
      if (cp.length > 110) q = cp.slice(0, 109).join("") + "…";
      warnings.push({
        kind: "citation",
        level: "stop",
        text: "This contract promises to match the original package exactly, and " + citing.map((c) => c.label).join(" and ") + " still " + (citing.length === 1 ? "cites" : "cite") + " that package as the reason for the old behavior (\"" + q + "\"). The edit contradicts its own citation.",
      });
    }
  }

  if (N === 0 && changes.length > 0) {
    warnings.push({ kind: "prose-only", level: "ok", text: "Only unchecked prose changed. The code is held to exactly what it was held to before." });
  }

  const stale = [];
  if (Array.isArray(langs)) for (const l of langs) if (l !== "" && !stale.includes(l)) stale.push(l);
  if (N > 0 && stale.length > 0) {
    const names = new Map([["js", "JavaScript"], ["ts", "TypeScript"], ["rust", "Rust"]]);
    const nm = stale.map((l) => (names.has(l) ? names.get(l) : l));
    warnings.push({
      kind: "stale-langs",
      level: "note",
      text: "The " + nm.join(", ") + (stale.length === 1
        ? " file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it."
        : " files were written against the old version. They go out of date until someone reviews them against this one and re-binds them."),
    });
  }

  const u = firstDir(ad, "UNIT");
  const unit = u && u.args !== "" ? u.args : "(unnamed)";
  return { changes, unit, warnings };
}

export default explain_diff;
