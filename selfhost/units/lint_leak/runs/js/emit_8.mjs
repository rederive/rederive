const QUOTED = /(?<=^|[ \t([{,=:;|<>!&\-~])(?:"(?:\\[\s\S]|[^"\\])*")+/g;
const LITERAL = /"(?:\\[\s\S]|[^"\\])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const G = "\\u000B-\\u000D\\u0085\\u00A0\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}";
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
const isP = (n) => P.has(n) || /^R\d+$/.test(n);

const spans = (s) => [...s.matchAll(QUOTED)].map((m) => [m.index, m.index + m[0].length]);
const inside = (sp, i) => sp.some(([a, b]) => a < i && i < b);
const blank = (s) => s.replace(QUOTED, (m) => m.replace(LITERAL, '""'));
const trimWs = (s) => s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");

export default function lint_leak(text, isPrimary) {
  const hits = [];
  const lines = text.split(/\r\n|\r|\n/);
  for (let k = 0; k < lines.length; k++) {
    const line = lines[k]
      .replace(/^[ \t\uFEFF]+/, (r) => r.replace(/\uFEFF/g, ""))
      .replace(/[ \t]+$/, "");
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content === "") continue;
    const display = Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") continue;
      const ws = content.search(/[ \t]/);
      const tok = ws < 0 ? content : content.slice(0, ws);
      let hit = false;
      if (isP(tok.replace(/:$/, ""))) hit = true;
      else {
        const g = GLUED.exec(tok);
        if (g && isP(g[0].replace(/:$/, ""))) hit = true;
        else {
          const l = LEAD.exec(content);
          if (l && isP(l[1])) hit = true;
        }
      }
      if (hit) hits.push({ line: k + 1, what: "behavior in a language file", text: display });
      continue;
    }
    const segs = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      let code = content, comment = null;
      const sp = spans(content);
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== "#") continue;
        const b = content[i - 1], a = content[i + 1];
        if ((b === " " || b === "\t") && (a === undefined || a === " " || a === "\t") && !inside(sp, i)) {
          code = content.slice(0, i).replace(/[ \t]+$/, "");
          comment = trimWs(content.slice(i + 1));
          break;
        }
      }
      if (indent === "") {
        const w = code.search(/[ \t]/);
        const name = (w < 0 ? code : code.slice(0, w)).replace(/:$/, "");
        if (NAMESHAPE.test(name) && name !== "CITED") code = w < 0 ? "" : code.slice(w);
      }
      const at = " " + code;
      const asp = spans(at);
      let body = at;
      for (const m of at.matchAll(MARK)) {
        const ki = m.index + m[0].length - m[1].length;
        if (inside(asp, ki)) continue;
        body = at.slice(0, m.index);
        break;
      }
      segs.push(trimWs(body));
      if (comment !== null) segs.push(comment);
    }
    const seen = new Set();
    for (const seg of segs) {
      const b = blank(seg);
      for (const [re, what] of DIALECT) {
        if (seen.has(what)) continue;
        if (re.test(b)) {
          seen.add(what);
          hits.push({ line: k + 1, what, text: display });
        }
      }
    }
  }
  return { hits };
}
