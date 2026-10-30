type Hit = { line: number; what: string; text: string };
type Dir = { dep: boolean; args: string; cont: string[]; attrs: string[]; comments: string[] };

const WHAT = "carried data declared under DEPENDS-ON — use CARRIED (§" + "18)";
const CARRIED_WORD = /(?<![A-Za-z])carried(?![A-Za-z])/i;
const OPENERS = " \t([{,=:;|<>!&-~";

function isSP(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function isWord(c: string | undefined): boolean {
  return c !== undefined && /^[A-Za-z0-9_]$/.test(c);
}

function trimSP(s: string): string {
  return s.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

function spans(s: string): [number, number][] {
  const out: [number, number][] = [];
  let prevClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"') {
      const prev = i === 0 ? undefined : s[i - 1];
      const opens = i === 0 || (prev !== undefined && OPENERS.includes(prev)) || i - 1 === prevClose;
      if (opens) {
        let j = i + 1;
        let close = -1;
        while (j < s.length) {
          const ch = s[j];
          if (ch === "\\") {
            const cp = s.codePointAt(j + 1);
            j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
          } else if (ch === '"') {
            close = j;
            break;
          } else {
            j += 1;
          }
        }
        if (close < 0) break;
        out.push([i, close]);
        prevClose = close;
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return out;
}

function inside(sp: [number, number][], p: number): boolean {
  for (const [a, b] of sp) if (a < p && p < b) return true;
  return false;
}

function attributes(code: string): { body: string; values: string[] } {
  const piece = " " + code;
  const sp = spans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const wordPos = m.index + m[0].length - m[1].length;
    if (!inside(sp, wordPos)) marks.push({ start: m.index, end: m.index + m[0].length });
    m = re.exec(piece);
  }
  if (marks.length === 0) return { body: trimSP(piece), values: [] };
  const first = marks[0];
  if (first === undefined) return { body: trimSP(piece), values: [] };
  const body = trimSP(piece.slice(0, first.start));
  const values: string[] = [];
  for (let k = 0; k < marks.length; k++) {
    const mk = marks[k];
    if (mk === undefined) continue;
    const nx = marks[k + 1];
    values.push(trimSP(piece.slice(mk.end, nx === undefined ? piece.length : nx.start)));
  }
  return { body, values };
}

function nameHit(content: string, name: string): boolean {
  let from = 0;
  for (;;) {
    const at = content.indexOf(name, from);
    if (at < 0) return false;
    const before = at === 0 ? undefined : content[at - 1];
    const after = content[at + name.length];
    if (!isWord(before) && !isWord(after)) return true;
    from = at + 1;
  }
}

export default function schema_lint(text: string, carried_name: string | null): { hits: Hit[] } {
  const rawLines = text.split(/\r\n|\r|\n/);
  const dirs: { line: number; text: string; d: Dir }[] = [];
  let cur: Dir | null = null;
  for (let n = 0; n < rawLines.length; n++) {
    const raw = rawLines[n] ?? "";
    const lead = /^[ \t﻿]*/.exec(raw);
    const leadStr = lead === null ? "" : lead[0];
    const line = (leadStr.replace(/﻿/g, "") + raw.slice(leadStr.length)).replace(/[ \t]+$/, "");
    if (line === "") continue;
    const part = line.replace(/^[ \t]+/, "");
    if (part[0] === "#") {
      if (cur !== null) {
        let c = part.replace(/^#+/, "");
        if (isSP(c[0])) c = c.slice(1);
        cur.comments.push(c);
      }
      continue;
    }
    const sp = spans(part);
    let code = part;
    let trailing: string | null = null;
    for (let i = 1; i < part.length; i++) {
      if (part[i] === "#" && isSP(part[i - 1]) && (i + 1 === part.length || isSP(part[i + 1])) && !inside(sp, i)) {
        code = part.slice(0, i).replace(/[ \t]+$/, "");
        trailing = trimSP(part.slice(i + 1));
        break;
      }
    }
    let opened = false;
    if (!isSP(line[0])) {
      let e = 0;
      while (e < code.length && !isSP(code[e])) e++;
      const name = code.slice(0, e);
      const word = name.endsWith(":") ? name.slice(0, -1) : name;
      if (/^[A-Z][A-Z0-9-]*$/.test(word) && word !== "CITED") {
        const at = attributes(code.slice(e));
        cur = { dep: word === "DEPENDS-ON", args: at.body, cont: [], attrs: at.values, comments: [] };
        dirs.push({ line: n + 1, text: line, d: cur });
        opened = true;
      }
    }
    if (!opened && cur !== null) {
      const at = attributes(code);
      if (at.body !== "") cur.cont.push(at.body);
      for (const v of at.values) cur.attrs.push(v);
    }
    if (trailing !== null && cur !== null) cur.comments.push(trailing);
  }
  const useName = carried_name !== null && carried_name !== "" && carried_name !== "none";
  const hits: Hit[] = [];
  for (const e of dirs) {
    if (!e.d.dep) continue;
    const content = [e.d.args, ...e.d.cont, ...e.d.attrs, ...e.d.comments].join(" ");
    if (CARRIED_WORD.test(content) || (useName && carried_name !== null && nameHit(content, carried_name))) {
      hits.push({ line: e.line, what: WHAT, text: Array.from(e.text).slice(0, 96).join("") });
    }
  }
  return { hits };
}
