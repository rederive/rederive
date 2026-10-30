const P = new Set(("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
  "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
  "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "));
const LINES = /\r\n|\r|\n/;
const QUOTED = /"(?:\\.|[^"\\\n])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const RULE = /^R\d+$/;
const ROWS = [
  [/\/\^.*\$\/[gimsuy]*/, "anchored regex literal"],
  [/\\[wsdWSDbB]\b/, "regex class escape"],
  [/\\p\{/, "regex property escape"],
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, "JS API name"],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/, "JS API name"],
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/, "Rust API name"],
  [/\b(?:new)?line[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];
const trimST = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

export default function lint_leak(text, isPrimary) {
  const hits = [];
  const lines = text.split(LINES);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content === "") continue;
    const display = Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") continue;
      const m0 = /^[^ \t]*/.exec(content)[0];
      const tok = m0.endsWith(":") ? m0.slice(0, -1) : m0;
      let ok = P.has(tok) || RULE.test(tok);
      if (!ok) {
        const g = GLUED.exec(m0);
        if (g && (P.has(g[0]) || RULE.test(g[0]))) ok = true;
      }
      if (ok) hits.push({ line: i + 1, what: "behavior in a language file", text: display });
      continue;
    }
    const segs = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      let code = content;
      let comment = null;
      const prot = [];
      for (const m of content.matchAll(QUOTED)) prot.push([m.index, m.index + m[0].length]);
      for (let k = 0; k < content.length; k++) {
        if (content[k] !== "#" || k === 0) continue;
        const pc = content[k - 1];
        if (pc !== " " && pc !== "\t") continue;
        const nc = content[k + 1];
        if (!(nc === undefined || nc === " " || nc === "\t")) continue;
        if (prot.some(([s, e]) => s < k && k < e)) continue;
        code = content.slice(0, k).replace(/[ \t]+$/, "");
        comment = trimST(content.slice(k + 1));
        break;
      }
      if (indent === "") {
        const sp = code.search(/[ \t]/);
        let name = sp < 0 ? code : code.slice(0, sp);
        name = name.replace(/:$/, "");
        if (NAMESHAPE.test(name)) code = sp < 0 ? "" : code.slice(sp);
      }
      const full = " " + code;
      const mm = MARK.exec(full);
      const body = trimST(mm ? full.slice(0, mm.index) : full);
      segs.push(body);
      if (comment !== null) segs.push(comment);
    }
    const seen = new Set();
    for (const seg of segs) {
      const b = seg.replace(QUOTED, '""');
      for (const [re, label] of ROWS) {
        if (seen.has(label)) continue;
        if (re.test(b)) {
          seen.add(label);
          hits.push({ line: i + 1, what: label, text: display });
        }
      }
    }
  }
  return { hits };
}
