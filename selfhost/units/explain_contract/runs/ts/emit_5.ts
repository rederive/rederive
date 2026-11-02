type Item = { id: string; label?: string; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };
type Section = { id: string; title: string; checked: boolean; items: Item[] };
type Reading = { unit: string; summary: string[]; sig: string | null; checks: string[]; sections: Section[] };
type Pair = { kw: string; value: string };
type Dir = { name: string; line: number; args: string; cont: string[]; comments: string[]; pairs: Pair[]; known: boolean };
type Span = { open: number; close: number };

const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const ANCHOR_DOTS = /\.+$/;
const RETURN = " ⏎ ";
const OPENERS = new Set(["\t", " ", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);
const VOCAB = new Set("UNIT SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM SIG ENVELOPE DEPENDS-ON DESCRIPTION BEHAVIOR INVARIANT TABLE PINNED EARNED NOTE RATIONALE SCOPE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE PROVENANCE CARRIED SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED LANG PRIMARY-SHA256 ABI MECHANISM".split(" "));
const KIND_PHRASE = new Map<string, string>([
  ["FUNCTIONAL", "A pure function: the same input always gives the same output."],
  ["STATE", "Changes one of its arguments in place; the tests check the result and the changed argument."],
  ["EFFECT", "Talks to the outside world; the tests check the calls it makes, in order."],
]);
const FID_PHRASE = new Map<string, string>([
  ["package", "Matches the original package exactly, quirks included."],
  ["spec", "Follows the cited standard, even where the original package does not."],
]);
const PIN_KIND = new Map<string, string>([
  ["regex", "pattern"], ["charset", "character set"], ["grammar", "grammar"], ["text", "exact text"],
  ["set", "set"], ["const", "constant"], ["names", "names"], ["number", "number"], ["constant", "constant"],
  ["chars", "characters"], ["order", "order"], ["map", "mapping"], ["bytes", "bytes"],
]);
const OTHER_LABEL = new Map<string, string>([
  ["ORACLE", "The tests (file and fingerprint)"], ["ORACLE-CLASS", "Kind of tests"], ["STATE", "What it changes in place"],
  ["SEAM", "Export shape"], ["TRACE-SEAM", "Effect boundary"], ["SRC", "Source location"], ["EFFECT", "Effect"],
  ["SURFACE", "Module surface"], ["EMIT", "Emits"], ["REQUEST", "Requests"], ["BRANCH", "Branch"],
  ["ON-ERROR", "On error"], ["PAR", "Unordered window"], ["RING", "Token ring"], ["LIFECYCLE", "Resource lifecycle"],
  ["REACH", "Off-path unit"], ["TRIGGER", "Trigger"], ["EARNED", "Earned rule"], ["BEHAVIOR", "Behavior header"],
]);

function trimST(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function spansOf(s: string): Span[] {
  const out: Span[] = [];
  let prevClose = -2;
  let p = 0;
  while (p < s.length) {
    if (s[p] === '"' && (p === 0 || OPENERS.has(s[p - 1] as string) || p === prevClose + 1)) {
      let j = p + 1;
      let found = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") j += 2;
        else if (c === '"') { found = j; break; } else j++;
      }
      if (found < 0) break;
      out.push({ open: p, close: found });
      prevClose = found;
      p = found + 1;
    } else p++;
  }
  return out;
}

function inside(spans: Span[], pos: number): boolean {
  for (const sp of spans) if (pos > sp.open && pos < sp.close) return true;
  return false;
}

function splitAttrs(s: string): { body: string; pairs: Pair[] } {
  const spans = spansOf(s);
  const hits: { index: number; end: number; kw: string }[] = [];
  const re = new RegExp(ATTR.source, "g");
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    const kw = m[1] as string;
    const end = m.index + m[0].length;
    if (!inside(spans, end - kw.length)) hits.push({ index: m.index, end, kw });
    m = re.exec(s);
  }
  if (hits.length === 0) return { body: trimST(s), pairs: [] };
  const first = hits[0] as { index: number };
  const pairs: Pair[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i] as { index: number; end: number; kw: string };
    const next = hits[i + 1];
    pairs.push({ kw: h.kw, value: trimST(s.slice(h.end, next ? next.index : s.length)) });
  }
  return { body: trimST(s.slice(0, first.index)), pairs };
}

function codeOf(content: string): { code: string; comment: string | null } {
  const spans = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    const prev = content[i - 1];
    if (prev !== " " && prev !== "\t") continue;
    const nx = content[i + 1];
    if (!(nx === undefined || nx === " " || nx === "\t")) continue;
    if (inside(spans, i)) continue;
    return { code: trimEnd(content.slice(0, i)), comment: trimST(content.slice(i + 1)) };
  }
  return { code: content, comment: null };
}

function trimEnd(s: string): string {
  return s.replace(/[ \t]+$/, "");
}

function isDirName(n: string): boolean {
  return /^[A-Z][A-Z0-9-]*$/.test(n);
}

function isRule(n: string): boolean {
  return /^R[0-9]+$/.test(n);
}

function textOf(d: Dir): string {
  const pieces = [d.args, ...d.cont].filter((p) => p !== "");
  return pieces.join(d.name === "TABLE" ? RETURN : " ");
}

function rawOf(d: Dir): string {
  const pieces = [d.args, ...d.cont].filter((p) => p !== "");
  let r = pieces.join(d.name === "TABLE" ? "\n" : " ");
  for (const c of d.comments) r += " # " + c;
  return r;
}

function whyOf(p: Pair): string {
  if (p.kw === "CITED") return p.value !== "" ? p.value : "no reason given";
  if (p.kw === "EARNED") return p.value !== "" ? "added after a failed test (" + p.value + ")" : "added after a failed test";
  return p.value !== "" ? "anchored to " + p.value : "anchored (no reference given)";
}

function head(dirs: Dir[], n: string, legacy: string): Dir | null {
  const all = dirs.filter((d) => d.name === n).concat(dirs.filter((d) => d.name === legacy));
  for (const d of all) if (textOf(d) !== "") return d;
  return all.length > 0 ? (all[0] as Dir) : null;
}

type Draft = { base: string; label?: string; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };

export function explain_contract(primaryText: unknown): Reading {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const rawLines = primaryText.split(LINE_BREAK);
  const dirs: Dir[] = [];
  const strays: { line: number; text: string }[] = [];
  let cur: Dir | null = null;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNo = idx + 1;
    const full = rawLines[idx] as string;
    let k = 0;
    while (k < full.length && (full[k] === " " || full[k] === "\t" || full[k] === "﻿")) k++;
    const lead = full.slice(0, k).split("﻿").join("");
    const line = trimEnd(lead + full.slice(k));
    if (line === "") continue;
    let ind = 0;
    while (ind < line.length && (line[ind] === " " || line[ind] === "\t")) ind++;
    const indent = line.slice(0, ind);
    const content = line.slice(ind);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ line: lineNo, text: content });
      continue;
    }
    const { code, comment } = codeOf(content);
    if (indent === "") {
      let cut = 0;
      while (cut < code.length && code[cut] !== " " && code[cut] !== "\t") cut++;
      let name = code.slice(0, cut);
      const rest = code.slice(cut);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (isDirName(name) && name !== "CITED") {
        const { body, pairs } = splitAttrs(rest);
        const d: Dir = {
          name, line: lineNo, args: body, cont: [], comments: comment !== null ? [comment] : [], pairs,
          known: VOCAB.has(name) || isRule(name),
        };
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (!cur) {
      strays.push({ line: lineNo, text: content });
      continue;
    }
    const { body, pairs } = splitAttrs(" " + code);
    for (const p of pairs) cur.pairs.push(p);
    if (body !== "") cur.cont.push(body);
    if (comment !== null) cur.comments.push(comment);
  }

  const uh = head(dirs, "UNIT", "SIR");
  const ut = uh ? textOf(uh) : "";
  const unit = ut !== "" ? ut : "(unnamed)";
  const summary: string[] = [];
  const kh = head(dirs, "KIND", "KIND");
  if (kh && textOf(kh) !== "") {
    const t = textOf(kh);
    const ph = KIND_PHRASE.get(t);
    summary.push(ph !== undefined ? ph : "Kind: " + t + " (not a kind SIR defines).");
  }
  const fh = head(dirs, "FIDELITY", "VARIANT");
  if (fh && textOf(fh) !== "") {
    const t = textOf(fh);
    const ph = FID_PHRASE.get(t);
    summary.push(ph !== undefined ? ph : "Fidelity: " + t + " (not a fidelity SIR defines).");
  }
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const t = textOf(d).replace(ANCHOR_DOTS, "");
    if (t !== "") { summary.push("Anchored to " + t + "."); break; }
  }
  const sigD = dirs.find((d) => d.name === "SIG");
  const sig = sigD ? textOf(sigD) : null;

  const mk = (d: Dir, label: string | undefined, text: string, base: string): Draft => {
    const o: Draft = {
      base, text, why: d.pairs.map(whyOf), raw: rawOf(d),
      rawWhy: d.pairs.map((p) => (p.value === "" ? p.kw : p.kw + " " + p.value)), line: d.line,
    };
    if (label !== undefined) o.label = label;
    return o;
  };
  const byNames = (names: string[], labels: (string | undefined)[]): Draft[] => {
    const out: Draft[] = [];
    names.forEach((n, i) => {
      for (const d of dirs) if (d.name === n) out.push(mk(d, labels[i], textOf(d), n));
    });
    return out;
  };

  const rules: Draft[] = dirs.filter((d) => isRule(d.name)).map((d) => mk(d, "Rule " + d.name.slice(1), textOf(d), d.name));
  const pins: Draft[] = dirs.filter((d) => d.name === "PINNED").map((d) => {
    const spans = spansOf(d.args);
    let eq = -1;
    for (let i = 0; i < d.args.length; i++) {
      if (d.args[i] === "=" && !inside(spans, i)) { eq = i; break; }
    }
    const hd = trimST(eq >= 0 ? d.args.slice(0, eq) : d.args);
    const words = hd.split(/[ \t]+/).filter((w) => w !== "");
    const kind = words[0] ?? "";
    const nm = words[1] ?? "";
    let text = textOf(d);
    let empty = false;
    if (eq >= 0) {
      const value = [trimST(d.args.slice(eq + 1)), ...d.cont].filter((p) => p !== "").join(" ");
      text = value;
      empty = value === "";
    }
    const kp = PIN_KIND.get(kind);
    const label = (nm !== "" ? nm : "(unnamed pin)") + " (" + (kp !== undefined ? kp : kind !== "" ? kind : "no kind") + (empty ? ", empty value" : "") + ")";
    return mk(d, label, text, nm !== "" ? "PIN:" + nm : "PIN");
  });
  const carried: Draft[] = dirs.filter((d) => d.name === "CARRIED").map((d) => {
    let c = 0;
    while (c < d.args.length && d.args[c] !== " " && d.args[c] !== "\t") c++;
    const w = d.args.slice(0, c);
    return mk(d, w !== "" ? w : "Carried data", textOf(d), "CARRIED");
  });
  const deps: Draft[] = dirs.filter((d) => d.name === "DEPENDS-ON").map((d) => {
    const t = textOf(d);
    return mk(d, undefined, NONE.test(t) ? "Nothing. No other package is involved." : t, "DEPENDS-ON");
  });
  const members = new Set(["UNIT", "KIND", "FIDELITY", "ANCHOR", "DESCRIPTION", "SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN",
    "PINNED", "TABLE", "CARRIED", "DEPENDS-ON", "INVARIANT", "SCOPE", "NOTE", "RATIONALE", "PROVENANCE"]);
  const more: Draft[] = dirs.filter((d) => !members.has(d.name) && !isRule(d.name)
    && !(d.name === "BEHAVIOR" && textOf(d) === "" && d.pairs.length === 0)).map((d) => {
    const ol = OTHER_LABEL.get(d.name);
    const label = !d.known ? d.name + " (not in the SIR vocabulary)" : ol !== undefined ? ol : d.name;
    return mk(d, label, textOf(d), d.name);
  });
  const strayItems: Draft[] = strays.map((s) => ({
    base: "STRAY", label: "Line " + s.line, text: s.text, why: [], raw: s.text, rawWhy: [], line: s.line,
  }));

  const defs: { id: string; title: string; checked: boolean; drafts: Draft[] }[] = [
    { id: "header", title: "What kind of unit it is", checked: true, drafts: byNames(["UNIT", "KIND", "FIDELITY", "ANCHOR"], ["Name", "Kind", "Fidelity", "Anchor"]) },
    { id: "what", title: "What it is for", checked: false, drafts: byNames(["DESCRIPTION"], [undefined]) },
    { id: "inputs", title: "What it accepts", checked: true, drafts: byNames(["SIG", "ENVELOPE", "UNGUARDED-PRECONDITION", "OUT-OF-DOMAIN"], ["Signature", "Inputs it is verified on", "Assumes, without checking", "Not covered"]) },
    { id: "rules", title: "What it does", checked: true, drafts: rules },
    { id: "pins", title: "Exact definitions", checked: true, drafts: pins },
    { id: "table", title: "Decision table", checked: true, drafts: byNames(["TABLE"], [undefined]) },
    { id: "data", title: "Data it carries", checked: true, drafts: carried },
    { id: "deps", title: "What it depends on", checked: true, drafts: deps },
    { id: "more", title: "Other parts of the contract", checked: true, drafts: more },
    { id: "stray", title: "Text outside any directive", checked: true, drafts: strayItems },
    { id: "holds", title: "Should always hold", checked: false, drafts: byNames(["INVARIANT"], [undefined]) },
    { id: "scope", title: "In and out of scope", checked: false, drafts: byNames(["SCOPE"], [undefined]) },
    { id: "notes", title: "Background", checked: false, drafts: byNames(["NOTE", "RATIONALE", "PROVENANCE"], ["Note", "Why", "Where it came from"]) },
  ];

  const counts = new Map<string, number>();
  const sections: Section[] = [];
  for (const def of defs) {
    if (def.drafts.length === 0) continue;
    const items: Item[] = def.drafts.map((dr) => {
      const n = (counts.get(dr.base) ?? 0) + 1;
      counts.set(dr.base, n);
      const it: Item = { id: n === 1 ? dr.base : dr.base + " #" + n, text: dr.text, why: dr.why, raw: dr.raw, rawWhy: dr.rawWhy, line: dr.line };
      if (dr.label !== undefined) it.label = dr.label;
      return it;
    });
    sections.push({ id: def.id, title: def.title, checked: def.checked, items });
  }
  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
