const FEFF = String.fromCharCode(0xfeff);
const RET = String.fromCharCode(0x23ce);
const LEAD = new RegExp("^[ \\t\\uFEFF]*");
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
const WS = (c) => c === " " || c === "\t";
const trimWS = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

function spansOf(s) {
  const out = [];
  let i = 0, prev = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1]) || i === prev + 1)) {
      let j = i + 1, found = -1;
      while (j < s.length) {
        if (s[j] === "\\") j += 2;
        else if (s[j] === '"') { found = j; break; } else j++;
      }
      if (found < 0) break;
      out.push([i, found]);
      prev = found;
      i = found + 1;
    } else i++;
  }
  return out;
}
const inside = (spans, p) => spans.some(([o, c]) => p > o && p < c);

function splitAttrs(S, spans, off) {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const hits = [];
  let m;
  while ((m = re.exec(S)) !== null) {
    const kwStart = m.index + m[0].length - m[1].length;
    if (!inside(spans, kwStart + off)) hits.push({ idx: m.index, kw: m[1], end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  const body = trimWS(hits.length ? S.slice(0, hits[0].idx) : S);
  const pairs = hits.map((h, k) => [h.kw, trimWS(S.slice(h.end, k + 1 < hits.length ? hits[k + 1].idx : S.length))]);
  return { body, pairs };
}

function parse(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const dirs = [], stray = [];
  let cur = null;
  lines.forEach((raw, k) => {
    const ln = k + 1;
    const lead = LEAD.exec(raw)[0];
    let line = lead.split(FEFF).join("") + raw.slice(lead.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") return;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, ""));
      else stray.push({ line: ln, text: content });
      return;
    }
    const spans = spansOf(content);
    let marker = -1;
    for (let p = 0; p < content.length; p++) {
      if (content[p] === "#" && p > 0 && WS(content[p - 1]) && (p + 1 === content.length || WS(content[p + 1])) && !inside(spans, p)) { marker = p; break; }
    }
    const code = marker < 0 ? content : content.slice(0, marker).replace(/[ \t]+$/, "");
    const tcom = marker < 0 ? null : trimWS(content.slice(marker + 1));
    if (indent === "") {
      let n = 0;
      while (n < code.length && !WS(code[n])) n++;
      let name = code.slice(0, n);
      const rest = code.slice(n);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (/^([A-Z][A-Z0-9-]*|R[0-9]+)$/.test(name) && name !== "CITED") {
        const { body, pairs } = splitAttrs(rest, spans, n);
        cur = { name, line: ln, args: body, attrs: pairs, cont: [], comments: tcom === null ? [] : [tcom], known: VOCAB.has(name) || /^R[0-9]+$/.test(name) };
        dirs.push(cur);
        return;
      }
    }
    if (!cur) { stray.push({ line: ln, text: content }); return; }
    const { body, pairs } = splitAttrs(" " + code, spans, -1);
    cur.attrs.push(...pairs);
    if (body !== "") cur.cont.push(body);
    if (tcom !== null) cur.comments.push(tcom);
  });
  return { dirs, stray };
}

const pieces = (d) => [d.args, ...d.cont].filter((x) => x !== "");
const textOf = (d) => pieces(d).join(d.name === "TABLE" ? " " + RET + " " : " ");
const rawOf = (d) => pieces(d).join(d.name === "TABLE" ? "\n" : " ") + d.comments.map((c) => " # " + c).join("");

function whyOf([kw, v]) {
  if (kw === "CITED") return v !== "" ? v : "no reason given";
  if (kw === "EARNED") return v !== "" ? "added after a failed test (" + v + ")" : "added after a failed test";
  return v !== "" ? "anchored to " + v : "anchored (no reference given)";
}

function pinParts(d) {
  const a = d.args;
  const sp = spansOf(a);
  let eq = -1;
  for (let i = 0; i < a.length; i++) if (a[i] === "=" && !inside(sp, i)) { eq = i; break; }
  const words = trimWS(eq < 0 ? a : a.slice(0, eq)).split(/[ \t]+/);
  const kind = words[0] || "", name = words[1] || "";
  let shown, empty = false;
  if (eq >= 0) {
    shown = [trimWS(a.slice(eq + 1)), ...d.cont].filter((x) => x !== "").join(" ");
    empty = shown === "";
  } else shown = textOf(d);
  const kp = kind !== "" ? (PIN_KIND.has(kind) ? PIN_KIND.get(kind) : kind) : "no kind";
  const label = (name !== "" ? name : "(unnamed pin)") + " (" + kp + (empty ? ", empty value" : "") + ")";
  return { shown, label, base: "PIN" + (name !== "" ? ":" + name : "") };
}

export function explain_contract(primaryText) {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const { dirs, stray } = parse(primaryText);
  const head = (n, legacy) => {
    const l = dirs.filter((d) => d.name === n).concat(dirs.filter((d) => d.name === legacy));
    return l.find((d) => textOf(d) !== "") || l[0] || null;
  };
  const hu = head("UNIT", "SIR");
  const unit = hu && textOf(hu) !== "" ? textOf(hu) : "(unnamed)";
  const summary = [];
  const hk = head("KIND", "KIND");
  if (hk && textOf(hk) !== "") {
    const t = textOf(hk);
    summary.push(KIND_PHRASE.has(t) ? KIND_PHRASE.get(t) : "Kind: " + t + " (not a kind SIR defines).");
  }
  const hf = head("FIDELITY", "VARIANT");
  if (hf && textOf(hf) !== "") {
    const t = textOf(hf);
    summary.push(FID_PHRASE.has(t) ? FID_PHRASE.get(t) : "Fidelity: " + t + " (not a fidelity SIR defines).");
  }
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const s = textOf(d).replace(/\.+$/, "");
    if (s !== "") { summary.push("Anchored to " + s + "."); break; }
  }
  const sd = dirs.find((d) => d.name === "SIG");
  const sig = sd ? textOf(sd) : null;

  const members = new Set();
  for (const s of SECTIONS) if (Array.isArray(s[3])) for (const [n] of s[3]) members.add(n);
  members.add("PINNED"); members.add("CARRIED");
  const isR = (n) => /^R[0-9]+$/.test(n);

  const counts = new Map();
  const nextId = (base) => {
    const k = (counts.get(base) || 0) + 1;
    counts.set(base, k);
    return k === 1 ? base : base + " #" + k;
  };
  const mk = (d, base, label, shown) => {
    const it = { id: nextId(base) };
    if (label !== null) it.label = label;
    it.text = shown;
    it.why = d.attrs.map(whyOf);
    it.raw = rawOf(d);
    it.rawWhy = d.attrs.map(([k, v]) => (v !== "" ? k + " " + v : k));
    it.line = d.line;
    return it;
  };
  const sections = [];
  for (const [id, title, checked, spec] of SECTIONS) {
    const items = [];
    if (Array.isArray(spec)) {
      for (const [n, label] of spec) for (const d of dirs) if (d.name === n) {
        let shown = textOf(d);
        if (n === "DEPENDS-ON" && /^none$/i.test(shown)) shown = "Nothing. No other package is involved.";
        items.push(mk(d, n, label, shown));
      }
    } else if (spec === "R") {
      for (const d of dirs) if (isR(d.name)) items.push(mk(d, d.name, "Rule " + d.name.slice(1), textOf(d)));
    } else if (spec === "PINNED") {
      for (const d of dirs) if (d.name === "PINNED") {
        const p = pinParts(d);
        items.push(mk(d, p.base, p.label, p.shown));
      }
    } else if (spec === "CARRIED") {
      for (const d of dirs) if (d.name === "CARRIED") {
        let n = 0;
        while (n < d.args.length && !WS(d.args[n])) n++;
        items.push(mk(d, "CARRIED", d.args === "" ? "Carried data" : d.args.slice(0, n), textOf(d)));
      }
    } else if (spec === "MORE") {
      for (const d of dirs) {
        if (members.has(d.name) || isR(d.name)) continue;
        if (d.name === "BEHAVIOR" && textOf(d) === "" && d.attrs.length === 0) continue;
        const label = !d.known ? d.name + " (not in the SIR vocabulary)" : OTHER.has(d.name) ? OTHER.get(d.name) : d.name;
        items.push(mk(d, d.name, label, textOf(d)));
      }
    } else if (spec === "STRAY") {
      for (const s of stray) items.push({ id: nextId("STRAY"), label: "Line " + s.line, text: s.text, why: [], raw: s.text, rawWhy: [], line: s.line });
    }
    if (items.length) sections.push({ id, title, checked, items });
  }
  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
