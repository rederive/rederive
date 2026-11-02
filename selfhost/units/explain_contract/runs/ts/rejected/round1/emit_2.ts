type Item = { id: string; label?: string; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };
type Section = { id: string; title: string; checked: boolean; items: Item[] };
type Reading = { unit: string; summary: string[]; sig: string | null; checks: string[]; sections: Section[] };
type Pair = { kw: string; value: string };
type Dir = { name: string; line: number; args: string; attrs: Pair[]; cont: string[]; comments: string[]; known: boolean };
type Stray = { line: number; text: string };

const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const ANCHOR_DOTS = /\.+$/;
const SEP = " ⏎ ";
const OPENERS = "\t ([{,=:;|<>!&-~";

const VOCAB = new Set<string>(("UNIT SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM SIG ENVELOPE DEPENDS-ON DESCRIPTION BEHAVIOR INVARIANT TABLE PINNED EARNED NOTE RATIONALE SCOPE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE PROVENANCE CARRIED SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED LANG PRIMARY-SHA256 ABI MECHANISM").split(" "));
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

type Member = { name: string; label: string | null };
type SecDef = { id: string; title: string; checked: boolean; members: Member[] | string };
const m = (name: string, label: string | null): Member => ({ name, label });
const SECTIONS: SecDef[] = [
  { id: "header", title: "What kind of unit it is", checked: true, members: [m("UNIT", "Name"), m("KIND", "Kind"), m("FIDELITY", "Fidelity"), m("ANCHOR", "Anchor")] },
  { id: "what", title: "What it is for", checked: false, members: [m("DESCRIPTION", null)] },
  { id: "inputs", title: "What it accepts", checked: true, members: [m("SIG", "Signature"), m("ENVELOPE", "Inputs it is verified on"), m("UNGUARDED-PRECONDITION", "Assumes, without checking"), m("OUT-OF-DOMAIN", "Not covered")] },
  { id: "rules", title: "What it does", checked: true, members: "rules" },
  { id: "pins", title: "Exact definitions", checked: true, members: "pins" },
  { id: "table", title: "Decision table", checked: true, members: [m("TABLE", null)] },
  { id: "data", title: "Data it carries", checked: true, members: "data" },
  { id: "deps", title: "What it depends on", checked: true, members: [m("DEPENDS-ON", null)] },
  { id: "more", title: "Other parts of the contract", checked: true, members: "more" },
  { id: "stray", title: "Text outside any directive", checked: true, members: "stray" },
  { id: "holds", title: "Should always hold", checked: false, members: [m("INVARIANT", null)] },
  { id: "scope", title: "In and out of scope", checked: false, members: [m("SCOPE", null)] },
  { id: "notes", title: "Background", checked: false, members: [m("NOTE", "Note"), m("RATIONALE", "Why"), m("PROVENANCE", "Where it came from")] },
];
const NAMED = new Set<string>();
for (const s of SECTIONS) if (typeof s.members !== "string") for (const x of s.members) NAMED.add(x.name);
NAMED.add("PINNED");
NAMED.add("CARRIED");

function spansOf(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  let lastClose = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1]) || lastClose === i - 1)) {
      let j = i + 1;
      let found = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") j += 2;
        else if (c === '"') { found = j; break; }
        else j++;
      }
      if (found < 0) break;
      out.push([i, found]);
      lastClose = found;
      i = found + 1;
    } else i++;
  }
  return out;
}

function inside(spans: Array<[number, number]>, p: number): boolean {
  for (const [a, b] of spans) if (p > a && p < b) return true;
  return false;
}

function trimST(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === " " || s[a] === "\t")) a++;
  while (b > a && (s[b - 1] === " " || s[b - 1] === "\t")) b--;
  return s.slice(a, b);
}

function splitAttrs(S: string): { body: string; pairs: Pair[] } {
  const spans = spansOf(S);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const hits: Array<{ idx: number; end: number; kw: string }> = [];
  let mm: RegExpExecArray | null = re.exec(S);
  while (mm !== null) {
    const kw = mm[1];
    const end = mm.index + mm[0].length;
    if (!inside(spans, end - kw.length)) hits.push({ idx: mm.index, end, kw });
    mm = re.exec(S);
  }
  if (hits.length === 0) return { body: trimST(S), pairs: [] };
  const pairs: Pair[] = [];
  for (let k = 0; k < hits.length; k++) {
    const stop = k + 1 < hits.length ? hits[k + 1].idx : S.length;
    pairs.push({ kw: hits[k].kw, value: trimST(S.slice(hits[k].end, stop)) });
  }
  return { body: trimST(S.slice(0, hits[0].idx)), pairs };
}

function textOf(d: Dir): string {
  const p = [d.args, ...d.cont].filter((x) => x !== "");
  return p.join(d.name === "TABLE" ? SEP : " ");
}

function rawOf(d: Dir): string {
  const p = [d.args, ...d.cont].filter((x) => x !== "");
  let r = p.join(d.name === "TABLE" ? "\n" : " ");
  for (const c of d.comments) r += " # " + c;
  return r;
}

const isR = (n: string): boolean => /^R[0-9]+$/.test(n);

export function explain_contract(primaryText: unknown): Reading {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const dirs: Dir[] = [];
  const strays: Stray[] = [];
  const lines = primaryText.split(LINE_BREAK);
  let cur: Dir | null = null;
  for (let li = 0; li < lines.length; li++) {
    const lineNo = li + 1;
    const raw0 = lines[li];
    const lead = /^[ \t﻿]*/.exec(raw0);
    const leadStr = lead === null ? "" : lead[0];
    const line = (leadStr.replace(/﻿/g, "") + raw0.slice(leadStr.length)).replace(/[ \t]+$/, "");
    if (line === "") continue;
    const ind = /^[ \t]*/.exec(line);
    const indent = ind === null ? "" : ind[0];
    const content = line.slice(indent.length);
    if (content.startsWith("#")) {
      if (cur !== null) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ line: lineNo, text: content });
      continue;
    }
    const spans = spansOf(content);
    let code = content;
    let tc: string | null = null;
    for (let k = 1; k < content.length + 1; k++) {
      if (k >= content.length || content[k] !== "#") continue;
      const prev = content[k - 1];
      const next = k + 1 < content.length ? content[k + 1] : "";
      if ((prev === " " || prev === "\t") && (next === "" || next === " " || next === "\t") && !inside(spans, k)) {
        code = content.slice(0, k).replace(/[ \t]+$/, "");
        tc = trimST(content.slice(k + 1));
        break;
      }
    }
    if (indent === "") {
      let cut = 0;
      while (cut < code.length && code[cut] !== " " && code[cut] !== "\t") cut++;
      let name = code.slice(0, cut);
      const rest = code.slice(cut);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== "CITED") {
        const { body, pairs } = splitAttrs(rest);
        const d: Dir = { name, line: lineNo, args: body, attrs: pairs, cont: [], comments: tc !== null ? [tc] : [], known: VOCAB.has(name) || isR(name) };
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (cur === null) {
      strays.push({ line: lineNo, text: content });
      continue;
    }
    const { body, pairs } = splitAttrs(" " + code);
    for (const p of pairs) cur.attrs.push(p);
    if (body !== "") cur.cont.push(body);
    if (tc !== null) cur.comments.push(tc);
  }

  const head = (n: string, legacy: string): Dir | null => {
    const list = dirs.filter((d) => d.name === n).concat(dirs.filter((d) => d.name === legacy));
    for (const d of list) if (textOf(d) !== "") return d;
    const a = dirs.find((d) => d.name === n);
    if (a !== undefined) return a;
    const b = dirs.find((d) => d.name === legacy);
    return b === undefined ? null : b;
  };

  const hu = head("UNIT", "SIR");
  const ut = hu === null ? "" : textOf(hu);
  const unit = ut === "" ? "(unnamed)" : ut;
  const summary: string[] = [];
  const hk = head("KIND", "KIND");
  if (hk !== null) {
    const t = textOf(hk);
    if (t !== "") summary.push(KIND_PHRASE.get(t) ?? "Kind: " + t + " (not a kind SIR defines).");
  }
  const hf = head("FIDELITY", "VARIANT");
  if (hf !== null) {
    const t = textOf(hf);
    if (t !== "") summary.push(FID_PHRASE.get(t) ?? "Fidelity: " + t + " (not a fidelity SIR defines).");
  }
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const t = textOf(d).replace(ANCHOR_DOTS, "");
    if (t !== "") { summary.push("Anchored to " + t + "."); break; }
  }
  const sd = dirs.find((d) => d.name === "SIG");
  const sig = sd === undefined ? null : textOf(sd);

  const counts = new Map<string, number>();
  const mkId = (base: string): string => {
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    return k === 1 ? base : base + " #" + k;
  };
  const mkItem = (d: Dir, base: string, label: string | null, text: string): Item => {
    const why = d.attrs.map((p) => {
      if (p.kw === "CITED") return p.value !== "" ? p.value : "no reason given";
      if (p.kw === "EARNED") return p.value !== "" ? "added after a failed test (" + p.value + ")" : "added after a failed test";
      return p.value !== "" ? "anchored to " + p.value : "anchored (no reference given)";
    });
    const it: Item = { id: mkId(base), text, why, raw: rawOf(d), rawWhy: d.attrs.map((p) => (p.value === "" ? p.kw : p.kw + " " + p.value)), line: d.line };
    if (label !== null) it.label = label;
    return it;
  };
  const plain = (d: Dir, label: string | null): Item => {
    let text = textOf(d);
    if (d.name === "DEPENDS-ON" && NONE.test(text)) text = "Nothing. No other package is involved.";
    return mkItem(d, d.name, label, text);
  };
  const pin = (d: Dir): Item => {
    const spans = spansOf(d.args);
    let eq = -1;
    for (let k = 0; k < d.args.length; k++) if (d.args[k] === "=" && !inside(spans, k)) { eq = k; break; }
    const hd = trimST(eq < 0 ? d.args : d.args.slice(0, eq));
    const words = hd === "" ? [] : hd.split(/[ \t]+/);
    const kind = words.length > 0 ? words[0] : "";
    const name = words.length > 1 ? words[1] : "";
    let text = textOf(d);
    let emptyVal = false;
    if (eq >= 0) {
      const value = trimST(d.args.slice(eq + 1));
      text = [value, ...d.cont].filter((x) => x !== "").join(" ");
      emptyVal = value === "";
    }
    const kp = PIN_KIND.get(kind);
    const label = (name !== "" ? name : "(unnamed pin)") + " (" + (kp !== undefined ? kp : kind !== "" ? kind : "no kind") + (eq >= 0 && emptyVal ? ", empty value" : "") + ")";
    return mkItem(d, name === "" ? "PIN" : "PIN:" + name, label, text);
  };

  const sections: Section[] = [];
  for (const s of SECTIONS) {
    const items: Item[] = [];
    if (typeof s.members !== "string") {
      for (const mem of s.members) for (const d of dirs) if (d.name === mem.name) items.push(plain(d, mem.label));
    } else if (s.members === "rules") {
      for (const d of dirs) if (isR(d.name)) items.push(plain(d, "Rule " + d.name.slice(1)));
    } else if (s.members === "pins") {
      for (const d of dirs) if (d.name === "PINNED") items.push(pin(d));
    } else if (s.members === "data") {
      for (const d of dirs) {
        if (d.name !== "CARRIED") continue;
        let cut = 0;
        while (cut < d.args.length && d.args[cut] !== " " && d.args[cut] !== "\t") cut++;
        items.push(plain(d, d.args === "" ? "Carried data" : d.args.slice(0, cut)));
      }
    } else if (s.members === "more") {
      for (const d of dirs) {
        if (NAMED.has(d.name) || isR(d.name)) continue;
        if (d.name === "BEHAVIOR" && textOf(d) === "" && d.attrs.length === 0) continue;
        const label = !d.known ? d.name + " (not in the SIR vocabulary)" : OTHER_LABEL.get(d.name) ?? d.name;
        items.push(plain(d, label));
      }
    } else {
      for (const st of strays) {
        items.push({ id: mkId("STRAY"), label: "Line " + st.line, text: st.text, why: [], raw: st.text, rawWhy: [], line: st.line });
      }
    }
    if (items.length > 0) sections.push({ id: s.id, title: s.title, checked: s.checked, items });
  }
  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
