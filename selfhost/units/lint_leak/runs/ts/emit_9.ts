type Hit = { line: number; what: string; text: string };

const GLUE_CLASS = "\\u000B-\\u000D\\u0085\\u00A0\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}";

const LINES = /\r\n|\r|\n/;
const QUOTED_SRC = '(?<=^|[ \\t([{,=:;|<>!&\\-~])(?:"(?:\\\\[\\s\\S]|[^"\\\\])*")+';
const LITERAL = /"(?:\\[\s\S]|[^"\\])*"/g;
const MARK_SRC = "[ \\t]+(CITED|EARNED|ANCHOR)(?=[ \\t]|$)";
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = new RegExp("^[A-Z][A-Z0-9-]*:?(?=[" + GLUE_CLASS + "])", "u");
const LEAD = new RegExp("^[" + GLUE_CLASS + "]+([A-Z][A-Z0-9-]*)(?=[ \\t:" + GLUE_CLASS + "]|$)", "u");

const DIALECT: Array<[RegExp, string]> = [
  [/\/\^.*\$\/[gimsuy]*/, "anchored regex literal"],
  [/\\[wsdWSDbB]\b/, "regex class escape"],
  [/\\p\{/, "regex property escape"],
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, "JS API name"],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/, "JS API name"],
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/, "Rust API name"],
  [/\b(?:new)?line[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];

const P = new Set(
  ("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "),
);

function isP(name: string): boolean {
  return P.has(name) || /^R\d+$/.test(name);
}

function spans(s: string): Array<[number, number]> {
  const re = new RegExp(QUOTED_SRC, "g");
  const out: Array<[number, number]> = [];
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    out.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
    m = re.exec(s);
  }
  return out;
}

function inside(sp: Array<[number, number]>, i: number): boolean {
  for (const [a, b] of sp) if (a < i && i < b) return true;
  return false;
}

function blank(s: string): string {
  return s.replace(new RegExp(QUOTED_SRC, "g"), (m: string) => m.replace(LITERAL, '""'));
}

function trimSp(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function display(line: string): string {
  return Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");
}

function cleanLine(raw: string): string {
  return raw.replace(/^[ \t\uFEFF]+/, (r: string) => r.replace(/\uFEFF/g, "")).replace(/[ \t]+$/, "");
}

function primaryLine(line: string, n: number, hits: Hit[]): void {
  const lead = /^[ \t]*/.exec(line);
  const indent = lead === null ? "" : lead[0];
  const content = line.slice(indent.length);
  if (content === "") return;
  const segs: string[] = [];
  if (content.startsWith("#")) {
    segs.push(content.replace(/^#+/, ""));
  } else {
    const sp = spans(content);
    let code = content;
    let comment: string | null = null;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== "#") continue;
      const prev = content[i - 1];
      if (prev !== " " && prev !== "\t") continue;
      if (i + 1 < content.length && content[i + 1] !== " " && content[i + 1] !== "\t") continue;
      if (inside(sp, i)) continue;
      code = trimSp(content.slice(0, i)).replace(/[ \t]+$/, "");
      code = content.slice(0, i).replace(/[ \t]+$/, "");
      comment = trimSp(content.slice(i + 1));
      break;
    }
    if (indent === "") {
      const w = code.search(/[ \t]/);
      const first = w < 0 ? code : code.slice(0, w);
      const name = first.replace(/:$/, "");
      if (NAMESHAPE.test(name) && name !== "CITED") {
        code = w < 0 ? "" : code.slice(w);
      }
    }
    const at = " " + code;
    const asp = spans(at);
    const re = new RegExp(MARK_SRC, "g");
    let body = trimSp(at);
    let m: RegExpExecArray | null = re.exec(at);
    while (m !== null) {
      const kw = m.index + m[0].length - m[1].length;
      if (!inside(asp, kw)) {
        body = trimSp(at.slice(0, m.index));
        break;
      }
      m = re.exec(at);
    }
    segs.push(body);
    if (comment !== null) segs.push(comment);
  }
  const seen = new Set<string>();
  const disp = display(line);
  for (const seg of segs) {
    const b = blank(seg);
    for (const [re, label] of DIALECT) {
      if (seen.has(label)) continue;
      if (re.test(b)) {
        seen.add(label);
        hits.push({ line: n, what: label, text: disp });
      }
    }
  }
}

function languageLine(line: string, n: number, hits: Hit[]): void {
  if (line === "" || line[0] === " " || line[0] === "\t" || line[0] === "#") return;
  const w = line.search(/[ \t]/);
  const tok = w < 0 ? line : line.slice(0, w);
  let hit = false;
  if (isP(tok) || isP(tok.replace(/:$/, "")) && tok.endsWith(":")) hit = true;
  if (!hit) {
    const g = GLUED.exec(tok);
    if (g !== null && isP(g[0].replace(/:$/, ""))) hit = true;
  }
  if (!hit) {
    const l = LEAD.exec(line);
    if (l !== null && isP(l[1])) hit = true;
  }
  if (hit) hits.push({ line: n, what: "behavior in a language file", text: display(line) });
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<{ line: number; what: string; text: string }> } {
  const hits: Hit[] = [];
  const lines = text.split(LINES);
  for (let i = 0; i < lines.length; i++) {
    const line = cleanLine(lines[i]);
    if (isPrimary) primaryLine(line, i + 1, hits);
    else languageLine(line, i + 1, hits);
  }
  return { hits };
}
