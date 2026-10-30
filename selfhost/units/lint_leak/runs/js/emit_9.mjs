const G = "\\u000B-\\u000D\\u0085\\u00A0\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}";
const LINES = /\r\n|\r|\n/;
const QUOTED_SRC = '(?<=^|[ \\t([{,=:;|<>!&\\-~])(?:"(?:\\\\[\\s\\S]|[^"\\\\])*")+';
const LITERAL = /"(?:\\[\s\S]|[^"\\])*"/g;
const MARK_SRC = "[ \\t]+(CITED|EARNED|ANCHOR)(?=[ \\t]|$)";
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = new RegExp("^[A-Z][A-Z0-9-]*:?(?=[" + G + "])", "u");
const LEAD = new RegExp("^[" + G + "]+([A-Z][A-Z0-9-]*)(?=[ \\t:" + G + "]|$)", "u");
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
const isP = (n) => P.has(n) || /^R[0-9]+$/.test(n);

const trimST = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
const spans = (s) => [...s.matchAll(new RegExp(QUOTED_SRC, "g"))].map((m) => [m.index, m.index + m[0].length]);
const blank = (s) => s.replace(new RegExp(QUOTED_SRC, "g"), (m) => m.replace(LITERAL, '""'));
const inside = (sp, i) => sp.some(([a, b]) => a < i && i < b);

export default function lint_leak(text, isPrimary) {
  const hits = [];
  const raw = text.split(LINES);
  for (let k = 0; k < raw.length; k++) {
    const line = raw[k]
      .replace(/^[ \t\uFEFF]+/, (r) => r.replace(/\uFEFF/g, ""))
      .replace(/[ \t]+$/, "");
    const display = Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content === "") continue;
    const num = k + 1;
    if (isPrimary) {
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
          if (i + 1 < content.length && content[i + 1] !== " " && content[i + 1] !== "\t") continue;
          if (inside(sp, i)) continue;
          code = content.slice(0, i).replace(/[ \t]+$/, "");
          comment = trimST(content.slice(i + 1));
          break;
        }
        if (indent === "") {
          const m = /[ \t]/.exec(code);
          const tokEnd = m ? m.index : code.length;
          const name = code.slice(0, tokEnd).replace(/:$/, "");
          if (NAMESHAPE.test(name) && name !== "CITED") code = code.slice(tokEnd);
        }
        const at = " " + code;
        const asp = spans(at);
        let end = at.length;
        for (const m of at.matchAll(new RegExp(MARK_SRC, "g"))) {
          const ki = m.index + m[0].length - m[1].length;
          if (inside(asp, ki)) continue;
          end = m.index;
          break;
        }
        segs.push(trimST(at.slice(0, end)));
        if (comment !== null) segs.push(comment);
      }
      const seen = new Set();
      for (const seg of segs) {
        const b = blank(seg);
        for (const [re, label] of DIALECT) {
          if (seen.has(label)) continue;
          if (re.test(b)) {
            seen.add(label);
            hits.push({ line: num, what: label, text: display });
          }
        }
      }
    } else {
      if (indent !== "" || content[0] === "#") continue;
      let hit = false;
      const tm = /[ \t]/.exec(content);
      const tok = tm ? content.slice(0, tm.index) : content;
      if (isP(tok) || (tok.endsWith(":") && isP(tok.slice(0, -1)))) hit = true;
      if (!hit) {
        const g = GLUED.exec(tok);
        if (g && isP(g[0].replace(/:$/, ""))) hit = true;
      }
      if (!hit) {
        const l = LEAD.exec(content);
        if (l && isP(l[1])) hit = true;
      }
      if (hit) hits.push({ line: num, what: "behavior in a language file", text: display });
    }
  }
  return { hits };
}
