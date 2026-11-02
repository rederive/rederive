type Item = { id: string; label?: string; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };
type Section = { id: string; title: string; checked: boolean; items: Item[] };
type Reading = { unit: string; summary: string[]; sig: string | null; checks: string[]; sections: Section[] };
type Dir = { name: string; line: number; args: string; attrs: [string, string][]; cont: string[]; comments: string[]; known: boolean };
type Entry = { base: string; label: string | undefined; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };

const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const ANCHOR_DOTS = /\.+$/;
const DIR_NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const RULE = /^R[0-9]+$/;
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
  ["regex", "pattern"], ["charset", "character set"], ["grammar", "grammar"], ["text", "exact text"], ["set", "set"],
  ["const", "constant"], ["names", "names"], ["number", "number"], ["constant", "constant"], ["chars", "characters"],
  ["order", "order"], ["map", "mapping"], ["bytes", "bytes"],
]);
const OTHER_LABEL = new Map<string, string>([
  ["ORACLE", "The tests (file and fingerprint)"], ["ORACLE-CLASS", "Kind of tests"], ["STATE", "What it changes in place"],
  ["SEAM", "Export shape"], ["TRACE-SEAM", "Effect boundary"], ["SRC", "Source location"], ["EFFECT", "Effect"],
  ["SURFACE", "Module surface"], ["EMIT", "Emits"], ["REQUEST", "Requests"], ["BRANCH", "Branch"], ["ON-ERROR", "On error"],
  ["PAR", "Unordered window"], ["RING", "Token ring"], ["LIFECYCLE", "Resource lifecycle"], ["REACH", "Off-path unit"],
  ["TRIGGER", "Trigger"], ["EARNED", "Earned rule"], ["BEHAVIOR", "Behavior header"],
]);

const isST = (c: string | undefined): boolean => c === " " || c === "\t";

function trimST(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isST(s[a])) a++;
  while (b > a && isST(s[b - 1])) b--;
  return s.slice(a, b);
}

function spans(s: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0;
  let prevClose = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1] as string) || i === prevClose + 1)) {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\") { j += 2; continue; }
        if (s[j] === '"') break;
        j++;
      }
      if (j >= s.length) break;
      out.push([i, j]);
      prevClose = j;
      i = j + 1;
    } else i++;
  }
  return out;
}

function inside(sp: [number, number][], p: number): boolean {
  for (const [a, b] of sp) if (a < p && p < b) return true;
  return false;
}

function splitAttrs(s: string): { body: string; pairs: [string, string][] } {
  const sp = spans(s);
  const hits: { idx: number; end: number; kw: string }[] = [];
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR.exec(s)) !== null) {
    const kw = m[1] as string;
    const end = m.index + m[0].length;
    if (!inside(sp, end - kw.length)) hits.push({ idx: m.index, end, kw });
  }
  if (hits.length === 0) return { body: trimST(s), pairs: [] };
  const first = hits[0] as { idx: number; end: number; kw: string };
  const pairs: [string, string][] = [];
  for (let k = 0; k < hits.length; k++) {
    const h = hits[k] as { idx: number; end: number; kw: string };
    const nxt = hits[k + 1];
    pairs.push([h.kw, trimST(s.slice(h.end, nxt ? nxt.idx : s.length))]);
  }
  return { body: trimST(s.slice(0, first.idx)), pairs };
}

function codeAndComment(content: string): { code: string; comment: string | null } {
  const sp = spans(content);
  for (let k = 1; k < content.length; k++) {
    if (content[k] !== "#") continue;
    if (!isST(content[k - 1])) continue;
    if (k + 1 < content.length && !isST(content[k + 1])) continue;
    if (inside(sp, k)) continue;
    return { code: trimST(content.slice(0, k)), comment: trimST(content.slice(k + 1)) };
  }
  return { code: content, comment: null };
}

function textOf(d: Dir): string {
  return [d.args, ...d.cont].filter((p) => p !== "").join(d.name === "TABLE" ? " ⏎ " : " ");
}

function rawOf(d: Dir): string {
  let r = [d.args, ...d.cont].filter((p) => p !== "").join(d.name === "TABLE" ? "\n" : " ");
  for (const c of d.comments) r += " # " + c;
  return r;
}

function whyOf(pair: [string, string]): string {
  const [k, v] = pair;
  if (k === "CITED") return v !== "" ? v : "no reason given";
  if (k === "EARNED") return v !== "" ? "added after a failed test (" + v + ")" : "added after a failed test";
  return v !== "" ? "anchored to " + v : "anchored (no reference given)";
}

export function explain_contract(primaryText: unknown): Reading {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const lines = primaryText.split(LINE_BREAK);
  const dirs: Dir[] = [];
  const strays: { line: number; text: string }[] = [];
  let cur: Dir | null = null;

  for (let n = 0; n < lines.length; n++) {
    let ln = lines[n] as string;
    let e = 0;
    while (e < ln.length && (isST(ln[e]) || ln[e] === "﻿")) e++;
    ln = ln.slice(0, e).split("﻿").join("") + ln.slice(e);
    let b = ln.length;
    while (b > 0 && isST(ln[b - 1])) b--;
    ln = ln.slice(0, b);
    if (ln === "") continue;
    let ind = 0;
    while (ind < ln.length && isST(ln[ind])) ind++;
    const content = ln.slice(ind);
    const lineNo = n + 1;
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ line: lineNo, text: content });
      continue;
    }
    const cc = codeAndComment(content);
    if (ind === 0) {
      let sp = cc.code.search(/[ \t]/);
      if (sp < 0) sp = cc.code.length;
      let name = cc.code.slice(0, sp);
      const rest = cc.code.slice(sp);
      if (COLON_NAME.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (DIR_NAME.test(name) && name !== "CITED") {
        const r = splitAttrs(rest);
        const d: Dir = {
          name, line: lineNo, args: r.body, attrs: r.pairs, cont: [],
          comments: cc.comment !== null ? [cc.comment] : [],
          known: VOCAB.has(name) || RULE.test(name),
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
    const r = splitAttrs(" " + cc.code);
    for (const p of r.pairs) cur.attrs.push(p);
    if (r.body !== "") cur.cont.push(r.body);
    if (cc.comment !== null) cur.comments.push(cc.comment);
  }

  const head = (n: string, legacy: string): Dir | null => {
    const list = dirs.filter((d) => d.name === n).concat(dirs.filter((d) => d.name === legacy));
    for (const d of list) if (textOf(d) !== "") return d;
    return list.length > 0 ? (list[0] as Dir) : null;
  };

  const uh = head("UNIT", "SIR");
  const ut = uh ? textOf(uh) : "";
  const unit = ut !== "" ? ut : "(unnamed)";
  const summary: string[] = [];
  const kh = head("KIND", "KIND");
  const kt = kh ? textOf(kh) : "";
  if (kt !== "") summary.push(KIND_PHRASE.get(kt) ?? "Kind: " + kt + " (not a kind SIR defines).");
  const fh = head("FIDELITY", "VARIANT");
  const ft = fh ? textOf(fh) : "";
  if (ft !== "") summary.push(FID_PHRASE.get(ft) ?? "Fidelity: " + ft + " (not a fidelity SIR defines).");
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const t = textOf(d).replace(ANCHOR_DOTS, "");
    if (t !== "") { summary.push("Anchored to " + t + "."); break; }
  }
  const sigD = dirs.find((d) => d.name === "SIG");
  const sig = sigD ? textOf(sigD) : null;

  const generic = (d: Dir, label: string | undefined, text: string): Entry => ({
    base: d.name, label, text, why: d.attrs.map(whyOf), raw: rawOf(d),
    rawWhy: d.attrs.map(([k, v]) => (v !== "" ? k + " " + v : k)), line: d.line,
  });
  const byName = (n: string): Dir[] => dirs.filter((d) => d.name === n);
  const members = (list: [string, string | undefined][]): Entry[] => {
    const out: Entry[] = [];
    for (const [n, l] of list) for (const d of byName(n)) out.push(generic(d, l, textOf(d)));
    return out;
  };

  const memberNames = new Set<string>();
  const defs: { id: string; title: string; checked: boolean; make: () => Entry[] }[] = [];
  const addM = (id: string, title: string, checked: boolean, list: [string, string | undefined][]): void => {
    for (const [n] of list) memberNames.add(n);
    defs.push({ id, title, checked, make: () => members(list) });
  };
  addM("header", "What kind of unit it is", true, [["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]]);
  addM("what", "What it is for", false, [["DESCRIPTION", undefined]]);
  addM("inputs", "What it accepts", true, [["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]]);
  defs.push({
    id: "rules", title: "What it does", checked: true,
    make: () => dirs.filter((d) => RULE.test(d.name)).map((d) => generic(d, "Rule " + d.name.slice(1), textOf(d))),
  });
  memberNames.add("PINNED");
  defs.push({
    id: "pins", title: "Exact definitions", checked: true,
    make: () => byName("PINNED").map((d) => {
      const a = d.args;
      const sp = spans(a);
      let eq = -1;
      for (let i = 0; i < a.length; i++) if (a[i] === "=" && !inside(sp, i)) { eq = i; break; }
      const words = trimST(eq >= 0 ? a.slice(0, eq) : a).split(/[ \t]+/);
      const kind = words[0] ?? "";
      const name = words[1] ?? "";
      let text = textOf(d);
      let emptyVal = false;
      if (eq >= 0) {
        text = [trimST(a.slice(eq + 1)), ...d.cont].filter((p) => p !== "").join(" ");
        emptyVal = text === "";
      }
      const kp = kind !== "" ? (PIN_KIND.get(kind) ?? kind) : "no kind";
      const label = (name !== "" ? name : "(unnamed pin)") + " (" + kp + (emptyVal ? ", empty value" : "") + ")";
      const en = generic(d, label, text);
      en.base = "PIN" + (name !== "" ? ":" + name : "");
      return en;
    }),
  });
  addM("table", "Decision table", true, [["TABLE", undefined]]);
  memberNames.add("CARRIED");
  defs.push({
    id: "data", title: "Data it carries", checked: true,
    make: () => byName("CARRIED").map((d) => {
      let sp = d.args.search(/[ \t]/);
      if (sp < 0) sp = d.args.length;
      return generic(d, d.args === "" ? "Carried data" : d.args.slice(0, sp), textOf(d));
    }),
  });
  memberNames.add("DEPENDS-ON");
  defs.push({
    id: "deps", title: "What it depends on", checked: true,
    make: () => byName("DEPENDS-ON").map((d) => {
      const t = textOf(d);
      return generic(d, undefined, NONE.test(t) ? "Nothing. No other package is involved." : t);
    }),
  });
  const moreIdx = defs.length;
  defs.push({ id: "more", title: "Other parts of the contract", checked: true, make: () => [] });
  defs.push({
    id: "stray", title: "Text outside any directive", checked: true,
    make: () => strays.map((s) => ({ base: "STRAY", label: "Line " + s.line, text: s.text, why: [], raw: s.text, rawWhy: [], line: s.line })),
  });
  addM("holds", "Should always hold", false, [["INVARIANT", undefined]]);
  addM("scope", "In and out of scope", false, [["SCOPE", undefined]]);
  addM("notes", "Background", false, [["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]]);
  defs[moreIdx] = {
    id: "more", title: "Other parts of the contract", checked: true,
    make: () => dirs
      .filter((d) => !memberNames.has(d.name) && !RULE.test(d.name) && !(d.name === "BEHAVIOR" && textOf(d) === "" && d.attrs.length === 0))
      .map((d) => generic(d, !d.known ? d.name + " (not in the SIR vocabulary)" : (OTHER_LABEL.get(d.name) ?? d.name), textOf(d))),
  };

  const counts = new Map<string, number>();
  const sections: Section[] = [];
  for (const def of defs) {
    const items: Item[] = [];
    for (const en of def.make()) {
      const k = (counts.get(en.base) ?? 0) + 1;
      counts.set(en.base, k);
      const it: Item = { id: k === 1 ? en.base : en.base + " #" + k, text: en.text, why: en.why, raw: en.raw, rawWhy: en.rawWhy, line: en.line };
      if (en.label !== undefined) it.label = en.label;
      items.push(it);
    }
    if (items.length > 0) sections.push({ id: def.id, title: def.title, checked: def.checked, items });
  }
  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
