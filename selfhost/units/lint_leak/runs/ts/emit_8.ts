type Hit = { line: number; what: string; text: string };

const GLUE_CLASS =
  "\\u000B-\\u000D\\u0085\\u00A0\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}";

const QUOTED = /(?<=^|[ \t([{,=:;|<>!&\-~])(?:"(?:\\[\s\S]|[^"\\])*")+/g;
const LITERAL = /"(?:\\[\s\S]|[^"\\])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = new RegExp("^[A-Z][A-Z0-9-]*:?(?=[" + GLUE_CLASS + "])", "u");
const LEAD = new RegExp(
  "^[" + GLUE_CLASS + "]+([A-Z][A-Z0-9-]*)(?=[ \\t:" + GLUE_CLASS + "]|$)",
  "u"
);

const DIALECT: Array<[RegExp, string]> = [
  [/\/\^.*\$\/[gimsuy]*/, "anchored regex literal"],
  [/\\[wsdWSDbB]\b/, "regex class escape"],
  [/\\p\{/, "regex property escape"],
  [
    /\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/,
    "JS API name",
  ],
  [
    /\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/,
    "JS API name",
  ],
  [
    /\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/,
    "Rust API name",
  ],
  [/\b(?:new)?line[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];

const P_NAMES = new Set(
  (
    "SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED"
  ).split(" ")
);

function isP(name: string): boolean {
  return P_NAMES.has(name) || /^R\d+$/.test(name);
}

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of s.matchAll(QUOTED)) {
    const start = m.index ?? 0;
    out.push([start, start + m[0].length]);
  }
  return out;
}

function inside(sp: Array<[number, number]>, i: number): boolean {
  for (const [a, b] of sp) if (a < i && i < b) return true;
  return false;
}

function blank(s: string): string {
  return s.replace(QUOTED, (m) => m.replace(LITERAL, '""'));
}

function trimSpacing(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function display(line: string): string {
  return Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
}

function splitComment(content: string): { code: string; comment: string | null } {
  const sp = spans(content);
  for (let i = 0; i < content.length; i++) {
    if (content[i] !== "#" || i === 0) continue;
    const before = content[i - 1];
    if (before !== " " && before !== "\t") continue;
    const after = i + 1 < content.length ? content[i + 1] : "";
    if (after !== "" && after !== " " && after !== "\t") continue;
    if (inside(sp, i)) continue;
    return {
      code: content.slice(0, i).replace(/[ \t]+$/, ""),
      comment: trimSpacing(content.slice(i + 1)),
    };
  }
  return { code: content, comment: null };
}

function bodyOf(code: string): string {
  const attr = " " + code;
  const sp = spans(attr);
  for (const m of attr.matchAll(MARK)) {
    const idx = m.index ?? 0;
    const kwIdx = idx + m[0].length - m[1].length;
    if (inside(sp, kwIdx)) continue;
    return trimSpacing(attr.slice(0, idx));
  }
  return trimSpacing(attr);
}

export default function lint_leak(
  text: string,
  isPrimary: boolean
): { hits: Array<{ line: number; what: string; text: string }> } {
  const hits: Hit[] = [];
  const rawLines = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < rawLines.length; n++) {
    const line = rawLines[n]
      .replace(/^[ \t\uFEFF]+/, (run) => run.replace(/\uFEFF/g, ""))
      .replace(/[ \t]+$/, "");
    const indentLen = line.length - line.replace(/^[ \t]+/, "").length;
    const indent = line.slice(0, indentLen);
    const content = line.slice(indentLen);
    if (content === "") continue;
    if (isPrimary) {
      const segments: string[] = [];
      if (content[0] === "#") {
        segments.push(content.replace(/^#+/, ""));
      } else {
        const sc = splitComment(content);
        let code = sc.code;
        if (indent === "") {
          const m = /[ \t]/.exec(code);
          const first = m ? code.slice(0, m.index) : code;
          const name = first.replace(/:$/, "");
          if (NAMESHAPE.test(name) && name !== "CITED") {
            code = m ? code.slice(m.index) : "";
          }
        }
        segments.push(bodyOf(code));
        if (sc.comment !== null) segments.push(sc.comment);
      }
      const seen = new Set<string>();
      for (const seg of segments) {
        const b = blank(seg);
        for (const [re, label] of DIALECT) {
          if (seen.has(label)) continue;
          if (re.test(b)) {
            seen.add(label);
            hits.push({ line: n + 1, what: label, text: display(line) });
          }
        }
      }
    } else {
      if (indent !== "" || content[0] === "#") continue;
      const m = /[ \t]/.exec(content);
      const token = m ? content.slice(0, m.index) : content;
      let hit = false;
      if (isP(token.replace(/:$/, ""))) hit = true;
      if (!hit) {
        const g = GLUED.exec(token);
        if (g && isP(g[0].replace(/:$/, ""))) hit = true;
      }
      if (!hit) {
        const l = LEAD.exec(content);
        if (l && isP(l[1])) hit = true;
      }
      if (hit) {
        hits.push({
          line: n + 1,
          what: "behavior in a language file",
          text: display(line),
        });
      }
    }
  }
  return { hits };
}
