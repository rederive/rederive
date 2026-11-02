const OPENERS = " \t([{,=:;|<>!&-~";
const ATTR_KW = new Set(["CITED", "EARNED", "ANCHOR"]);
const trimST = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

function spansOf(t) {
  const out = [];
  let i = 0, prev = -2;
  while (i < t.length) {
    if (t[i] === '"' && (i === 0 || OPENERS.includes(t[i - 1]) || i === prev + 1)) {
      let j = i + 1, close = -1;
      while (j < t.length) {
        const c = t[j];
        if (c === "\\") {
          j += 1;
          const cp = t.codePointAt(j);
          j += cp === undefined ? 0 : cp > 0xffff ? 2 : 1;
        } else if (c === '"') { close = j; break; } else j++;
      }
      if (close < 0) break;
      out.push([i, close]);
      prev = close;
      i = close + 1;
    } else i++;
  }
  return out;
}
const inSpan = (spans, k) => spans.some(([a, b]) => k > a && k < b);

function splitAttrs(piece) {
  const spans = spansOf(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks = [];
  let m;
  while ((m = re.exec(piece)) !== null) {
    const kwStart = m.index + m[0].length - m[1].length;
    if (!inSpan(spans, kwStart)) marks.push({ idx: m.index, kw: m[1], end: m.index + m[0].length });
  }
  if (!marks.length) return { body: trimST(piece), attrs: [] };
  const attrs = marks.map((mk, n) => {
    const stop = n + 1 < marks.length ? marks[n + 1].idx : piece.length;
    return [mk.kw, trimST(piece.slice(mk.end, stop))];
  });
  return { body: trimST(piece.slice(0, marks[0].idx)), attrs };
}

function parse(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const dirs = [], strays = [];
  let cur = null;
  lines.forEach((raw, n) => {
    const lead = /^[ \t﻿]*/.exec(raw)[0];
    let line = lead.replace(/﻿/g, "") + raw.slice(lead.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") return;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, ""));
      else strays.push({ line: n + 1, text: content });
      return;
    }
    const spans = spansOf(content);
    let code = content, tc = null;
    for (let k = 1; k < content.length; k++) {
      if (content[k] === "#" && (content[k - 1] === " " || content[k - 1] === "\t") &&
          (k + 1 === content.length || content[k + 1] === " " || content[k + 1] === "\t") && !inSpan(spans, k)) {
        code = content.slice(0, k).replace(/[ \t]+$/, "");
        tc = trimST(content.slice(k + 1));
        break;
      }
    }
    let isDir = false, name = "", rest = "";
    if (indent === "") {
      const sp = code.search(/[ \t]/);
      name = sp < 0 ? code : code.slice(0, sp);
      rest = sp < 0 ? "" : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      isDir = /^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED";
    }
    if (isDir) {
      const s = splitAttrs(rest);
      cur = { name, args: s.body, pieces: [], attrs: s.attrs.slice(), comments: tc !== null ? [tc] : [] };
      dirs.push(cur);
    } else if (!cur) {
      strays.push({ line: n + 1, text: content });
    } else {
      const s = splitAttrs(" " + code);
      for (const a of s.attrs) cur.attrs.push(a);
      if (s.body !== "") cur.pieces.push(s.body);
      if (tc !== null) cur.comments.push(tc);
    }
  });
  return { dirs, strays };
}

const joined = (d) => [d.args, ...d.pieces].filter((x) => x !== "").join(d.name === "TABLE" ? " ⏎ " : " ");
function rawOf(d) {
  const b = [d.args, ...d.pieces].filter((x) => x !== "").join(d.name === "TABLE" ? "\n" : " ");
  return d.comments.length ? b + " # " + d.comments.join(" # ") : b;
}
const rawCit = (d) => d.attrs.map(([k, v]) => (v === "" ? k : k + " " + v));
function whyList(d) {
  return d.attrs.map(([k, v]) => {
    if (k === "CITED") return v;
    if (k === "EARNED") return v === "" ? "added after a failed test" : "added after a failed test (" + v + ")";
    return v === "" ? "anchored (no reference given)" : "anchored to " + v;
  });
}

const PIN_KINDS = new Map(Object.entries({ regex: "pattern", charset: "character set", grammar: "grammar", text: "exact text", set: "set", const: "constant", constant: "constant", names: "names", number: "number", chars: "characters", order: "order", map: "mapping", bytes: "bytes" }));
const OTHER_LABELS = new Map(Object.entries({ ORACLE: "The tests (file and fingerprint)", "ORACLE-CLASS": "Kind of tests", STATE: "What it changes in place", SEAM: "Export shape", "TRACE-SEAM": "Effect boundary", SRC: "Source location", EFFECT: "Effect", SURFACE: "Module surface", EMIT: "Emits", REQUEST: "Requests", BRANCH: "Branch", "ON-ERROR": "On error", PAR: "Unordered window", RING: "Token ring", LIFECYCLE: "Resource lifecycle", REACH: "Off-path unit", TRIGGER: "Trigger", EARNED: "Earned rule", BEHAVIOR: "Behavior header" }));
const KNOWN_OTHER = new Set("SIR VARIANT SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA NOTES GUARD-PINNED LANG PRIMARY-SHA256 ABI MECHANISM CITED R11".split(" "));
const NAMED = new Set("UNIT KIND FIDELITY ANCHOR DESCRIPTION SIG ENVELOPE UNGUARDED-PRECONDITION OUT-OF-DOMAIN PINNED TABLE CARRIED DEPENDS-ON INVARIANT SCOPE NOTE RATIONALE PROVENANCE".split(" "));

function buildItems(p) {
  const items = [];
  const plain = (section, tested, d, label, base) => {
    let text = joined(d);
    if (d.name === "DEPENDS-ON" && /^none$/i.test(text)) text = "Nothing. No other package is involved.";
    items.push({ section, tested, base: base || d.name, label, raw: rawOf(d), text, rc: rawCit(d), why: whyList(d) });
  };
  const byNames = (section, tested, spec) => {
    for (const [n, label] of spec) for (const d of p.dirs) if (d.name === n) plain(section, tested, d, label);
  };
  byNames("What kind of unit it is", true, [["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]]);
  byNames("What it is for", false, [["DESCRIPTION", null]]);
  byNames("What it accepts", true, [["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]]);
  for (const d of p.dirs) if (/^R[0-9]+$/.test(d.name)) plain("What it does", true, d, "Rule " + d.name.slice(1));
  for (const d of p.dirs) {
    if (d.name !== "PINNED") continue;
    const spans = spansOf(d.args);
    let eq = -1;
    for (let k = 0; k < d.args.length; k++) if (d.args[k] === "=" && !inSpan(spans, k)) { eq = k; break; }
    const head = eq < 0 ? d.args : d.args.slice(0, eq);
    const f = head.split(/[ \t]+/).filter((x) => x !== "");
    const kw = f[0] || "", nm = f[1] || "";
    const shown = eq < 0 ? joined(d) : [trimST(d.args.slice(eq + 1)), ...d.pieces].filter((x) => x !== "").join(" ");
    const phrase = PIN_KINDS.has(kw) ? PIN_KINDS.get(kw) : kw !== "" ? kw : "no kind";
    const empty = eq >= 0 && shown === "" ? ", empty value" : "";
    items.push({ section: "Exact definitions", tested: true, base: nm === "" ? "PIN" : "PIN:" + nm, label: (nm === "" ? "(unnamed pin)" : nm) + " (" + phrase + empty + ")", raw: rawOf(d), text: shown, rc: rawCit(d), why: whyList(d) });
  }
  byNames("Decision table", true, [["TABLE", null]]);
  for (const d of p.dirs) if (d.name === "CARRIED") plain("Data it carries", true, d, d.args === "" ? "Carried data" : d.args.split(/[ \t]+/).filter((x) => x !== "")[0]);
  byNames("What it depends on", true, [["DEPENDS-ON", null]]);
  for (const d of p.dirs) {
    if (NAMED.has(d.name) || /^R[0-9]+$/.test(d.name)) continue;
    if (d.name === "BEHAVIOR" && joined(d) === "" && d.attrs.length === 0) continue;
    const label = OTHER_LABELS.has(d.name) ? OTHER_LABELS.get(d.name) : KNOWN_OTHER.has(d.name) ? d.name : d.name + " (not in the SIR vocabulary)";
    plain("Other parts of the contract", true, d, label);
  }
  for (const s of p.strays) items.push({ section: "Text outside any directive", tested: true, base: "STRAY", label: "Line " + s.line, raw: s.text, text: s.text, rc: [], why: [] });
  byNames("Should always hold", false, [["INVARIANT", null]]);
  byNames("In and out of scope", false, [["SCOPE", null]]);
  byNames("Background", false, [["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]]);
  const counts = new Map();
  for (const it of items) {
    const k = (counts.get(it.base) || 0) + 1;
    counts.set(it.base, k);
    it.id = k === 1 ? it.base : it.base + " #" + k;
    it.group = it.section + "\u0001" + it.id.replace(/ #[0-9]+$/, "");
  }
  return items;
}

function wordDiff(a, b) {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/);
  const n = x.length, m = y.length, w = m + 1;
  const L = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i * w + j] = x[i] === y[j] ? L[(i + 1) * w + j + 1] + 1 : Math.max(L[(i + 1) * w + j], L[i * w + j + 1]);
  const e = [];
  const push = (op, t) => { const l = e[e.length - 1]; if (l && l.op === op) l.text += t; else e.push({ op, text: t }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { push("=", x[i]); i++; j++; }
    else if (L[(i + 1) * w + j] >= L[i * w + j + 1]) { push("-", x[i]); i++; }
    else { push("+", y[j]); j++; }
  }
  while (i < n) push("-", x[i++]);
  while (j < m) push("+", y[j++]);
  const out = [];
  let k = 0;
  while (k < e.length) {
    if (e[k].op === "=") { out.push(e[k]); k++; continue; }
    let del = "", ins = "", last = k, q = k;
    while (q < e.length) {
      const t = e[q];
      if (t.op === "-") { del += t.text; last = q; }
      else if (t.op === "+") { ins += t.text; last = q; }
      else {
        const tr = t.text.trim();
        const glue = q < e.length - 1 && (tr === "" || tr.split(/\s+/).length <= 2);
        if (glue) { del += t.text; ins += t.text; } else break;
      }
      q++;
    }
    if (del !== "") out.push({ op: "-", text: del });
    if (ins !== "") out.push({ op: "+", text: ins });
    k = last + 1;
  }
  return out.filter((t) => t.text !== "");
}

function header(p) {
  const nz = (name) => p.dirs.find((d) => d.name === name && joined(d) !== "");
  const f = nz("FIDELITY") || nz("VARIANT");
  const a = nz("ANCHOR");
  const ref = a ? joined(a).split(/[ \t]+/).filter((x) => x !== "")[0] : undefined;
  return { fid: f ? joined(f) : undefined, ref };
}

export function explain_diff(before, after, oracleChanged, langs) {
  const pb = parse(before), pa = parse(after);
  const ib = buildItems(pb), ia = buildItems(pa);
  const groups = [];
  const gb = new Map(), ga = new Map();
  for (const it of ib) { if (!gb.has(it.group) && !ga.has(it.group)) groups.push(it.group); if (!gb.has(it.group)) gb.set(it.group, []); gb.get(it.group).push(it); }
  for (const it of ia) { if (!gb.has(it.group) && !ga.has(it.group)) groups.push(it.group); if (!ga.has(it.group)) ga.set(it.group, []); ga.get(it.group).push(it); }
  const pairOf = new Map();
  const unpairedBefore = [];
  for (const g of groups) {
    const bs = gb.get(g) || [], as = ga.get(g) || [];
    const usedA = new Set(), usedB = new Set();
    bs.forEach((b, bi) => {
      const ai = as.findIndex((a, k) => !usedA.has(k) && a.raw === b.raw && JSON.stringify(a.rc) === JSON.stringify(b.rc));
      if (ai >= 0) { usedA.add(ai); usedB.add(bi); pairOf.set(as[ai], b); }
    });
    const lb = bs.filter((_, k) => !usedB.has(k));
    const la = as.filter((_, k) => !usedA.has(k));
    lb.forEach((b, k) => { if (k < la.length) pairOf.set(la[k], b); else unpairedBefore.push(b); });
  }
  const changes = [];
  const meta = [];
  for (const a of ia) {
    const b = pairOf.get(a);
    const base = { checked: a.tested, id: a.id, label: a.label || a.section, section: a.section };
    if (!b) { changes.push({ checked: base.checked, id: base.id, kind: "added", label: base.label, section: base.section, text: a.text }); meta.push(null); continue; }
    if (a.raw === b.raw && JSON.stringify(a.rc) === JSON.stringify(b.rc)) continue;
    let diff = wordDiff(b.text, a.text);
    if (!diff.some((t) => t.op !== "=")) diff = wordDiff(b.raw, a.raw);
    const same = JSON.stringify(a.rc) === JSON.stringify(b.rc);
    const whyDiff = same ? null : wordDiff(b.rc.join("; "), a.rc.join("; "));
    changes.push({ checked: base.checked, diff, id: base.id, kind: "changed", label: base.label, section: base.section, whyDiff });
    meta.push(a);
  }
  for (const b of unpairedBefore) {
    changes.push({ checked: b.tested, id: b.id, kind: "removed", label: b.label || b.section, section: b.section, text: b.text });
    meta.push(null);
  }
  const unitDir = (kind) => pa.dirs.find((d) => d.name === kind && joined(d) !== "");
  const u = unitDir("UNIT") || unitDir("SIR");
  const unit = u ? joined(u) : "(unnamed)";

  const warnings = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((c) => c.kind));
    const verbs = ["changed", "added", "removed"].filter((v) => kinds.has(v)).join(" or ");
    const labels = [...new Set(tested.map((c) => c.label))].join(", ");
    warnings.push({ kind: "untested-change", level: "stop", text: N + (N === 1 ? " tested part was " : " tested parts were ") + verbs + " (" + labels + "), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one." });
  }
  const hb = header(pb), ha = header(pa);
  if (hb.fid === "package" || ha.fid === "package") {
    const refs = [hb.ref, ha.ref].filter((r) => typeof r === "string" && r.includes("@"));
    const citing = [];
    changes.forEach((c, k) => {
      const a = meta[k];
      if (!a || !c.checked || c.kind !== "changed") return;
      const idx = a.rc.findIndex((e) => e.includes("FIDELITY package") || e.split(/[ \t]+/).some((t) => refs.includes(t.replace(/[.,;:)\]]+$/, ""))));
      if (idx >= 0) citing.push({ label: c.label, why: a.why[idx] });
    });
    if (citing.length) {
      let q = citing[0].why;
      const pre = "FIDELITY package — ";
      if (q.startsWith(pre)) q = q.slice(pre.length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join("") + "…";
      warnings.push({ kind: "citation", level: "stop", text: "This contract promises to match the original package exactly, and " + citing.map((c) => c.label).join(" and ") + " still " + (citing.length === 1 ? "cites" : "cite") + " that package as the reason for the old behavior (\"" + q + "\"). The edit contradicts its own citation." });
    }
  }
  if (N === 0 && changes.length > 0) warnings.push({ kind: "prose-only", level: "ok", text: "Only unchecked prose changed. The code is held to exactly what it was held to before." });
  if (N > 0) {
    const stale = [...new Set(Array.from(langs).filter((l) => l !== ""))];
    if (stale.length) {
      const nm = new Map([["js", "JavaScript"], ["ts", "TypeScript"], ["rust", "Rust"]]);
      const names = stale.map((l) => (nm.has(l) ? nm.get(l) : l)).join(", ");
      warnings.push({ kind: "stale-langs", level: "note", text: "The " + names + (stale.length === 1
        ? " file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it."
        : " files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.") });
    }
  }
  return { changes, unit, warnings };
}

export default explain_diff;
