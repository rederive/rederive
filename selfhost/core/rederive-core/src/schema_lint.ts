type Hit = { line: number; what: string; text: string };

const WHAT = "carried data declared under DEPENDS-ON — use CARRIED (§" + "18)";
const OPENERS = " \t([{,=:;|<>!&-~";
const CARRIED_WORD = /(?<![A-Za-z])carried(?![A-Za-z])/i;

type Dir = { line: number; isDep: boolean; text: string; args: string; conts: string[]; attrs: string[]; comments: string[] };

function isSp(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function trimSp(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isSp(s[a])) a++;
  while (b > a && isSp(s[b - 1])) b--;
  return s.slice(a, b);
}

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prevClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1] ?? "") || i === prevClose + 1)) {
      let k = i + 1;
      let close = -1;
      while (k < s.length) {
        const c = s[k];
        if (c === "\\") {
          const cp = s.codePointAt(k + 1);
          k += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
          continue;
        }
        if (c === '"') {
          close = k;
          break;
        }
        k++;
      }
      if (close < 0) break;
      out.push([i, close]);
      prevClose = close;
      i = close + 1;
    } else {
      i++;
    }
  }
  return out;
}

function inside(sp: Array<[number, number]>, i: number): boolean {
  for (const [a, b] of sp) if (a < i && i < b) return true;
  return false;
}

function attributes(piece: string): { body: string; values: string[] } {
  const s = " " + piece;
  const sp = spans(s);
  const words = ["CITED", "EARNED", "ANCHOR"];
  const marks: Array<{ run: number; end: number }> = [];
  for (let w = 1; w < s.length; w++) {
    if (!isSp(s[w - 1])) continue;
    for (const word of words) {
      if (!s.startsWith(word, w)) continue;
      const after = s[w + word.length];
      if (after !== undefined && !isSp(after)) continue;
      if (inside(sp, w)) continue;
      let r = w - 1;
      while (r > 0 && isSp(s[r - 1])) r--;
      marks.push({ run: r, end: w + word.length });
    }
  }
  if (marks.length === 0) return { body: trimSp(s), values: [] };
  const values: string[] = [];
  for (let m = 0; m < marks.length; m++) {
    const mk = marks[m];
    if (mk === undefined) continue;
    const nx = marks[m + 1];
    const stop = nx === undefined ? s.length : nx.run;
    values.push(trimSp(s.slice(mk.end, stop)));
  }
  const first = marks[0];
  return { body: trimSp(s.slice(0, first === undefined ? s.length : first.run)), values };
}

function isWord(c: string | undefined): boolean {
  return c !== undefined && /^[A-Za-z0-9_]$/.test(c);
}

function hasName(content: string, name: string): boolean {
  let from = 0;
  for (;;) {
    const p = content.indexOf(name, from);
    if (p < 0) return false;
    if (!isWord(content[p - 1]) && !isWord(content[p + name.length])) return true;
    from = p + 1;
  }
}

function cleanLine(raw: string): string {
  let i = 0;
  let lead = "";
  while (i < raw.length && (raw[i] === " " || raw[i] === "\t" || raw[i] === "﻿")) {
    if (raw[i] !== "﻿") lead += raw[i];
    i++;
  }
  let line = lead + raw.slice(i);
  let b = line.length;
  while (b > 0 && isSp(line[b - 1])) b--;
  line = line.slice(0, b);
  return line;
}

export default function schema_lint(text: string, carried_name: string | null): { hits: { line: number; what: string; text: string }[] } {
  const lines = text.split(/\r\n|\r|\n/);
  const dirs: Dir[] = [];
  let cur: Dir | null = null;
  for (let n = 0; n < lines.length; n++) {
    const line = cleanLine(lines[n] ?? "");
    if (line === "") continue;
    let st = 0;
    while (st < line.length && isSp(line[st])) st++;
    const part = line.slice(st);
    if (part[0] === "#") {
      let h = 0;
      while (part[h] === "#") h++;
      let c = part.slice(h);
      if (isSp(c[0])) c = c.slice(1);
      if (cur !== null) cur.comments.push(c);
      continue;
    }
    const sp = spans(part);
    let code = part;
    let trailing: string | null = null;
    for (let i = 1; i < part.length; i++) {
      if (part[i] !== "#") continue;
      if (!isSp(part[i - 1])) continue;
      const nx = part[i + 1];
      if (nx !== undefined && !isSp(nx)) continue;
      if (inside(sp, i)) continue;
      code = part.slice(0, i).replace(/[ \t]+$/, "");
      trailing = trimSp(part.slice(i + 1));
      break;
    }
    let opened = false;
    if (st === 0) {
      let e = 0;
      while (e < code.length && !isSp(code[e])) e++;
      const name = code.slice(0, e);
      if (/^[A-Z][A-Z0-9-]*:?$/.test(name) && name !== "CITED" && name !== "CITED:") {
        const bare = name.endsWith(":") ? name.slice(0, -1) : name;
        const at = attributes(code.slice(e));
        cur = { line: n + 1, isDep: bare === "DEPENDS-ON", text: line, args: at.body, conts: [], attrs: [...at.values], comments: [] };
        dirs.push(cur);
        opened = true;
      }
    }
    if (!opened && cur !== null) {
      const at = attributes(code);
      if (at.body !== "") cur.conts.push(at.body);
      cur.attrs.push(...at.values);
    }
    if (trailing !== null && cur !== null) cur.comments.push(trailing);
  }
  const hits: Hit[] = [];
  const useName = carried_name !== null && carried_name !== "" && carried_name !== "none";
  for (const d of dirs) {
    if (!d.isDep) continue;
    const content = [d.args, ...d.conts, ...d.attrs, ...d.comments].join(" ");
    let hit = CARRIED_WORD.test(content);
    if (!hit && useName && carried_name !== null) hit = hasName(content, carried_name);
    if (hit) hits.push({ line: d.line, what: WHAT, text: Array.from(d.text).slice(0, 96).join("") });
  }
  return { hits };
}
