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
const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const DIRNAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const RULE = /^R[0-9]+$/;
const sp = (c) => c === " " || c === "\t";

function trimST(s) {
  let a = 0, b = s.length;
  while (a < b && sp(s[a])) a++;
  while (b > a && sp(s[b - 1])) b--;
  return s.slice(a, b);
}

function spans(s) {
  const out = [];
  let p = 0, prevClose = -2;
  while (p < s.length) {
    if (s[p] === '"' && (p === 0 || OPENERS.has(s[p - 1]) || p === prevClose + 1)) {
      let j = p + 1, close = -1;
      while (j < s.length) {
        if (s[j] === "\\") j += 2;
        else if (s[j] === '"') { close = j; break; } else j++;
      }
      if (close < 0) break;
      out.push([p, close]);
      prevClose = close;
      p = close + 1;
    } else p++;
  }
  return out;
}

const inside = (sps, p) => sps.some(([a, b]) => a < p && p < b);

function splitAttr(S, sps, off) {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const hits = [];
  let m;
  while ((m = re.exec(S)) !== null) {
    const kp = m.index + m[0].length - m[1].length;
    if (inside(sps, kp + off)) continue;
    hits.push({ idx: m.index, kw: m[1], vs: m.index + m[0].length });
  }
  if (!hits.length) return { body: trimST(S), pairs: [] };
  const pairs = hits.map((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].idx : S.length;
    return [h.kw, trimST(S.slice(h.vs, end))];
  });
  return { body: trimST(S.slice(0, hits[0].idx)), pairs };
}

function textOf(d) {
  return [d.args, ...d.cont].filter((x) => x !== "").join(d.name === "TABLE" ? " ⏎ " : " ");
}
function rawOf(d) {
  let r = [d.args, ...d.cont].filter((x) => x !== "").join(d.name === "TABLE" ? "\n" : " ");
  for (const c of d.comments) r += " # " + c;
  return r;
}

function parse(text) {
  const lines = text.split(LINE_BREAK);
  const dirs = [], stray = [];
  let cur = null;
  lines.forEach((raw, idx) => {
    const ln = idx + 1;
    let i = 0;
    while (i < raw.length && (sp(raw[i]) || raw[i] === "﻿")) i++;
    let line = raw.slice(0, i).split("﻿").join("") + raw.slice(i);
    let e = line.length;
    while (e > 0 && sp(line[e - 1])) e--;
    line = line.slice(0, e);
    if (line === "") return;
    let k = 0;
    while (k < line.length && sp(line[k])) k++;
    const indent = line.slice(0, k), content = line.slice(k);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else stray.push({ ln, content });
      return;
    }
    const sps = spans(content);
    let code = content, tc = null;
    for (let p = 1; p < content.length + 0; p++) {
      if (content[p] === "#" && sp(content[p - 1]) && (p + 1 === content.length || sp(content[p + 1])) && !inside(sps, p)) {
        let c = content.slice(0, p);
        let ce = c.length;
        while (ce > 0 && sp(c[ce - 1])) ce--;
        code = c.slice(0, ce);
        tc = trimST(content.slice(p + 1));
        break;
      }
    }
    if (indent === "") {
      let q = 0;
      while (q < code.length && !sp(code[q])) q++;
      let name = code.slice(0, q);
      const rest = code.slice(q);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && !/^(CITED|EARNED|ANCHOR)$/.test(name.slice(0, -1)) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (DIRNAME.test(name) && name !== "CITED") {
        const { body, pairs } = splitAttr(rest, sps, code.length - rest.length);
        cur = { name, line: ln, args: body, attrs: pairs, cont: [], comments: tc !== null ? [tc] : [], known: VOCAB.has(name) || RULE.test(name) };
        dirs.push(cur);
        return;
      }
    }
    if (!cur) { stray.push({ ln, content }); return; }
    const { body, pairs } = splitAttr(" " + code, sps, -1);
    cur.attrs.push(...pairs);
    if (body !== "") cur.cont.push(body);
    if (tc !== null) cur.comments.push(tc);
  });
  return { dirs, stray };
}

const SECTIONS = [
  ["header", "What kind of unit it is", true, [["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]]],
  ["what", "What it is for", false, [["DESCRIPTION", null]]],
  ["inputs", "What it accepts", true, [["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]]],
  ["rules", "What it does", true, "rules"],
  ["pins", "Exact definitions", true, "pins"],
  ["table", "Decision table", true, [["TABLE", null]]],
  ["data", "Data it carries", true, "data"],
  ["deps", "What it depends on", true, [["DEPENDS-ON", null]]],
  ["more", "Other parts of the contract", true, "more"],
  ["stray", "Text outside any directive", true, "stray"],
  ["holds", "Should always hold", false, [["INVARIANT", null]]],
  ["scope", "In and out of scope", false, [["SCOPE", null]]],
  ["notes", "Background", false, [["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]]],
];

function whyOf([kw, v]) {
  if (kw === "CITED") return v !== "" ? v : "no reason given";
  if (kw === "EARNED") return v !== "" ? "added after a failed test (" + v + ")" : "added after a failed test";
  return v !== "" ? "anchored to " + v : "anchored (no reference given)";
}

function head(dirs, n, legacy) {
  const l = [...dirs.filter((d) => d.name === n), ...dirs.filter((d) => d.name === legacy)];
  return l.find((d) => textOf(d) !== "") || l[0] || null;
}

export function explain_contract(primaryText) {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const { dirs, stray } = parse(primaryText);
  const hu = head(dirs, "UNIT", "SIR");
  const unit = hu && textOf(hu) !== "" ? textOf(hu) : "(unnamed)";
  const summary = [];
  const hk = head(dirs, "KIND", "KIND");
  if (hk && textOf(hk) !== "") {
    const t = textOf(hk);
    summary.push(KIND_PHRASE.has(t) ? KIND_PHRASE.get(t) : "Kind: " + t + " (not a kind SIR defines).");
  }
  const hf = head(dirs, "FIDELITY", "VARIANT");
  if (hf && textOf(hf) !== "") {
    const t = textOf(hf);
    summary.push(FID_PHRASE.has(t) ? FID_PHRASE.get(t) : "Fidelity: " + t + " (not a fidelity SIR defines).");
  }
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const s = textOf(d).replace(/\.+$/, "");
    if (s !== "") { summary.push("Anchored to " + s + "."); break; }
  }
  const sg = dirs.find((d) => d.name === "SIG");
  const sig = sg ? textOf(sg) : null;

  const counts = new Map();
  const nextId = (base) => {
    const k = (counts.get(base) || 0) + 1;
    counts.set(base, k);
    return k === 1 ? base : base + " #" + k;
  };
  const mk = (base, d, label, text) => {
    const it = { id: nextId(base) };
    if (label !== null) it.label = label;
    it.text = text;
    it.why = d.attrs.map(whyOf);
    it.raw = rawOf(d);
    it.rawWhy = d.attrs.map(([k, v]) => (v !== "" ? k + " " + v : k));
    it.line = d.line;
    return it;
  };
  const memberNames = new Set();
  for (const s of SECTIONS) if (Array.isArray(s[3])) for (const [n] of s[3]) memberNames.add(n);
  memberNames.add("PINNED"); memberNames.add("CARRIED");

  const sections = [];
  for (const [id, title, checked, mem] of SECTIONS) {
    let items = [];
    if (Array.isArray(mem)) {
      for (const [n, lab] of mem) {
        for (const d of dirs) {
          if (d.name !== n) continue;
          let t = textOf(d);
          if (n === "DEPENDS-ON" && NONE.test(t)) t = "Nothing. No other package is involved.";
          items.push(mk(n, d, lab, t));
        }
      }
    } else if (mem === "rules") {
      for (const d of dirs) if (RULE.test(d.name)) items.push(mk(d.name, d, "Rule " + d.name.slice(1), textOf(d)));
    } else if (mem === "pins") {
      for (const d of dirs) {
        if (d.name !== "PINNED") continue;
        const a = d.args, sps = spans(a);
        let eq = -1;
        for (let p = 0; p < a.length; p++) if (a[p] === "=" && !inside(sps, p)) { eq = p; break; }
        const words = trimST(eq < 0 ? a : a.slice(0, eq)).split(/[ \t]+/);
        const kind = words[0] || "", name = words[1] || "";
        let shown, empty = false;
        if (eq >= 0) {
          shown = [trimST(a.slice(eq + 1)), ...d.cont].filter((x) => x !== "").join(" ");
          empty = shown === "";
        } else shown = textOf(d);
        const kp = kind === "" ? "no kind" : PIN_KIND.has(kind) ? PIN_KIND.get(kind) : kind;
        const label = (name !== "" ? name : "(unnamed pin)") + " (" + kp + (empty ? ", empty value" : "") + ")";
        items.push(mk(name !== "" ? "PIN:" + name : "PIN", d, label, shown));
      }
    } else if (mem === "data") {
      for (const d of dirs) {
        if (d.name !== "CARRIED") continue;
        let q = 0;
        while (q < d.args.length && !sp(d.args[q])) q++;
        items.push(mk("CARRIED", d, d.args === "" ? "Carried data" : d.args.slice(0, q), textOf(d)));
      }
    } else if (mem === "more") {
      for (const d of dirs) {
        if (memberNames.has(d.name) || RULE.test(d.name)) continue;
        if (d.name === "BEHAVIOR" && textOf(d) === "" && d.attrs.length === 0) continue;
        const label = !d.known ? d.name + " (not in the SIR vocabulary)" : OTHER.has(d.name) ? OTHER.get(d.name) : d.name;
        items.push(mk(d.name, d, label, textOf(d)));
      }
    } else {
      for (const s of stray) {
        items.push({ id: nextId("STRAY"), label: "Line " + s.ln, text: s.content, why: [], raw: s.content, rawWhy: [], line: s.ln });
      }
    }
    if (items.length) sections.push({ id, title, checked, items });
  }
  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
