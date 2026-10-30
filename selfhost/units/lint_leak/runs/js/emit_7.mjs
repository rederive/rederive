const LINES = /\r\n|\r|\n/;
const QUOTED = /(?<=^|[ \t([{,=:;|<>!&\-~])(?:"(?:\\[\s\S]|[^"\\])*")+/g;
const LITERAL = /"(?:\\[\s\S]|[^"\\])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUE = "\\u000B-\\u000D\\u0085\\u00A0\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}";
const GLUED = new RegExp("^[A-Z][A-Z0-9-]*:?(?=[" + GLUE + "])", "u");
const LEAD = new RegExp("^[" + GLUE + "]+([A-Z][A-Z0-9-]*)(?=[ \\t:" + GLUE + "]|$)", "u");
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
const isP = (n) => P.has(n) || /^R\d+$/.test(n);

const trimST = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
const spans = (s) => [...s.matchAll(QUOTED)].map((m) => [m.index, m.index + m[0].length]);
const blank = (s) => s.replace(QUOTED, (m) => m.replace(LITERAL, '""'));
const display = (l) => Array.from(l.replace(/^[ \t]+/, "")).slice(0, 96).join("");

export default function lint_leak(text, isPrimary) {
  const hits = [];
  const lines = text.split(LINES).map((l) =>
    l.replace(/^[ \t\uFEFF]+/, (m) => m.replace(/\uFEFF/g, "")).replace(/[ \t]+$/, ""));
  lines.forEach((line, idx) => {
    const n = idx + 1;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content === "") return;
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") return;
      const tm = /^[^ \t]*/.exec(content)[0];
      let hit = isP(tm) || (tm.endsWith(":") && isP(tm.slice(0, -1)));
      if (!hit) {
        const g = GLUED.exec(tm);
        if (g && isP(g[0].replace(/:$/, ""))) hit = true;
      }
      if (!hit) {
        const c = LEAD.exec(line);
        if (c && isP(c[1])) hit = true;
      }
      if (hit) hits.push({ line: n, what: "behavior in a language file", text: display(line) });
      return;
    }
    const segs = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      let code = content;
      let comment = null;
      const sp = spans(content);
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== "#") continue;
        if (content[i - 1] !== " " && content[i - 1] !== "\t") continue;
        const nx = content[i + 1];
        if (!(nx === undefined || nx === " " || nx === "\t")) continue;
        if (sp.some(([a, b]) => a < i && i < b)) continue;
        code = content.slice(0, i).replace(/[ \t]+$/, "");
        comment = trimST(content.slice(i + 1));
        break;
      }
      if (indent === "") {
        const k = code.search(/[ \t]/);
        const name = (k < 0 ? code : code.slice(0, k)).replace(/:$/, "");
        if (NAMESHAPE.test(name) && name !== "CITED") code = k < 0 ? "" : code.slice(k);
      }
      const at = " " + code;
      const asp = spans(at);
      let body = at;
      for (const m of at.matchAll(MARK)) {
        const ki = m.index + m[0].length - m[1].length;
        if (asp.some(([a, b]) => a < ki && ki < b)) continue;
        body = at.slice(0, m.index);
        break;
      }
      segs.push(trimST(body));
      if (comment !== null) segs.push(comment);
    }
    const seen = new Set();
    for (const seg of segs) {
      const b = blank(seg);
      for (const [re, label] of DIALECT) {
        if (seen.has(label)) continue;
        if (re.test(b)) {
          seen.add(label);
          hits.push({ line: n, what: label, text: display(line) });
        }
      }
    }
  });
  return { hits };
}
