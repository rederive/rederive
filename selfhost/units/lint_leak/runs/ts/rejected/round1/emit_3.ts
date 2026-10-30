type Hit = { line: number; what: string; text: string };
type Node = { name: string; line: number; args: string; cont: string[]; comments: string[]; isComment: boolean };

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

function parse(text: string): Node[] {
  const nodes: Node[] = [];
  let cur: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    if (line.trim() === "") continue;
    const num = i + 1;
    const content = line.replace(/^[ \t]+/, "");
    const indent = line.slice(0, line.length - content.length);
    if (content.charAt(0) === "#") {
      if (cur) {
        let r = content.replace(/^#+/, "");
        if (r.length > 0 && r.charAt(0).trim() === "") r = r.slice(1);
        cur.comments.push(r);
      } else {
        nodes.push({ name: "#", line: num, args: content, cont: [], comments: [], isComment: true });
      }
      continue;
    }
    let code = content;
    let trailer: string | null = null;
    const m = TRAILER.exec(content);
    if (m) {
      code = (m[1] ?? "").replace(/\s+$/, "");
      trailer = (m[2] ?? "").trim();
    }
    if (indent === "") {
      const sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? "" : code.slice(sp + 1).replace(/^[ \t]+/, "");
      if (COLON.test(name)) name = name.slice(0, -1);
      if (NAMESHAPE.test(name)) {
        const n: Node = { name, line: num, args: body(rest), cont: [], comments: trailer !== null ? [trailer] : [], isComment: false };
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

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<Hit> } {
  const hits: Hit[] = [];
  const nodes = parse(text);
  for (const n of nodes) {
    if (isPrimary) {
      const segs = n.isComment ? [n.args] : [n.args, ...n.cont, ...n.comments];
      for (const seg of segs) {
        const b = seg.replace(BLANK, '""');
        for (const [re, what] of ROWS) {
          if (re.test(b)) hits.push({ line: n.line, what, text: display(n.name + " " + b) });
        }
      }
    } else if (!n.isComment && (P.has(n.name) || RULE.test(n.name))) {
      hits.push({ line: n.line, what: "behavior in a language file", text: display(n.name + " " + n.args) });
    }
  }
  return { hits };
}
