type Hit = { line: number; what: string; text: string };

const P = new Set<string>(("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
  "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
  "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "));

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
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, "JS API name"],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/, "JS API name"],
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/, "Rust API name"],
  [/\b(?:new)?line[- ]?terminator/i, "line-terminator mechanism"],
  [/\b(null|undefined)\b/, "JS value name (say none)"],
];

function blank(s: string): string {
  return s.replace(QUOTED, '""');
}

function isSp(c: string): boolean {
  return c === " " || c === "\t";
}

function trimSp(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function isP(name: string): boolean {
  return P.has(name) || RULE.test(name);
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<Hit> } {
  const hits: Hit[] = [];
  const rawLines = text.split(LINES);
  for (let n = 0; n < rawLines.length; n++) {
    const line = rawLines[n].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const content = line.replace(/^[ \t]+/, "");
    const indent = line.slice(0, line.length - content.length);
    if (content === "") continue;
    const display = Array.from(line.replace(/^[ \t]+/, "")).slice(0, 96).join("");

    if (!isPrimary) {
      if (indent !== "" || content.startsWith("#")) continue;
      let end = 0;
      while (end < content.length && !isSp(content[end])) end++;
      const token = content.slice(0, end);
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
    if (content.startsWith("#")) {
      segments.push(content.replace(/^#+/, ""));
    } else {
      let code = content;
      let comment: string | null = null;
      const spans: Array<[number, number]> = [];
      for (const m of content.matchAll(QUOTED)) {
        const st = m.index === undefined ? 0 : m.index;
        spans.push([st, st + m[0].length]);
      }
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== "#") continue;
        if (!isSp(content[i - 1])) continue;
        if (i + 1 < content.length && !isSp(content[i + 1])) continue;
        let prot = false;
        for (const [a, b] of spans) {
          if (a < i && i < b) {
            prot = true;
            break;
          }
        }
        if (prot) continue;
        code = content.slice(0, i).replace(/[ \t]+$/, "");
        comment = trimSp(content.slice(i + 1));
        break;
      }
      if (indent === "") {
        let e = 0;
        while (e < code.length && !isSp(code[e])) e++;
        const name = code.slice(0, e).replace(/:$/, "");
        if (NAMESHAPE.test(name)) code = code.slice(e);
      }
      const s = " " + code;
      const mm = MARK.exec(s);
      const body = trimSp(mm === null ? s : s.slice(0, mm.index));
      segments.push(body);
      if (comment !== null) segments.push(comment);
    }

    const seen = new Set<string>();
    for (const seg of segments) {
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
