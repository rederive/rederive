type Hit = { line: number; what: string; text: string };

const LINES = /\r\n|\r|\n/;
const QUOTED = /"(?:\\.|[^"\\\n])*"/g;
const MARK = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const RULE = /^R\d+$/;

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

const P = new Set(
  (
    "SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED"
  ).split(" "),
);

function isP(name: string): boolean {
  return P.has(name) || RULE.test(name);
}

function trimEnd(s: string): string {
  let e = s.length;
  while (e > 0 && (s[e - 1] === " " || s[e - 1] === "\t")) e--;
  return s.slice(0, e);
}

function trimStart(s: string): string {
  let b = 0;
  while (b < s.length && (s[b] === " " || s[b] === "\t")) b++;
  return s.slice(b);
}

function firstSpace(s: string): number {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === " " || s[i] === "\t") return i;
  }
  return -1;
}

function splitComment(content: string): { code: string; comment: string | null } {
  const spans: Array<[number, number]> = [];
  for (const m of content.matchAll(QUOTED)) {
    const start = m.index ?? 0;
    spans.push([start, start + m[0].length]);
  }
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    const before = content[i - 1];
    if (before !== " " && before !== "\t") continue;
    const after = i + 1 < content.length ? content[i + 1] : "";
    if (after !== "" && after !== " " && after !== "\t") continue;
    let protectedHash = false;
    for (const [s, e] of spans) {
      if (s < i && i < e) {
        protectedHash = true;
        break;
      }
    }
    if (protectedHash) continue;
    return {
      code: trimEnd(content.slice(0, i)),
      comment: trimStart(trimEnd(content.slice(i + 1))),
    };
  }
  return { code: content, comment: null };
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Hit[] } {
  const hits: Hit[] = [];
  const lines = text.split(LINES);
  for (let n = 0; n < lines.length; n++) {
    const line = trimEnd(lines[n].replace(/^﻿+/, ""));
    const content = trimStart(line);
    if (content === "") continue;
    const indentEmpty = content.length === line.length;
    const display = Array.from(content).slice(0, 96).join("");
    // display strips leading spaces/tabs of the line, which equals content
    if (!isPrimary) {
      if (!indentEmpty || content[0] === "#") continue;
      const sp = firstSpace(content);
      const token = sp < 0 ? content : content.slice(0, sp);
      let hit = false;
      if (isP(token)) hit = true;
      else if (token.endsWith(":") && isP(token.slice(0, -1))) hit = true;
      else {
        const m = GLUED.exec(token);
        if (m !== null && isP(m[0])) hit = true;
      }
      if (hit) hits.push({ line: n + 1, what: "behavior in a language file", text: display });
      continue;
    }
    const segments: string[] = [];
    if (content[0] === "#") {
      segments.push(content.replace(/^#+/, ""));
    } else {
      const sc = splitComment(content);
      let code = sc.code;
      if (indentEmpty) {
        const sp = firstSpace(code);
        const token = sp < 0 ? code : code.slice(0, sp);
        const name = token.replace(/:$/, "");
        if (NAMESHAPE.test(name)) code = sp < 0 ? "" : code.slice(sp);
      }
      const full = " " + code;
      const mm = MARK.exec(full);
      const body = trimStart(trimEnd(mm === null ? full : full.slice(0, mm.index)));
      segments.push(body);
      if (sc.comment !== null) segments.push(sc.comment);
    }
    const seen = new Set<string>();
    for (const seg of segments) {
      const blanked = seg.replace(QUOTED, '""');
      for (const [re, label] of DIALECT) {
        if (seen.has(label)) continue;
        if (re.test(blanked)) {
          seen.add(label);
          hits.push({ line: n + 1, what: label, text: display });
        }
      }
    }
  }
  return { hits };
}
