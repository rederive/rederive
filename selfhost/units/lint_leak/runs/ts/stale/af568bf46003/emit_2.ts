type Hit = { line: number; what: string; text: string };
type Node = { name: string; line: number; args: string; cont: string[]; comments: string[]; segs: string[] | null };

const TRAILER = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const NAMECOLON = /^[A-Z][A-Z0-9-]*:$/;
const BLANK = /"(?:\\.|[^"\\\n])*"/g;
const RULE = /^R\d+$/;

const ROWS: Array<[RegExp, string]> = [
  [/\/\^.*\$\/[gimsuy]*/, "anchored regex literal"],
  [/\\[wsdWSDbB]\b/, "regex class escape"],
  [/\\p\{/, "regex property escape"],
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, "JS API name"],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl)\.[a-z]\w*/, "JS API name"],
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|(?:^|[^\w])&str\b|\bto_lowercase\b/, "Rust API name"],
  [/\bline[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];

const PRIMARY_NAMES = new Set<string>(
  ("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "),
);

function display(s: string): string {
  return s.trim().slice(0, 96);
}

function body(s: string): string {
  const re = new RegExp(MARK.source, "g");
  const m = re.exec(s);
  return (m === null ? s : s.slice(0, m.index)).trim();
}

function split(content: string): { code: string; trailer: string | null } {
  const m = TRAILER.exec(content);
  if (m === null) return { code: content, trailer: null };
  return { code: m[1].replace(/\s+$/, ""), trailer: m[2].trim() };
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<{ line: number; what: string; text: string }> } {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, "").replace(/[ \t]+$/, ""));
  const nodes: Node[] = [];
  let cur: Node | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ln = i + 1;
    if (line.trim() === "") continue;
    const indent = /^[ \t]*/.exec(line);
    const ind = indent === null ? "" : indent[0];
    const content = line.slice(ind.length);
    if (content.startsWith("#")) {
      let c = content.replace(/^#+/, "");
      if (c.length > 0 && /^\s/.test(c)) c = c.slice(1);
      if (cur !== null) cur.comments.push(c);
      else nodes.push({ name: "#", line: ln, args: "", cont: [], comments: [], segs: [content] });
      continue;
    }
    const { code, trailer } = split(content);
    if (ind === "") {
      const sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? "" : code.slice(sp + 1).replace(/^[ \t]+/, "");
      if (NAMECOLON.test(name)) name = name.slice(0, -1);
      if (NAMESHAPE.test(name)) {
        const n: Node = { name, line: ln, args: body(rest), cont: [], comments: trailer !== null ? [trailer] : [], segs: null };
        nodes.push(n);
        cur = n;
        continue;
      }
    }
    if (cur !== null) {
      cur.cont.push(body(" " + code));
      if (trailer !== null) cur.comments.push(trailer);
    }
  }
  const hits: Hit[] = [];
  if (isPrimary) {
    for (const n of nodes) {
      const segs = n.segs !== null ? n.segs : [n.args, ...n.cont, ...n.comments];
      for (const seg of segs) {
        const b = seg.replace(BLANK, '""');
        for (const [re, what] of ROWS) {
          if (re.test(b)) hits.push({ line: n.line, what, text: display(n.name + " " + seg) });
        }
      }
    }
  } else {
    for (const n of nodes) {
      if (n.segs !== null) continue;
      if (PRIMARY_NAMES.has(n.name) || RULE.test(n.name)) {
        hits.push({ line: n.line, what: "behavior in a language file", text: display(n.name + " " + n.args) });
      }
    }
  }
  return { hits };
}
