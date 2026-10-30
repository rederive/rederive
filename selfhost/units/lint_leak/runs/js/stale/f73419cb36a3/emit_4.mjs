const LINES = /\r\n|\r|\n/;
const QUOTED = /"(?:\\.|[^"\\\n])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const RULE = /^R\d+$/;
const DIALECT = [
  [/\/\^.*\$\/[gimsuy]*/, "anchored regex literal"],
  [/\\[wsdWSDbB]\b/, "regex class escape"],
  [/\\p\{/, "regex property escape"],
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, "JS API name"],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/, "JS API name"],
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/, "Rust API name"],
  [/\b(?:new)?line[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];
const P = new Set(("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
  "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
  "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "));
const isP = (n) => P.has(n) || RULE.test(n);
const blank = (s) => s.replace(QUOTED, '""');
const trimST = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

function splitComment(content) {
  const prot = [];
  for (const m of content.matchAll(QUOTED)) prot.push([m.index, m.index + m[0].length]);
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "#") continue;
    if (i === 0) continue;
    const b = content[i - 1];
    if (b !== " " && b !== "\t") continue;
    if (i + 1 < content.length) {
      const a = content[i + 1];
      if (a !== " " && a !== "\t") continue;
    }
    if (prot.some(([s, e]) => s < i && i < e)) continue;
    return { code: content.slice(0, i).replace(/[ \t]+$/, ""), comment: trimST(content.slice(i + 1)) };
  }
  return { code: content, comment: null };
}

export default function lint_leak(text, isPrimary) {
  const hits = [];
  const lines = text.split(LINES);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content === "") continue;
    const display = Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") continue;
      const m0 = /[ \t]/.exec(content);
      const tok = m0 ? content.slice(0, m0.index) : content;
      let hit = isP(tok.replace(/:$/, ""));
      if (!hit) {
        const g = GLUED.exec(tok);
        if (g && isP(g[0])) hit = true;
      }
      if (hit) hits.push({ line: n + 1, what: "behavior in a language file", text: display });
      continue;
    }
    const segs = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      let { code, comment } = splitComment(content);
      if (indent === "") {
        const m = /[ \t]/.exec(code);
        const raw = m ? code.slice(0, m.index) : code;
        const name = raw.replace(/:$/, "");
        if (NAMESHAPE.test(name)) code = m ? code.slice(m.index) : "";
      }
      const spaced = " " + code;
      const mk = MARK.exec(spaced);
      segs.push(trimST(mk ? spaced.slice(0, mk.index) : spaced));
      if (comment !== null) segs.push(comment);
    }
    const seen = new Set();
    for (const seg of segs) {
      const b = blank(seg);
      for (const [re, label] of DIALECT) {
        if (seen.has(label)) continue;
        if (re.test(b)) {
          seen.add(label);
          hits.push({ line: n + 1, what: label, text: display });
        }
      }
    }
  }
  return { hits };
}
