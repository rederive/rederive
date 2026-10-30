const LINES = /\r\n|\r|\n/;
const QUOTED = /"(?:\\.|[^"\\\n])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const RULENAME = /^R\d+$/;
const P = new Set(("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
  "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
  "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "));
const ROWS = [
  ["anchored regex literal", /\/\^.*\$\/[gimsuy]*/],
  ["regex class escape", /\\[wsdWSDbB]\b/],
  ["regex property escape", /\\p\{/],
  ["JS API name", /\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/],
  ["JS API name", /\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/],
  ["Rust API name", /\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/],
  ["line-terminator mechanism", /\b(?:new)?line[- ]?terminator/i],
  ["JS value name (say none)", /\b(null|undefined)\b/],
];
const isSp = (c) => c === " " || c === "\t";
const trimBoth = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

export default function lint_leak(text, isPrimary) {
  const hits = [];
  const lines = text.split(LINES);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content === "") continue;
    const disp = () => Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") continue;
      let k = 0;
      while (k < content.length && !isSp(content[k])) k++;
      const tok = content.slice(0, k);
      let hit = false;
      const isName = (s) => P.has(s) || RULENAME.test(s);
      if (isName(tok) || (tok.endsWith(":") && isName(tok.slice(0, -1)))) hit = true;
      else {
        const m = GLUED.exec(tok);
        if (m && isName(m[0])) hit = true;
      }
      if (hit) hits.push({ line: n + 1, what: "behavior in a language file", text: disp() });
      continue;
    }
    const segs = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      const spans = [];
      for (const m of content.matchAll(QUOTED)) spans.push([m.index, m.index + m[0].length]);
      let code = content;
      let comment = null;
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== "#") continue;
        if (!isSp(content[i - 1])) continue;
        if (!(i + 1 === content.length || isSp(content[i + 1]))) continue;
        if (spans.some(([s, e]) => s < i && i < e)) continue;
        code = content.slice(0, i).replace(/[ \t]+$/, "");
        comment = trimBoth(content.slice(i + 1));
        break;
      }
      if (indent === "") {
        let k = 0;
        while (k < code.length && !isSp(code[k])) k++;
        const name = code.slice(0, k).replace(/:$/, "");
        if (NAMESHAPE.test(name)) code = code.slice(k);
      }
      let body = " " + code;
      const mm = MARK.exec(body);
      if (mm) body = body.slice(0, mm.index);
      segs.push(trimBoth(body));
      if (comment !== null) segs.push(comment);
    }
    const seen = new Set();
    for (const seg of segs) {
      const b = seg.replace(QUOTED, '""');
      for (const [label, re] of ROWS) {
        if (seen.has(label)) continue;
        if (re.test(b)) {
          seen.add(label);
          hits.push({ line: n + 1, what: label, text: disp() });
        }
      }
    }
  }
  return { hits };
}
