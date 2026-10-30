type Hit = { line: number; what: string; text: string };

const P_NAMES: ReadonlySet<string> = new Set(
  ("SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR INVARIANT TABLE SCOPE " +
    "UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST " +
    "BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED").split(" "),
);

const LINES = /\r\n|\r|\n/;
const QUOTED_SRC = '"(?:\\\\.|[^"\\\\\\n])*"';
const MARK = /[ \t]+(?:CITED|EARNED|ANCHOR)(?=[ \t]|$)/;
const NAMESHAPE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const RULE = /^R\d+$/;

const ROWS: ReadonlyArray<{ re: RegExp; what: string }> = [
  { re: /\/\^.*\$\/[gimsuy]*/, what: "anchored regex literal" },
  { re: /\\[wsdWSDbB]\b/, what: "regex class escape" },
  { re: /\\p\{/, what: "regex property escape" },
  {
    re: /\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/,
    what: "JS API name",
  },
  {
    re: /\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/,
    what: "JS API name",
  },
  {
    re: /\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/,
    what: "Rust API name",
  },
  { re: /\b(?:new)?line[- ]?terminator/i, what: "line-terminator mechanism" },
  { re: /\b(null|undefined)\b/, what: "JS value name (say none)" },
];

function blank(s: string): string {
  return s.replace(new RegExp(QUOTED_SRC, "g"), '""');
}

function display(line: string): string {
  let i = 0;
  while (i < line.length && (line[i] === " " || line[i] === "\t")) i++;
  return Array.from(line.slice(i)).slice(0, 96).join("");
}

function trimST(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

export default function lint_leak(text: string, isPrimary: boolean): { hits: Array<Hit> } {
  const hits: Hit[] = [];
  const raw = text.split(LINES);
  for (let n = 0; n < raw.length; n++) {
    const line = raw[n].replace(/^﻿+/, "").replace(/[ \t]+$/, "");
    const m = /^[ \t]*/.exec(line);
    const indent = m ? m[0] : "";
    const content = line.slice(indent.length);
    if (content === "") continue;
    const shown = display(line);
    if (!isPrimary) {
      if (indent !== "" || content[0] === "#") continue;
      let k = 0;
      while (k < content.length && content[k] !== " " && content[k] !== "\t") k++;
      const token = content.slice(0, k);
      const bare = token.endsWith(":") ? token.slice(0, -1) : token;
      let hit = P_NAMES.has(token) || RULE.test(token) || P_NAMES.has(bare) || RULE.test(bare);
      if (!hit) {
        const g = GLUED.exec(token);
        if (g) hit = P_NAMES.has(g[0]) || RULE.test(g[0]);
      }
      if (hit) hits.push({ line: n + 1, what: "behavior in a language file", text: shown });
      continue;
    }
    const segs: string[] = [];
    if (content[0] === "#") {
      segs.push(content.replace(/^#+/, ""));
    } else {
      const spans: Array<[number, number]> = [];
      for (const q of content.matchAll(new RegExp(QUOTED_SRC, "g"))) {
        const st = q.index ?? 0;
        spans.push([st, st + q[0].length]);
      }
      let code = content;
      let comment: string | null = null;
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== "#") continue;
        const prev = content[i - 1];
        if (prev !== " " && prev !== "\t") continue;
        if (i + 1 < content.length && content[i + 1] !== " " && content[i + 1] !== "\t") continue;
        if (spans.some(([a, b]) => a < i && i < b)) continue;
        code = content.slice(0, i).replace(/[ \t]+$/, "");
        comment = trimST(content.slice(i + 1));
        break;
      }
      if (indent === "") {
        let k = 0;
        while (k < code.length && code[k] !== " " && code[k] !== "\t") k++;
        let name = code.slice(0, k);
        if (name.endsWith(":")) name = name.slice(0, -1);
        if (NAMESHAPE.test(name)) code = code.slice(k);
      }
      const s = " " + code;
      const mk = MARK.exec(s);
      const body = trimST(mk ? s.slice(0, mk.index) : s);
      segs.push(body);
      if (comment !== null) segs.push(comment);
    }
    const seen = new Set<string>();
    for (const seg of segs) {
      const b = blank(seg);
      for (const row of ROWS) {
        if (seen.has(row.what)) continue;
        if (row.re.test(b)) {
          seen.add(row.what);
          hits.push({ line: n + 1, what: row.what, text: shown });
        }
      }
    }
  }
  return { hits };
}
