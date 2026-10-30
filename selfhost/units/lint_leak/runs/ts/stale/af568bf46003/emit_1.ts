type Node = { name: string; line: number; args: string; cont: string[]; comments: string[]; comment: boolean };

const TRAILER = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const MARK = /[ \t]+(?:CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const COLON = /^[A-Z][A-Z0-9-]*:$/;
const RULE = /^R\d+$/;
const BLANK = /"(?:\\.|[^"\\\n])*"/g;
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
const P = new Set(
  ("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "),
);

function body(s: string): string {
  const m = MARK.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
}

function display(s: string): string {
  return s.trim().slice(0, 96);
}

function readNodes(text: string): Node[] {
  const nodes: Node[] = [];
  let cur: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const ln = i + 1;
    if (line.trim() === "") continue;
    const im = /^[ \t]*/.exec(line);
    const indent = im ? im[0] : "";
    const content = line.slice(indent.length);
    if (content.startsWith("#")) {
      let t = content.replace(/^#+/, "");
      if (t.length > 0 && t.charAt(0).trim() === "") t = t.slice(1);
      if (cur) cur.comments.push(t);
      else nodes.push({ name: "#", line: ln, args: content, cont: [], comments: [], comment: true });
      continue;
    }
    let code = content;
    let trailer: string | null = null;
    const tm = TRAILER.exec(content);
    if (tm) {
      code = tm[1].replace(/\s+$/, "");
      trailer = tm[2].trim();
    }
    if (indent === "") {
      const k = code.search(/[ \t]/);
      let name = k < 0 ? code : code.slice(0, k);
      const rest = k < 0 ? "" : code.slice(k + 1).replace(/^[ \t]+/, "");
      if (COLON.test(name)) name = name.slice(0, -1);
      if (NAMESHAPE.test(name)) {
        const n: Node = { name, line: ln, args: body(rest), cont: [], comments: trailer !== null ? [trailer] : [], comment: false };
        nodes.push(n);
        cur = n;
        continue;
      }
    }
    if (cur) {
      cur.cont.push(body(" " + code));
      if (trailer !== null) cur.comments.push(trailer);
    }
  }
  return nodes;
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<{ line: number; what: string; text: string }> } {
  const hits: Array<{ line: number; what: string; text: string }> = [];
  for (const n of readNodes(text)) {
    if (isPrimary) {
      const segs = n.comment ? [n.args] : [n.args, ...n.cont, ...n.comments];
      for (const s of segs) {
        const b = s.replace(BLANK, '""');
        for (const [re, what] of ROWS) {
          if (re.test(b)) hits.push({ line: n.line, what, text: display(n.name + " " + s) });
        }
      }
    } else if (!n.comment && (P.has(n.name) || RULE.test(n.name))) {
      hits.push({ line: n.line, what: "behavior in a language file", text: display(n.name + " " + n.args) });
    }
  }
  return { hits };
}
