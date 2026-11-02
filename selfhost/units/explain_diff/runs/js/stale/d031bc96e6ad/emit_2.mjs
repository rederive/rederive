const EN = String.fromCharCode(0x2013);
const EM = String.fromCharCode(0x2014);
const ELL = String.fromCharCode(0x2026);
const BOM = String.fromCharCode(0xfeff);
const OPEN = " \t([{,=:;|<>!&-~";
const LEAD = new RegExp("^[ \\t" + BOM + "]*");
const BOMS = new RegExp(BOM, "g");
const RANGE = new RegExp("\\bR(\\d+)\\s*[-" + EN + "]\\s*R?(\\d+)\\b", "g");
const SINGLE = /\bR(\d+)\b/g;
const REF_TAIL = /[.,;:)\]]+$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;

const trimST = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");
const fields = (s) => s.split(/[ \t]+/).filter((x) => x !== "");
const readable = (s) => s.replace(RANGE, "rules $1" + EN + "$2").replace(SINGLE, "rule $1");

function qspans(s) {
  const out = [];
  const n = s.length;
  let i = 0;
  let prev = -1;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || i === prev + 1 || OPEN.includes(s[i - 1]))) {
      let j = i + 1;
      let c = -1;
      while (j < n) {
        if (s[j] === "\\") {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
          continue;
        }
        if (s[j] === '"') { c = j; break; }
        j++;
      }
      if (c < 0) break;
      out.push([i, c]);
      prev = c;
      i = c + 1;
    } else i++;
  }
  return out;
}

function splitAttrs(piece) {
  const sp = qspans(piece);
  const marks = [];
  const re = new RegExp(ATTR.source, "g");
  let m;
  while ((m = re.exec(piece))) {
    const ks = m.index + m[0].length - m[1].length;
    if (sp.some(([a, b]) => ks > a && ks < b)) continue;
    marks.push({ idx: m.index, kw: m[1], vs: m.index + m[0].length });
  }
  if (!marks.length) return { body: trimST(piece), attrs: [] };
  const attrs = marks.map((mk, k) => ({
    kw: mk.kw,
    value: trimST(piece.slice(mk.vs, k + 1 < marks.length ? marks[k + 1].idx : piece.length)),
  }));
  return { body: trimST(piece.slice(0, marks[0].idx)), attrs };
}

function parse(text) {
  const dirs = [];
  let cur = null;
  for (let raw of text.split(/\r\n|\r|\n/)) {
    const lead = raw.match(LEAD)[0];
    let line = lead.replace(BOMS, "") + raw.slice(lead.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = line.match(/^[ \t]*/)[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") continue;
    const sp = qspans(content);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== "#") continue;
      if (content[i - 1] !== " " && content[i - 1] !== "\t") continue;
      if (i + 1 < content.length && content[i + 1] !== " " && content[i + 1] !== "\t") continue;
      if (sp.some(([a, b]) => i > a && i < b)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, "");
      break;
    }
    let isNew = false;
    let name = "";
    let rest = "";
    if (indent === "") {
      const k = code.search(/[ \t]/);
      name = k < 0 ? code : code.slice(0, k);
      rest = k < 0 ? "" : code.slice(k);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED") isNew = true;
    }
    if (isNew) {
      const r = splitAttrs(rest);
      cur = { name, args: r.body, pieces: [], attrs: r.attrs.slice() };
      dirs.push(cur);
    } else if (cur) {
      const r = splitAttrs(" " + code);
      for (const a of r.attrs) cur.attrs.push(a);
      if (r.body !== "") cur.pieces.push(r.body);
    }
  }
  return dirs;
}

const PIN_KINDS = new Map(Object.entries({
  regex: "pattern", charset: "character set", grammar: "grammar", text: "exact text", set: "set",
  const: "constant", constant: "constant", names: "names", number: "number", chars: "characters",
  order: "order", map: "mapping", bytes: "bytes",
}));
const OTHER = new Map(Object.entries({
  ORACLE: "The tests (file and fingerprint)", "ORACLE-CLASS": "Kind of tests", STATE: "What it changes in place",
  SEAM: "Export shape", "TRACE-SEAM": "Effect boundary", SRC: "Source location", EFFECT: "Effect",
  SURFACE: "Module surface", EMIT: "Emits", REQUEST: "Requests", BRANCH: "Branch", "ON-ERROR": "On error",
  PAR: "Unordered window", RING: "Token ring", LIFECYCLE: "Resource lifecycle", REACH: "Off-path unit",
  TRIGGER: "Trigger", EARNED: "Earned rule", BEHAVIOR: "Behavior header",
}));
const KNOWN = new Set(["SIR", "VARIANT", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "NOTES", "GUARD-PINNED", "LANG", "PRIMARY-SHA256", "ABI", "MECHANISM", "CITED"]);
const NAMED = new Set(["UNIT", "KIND", "FIDELITY", "ANCHOR", "DESCRIPTION", "SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "PINNED", "TABLE", "CARRIED", "DEPENDS-ON", "INVARIANT", "SCOPE", "NOTE", "RATIONALE", "PROVENANCE"]);
const isRule = (n) => /^R[0-9]+$/.test(n);
const lab = (o) => (d) => o[d.name];
const SECTIONS = [
  ["What kind of unit it is", true, [["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]]],
  ["What it is for", false, [["DESCRIPTION", null]]],
  ["What it accepts", true, [["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]]],
  ["What it does", true, "rules"],
  ["Exact definitions", true, [["PINNED", "pin"]]],
  ["Decision table", true, [["TABLE", null]]],
  ["Data it carries", true, [["CARRIED", "carried"]]],
  ["What it depends on", true, [["DEPENDS-ON", null]]],
  ["Other parts of the contract", true, "other"],
  ["Should always hold", false, [["INVARIANT", null]]],
  ["In and out of scope", false, [["SCOPE", null]]],
  ["Background", false, [["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]]],
];

function joined(d) {
  return [d.args, ...d.pieces].filter((x) => x !== "").join(" ");
}

function mkItem(d, section, tested, label, base) {
  const rawText = joined(d);
  let shown = rawText;
  if (d.name === "PINNED") {
    const eq = d.args.indexOf("=");
    const value = eq < 0 ? "" : d.args.slice(eq + 1);
  void value;
  }
  const cits = d.attrs.map((a) => (a.value === "" ? a.kw : a.kw + " " + a.value));
  const why = d.attrs.map((a) =>
    readable(a.kw === "CITED" ? a.value : a.kw === "EARNED" ? "added after a failed test (" + a.value + ")" : "anchored to " + a.value));
  if (d.name === "DEPENDS-ON" && rawText.toLowerCase() === "none" && /^none$/i.test(rawText)) shown = "Nothing. No other package is involved.";
  return { section, tested, label, base, raw: rawText, shown, cits, why };
}

function items(text) {
  const dirs = parse(text);
  const out = [];
  const used = new Set();
  const add = (d, title, tested, label, base, shown) => {
    const it = mkItem(d, title, tested, label, base);
    if (shown !== undefined) it.shown = shown;
    it.text = readable(it.shown);
    out.push(it);
  };
  for (const [title, tested, rows] of SECTIONS) {
    if (rows === "rules") {
      for (const d of dirs) if (isRule(d.name)) add(d, title, tested, "Rule " + d.name.slice(1), d.name);
    } else if (rows === "other") {
      for (const d of dirs) {
        if (NAMED.has(d.name) || isRule(d.name)) continue;
        if (d.name === "BEHAVIOR" && joined(d) === "" && d.attrs.length === 0) continue;
        const l = OTHER.has(d.name) ? OTHER.get(d.name) : KNOWN.has(d.name) ? d.name : d.name + " (not in the SIR vocabulary)";
        add(d, title, tested, l, d.name);
      }
    } else {
      for (const [nm, l] of rows) {
        for (const d of dirs) {
          if (d.name !== nm) continue;
          if (l === "pin") {
            const eq = d.args.indexOf("=");
            const head = eq < 0 ? d.args : d.args.slice(0, eq);
            const value = eq < 0 ? "" : d.args.slice(eq + 1);
            const f = fields(head).map((x) => x.trim());
            const kind = f[0] || "";
            const pname = f[1] || "";
            const phrase = PIN_KINDS.has(kind) ? PIN_KINDS.get(kind) : kind !== "" ? kind : "no kind";
            const shown = [value.trim(), ...d.pieces].filter((x) => x !== "").join(" ");
            add(d, title, tested, (pname === "" ? "(unnamed pin)" : pname) + " (" + phrase + ")", pname === "" ? "PIN" : "PIN:" + pname, shown);
          } else if (l === "carried") {
            const f = fields(d.args);
            add(d, title, tested, f.length ? f[0] : "Carried data", d.name);
          } else add(d, title, tested, l, d.name);
        }
      }
    }
  }
  void used;
  const counts = new Map();
  for (const it of out) {
    const k = (counts.get(it.base) || 0) + 1;
    counts.set(it.base, k);
    it.id = k === 1 ? it.base : it.base + " #" + k;
    it.group = it.section + "|" + it.id.replace(/\s#\d+$/, "");
  }
  return { out, dirs };
}

function tokens(s) {
  return s.split(/(\s+)/);
}

function diff(a, b) {
  const A = tokens(a);
  const B = tokens(b);
  const n = A.length;
  const m = B.length;
  const W = m + 1;
  const L = new Int32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    }
  }
  const list = [];
  const push = (op, text) => {
    const last = list[list.length - 1];
    if (last && last.op === op) last.text += text;
    else list.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("=", A[i]); i++; j++; }
    else if (L[(i + 1) * W + j] >= L[i * W + j + 1]) { push("-", A[i]); i++; }
    else { push("+", B[j]); j++; }
  }
  while (i < n) push("-", A[i++]);
  while (j < m) push("+", B[j++]);
  const res = [];
  let k = 0;
  while (k < list.length) {
    const e = list[k];
    if (e.op === "=") { res.push(e); k++; continue; }
    let del = "";
    let ins = "";
    let last = k;
    let q = k;
    while (q < list.length) {
      const x = list[q];
      if (x.op === "-") { del += x.text; last = q; }
      else if (x.op === "+") { ins += x.text; last = q; }
      else {
        const t = x.text.trim();
        const glue = q + 1 < list.length && (t === "" || t.split(/\s+/).length <= 2);
        if (glue) { del += x.text; ins += x.text; } else break;
      }
      q++;
    }
    if (del !== "") res.push({ op: "-", text: del });
    if (ins !== "") res.push({ op: "+", text: ins });
    k = last + 1;
  }
  return res.filter((e) => e.text !== "");
}

const sameList = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);

export function explain_diff(before, after, oracleChanged, langs) {
  const B = items(before);
  const A = items(after);
  const groups = [];
  const gm = new Map();
  for (const it of [...B.out, ...A.out]) if (!gm.has(it.group)) { gm.set(it.group, { b: [], a: [] }); groups.push(it.group); }
  for (const it of B.out) gm.get(it.group).b.push(it);
  for (const it of A.out) gm.get(it.group).a.push(it);
  const pairOf = new Map();
  const unpairedBefore = [];
  for (const g of groups) {
    const { b, a } = gm.get(g);
    const bp = new Set();
    const ap = new Set();
    for (const x of b) {
      for (const y of a) {
        if (ap.has(y)) continue;
        if (x.raw === y.raw && sameList(x.cits, y.cits)) { pairOf.set(y, x); ap.add(y); bp.add(x); break; }
      }
    }
    const lb = b.filter((x) => !bp.has(x));
    const la = a.filter((y) => !ap.has(y));
    const n = Math.min(lb.length, la.length);
    for (let i = 0; i < n; i++) pairOf.set(la[i], lb[i]);
    for (let i = n; i < lb.length; i++) unpairedBefore.push(lb[i]);
  }
  const changes = [];
  const afterOf = [];
  const base = (it, kind) => ({ section: it.section, id: it.id, label: it.label === null ? it.section : it.label, kind, checked: it.tested });
  for (const y of A.out) {
    const x = pairOf.get(y);
    if (!x) {
      changes.push({ ...base(y, "added"), text: y.text });
      afterOf.push(y);
    } else if (!(x.raw === y.raw && sameList(x.cits, y.cits))) {
      let d = diff(x.text, y.text);
      if (!d.some((e) => e.op !== "=")) d = diff(x.raw, y.raw);
      const wd = sameList(x.cits, y.cits) ? null : diff(x.cits.join("; "), y.cits.join("; "));
      changes.push({ ...base(y, "changed"), diff: d, whyDiff: wd });
      afterOf.push(y);
    }
  }
  for (const x of unpairedBefore) { changes.push({ ...base(x, "removed"), text: x.text }); afterOf.push(null); }

  const firstUnit = A.dirs.find((d) => d.name === "UNIT");
  const unit = firstUnit && firstUnit.args !== "" ? firstUnit.args : "(unnamed)";
  const warnings = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((c) => c.kind));
    const verbs = ["changed", "added", "removed"].filter((v) => kinds.has(v)).join(" or ");
    const labels = [];
    for (const c of tested) if (!labels.includes(c.label)) labels.push(c.label);
    warnings.push({
      level: "stop",
      kind: "untested-change",
      text: N + (N === 1 ? " tested part was " : " tested parts were ") + verbs + " (" + labels.join(", ") +
        "), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.",
    });
  }
  const fid = (dirs) => dirs.find((d) => d.name === "FIDELITY");
  const fb = fid(B.dirs);
  const fa = fid(A.dirs);
  if ((fb && fb.args === "package") || (fa && fa.args === "package")) {
    const refs = [];
    for (const dirs of [B.dirs, A.dirs]) {
      const an = dirs.find((d) => d.name === "ANCHOR");
      if (!an) continue;
      const f = fields(an.args);
      if (f.length && f[0].includes("@")) refs.push(f[0]);
    }
    const citing = [];
    changes.forEach((c, idx) => {
      if (!c.checked || c.kind !== "changed") return;
      const it = afterOf[idx];
      const pos = it.cits.findIndex((e) => e.includes("FIDELITY package") || fields(e).some((t) => refs.includes(t.replace(REF_TAIL, ""))));
      if (pos >= 0) citing.push({ label: c.label, why: it.why[pos] });
    });
    if (citing.length) {
      let q = citing[0].why;
      const pre = "FIDELITY package " + EM + " ";
      if (q.startsWith(pre)) q = q.slice(pre.length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join("") + ELL;
      warnings.push({
        level: "stop",
        kind: "citation",
        text: "This contract promises to match the original package exactly, and " + citing.map((c) => c.label).join(" and ") +
          " still " + (citing.length === 1 ? "cites" : "cite") + " that package as the reason for the old behavior (\"" + q +
          "\"). The edit contradicts its own citation.",
      });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: "ok", kind: "prose-only", text: "Only unchecked prose changed. The code is held to exactly what it was held to before." });
  }
  const stale = [];
  for (const l of Array.from(langs)) if (l !== "" && !stale.includes(l)) stale.push(l);
  if (N > 0 && stale.length) {
    const names = new Map([["js", "JavaScript"], ["ts", "TypeScript"], ["rust", "Rust"]]);
    const nm = stale.map((l) => (names.has(l) ? names.get(l) : l)).join(", ");
    warnings.push({
      level: "note",
      kind: "stale-langs",
      text: "The " + nm + (stale.length === 1
        ? " file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it."
        : " files were written against the old version. They go out of date until someone reviews them against this one and re-binds them."),
    });
  }
  return { unit, changes, warnings };
}

export default explain_diff;
