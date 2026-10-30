const P = new Set(("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
  "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
  "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "));
const TRAILER = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const COLON = /^[A-Z][A-Z0-9-]*:$/;
const RULE = /^R\d+$/;
const BLANK = /"(?:\\.|[^"\\\n])*"/g;
const ROWS = [
  [/\/\^.*\$\/[gimsuy]*/, "anchored regex literal"],
  [/\\[wsdWSDbB]\b/, "regex class escape"],
  [/\\p\{/, "regex property escape"],
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, "JS API name"],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl)\.[a-z]\w*/, "JS API name"],
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|(?:^|[^\w])&str\b|\bto_lowercase\b/, "Rust API name"],
  [/\bline[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];

const body = (s) => {
  const m = MARK.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
};
const display = (s) => s.trim().slice(0, 96);

export default function lint_leak(text, isPrimary) {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, "").replace(/[ \t]+$/, ""));
  const nodes = [];
  let cur = null;
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (line.trim() === "") return;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith("#")) {
      if (cur) {
        let c = content.replace(/^#+/, "");
        if (c.length && /\s/.test(c[0])) c = c.slice(1);
        cur.comments.push(c);
      } else {
        nodes.push({ name: "#", line: ln, comment: true, segs: [content] });
      }
      return;
    }
    let code = content, trailer;
    const t = TRAILER.exec(content);
    if (t) {
      code = t[1].replace(/\s+$/, "");
      trailer = t[2].trim();
    }
    if (indent === "") {
      const k = code.search(/[ \t]/);
      let name = k < 0 ? code : code.slice(0, k);
      const rest = k < 0 ? "" : code.slice(k + 1).replace(/^[ \t]+/, "");
      if (COLON.test(name)) name = name.slice(0, -1);
      if (NAMESHAPE.test(name)) {
        cur = { name, line: ln, args: body(rest), cont: [], comments: trailer !== undefined ? [trailer] : [] };
        nodes.push(cur);
        return;
      }
    }
    if (cur) {
      cur.cont.push(body(" " + code));
      if (trailer !== undefined) cur.comments.push(trailer);
    }
  });
  const hits = [];
  if (isPrimary) {
    for (const n of nodes) {
      const segs = n.comment ? n.segs : [n.args, ...n.cont, ...n.comments];
      for (const seg of segs) {
        const b = seg.replace(BLANK, '""');
        for (const [re, what] of ROWS) {
          if (re.test(b)) hits.push({ line: n.line, what, text: display(n.name + " " + seg) });
        }
      }
    }
  } else {
    for (const n of nodes) {
      if (n.comment) continue;
      if (P.has(n.name) || RULE.test(n.name)) {
        hits.push({ line: n.line, what: "behavior in a language file", text: display(n.name + " " + n.args) });
      }
    }
  }
  return { hits };
}
