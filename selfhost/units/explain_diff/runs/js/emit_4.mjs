const OPEN = " \t([{,=:;|<>!&-~";
const LEAD = new RegExp("^[ \\t\\uFEFF]*");
const FEFF = new RegExp("\\uFEFF", "g");
const ATTR_SRC = "[ \\t]+(CITED|EARNED|ANCHOR)(?=[ \\t]|$)";
const trimST = (s) => s.replace(/^[ \t]+|[ \t]+$/g, "");
const fields = (s) => s.split(/[ \t]+/).filter((x) => x !== "");

function quoted(s) {
  const sp = [];
  let i = 0, prev = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPEN.includes(s[i - 1]) || i === prev + 1)) {
      let j = i + 1, close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") {
          j += 1;
          const cp = s.codePointAt(j);
          j += cp === undefined ? 0 : cp > 0xffff ? 2 : 1;
          continue;
        }
        if (c === '"') { close = j; break; }
        j++;
      }
      if (close < 0) break;
      sp.push([i, close]);
      prev = close;
      i = close + 1;
    } else i++;
  }
  return sp;
}
const inside = (sp, p) => sp.some(([a, b]) => a < p && p < b);

function splitAttr(piece) {
  const sp = quoted(piece);
  const re = new RegExp(ATTR_SRC, "g");
  const marks = [];
  let m;
  while ((m = re.exec(piece)) !== null) {
    const ks = m.index + m[0].length - m[1].length;
    if (inside(sp, ks)) continue;
    marks.push({ idx: m.index, kw: m[1], end: m.index + m[0].length });
  }
  const body = marks.length ? trimST(piece.slice(0, marks[0].idx)) : trimST(piece);
  const attrs = marks.map((mk, k) => [mk.kw, trimST(piece.slice(mk.end, k + 1 < marks.length ? marks[k + 1].idx : undefined))]);
  return [body, attrs];
}

function splitTrailing(content) {
  const sp = quoted(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] === "#" && (content[i - 1] === " " || content[i - 1] === "\t") &&
        (i + 1 === content.length || content[i + 1] === " " || content[i + 1] === "\t") && !inside(sp, i)) {
      return [content.slice(0, i).replace(/[ \t]+$/, ""), trimST(content.slice(i + 1))];
    }
  }
  return [content, null];
}

function parse(text) {
  const ds = [], strays = [];
  let cur = null;
  text.split(/\r\n|\r|\n/).forEach((raw, ix) => {
    const no = ix + 1;
    const m = LEAD.exec(raw)[0];
    let line = m.replace(FEFF, "") + raw.slice(m.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") return;
    const ind = /^[ \t]*/.exec(line)[0];
    const content = line.slice(ind.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, ""));
      else strays.push({ no, text: content });
      return;
    }
    const [code, tc] = splitTrailing(content);
    if (ind.length === 0) {
      let name = /^[^ \t]*/.exec(code)[0];
      const rest = code.slice(name.length);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED") {
        const [args, attrs] = splitAttr(rest);
        cur = { name, args, attrs, pieces: [], comments: tc !== null ? [tc] : [] };
        ds.push(cur);
        return;
      }
    }
    if (!cur) { strays.push({ no, text: content }); return; }
    const [body, attrs] = splitAttr(" " + code);
    for (const a of attrs) cur.attrs.push(a);
    if (body !== "") cur.pieces.push(body);
    if (tc !== null) cur.comments.push(tc);
  });
  return { ds, strays };
}

const joined = (d) => [d.args, ...d.pieces].filter((x) => x !== "").join(d.name === "TABLE" ? " ⏎ " : " ");
const rawOf = (d) =>
  [d.args, ...d.pieces].filter((x) => x !== "").join(d.name === "TABLE" ? "\n" : " ") +
  (d.comments.length ? " # " + d.comments.join(" # ") : "");

const PINKINDS = new Map([["regex", "pattern"], ["charset", "character set"], ["grammar", "grammar"], ["text", "exact text"], ["set", "set"], ["const", "constant"], ["constant", "constant"], ["names", "names"], ["number", "number"], ["chars", "characters"], ["order", "order"], ["map", "mapping"], ["bytes", "bytes"]]);
const OTHER = new Map([["ORACLE", "The tests (file and fingerprint)"], ["ORACLE-CLASS", "Kind of tests"], ["STATE", "What it changes in place"], ["SEAM", "Export shape"], ["TRACE-SEAM", "Effect boundary"], ["SRC", "Source location"], ["EFFECT", "Effect"], ["SURFACE", "Module surface"], ["EMIT", "Emits"], ["REQUEST", "Requests"], ["BRANCH", "Branch"], ["ON-ERROR", "On error"], ["PAR", "Unordered window"], ["RING", "Token ring"], ["LIFECYCLE", "Resource lifecycle"], ["REACH", "Off-path unit"], ["TRIGGER", "Trigger"], ["EARNED", "Earned rule"], ["BEHAVIOR", "Behavior header"]]);
const KNOWN = new Set(["SIR", "VARIANT", "SHAPE", "CANONICAL-SHA256", "AUTHORITY", "CARRIED-DATA", "NOTES", "GUARD-PINNED", "LANG", "PRIMARY-SHA256", "ABI", "MECHANISM", "CITED", "R11"]);
const NAMED = new Set(["UNIT", "KIND", "FIDELITY", "ANCHOR", "DESCRIPTION", "SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN", "PINNED", "TABLE", "CARRIED", "DEPENDS-ON", "INVARIANT", "SCOPE", "NOTE", "RATIONALE", "PROVENANCE"]);
const isRule = (n) => /^R[0-9]+$/.test(n);

const S_KIND = "What kind of unit it is", S_FOR = "What it is for", S_ACC = "What it accepts", S_DOES = "What it does",
  S_PIN = "Exact definitions", S_TAB = "Decision table", S_CAR = "Data it carries", S_DEP = "What it depends on",
  S_OTH = "Other parts of the contract", S_STRAY = "Text outside any directive", S_INV = "Should always hold",
  S_SCOPE = "In and out of scope", S_BG = "Background";

function listItems(text) {
  const { ds, strays } = parse(text);
  const out = [];
  const mk = (section, tested, base, label, d, shown) => {
    const cites = d.attrs.map(([k, v]) => (v === "" ? k : k + " " + v));
    const whys = d.attrs.map(([k, v]) =>
      k === "CITED" ? (v === "" ? "no reason given" : v)
        : k === "EARNED" ? (v === "" ? "added after a failed test" : "added after a failed test (" + v + ")")
          : v === "" ? "anchored (no reference given)" : "anchored to " + v);
    out.push({ section, tested, base, label, raw: rawOf(d), text: shown === undefined ? joined(d) : shown, cites, whys });
  };
  const plain = (section, tested, names, labels) => {
    names.forEach((n, k) => {
      for (const d of ds) if (d.name === n) mk(section, tested, n, labels ? labels[k] : null, d);
    });
  };
  plain(S_KIND, true, ["UNIT", "KIND", "FIDELITY", "ANCHOR"], ["Name", "Kind", "Fidelity", "Anchor"]);
  plain(S_FOR, false, ["DESCRIPTION"]);
  plain(S_ACC, true, ["SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN"], ["Signature", "Inputs it is verified on", "Assumes, without checking", "Not covered"]);
  for (const d of ds) if (isRule(d.name)) mk(S_DOES, true, d.name, "Rule " + d.name.slice(1), d);
  for (const d of ds) {
    if (d.name !== "PINNED") continue;
    const sp = quoted(d.args);
    let eq = -1;
    for (let i = 0; i < d.args.length; i++) if (d.args[i] === "=" && !inside(sp, i)) { eq = i; break; }
    const f = fields(eq < 0 ? d.args : d.args.slice(0, eq));
    const kw = f[0] || "", nm = f[1] || "";
    let shown;
    if (eq >= 0) shown = [trimST(d.args.slice(eq + 1)), ...d.pieces].filter((x) => x !== "").join(" ");
    else shown = joined(d);
    const phrase = PINKINDS.has(kw) ? PINKINDS.get(kw) : kw || "no kind";
    const label = (nm || "(unnamed pin)") + " (" + phrase + (eq >= 0 && shown === "" ? ", empty value" : "") + ")";
    mk(S_PIN, true, nm ? "PIN:" + nm : "PIN", label, d, shown);
  }
  plain(S_TAB, true, ["TABLE"]);
  for (const d of ds) if (d.name === "CARRIED") mk(S_CAR, true, "CARRIED", fields(d.args)[0] || "Carried data", d);
  for (const d of ds) {
    if (d.name !== "DEPENDS-ON") continue;
    const j = joined(d);
    mk(S_DEP, true, "DEPENDS-ON", null, d, /^[Nn][Oo][Nn][Ee]$/.test(j) ? "Nothing. No other package is involved." : j);
  }
  for (const d of ds) {
    if (NAMED.has(d.name) || isRule(d.name)) continue;
    if (d.name === "BEHAVIOR" && joined(d) === "" && d.attrs.length === 0) continue;
    const label = OTHER.has(d.name) ? OTHER.get(d.name) : KNOWN.has(d.name) ? d.name : d.name + " (not in the SIR vocabulary)";
    mk(S_OTH, true, d.name, label, d);
  }
  for (const s of strays) out.push({ section: S_STRAY, tested: true, base: "STRAY", label: "Line " + s.no, raw: s.text, text: s.text, cites: [], whys: [] });
  plain(S_INV, false, ["INVARIANT"]);
  plain(S_SCOPE, false, ["SCOPE"]);
  plain(S_BG, false, ["NOTE", "RATIONALE", "PROVENANCE"], ["Note", "Why", "Where it came from"]);
  const counts = new Map();
  for (const it of out) {
    const k = (counts.get(it.base) || 0) + 1;
    counts.set(it.base, k);
    it.id = k === 1 ? it.base : it.base + " #" + k;
  }
  return { items: out, ds };
}

function diff(a, b) {
  const A = a.split(/(\s+)/), B = b.split(/(\s+)/), n = A.length, m = B.length;
  const L = [];
  for (let i = 0; i <= n; i++) L.push(new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const s1 = [];
  const push = (op, t) => {
    const l = s1[s1.length - 1];
    if (l && l.op === op) l.text += t;
    else s1.push({ op, text: t });
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("=", A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push("-", A[i]); i++; }
    else { push("+", B[j]); j++; }
  }
  while (i < n) push("-", A[i++]);
  while (j < m) push("+", B[j++]);
  const out = [];
  let k = 0;
  while (k < s1.length) {
    const e = s1[k];
    if (e.op === "=") { out.push(e); k++; continue; }
    let del = "", ins = "", last = k, ds = "", is = "";
    for (let q = k; q < s1.length; q++) {
      const x = s1[q];
      if (x.op === "-") { del += x.text; last = q; ds = del; is = ins; }
      else if (x.op === "+") { ins += x.text; last = q; ds = del; is = ins; }
      else {
        const t = x.text.trim();
        if (q < s1.length - 1 && (t === "" || t.split(/\s+/).length <= 2)) { del += x.text; ins += x.text; }
        else break;
      }
    }
    if (ds !== "") out.push({ op: "-", text: ds });
    if (is !== "") out.push({ op: "+", text: is });
    k = last + 1;
  }
  return out.filter((x) => x.text !== "");
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const gkey = (it) => it.section + "\n" + it.id.replace(/ #\d+$/, "");
const firstNonEmpty = (ds, name) => { for (const d of ds) if (d.name === name && joined(d) !== "") return d; return null; };
const header = (ds) => {
  const f = firstNonEmpty(ds, "FIDELITY") || firstNonEmpty(ds, "VARIANT");
  const a = firstNonEmpty(ds, "ANCHOR");
  return { fid: f ? joined(f) : null, ref: a ? fields(joined(a))[0] : undefined };
};

export function explain_diff(before, after, oracleChanged, langs) {
  const B = listItems(before), A = listItems(after);
  const groups = [], gb = new Map(), ga = new Map();
  const touch = (it, mp) => {
    const k = gkey(it);
    if (!mp.has(k)) {
      mp.set(k, []);
      if (!groups.includes(k)) groups.push(k);
    }
    mp.get(k).push(it);
  };
  B.items.forEach((it) => touch(it, gb));
  A.items.forEach((it) => touch(it, ga));
  const pairOf = new Map(), pairedB = new Set();
  const leftoverB = [];
  for (const k of groups) {
    const bs = gb.get(k) || [], as = ga.get(k) || [];
    const usedA = new Set();
    const rest = [];
    for (const b of bs) {
      const a = as.find((x) => !usedA.has(x) && x.raw === b.raw && sameList(x.cites, b.cites));
      if (a) { usedA.add(a); pairOf.set(a, b); pairedB.add(b); } else rest.push(b);
    }
    const restA = as.filter((x) => !usedA.has(x));
    rest.forEach((b, i) => {
      if (i < restA.length) { pairOf.set(restA[i], b); pairedB.add(b); } else leftoverB.push(b);
    });
  }
  const changes = [];
  for (const a of A.items) {
    const label = a.label === null ? a.section : a.label;
    const b = pairOf.get(a);
    if (!b) {
      changes.push({ c: { checked: a.tested, id: a.id, kind: "added", label, section: a.section, text: a.text }, after: a });
    } else if (!(a.raw === b.raw && sameList(a.cites, b.cites))) {
      let d = diff(b.text, a.text);
      if (!d.some((x) => x.op !== "=")) d = diff(b.raw, a.raw);
      const why = sameList(a.cites, b.cites) ? null : diff(b.cites.join("; "), a.cites.join("; "));
      changes.push({ c: { checked: a.tested, diff: d, id: a.id, kind: "changed", label, section: a.section, whyDiff: why }, after: a });
    }
  }
  for (const b of leftoverB) {
    changes.push({ c: { checked: b.tested, id: b.id, kind: "removed", label: b.label === null ? b.section : b.label, section: b.section, text: b.text }, after: null });
  }
  const tested = changes.filter((x) => x.c.checked);
  const N = tested.length;
  const warnings = [];
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((x) => x.c.kind));
    const verbs = ["changed", "added", "removed"].filter((v) => kinds.has(v)).join(" or ");
    const labels = [];
    for (const x of tested) if (!labels.includes(x.c.label)) labels.push(x.c.label);
    warnings.push({
      kind: "untested-change", level: "stop",
      text: N + (N === 1 ? " tested part was " : " tested parts were ") + verbs + " (" + labels.join(", ") +
        "), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.",
    });
  }
  const hb = header(B.ds), ha = header(A.ds);
  if (hb.fid === "package" || ha.fid === "package") {
    const refs = [hb.ref, ha.ref].filter((r) => r !== undefined && r.includes("@"));
    const citing = [];
    for (const x of tested) {
      if (x.c.kind !== "changed") continue;
      const idx = x.after.cites.findIndex((e) =>
        e.includes("FIDELITY package") || fields(e).some((t) => refs.includes(t.replace(/[.,;:)\]]+$/, ""))));
      if (idx >= 0) citing.push({ label: x.c.label, why: x.after.whys[idx] });
    }
    if (citing.length) {
      let q = citing[0].why;
      const pre = "FIDELITY package — ";
      if (q.startsWith(pre)) q = q.slice(pre.length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join("") + "…";
      warnings.push({
        kind: "citation", level: "stop",
        text: "This contract promises to match the original package exactly, and " + citing.map((c) => c.label).join(" and ") +
          " still " + (citing.length === 1 ? "cites" : "cite") + " that package as the reason for the old behavior (\"" + q +
          "\"). The edit contradicts its own citation.",
      });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ kind: "prose-only", level: "ok", text: "Only unchecked prose changed. The code is held to exactly what it was held to before." });
  }
  if (N > 0) {
    const stale = [];
    for (const l of langs) if (l !== "" && !stale.includes(l)) stale.push(l);
    if (stale.length) {
      const nm = new Map([["js", "JavaScript"], ["ts", "TypeScript"], ["rust", "Rust"]]);
      const names = stale.map((l) => (nm.has(l) ? nm.get(l) : l)).join(", ");
      warnings.push({
        kind: "stale-langs", level: "note",
        text: "The " + names + (stale.length === 1
          ? " file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it."
          : " files were written against the old version. They go out of date until someone reviews them against this one and re-binds them."),
      });
    }
  }
  const uf = firstNonEmpty(A.ds, "UNIT") || firstNonEmpty(A.ds, "SIR");
  return { changes: changes.map((x) => x.c), unit: uf ? joined(uf) : "(unnamed)", warnings };
}

export default explain_diff;
