type Hit = { line: number; what: string; text: string };

const GL = "\\u000B-\\u000D\\u0085\\u00A0\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u1680\\u180E\\u2000-\\u200F\\u2028-\\u202F\\u205F-\\u2064\\u2066-\\u206F\\u3000\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}";
const GLUED = new RegExp("^[A-Z][A-Z0-9-]*:?(?=[" + GL + "])", "u");
const LEAD = new RegExp("^[" + GL + "]+([A-Z][A-Z0-9-]*)(?=[ \\t:" + GL + "]|$)", "u");

const P = new Set<string>(
  ("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "),
);
const RULE = /^R\d+$/;
const isP = (n: string): boolean => P.has(n) || RULE.test(n);

const QUOTED = /(?<=^|[ \t([{,=:;|<>!&\-~])(?:"(?:\\[\s\S]|[^"\\])*")+/g;
const LITERAL = /"(?:\\[\s\S]|[^"\\])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;

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

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const m of s.matchAll(QUOTED)) {
    const st = m.index ?? 0;
    out.push([st, st + m[0].length]);
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

function trimST(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && (s[a] === " " || s[a] === "\t")) a++;
  while (b > a && (s[b - 1] === " " || s[b - 1] === "\t")) b--;
  return s.slice(a, b);
}

function display(line: string): string {
  let a = 0;
  while (a < line.length && (line[a] === " " || line[a] === "\t")) a++;
  return Array.from(line.slice(a)).slice(0, 96).join("");
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<Hit> } {
  const hits: Hit[] = [];
  const raw = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < raw.length; n++) {
    const line = raw[n]
      .replace(/^[ \t\uFEFF]+/, (r) => r.replace(/\uFEFF/g, ""))
      .replace(/[ \t]+$/, "");
    const im = /^[ \t]*/.exec(line);
    const indent = im ? im[0] : "";
    const content = line.slice(indent.length);
    if (content === "") continue;
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") continue;
      let k = 0;
      while (k < content.length && content[k] !== " " && content[k] !== "\t") k++;
      const token = content.slice(0, k);
      let hit = false;
      const base = token.endsWith(":") ? token.slice(0, -1) : token;
      if (isP(token) || isP(base)) hit = true;
      if (!hit) {
        const g = GLUED.exec(token);
        if (g) {
          const nm = g[0].endsWith(":") ? g[0].slice(0, -1) : g[0];
          if (isP(nm)) hit = true;
        }
      }
      if (!hit) {
        const l = LEAD.exec(content);
        if (l && isP(l[1])) hit = true;
      }
      if (hit) hits.push({ line: n + 1, what: "behavior in a language file", text: display(line) });
      continue;
    }
    const segs: string[] = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      let code = content;
      let comment: string | null = null;
      const sp = spans(content);
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== "#") continue;
        const pv = content[i - 1];
        if (pv !== " " && pv !== "\t") continue;
        const nx = i + 1 < content.length ? content[i + 1] : "";
        if (nx !== "" && nx !== " " && nx !== "\t") continue;
        if (inside(sp, i)) continue;
        code = content.slice(0, i).replace(/[ \t]+$/, "");
        comment = trimST(content.slice(i + 1));
        break;
      }
      if (indent === "") {
        let k = 0;
        while (k < code.length && code[k] !== " " && code[k] !== "\t") k++;
        let name = code.slice(0, k);
        if (name.endsWith(":")) name = name.slice(0, -1);
        if (NAMESHAPE.test(name) && name !== "CITED") code = code.slice(k);
      }
      const at = " " + code;
      const asp = spans(at);
      let body = at;
      for (const m of at.matchAll(MARK)) {
        const idx = m.index ?? 0;
        const kw = idx + m[0].length - m[1].length;
        if (inside(asp, kw)) continue;
        body = at.slice(0, idx);
        break;
      }
      segs.push(trimST(body));
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
          hits.push({ line: n + 1, what: label, text: disp });
        }
      }
    }
  }
  return { hits };
}
