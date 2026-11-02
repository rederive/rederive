type Item = { id: string; label?: string; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };
type Section = { id: string; title: string; checked: boolean; items: Item[] };
type Reading = { unit: string; summary: string[]; sig: string | null; checks: string[]; sections: Section[] };
type Pair = { kw: string; value: string };
type Dir = { name: string; line: number; args: string; cont: string[]; attrs: Pair[]; comments: string[] };
type Span = { s: number; e: number };

const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const FEFF = String.fromCharCode(0xfeff);
const RET = String.fromCharCode(0x23ce);
const LEAD_RUN = new RegExp("^[ \\t\\uFEFF]*");
const OPENERS = new Set<string>(["\t", " ", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);

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
  ["set", "set"], ["const", "constant"], ["names", "names"], ["number", "number"],
  ["constant", "constant"], ["chars", "characters"], ["order", "order"], ["map", "mapping"], ["bytes", "bytes"],
]);
const OTHER_LABEL = new Map<string, string>([
  ["ORACLE", "The tests (file and fingerprint)"], ["ORACLE-CLASS", "Kind of tests"], ["STATE", "What it changes in place"],
  ["SEAM", "Export shape"], ["TRACE-SEAM", "Effect boundary"], ["SRC", "Source location"], ["EFFECT", "Effect"],
  ["SURFACE", "Module surface"], ["EMIT", "Emits"], ["REQUEST", "Requests"], ["BRANCH", "Branch"],
  ["ON-ERROR", "On error"], ["PAR", "Unordered window"], ["RING", "Token ring"], ["LIFECYCLE", "Resource lifecycle"],
  ["REACH", "Off-path unit"], ["TRIGGER", "Trigger"], ["EARNED", "Earned rule"], ["BEHAVIOR", "Behavior header"],
]);

type SecDef = { id: string; title: string; checked: boolean; members: [string, string | null][] };
const SECTIONS: SecDef[] = [
  { id: "header", title: "What kind of unit it is", checked: true, members: [["UNIT", "Name"], ["KIND", "Kind"], ["FIDELITY", "Fidelity"], ["ANCHOR", "Anchor"]] },
  { id: "what", title: "What it is for", checked: false, members: [["DESCRIPTION", null]] },
  { id: "inputs", title: "What it accepts", checked: true, members: [["SIG", "Signature"], ["ENVELOPE", "Inputs it is verified on"], ["UNGUARDED-PRECONDITION", "Assumes, without checking"], ["OUT-OF-DOMAIN", "Not covered"]] },
  { id: "rules", title: "What it does", checked: true, members: [] },
  { id: "pins", title: "Exact definitions", checked: true, members: [["PINNED", null]] },
  { id: "table", title: "Decision table", checked: true, members: [["TABLE", null]] },
  { id: "data", title: "Data it carries", checked: true, members: [["CARRIED", null]] },
  { id: "deps", title: "What it depends on", checked: true, members: [["DEPENDS-ON", null]] },
  { id: "more", title: "Other parts of the contract", checked: true, members: [] },
  { id: "stray", title: "Text outside any directive", checked: true, members: [] },
  { id: "holds", title: "Should always hold", checked: false, members: [["INVARIANT", null]] },
  { id: "scope", title: "In and out of scope", checked: false, members: [["SCOPE", null]] },
  { id: "notes", title: "Background", checked: false, members: [["NOTE", "Note"], ["RATIONALE", "Why"], ["PROVENANCE", "Where it came from"]] },
];

function trimST(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function quotedSpans(s: string): Span[] {
  const out: Span[] = [];
  let p = 0;
  let lastClose = -2;
  while (p < s.length) {
    if (s[p] === '"' && (p === 0 || OPENERS.has(s[p - 1] ?? "") || p === lastClose + 1)) {
      let q = p + 1;
      let found = -1;
      while (q < s.length) {
        const c = s[q];
        if (c === "\\") q += 2;
        else if (c === '"') { found = q; break; }
        else q++;
      }
      if (found < 0) break;
      out.push({ s: p, e: found });
      lastClose = found;
      p = found + 1;
    } else p++;
  }
  return out;
}

function inside(spans: Span[], pos: number): boolean {
  for (const sp of spans) if (sp.s < pos && pos < sp.e) return true;
  return false;
}

function splitAttrs(S: string, spans: Span[], off: number): { body: string; pairs: Pair[] } {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const hits: { idx: number; end: number; kw: string }[] = [];
  let m: RegExpExecArray | null = re.exec(S);
  while (m !== null) {
    const kw = m[1] ?? "";
    const end = m.index + m[0].length;
    if (!inside(spans, end - kw.length + off)) hits.push({ idx: m.index, end, kw });
    m = re.exec(S);
  }
  const first = hits[0];
  const body = trimST(first ? S.slice(0, first.idx) : S);
  const pairs: Pair[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!h) continue;
    const nx = hits[i + 1];
    pairs.push({ kw: h.kw, value: trimST(S.slice(h.end, nx ? nx.idx : S.length)) });
  }
  return { body, pairs };
}

function findMarker(content: string, spans: Span[]): number {
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    const prev = content[i - 1];
    if (prev !== " " && prev !== "\t") continue;
    const next = content[i + 1];
    if (next !== undefined && next !== " " && next !== "\t") continue;
    if (inside(spans, i)) continue;
    return i;
  }
  return -1;
}

function textOf(d: Dir): string {
  return [d.args, ...d.cont].filter((p) => p !== "").join(d.name === "TABLE" ? " " + RET + " " : " ");
}

function rawOf(d: Dir): string {
  let r = [d.args, ...d.cont].filter((p) => p !== "").join(d.name === "TABLE" ? "\n" : " ");
  for (const c of d.comments) r += " # " + c;
  return r;
}

const isRule = (n: string): boolean => /^R[0-9]+$/.test(n);

export function explain_contract(primaryText: unknown): Reading {
  if (typeof primaryText !== "string") throw new TypeError("primaryText must be a string");
  const lines = primaryText.split(LINE_BREAK);
  const dirs: Dir[] = [];
  const strays: { line: number; text: string }[] = [];
  let cur: Dir | null = null;

  for (let li = 0; li < lines.length; li++) {
    const lineNo = li + 1;
    let line = lines[li] ?? "";
    const lead = (LEAD_RUN.exec(line) ?? [""])[0];
    line = lead.split(FEFF).join("") + line.slice(lead.length);
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = (/^[ \t]*/.exec(line) ?? [""])[0];
    const content = line.slice(indent.length);
    if (content[0] === "#") {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ""));
      else strays.push({ line: lineNo, text: content });
      continue;
    }
    const spans = quotedSpans(content);
    const mk = findMarker(content, spans);
    let code = content;
    let trailing: string | null = null;
    if (mk >= 0) {
      code = content.slice(0, mk).replace(/[ \t]+$/, "");
      trailing = trimST(content.slice(mk + 1));
    }
    if (indent === "") {
      const sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const restStart = sp < 0 ? code.length : sp;
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== "CITED") name = name.slice(0, -1);
      if (/^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/.test(name) && name !== "CITED") {
        const rest = code.slice(restStart);
        const { body, pairs } = splitAttrs(rest, spans, restStart);
        const d: Dir = { name, line: lineNo, args: body, cont: [], attrs: pairs, comments: [] };
        if (trailing !== null) d.comments.push(trailing);
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (!cur) {
      strays.push({ line: lineNo, text: content });
      continue;
    }
    const { body, pairs } = splitAttrs(" " + code, spans, -1);
    for (const p of pairs) cur.attrs.push(p);
    if (body !== "") cur.cont.push(body);
    if (trailing !== null) cur.comments.push(trailing);
  }

  const head = (n: string, legacy: string): Dir | null => {
    const a = dirs.filter((d) => d.name === n);
    const b = n === legacy ? [] : dirs.filter((d) => d.name === legacy);
    const all = a.concat(b);
    for (const d of all) if (textOf(d) !== "") return d;
    return a[0] ?? b[0] ?? null;
  };

  const hu = head("UNIT", "SIR");
  const ut = hu ? textOf(hu) : "";
  const unit = ut === "" ? "(unnamed)" : ut;
  const summary: string[] = [];
  const hk = head("KIND", "KIND");
  const kt = hk ? textOf(hk) : "";
  if (kt !== "") summary.push(KIND_PHRASE.get(kt) ?? "Kind: " + kt + " (not a kind SIR defines).");
  const hf = head("FIDELITY", "VARIANT");
  const ft = hf ? textOf(hf) : "";
  if (ft !== "") summary.push(FID_PHRASE.get(ft) ?? "Fidelity: " + ft + " (not a fidelity SIR defines).");
  for (const d of dirs) {
    if (d.name !== "ANCHOR") continue;
    const t = textOf(d).replace(/\.+$/, "");
    if (t !== "") { summary.push("Anchored to " + t + "."); break; }
  }
  const sigD = dirs.find((d) => d.name === "SIG");
  const sig = sigD ? textOf(sigD) : null;

  const counts = new Map<string, number>();
  const mkId = (base: string): string => {
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    return k === 1 ? base : base + " #" + k;
  };

  const whyOf = (pairs: Pair[]): string[] =>
    pairs.map((p) => {
      if (p.kw === "CITED") return p.value !== "" ? p.value : "no reason given";
      if (p.kw === "EARNED") return p.value !== "" ? "added after a failed test (" + p.value + ")" : "added after a failed test";
      return p.value !== "" ? "anchored to " + p.value : "anchored (no reference given)";
    });
  const rawWhyOf = (pairs: Pair[]): string[] => pairs.map((p) => (p.value !== "" ? p.kw + " " + p.value : p.kw));

  const mkItem = (d: Dir, base: string, label: string | null, text: string): Item => {
    const it: Item = { id: mkId(base), text, why: whyOf(d.attrs), raw: rawOf(d), rawWhy: rawWhyOf(d.attrs), line: d.line };
    if (label !== null) it.label = label;
    return it;
  };

  const memberSet = new Set<string>();
  for (const s of SECTIONS) for (const [n] of s.members) memberSet.add(n);

  const sections: Section[] = [];
  for (const sec of SECTIONS) {
    const items: Item[] = [];
    if (sec.id === "rules") {
      for (const d of dirs) if (isRule(d.name)) items.push(mkItem(d, d.name, "Rule " + d.name.slice(1), textOf(d)));
    } else if (sec.id === "pins") {
      for (const d of dirs) {
        if (d.name !== "PINNED") continue;
        const spans = quotedSpans(d.args);
        let eq = -1;
        for (let i = 0; i < d.args.length; i++) {
          if (d.args[i] === "=" && !inside(spans, i)) { eq = i; break; }
        }
        const headS = trimST(eq >= 0 ? d.args.slice(0, eq) : d.args);
        const words = headS === "" ? [] : headS.split(/[ \t]+/);
        const kind = words[0] ?? "";
        const name = words[1] ?? "";
        let value = "";
        if (eq >= 0) value = [trimST(d.args.slice(eq + 1)), ...d.cont].filter((p) => p !== "").join(" ");
        const empty = eq >= 0 && value === "";
        const kr = PIN_KIND.get(kind);
        const label = (name !== "" ? name : "(unnamed pin)") + " (" + (kr !== undefined ? kr : kind !== "" ? kind : "no kind") + (empty ? ", empty value" : "") + ")";
        items.push(mkItem(d, name === "" ? "PIN" : "PIN:" + name, label, eq >= 0 ? value : textOf(d)));
      }
    } else if (sec.id === "data") {
      for (const d of dirs) {
        if (d.name !== "CARRIED") continue;
        const sp = d.args.search(/[ \t]/);
        const first = sp < 0 ? d.args : d.args.slice(0, sp);
        items.push(mkItem(d, d.name, d.args === "" ? "Carried data" : first, textOf(d)));
      }
    } else if (sec.id === "deps") {
      for (const d of dirs) {
        if (d.name !== "DEPENDS-ON") continue;
        const t = textOf(d);
        items.push(mkItem(d, d.name, null, NONE.test(t) ? "Nothing. No other package is involved." : t));
      }
    } else if (sec.id === "more") {
      for (const d of dirs) {
        if (memberSet.has(d.name) || isRule(d.name)) continue;
        if (d.name === "BEHAVIOR" && textOf(d) === "" && d.attrs.length === 0) continue;
        const known = VOCAB.has(d.name);
        const label = !known ? d.name + " (not in the SIR vocabulary)" : OTHER_LABEL.get(d.name) ?? d.name;
        items.push(mkItem(d, d.name, label, textOf(d)));
      }
    } else if (sec.id === "stray") {
      for (const s of strays) {
        items.push({ id: mkId("STRAY"), label: "Line " + s.line, text: s.text, why: [], raw: s.text, rawWhy: [], line: s.line });
      }
    } else {
      for (const [n, label] of sec.members) {
        for (const d of dirs) if (d.name === n) items.push(mkItem(d, n, label, textOf(d)));
      }
    }
    if (items.length > 0) sections.push({ id: sec.id, title: sec.title, checked: sec.checked, items });
  }

  return { unit, summary, sig, checks: [], sections };
}

export default explain_contract;
