const NS = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const NSC = /^[A-Z][A-Z0-9-]*:$/;
const TR = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const BL = /"(?:\\.|[^"\\\n])*"/g;
const P = new Set(("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
  "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
  "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "));
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
const disp = (s) => s.trim().slice(0, 96);
const body = (s) => {
  const m = MARK.exec(s);
  return (m ? s.slice(0, m.index) : s).trim();
};

export default function lint_leak(text, isPrimary) {
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, "").replace(/[ \t]+$/, ""));
  const nodes = [];
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const ln = i + 1;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith("#")) {
      if (cur) {
        let c = content.replace(/^#+/, "");
        if (c.length && c[0].trim() === "") c = c.slice(1);
        cur.comments.push(c);
      } else {
        nodes.push({ name: "#", line: ln, comment: true, segs: [content] });
      }
      continue;
    }
    let code = content, trailer = null;
    const m = TR.exec(content);
    if (m) {
      code = m[1].replace(/\s+$/, "");
      trailer = m[2].trim();
    }
    if (indent === "") {
      const k = code.search(/[ \t]/);
      let name = k < 0 ? code : code.slice(0, k);
      const rest = k < 0 ? "" : code.slice(k + 1).replace(/^[ \t]+/, "");
      if (NSC.test(name)) name = name.slice(0, -1);
      if (NS.test(name)) {
        cur = { name, line: ln, args: body(rest), cont: [], comments: trailer !== null ? [trailer] : [] };
        nodes.push(cur);
        continue;
      }
    }
    if (cur) {
      cur.cont.push(body(" " + code));
      if (trailer !== null) cur.comments.push(trailer);
    }
  }
  const hits = [];
  if (isPrimary) {
    for (const n of nodes) {
      const segs = n.comment ? n.segs : [n.args, ...n.cont, ...n.comments];
      for (const s of segs) {
        const b = s.replace(BL, '""');
        for (const [re, what] of ROWS) {
          if (re.test(b)) hits.push({ line: n.line, what, text: disp(n.name + " " + b) });
        }
      }
    }
  } else {
    for (const n of nodes) {
      if (n.comment) continue;
      if (P.has(n.name) || /^R\d+$/.test(n.name)) {
        hits.push({ line: n.line, what: "behavior in a language file", text: disp(n.name + " " + n.args) });
      }
    }
  }
  return { hits };
}
