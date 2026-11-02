const FE = String.fromCharCode(0xfeff);
const RET = String.fromCharCode(0x23ce);
const EM = String.fromCharCode(0x2014);
const ELL = String.fromCharCode(0x2026);
const LEAD = new RegExp("^[ \\t" + FE + "]*");
const OPEN = " \t([{,=:;|<>!&-~";
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const COMMENT_LEAD = /^#+[ \t]?/;
const REF_TAIL = /[.,;:)\]]+$/;
const trimST = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");

function spans(s) {
  const out = [];
  let i = 0;
  let prevClose = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPEN.includes(s[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let found = -1;
      while (j < s.length) {
        if (s[j] === "\\") {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
          continue;
        }
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
const inside = (sp, p) => sp.some(([a, b]) => a < p && p < b);

function splitAttrs(piece) {
  const sp = spans(piece);
  const marks = [];
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(piece)) !== null) {
    const kwStart = m.index + m[0].length - m[1].length;
    if (inside(sp, kwStart)) continue;
    marks.push({ idx: m.index, end: m.index + m[0].length, kw: m[1] });
  }
  if (!marks.length) return { body: trimST(piece), attrs: [] };
  const attrs = marks.map((mk, k) => ({
    kw: mk.kw,
    value: trimST(piece.slice(mk.end, k + 1 < marks.length ? marks[k + 1].idx : piece.length)),
  }));
  return { body: trimST(piece.slice(0, marks[0].idx)), attrs };
}

function parse(text) {
  const dirs = [];
  const strays = [];
  let cur = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < lines.length; n++) {
    let line = lines[n].replace(LEAD, (m) => m.split(FE).join(""));
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ n: n + 1, text: content });
      continue;
    }
    const sp = spans(content);
    let code = content;
    let tc = null;
    for (let i = 1; i < content.length; i++) {
      if (content[i] === "#" && (content[i - 1] === " " || content[i - 1] === "\t") &&
        (i + 1 === content.length || content[i + 1] === " " || content[i + 1] === "\t") && !inside(sp, i)) {
        code = content.slice(0, i).replace(/[ \t]+$/, "");
        tc = trimST(content.slice(i + 1));
        break;
      }
    }
    let isDir = false;
    let name = "";
    let rest = "";
    if (indent === "") {
      const k = code.search(/[ \t]/);
      name = k < 0 ? code : code.slice(0, k);
      rest = k < 0 ? "" : code.slice(k);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED") isDir = true;
    }
    if (isDir) {
      const r = splitAttrs(rest);
      cur = { name, args: r.body, pieces: [], attrs: r.attrs, comments: tc !== null ? [tc] : [] };
      dirs.push(cur);
    } else if (!cur) {
      strays.push({ n: n + 1, text: content });
    } else {
      const r = splitAttrs(" " + code);
      for (const a of r.attrs) cur.attrs.push(a);
      if (r.body !== "") cur.pieces.push(r.body);
      if (tc !== null) cur.comments.push(tc);
    }
  }
  return { dirs, strays };
}

const joinedOf = (d) => [d.args, ...d.pieces].filter((x) => x !== "").join(d.name === "TABLE" ? " " + RET + " " : " ");
function rawOf(d) {
  let r = [d.args, ...d.pieces].filter((x) => x !== "").join(d.name === "TABLE" ? "\n" : " ");
  if (d.comments.length) r += " # " + d.comments.join(" # ");
  return r;
}
const fields = (s) => s.split(/[ \t]+/).filter((x) => x !== "");

const PIN_KINDS = new Map([["regex", "pattern"], ["charset", "character set"], ["grammar", "grammar"], ["text", "exact text"],
  ["set", "set"], ["const", "constant"], ["constant", "constant"], ["names", "names"], ["number", "number"],
  ["chars", "characters"], ["order", "order"], ["map", "mapping"], ["bytes", "bytes"]]);
const OTHER_LABELS = new Map([["ORACLE", "The tests (file and fingerprint)"], ["ORACLE-CLASS", "Kind of tests"],
  ["STATE", "What it changes in place"], ["SEAM", "Export shape"], ["TRACE-SEAM", "Effect boundary"],
  ["SRC", "Source location"], ["EFFECT", "Effect"], ["SURFACE", "Module surface"], ["EMIT", "Emits"],
  ["REQUEST", "Requests"], ["BRANCH", "Branch"], ["ON-ERROR", "On error"], ["PAR", "Unordered window"],
  ["RING", "Token ring"], ["LIFECYCLE", "Resource lifecycle"], ["REACH", "Off-path unit"], ["TRIGGER", "Trigger"],
  ["EARNED", "Earned rule"], ["BEHAVIOR", "Behavior header"]]);
const KNOWN_OTHER = new Set(["SIR", "VARIANT", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "NOTES",
  "GUARD-PINNED", "LANG", "PRIMARY-SHA256", "ABI", "MECHANISM", "CITED"]);
const NAMED = new Set(["UNIT", "KIND", "FIDELITY", "ANCHOR", "DESCRIPTION", "SIG", "ENVELOPE", "UNGUARDED-PRECONDITION",
  "OUT-OF-DOMAIN", "PINNED", "TABLE", "CARRIED", "DEPENDS-ON", "INVARIANT", "SCOPE", "NOTE", "RATIONALE", "PROVENANCE"]);
const isRule = (n) => /^R[0-9]+$/.test(n);

const nm = (name, label) => ({ match: (d) => d.name === name, label: () => label });
const ROWS = [
  ["What kind of unit it is", true, [nm("UNIT", "Name"), nm("KIND", "Kind"), nm("FIDELITY", "Fidelity"), nm("ANCHOR", "Anchor")]],
  ["What it is for", false, [nm("DESCRIPTION", null)]],
  ["What it accepts", true, [nm("SIG", "Signature"), nm("ENVELOPE", "Inputs it is verified on"),
    nm("UNGUARDED-PRECONDITION", "Assumes, without checking"), nm("OUT-OF-DOMAIN", "Not covered")]],
  ["What it does", true, [{ match: (d) => isRule(d.name), label: (d) => "Rule " + d.name.slice(1) }]],
  ["Exact definitions", true, [{ match: (d) => d.name === "PINNED", label: () => null, pin: true }]],
  ["Decision table", true, [nm("TABLE", null)]],
  ["Data it carries", true, [{ match: (d) => d.name === "CARRIED", label: (d) => fields(d.args)[0] || "Carried data" }]],
  ["What it depends on", true, [nm("DEPENDS-ON", null)]],
  ["Other parts of the contract", true, [{
    match: (d) => !NAMED.has(d.name) && !isRule(d.name) && !(d.name === "BEHAVIOR" && joinedOf(d) === "" && d.attrs.length === 0),
    label: (d) => OTHER_LABELS.has(d.name) ? OTHER_LABELS.get(d.name) : KNOWN_OTHER.has(d.name) ? d.name : d.name + " (not in the SIR vocabulary)",
  }]],
  ["Text outside any directive", true, "stray"],
  ["Should always hold", false, [nm("INVARIANT", null)]],
  ["In and out of scope", false, [nm("SCOPE", null)]],
  ["Background", false, [nm("NOTE", "Note"), nm("RATIONALE", "Why"), nm("PROVENANCE", "Where it came from")]],
];

function whyOf(a) {
  const v = a.value;
  if (a.kw === "CITED") return v;
  if (a.kw === "EARNED") return v === "" ? "added after a failed test" : "added after a failed test (" + v + ")";
  return v === "" ? "anchored (no reference given)" : "anchored to " + v;
}

function mkItem(section, tested, d, label, text) {
  return {
    section, tested, base: d.name, label, raw: rawOf(d), text,
    cites: d.attrs.map((a) => (a.value === "" ? a.kw : a.kw + " " + a.value)),
    why: d.attrs.map(whyOf),
  };
}

function build(parsed) {
  const items = [];
  for (const [title, tested, rows] of ROWS) {
    if (rows === "stray") {
      for (const s of parsed.strays) items.push({ section: title, tested, base: "STRAY", label: "Line " + s.n, raw: s.text, text: s.text, cites: [], why: [] });
      continue;
    }
    for (const row of rows) {
      for (const d of parsed.dirs) {
        if (!row.match(d)) continue;
        if (row.pin) {
          const sp = spans(d.args);
          let eq = -1;
          for (let i = 0; i < d.args.length; i++) if (d.args[i] === "=" && !inside(sp, i)) { eq = i; break; }
          const head = eq < 0 ? d.args : d.args.slice(0, eq);
          const f = fields(head);
          const kind = f[0] || "";
          const name = f[1] || "";
          let text;
          let empty = "";
          if (eq >= 0) {
            text = [trimST(d.args.slice(eq + 1)), ...d.pieces].filter((x) => x !== "").join(" ");
            if (text === "") empty = ", empty value";
          } else text = joinedOf(d);
          const phrase = PIN_KINDS.has(kind) ? PIN_KINDS.get(kind) : kind !== "" ? kind : "no kind";
          const it = mkItem(title, tested, d, (name || "(unnamed pin)") + " (" + phrase + empty + ")", text);
          it.base = name === "" ? "PIN" : "PIN:" + name;
          items.push(it);
          continue;
        }
        let text = joinedOf(d);
        if (d.name === "DEPENDS-ON" && text.toLowerCase() === "none" && /^none$/i.test(text)) text = "Nothing. No other package is involved.";
        items.push(mkItem(title, tested, d, row.label(d), text));
      }
    }
  }
  const counts = new Map();
  for (const it of items) {
    const k = (counts.get(it.base) || 0) + 1;
    counts.set(it.base, k);
    it.id = k === 1 ? it.base : it.base + " #" + k;
  }
  return items;
}

function tok(t) { return t.split(/(\s+)/); }

function diff(a, b) {
  const A = tok(a);
  const B = tok(b);
  const n = A.length;
  const m = B.length;
  const L = [];
  for (let i = 0; i <= n; i++) L.push(new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const ents = [];
  const push = (op, text) => {
    const last = ents[ents.length - 1];
    if (last && last.op === op) last.text += text;
    else ents.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("=", A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push("-", A[i]); i++; }
    else { push("+", B[j]); j++; }
  }
  while (i < n) push("-", A[i++]);
  while (j < m) push("+", B[j++]);
  const out = [];
  let k = 0;
  while (k < ents.length) {
    if (ents[k].op === "=") { out.push({ op: "=", text: ents[k].text }); k++; continue; }
    let del = "";
    let ins = "";
    let last = k;
    let p = k;
    while (p < ents.length) {
      const e = ents[p];
      if (e.op === "-") { del += e.text; last = p; }
      else if (e.op === "+") { ins += e.text; last = p; }
      else {
        const tr = e.text.trim();
        const glue = p < ents.length - 1 && (tr === "" || tr.split(/\s+/).length <= 2);
        if (glue) { del += e.text; ins += e.text; } else break;
      }
      p++;
    }
    if (del !== "") out.push({ op: "-", text: del });
    if (ins !== "") out.push({ op: "+", text: ins });
    k = last + 1;
  }
  return out.filter((e) => e.text !== "");
}

const sameList = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
const grp = (it) => it.section + "\u0000" + it.id.replace(/ #\d+$/, "");

function header(dirs) {
  const first = (name) => dirs.find((d) => d.name === name && joinedOf(d) !== "");
  const f = first("FIDELITY") || first("VARIANT");
  const a = first("ANCHOR");
  return { fid: f ? joinedOf(f) : null, ref: a ? fields(joinedOf(a))[0] || null : null };
}

export function explain_diff(before, after, oracleChanged, langs) {
  const pb = parse(before);
  const pa = parse(after);
  const B = build(pb);
  const A = build(pa);
  const order = [];
  const seen = new Set();
  for (const it of [...B, ...A]) {
    const g = grp(it);
    if (!seen.has(g)) { seen.add(g); order.push(g); }
  }
  const pairOf = new Map();
  const unpairedBefore = [];
  for (const g of order) {
    const bs = B.filter((x) => grp(x) === g);
    const as = A.filter((x) => grp(x) === g);
    const usedA = new Set();
    const usedB = new Set();
    for (const b of bs) {
      const a = as.find((x) => !usedA.has(x) && x.raw === b.raw && sameList(x.cites, b.cites));
      if (a) { usedA.add(a); usedB.add(b); pairOf.set(a, b); }
    }
    const lb = bs.filter((x) => !usedB.has(x));
    const la = as.filter((x) => !usedA.has(x));
    for (let k = 0; k < lb.length; k++) {
      if (k < la.length) pairOf.set(la[k], lb[k]);
      else unpairedBefore.push(lb[k]);
    }
  }
  const changes = [];
  const afterOf = [];
  const mk = (it, kind) => ({ section: it.section, id: it.id, label: it.label === null ? it.section : it.label, kind, checked: it.tested });
  for (const a of A) {
    const b = pairOf.get(a);
    if (!b) {
      const c = mk(a, "added");
      c.text = a.text;
      changes.push(c);
      afterOf.push(a);
    } else if (!(b.raw === a.raw && sameList(b.cites, a.cites))) {
      const c = mk(a, "changed");
      let d = diff(b.text, a.text);
      if (!d.some((e) => e.op !== "=")) d = diff(b.raw, a.raw);
      c.diff = d;
      c.whyDiff = sameList(b.cites, a.cites) ? null : diff(b.cites.join("; "), a.cites.join("; "));
      changes.push(c);
      afterOf.push(a);
    }
  }
  for (const b of unpairedBefore) {
    const c = mk(b, "removed");
    c.text = b.text;
    changes.push(c);
    afterOf.push(null);
  }

  const warnings = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const verbs = ["changed", "added", "removed"].filter((v) => tested.some((c) => c.kind === v)).join(" or ");
    const labels = [...new Set(tested.map((c) => c.label))].join(", ");
    warnings.push({
      level: "stop", kind: "untested-change",
      text: N + (N === 1 ? " tested part was " : " tested parts were ") + verbs + " (" + labels +
        "), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.",
    });
  }
  const hb = header(pb.dirs);
  const ha = header(pa.dirs);
  if (hb.fid === "package" || ha.fid === "package") {
    const refs = [hb.ref, ha.ref].filter((r) => r && r.includes("@"));
    const citing = [];
    changes.forEach((c, ci) => {
      if (!c.checked || c.kind !== "changed") return;
      const it = afterOf[ci];
      const idx = it.cites.findIndex((e) => e.includes("FIDELITY package") ||
        e.split(/[ \t]+/).some((t) => t !== "" && refs.includes(t.replace(REF_TAIL, ""))));
      if (idx >= 0) citing.push({ label: c.label, why: it.why[idx] });
    });
    if (citing.length) {
      let q = citing[0].why;
      const pre = "FIDELITY package " + EM + " ";
      if (q.startsWith(pre)) q = q.slice(pre.length);
      const cp = Array.from(q);
      if (cp.length > 110) q = cp.slice(0, 109).join("") + ELL;
      warnings.push({
        level: "stop", kind: "citation",
        text: "This contract promises to match the original package exactly, and " + citing.map((x) => x.label).join(" and ") +
          " still " + (citing.length === 1 ? "cites" : "cite") + " that package as the reason for the old behavior (\"" + q +
          "\"). The edit contradicts its own citation.",
      });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: "ok", kind: "prose-only", text: "Only unchecked prose changed. The code is held to exactly what it was held to before." });
  }
  if (N > 0) {
    const stale = [...new Set(Array.from(langs).filter((l) => l !== ""))];
    if (stale.length) {
      const names = new Map([["js", "JavaScript"], ["ts", "TypeScript"], ["rust", "Rust"]]);
      const list = stale.map((l) => (names.has(l) ? names.get(l) : l)).join(", ");
      warnings.push({
        level: "note", kind: "stale-langs",
        text: "The " + list + (stale.length === 1
          ? " file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it."
          : " files were written against the old version. They go out of date until someone reviews them against this one and re-binds them."),
      });
    }
  }
  const un = (dirs, name) => dirs.find((d) => d.name === name && joinedOf(d) !== "");
  const ud = un(pa.dirs, "UNIT") || un(pa.dirs, "SIR");
  return { unit: ud ? joinedOf(ud) : "(unnamed)", changes, warnings };
}

export default explain_diff;
