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
const DIR_NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const R_DIGITS = /^R[0-9]+$/;
const LEAD_RUN = new RegExp("^[ \\t\\uFEFF]*");
const OPENERS = "\t ([{,=:;|<>!&-~";
const TAB_ROW = " ⏎ ";

const VOCAB = new Set<string>(("UNIT SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM SIG ENVELOPE DEPENDS-ON DESCRIPTION BEHAVIOR INVARIANT TABLE PINNED EARNED NOTE RATIONALE SCOPE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE PROVENANCE CARRIED SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED LANG PRIMARY-SHA256 ABI MECHANISM").split(" "));

const KIND_PHRASE = new Map<string, string>([
  ["FUNCTIONAL", "A pure function: the same input always gives the same output."],
  ["STATE", "Changes one of its arguments in place; the tests check the result and the changed argument."],
  ["EFFECT", "Talks to the outside world; the tests check the calls it makes, in order."],
]);
const FIDELITY_PHRASE = new Map<string, string>([
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
type SecDef = { id: string; title: string; checked: boolean; members: Member[] };
const m = (name: string, label: string | null): Member => ({ name, label });
const SECTIONS: SecDef[] = [
  { id: "header", title: "What kind of unit it is", checked: true, members: [m("UNIT", "Name"), m("KIND", "Kind"), m("FIDELITY", "Fidelity"), m("ANCHOR", "Anchor")] },
  { id: "what", title: "What it is for", checked: false, members: [m("DESCRIPTION", null)] },
  { id: "inputs", title: "What it accepts", checked: true, members: [m("SIG", "Signature"), m("ENVELOPE", "Inputs it is verified on"), m("UNGUARDED-PRECONDITION", "Assumes, without checking"), m("OUT-OF-DOMAIN", "Not covered")] },
  { id: "rules", title: "What it does", checked: true, members: [] },
  { id: "pins", title: "Exact definitions", checked: true, members: [m("PINNED", null)] },
  { id: "table", title: "Decision table", checked: true, members: [m("TABLE", null)] },
  { id: "data", title: "Data it carries", checked: true, members: [m("CARRIED", null)] },
  { id: "deps", title: "What it depends on", checked: true, members: [m("DEPENDS-ON", null)] },
  { id: "more", title: "Other parts of the contract", checked: true, members: [] },
  { id: "stray", title: "Text outside any directive", checked: true, members: [] },
  { id: "holds", title: "Should always hold", checked: false, members: [m("INVARIANT", null)] },
  { id: "scope", title: "In and out of scope", checked: false, members: [m("SCOPE", null)] },
  { id: "notes", title: "Background", checked: false, members: [m("NOTE", "Note"), m("RATIONALE", "Why"), m("PROVENANCE", "Where it came from")] },
];
const LISTED = new Set<string>();
for (const s of SECTIONS) for (const mm of s.members) LISTED.add(mm.name);

function spansOf(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  let prevEnd = -1;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1]) || i === prevEnd)) {
      let j = i + 1;
      let found = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") j += 2;
        else if (c === '"') { found = j; break; } else j++;
      }
      if (found < 0) break;
      out.push([i, found]);
      prevEnd = found + 1;
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

function splitAttrs(s: string, offset: number, spans: Array<[number, number]>): { body: string; pairs: Pair[] } {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const hits: Array<{ idx: number; end: number; kw: string }> = [];
  let mt: RegExpExecArray | null = re.exec(s);
  while (mt !== null) {
    const kw = mt[1];
    const end = mt.index + mt[0].length;
    if (!inside(spans, end - kw.length + offset)) hits.push({ idx: mt.index, end, kw });
    mt = re.exec(s);
  }
  if (hits.length === 0) return { body: trimST(s), pairs: [] };
  const pairs: Pair[] = [];
  for (let k = 0; k < hits.length; k++) {
    const stop = k + 1 < hits.length ? hits[k + 1].idx : s.length;
    pairs.push({ kw: hits[k].kw, value: trimST(s.slice(hits[k].end, stop)) });
  }
  return { body: trimST(s.slice(0, hits[0].idx)), pairs };
}

function textOf(d: Dir): string {
  return [d.args, ...d.cont].filter((p) => p !== "").join(d.name === "TABLE" ? TAB_ROW : " ");
}

function rawOf(d: Dir): string {
  let r = [d.args, ...d.cont].filter((p) => p !== "").join(d.name === "TABLE" ? "\n" : " ");
  for (const c of d.comments) r += " # " + c;
  return r;
}

export function explain_contract(primaryText: unknown): Reading {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const lines = primaryText.split(LINE_BREAK);
  const dirs: Dir[] = [];
  const strays: Stray[] = [];
  let cur: Dir | null = null;
  for (let n = 0; n < lines.length; n++) {
    const lineNo = n + 1;
    const lead = (LEAD_RUN.exec(lines[n]) ?? [""])[0];
    let line = lead.replace(/﻿/g, "") + lines[n].slice(lead.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = (/^[ \t]*/.exec(line) ?? [""])[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ line: lineNo, text: content });
      continue;
    }
    const spans = spansOf(content);
    let marker = -1;
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== "#") continue;
      if (i === 0) continue;
      const pv = content[i - 1];
      if (pv !== " " && pv !== "\t") continue;
      if (i + 1 < content.length && content[i + 1] !== " " && content[i + 1] !== "\t") continue;
      if (inside(spans, i)) continue;
      marker = i;
      break;
    }
    const code = marker >= 0 ? content.slice(0, marker).replace(/[ \t]+$/, "") : content;
    const trailing: string | null = marker >= 0 ? trimST(content.slice(marker + 1)) : null;
    if (indent === "") {
      let sp = code.search(/[ \t]/);
      if (sp < 0) sp = code.length;
      let name = code.slice(0, sp);
      const rest = code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (DIR_NAME.test(name) && name !== "CITED") {
        const { body, pairs } = splitAttrs(rest, sp, spans);
        cur = { name, line: lineNo, args: body, attrs: pairs, cont: [], comments: trailing !== null ? [trailing] : [], known: VOCAB.has(name) || R_DIGITS.test(name) };
        dirs.push(cur);
        continue;
      }
    }
    if (!cur) {
      strays.push({ line: lineNo, text: content });
      continue;
    }
    const { body, pairs } = splitAttrs(" " + code, -1, spans);
    for (const p of pairs) cur.attrs.push(p);
    if (body !== "") cur.cont.push(body);
    if (trailing !== null) cur.comments.push(trailing);
  }

  const head = (n: string, legacy: string): Dir | null => {
    const cands = dirs.filter((d) => d.name === n).concat(dirs.filter((d) => d.name === legacy));
    for (const d of cands) if (textOf(d) !== "") return d;
    return dirs.find((d) => d.name === n) ?? dirs.find((d) => d.name === legacy) ?? null;
  };

  const uh = head("UNIT", "SIR");
  const ut = uh ? textOf(uh) : "";
  const unit = ut === "" ? "(unnamed)" : ut;
  const summary: string[] = [];
  const kh = head("KIND", "KIND");
  if (kh && textOf(kh) !== "") {
    const t = textOf(kh);
    summary.push(KIND_PHRASE.get(t) ?? "Kind: " + t + " (not a kind SIR defines).");
  }
  const fh = head("FIDELITY", "VARIANT");
  if (fh && textOf(fh) !== "") {
    const t = textOf(fh);
    summary.push(FIDELITY_PHRASE.get(t) ?? "Fidelity: " + t + " (not a fidelity SIR defines).");
  }
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const t = textOf(d).replace(ANCHOR_DOTS, "");
    if (t !== "") {
      summary.push("Anchored to " + t + ".");
      break;
    }
  }
  const sd = dirs.find((d) => d.name === "SIG");
  const sig = sd ? textOf(sd) : null;

  const counts = new Map<string, number>();
  const idFor = (base: string): string => {
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    return k === 1 ? base : base + " #" + k;
  };

  const whyOf = (d: Dir): string[] =>
    d.attrs.map((p) => {
      if (p.kw === "CITED") return p.value !== "" ? p.value : "no reason given";
      if (p.kw === "EARNED") return p.value !== "" ? "added after a failed test (" + p.value + ")" : "added after a failed test";
      return p.value !== "" ? "anchored to " + p.value : "anchored (no reference given)";
    });
  const rawWhyOf = (d: Dir): string[] => d.attrs.map((p) => (p.value !== "" ? p.kw + " " + p.value : p.kw));

  const mk = (d: Dir, base: string, label: string | null, text: string): Item => {
    const it: Item = { id: idFor(base), text, why: whyOf(d), raw: rawOf(d), rawWhy: rawWhyOf(d), line: d.line };
    if (label !== null) it.label = label;
    return it;
  };

  const sections: Section[] = [];
  for (const def of SECTIONS) {
    const items: Item[] = [];
    if (def.id === "rules") {
      for (const d of dirs) if (R_DIGITS.test(d.name)) items.push(mk(d, d.name, "Rule " + d.name.slice(1), textOf(d)));
    } else if (def.id === "more") {
      for (const d of dirs) {
        if (LISTED.has(d.name) || R_DIGITS.test(d.name)) continue;
        if (d.name === "BEHAVIOR" && textOf(d) === "" && d.attrs.length === 0) continue;
        const label = !d.known ? d.name + " (not in the SIR vocabulary)" : OTHER_LABEL.get(d.name) ?? d.name;
        items.push(mk(d, d.name, label, textOf(d)));
      }
    } else if (def.id === "stray") {
      for (const s of strays) {
        items.push({ id: idFor("STRAY"), label: "Line " + s.line, text: s.text, why: [], raw: s.text, rawWhy: [], line: s.line });
      }
    } else {
      for (const mem of def.members) {
        for (const d of dirs) {
          if (d.name !== mem.name) continue;
          if (mem.name === "PINNED") {
            const spans = spansOf(d.args);
            let eq = -1;
            for (let i = 0; i < d.args.length; i++) {
              if (d.args[i] === "=" && !inside(spans, i)) { eq = i; break; }
            }
            const hd = trimST(eq >= 0 ? d.args.slice(0, eq) : d.args);
            const words = hd === "" ? [] : hd.split(/[ \t]+/);
            const kind = words[0] ?? "";
            const pname = words[1] ?? "";
            let text = textOf(d);
            let empty = false;
            if (eq >= 0) {
              text = [trimST(d.args.slice(eq + 1)), ...d.cont].filter((p) => p !== "").join(" ");
              empty = text === "";
            }
            const kp = PIN_KIND.get(kind) ?? (kind !== "" ? kind : "no kind");
            const label = (pname !== "" ? pname : "(unnamed pin)") + " (" + kp + (empty ? ", empty value" : "") + ")";
            items.push(mk(d, pname !== "" ? "PIN:" + pname : "PIN", label, text));
          } else if (mem.name === "CARRIED") {
            const sp = d.args.search(/[ \t]/);
            const first = sp < 0 ? d.args : d.args.slice(0, sp);
            items.push(mk(d, d.name, first !== "" ? first : "Carried data", textOf(d)));
          } else if (mem.name === "DEPENDS-ON") {
            const t = textOf(d);
            items.push(mk(d, d.name, mem.label, NONE.test(t) ? "Nothing. No other package is involved." : t));
          } else {
            items.push(mk(d, d.name, mem.label, textOf(d)));
          }
        }
      }
    }
    if (items.length > 0) sections.push({ id: def.id, title: def.title, checked: def.checked, items });
  }

  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
