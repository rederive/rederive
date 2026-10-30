const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const OPENERS = " \t([{,=:;|<>!&-~";

function isSep(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function trimSep(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, "");
}

// quoted spans as [open, close] index pairs
function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prevEnd = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1] ?? "?") || i === prevEnd)) {
      let j = i + 1;
      let closed = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") {
          if (j + 1 >= s.length) {
            j = s.length;
            break;
          }
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
          continue;
        }
        if (c === '"') {
          closed = j;
          break;
        }
        j++;
      }
      if (closed < 0) break;
      out.push([i, closed]);
      prevEnd = closed + 1;
      i = closed + 1;
    } else {
      i++;
    }
  }
  return out;
}

function protectedAt(sp: Array<[number, number]>, idx: number): boolean {
  for (const [a, b] of sp) if (a < idx && idx < b) return true;
  return false;
}

function attrCut(s: string): string {
  const sp = spans(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    const kw = m[1] ?? "";
    const kwIdx = m.index + m[0].length - kw.length;
    if (!protectedAt(sp, kwIdx)) return trimSep(s.slice(0, m.index));
    m = re.exec(s);
  }
  return trimSep(s);
}

export function directive(text: string, name: string): string | null {
  if (!NAME.test(name) || name === "CITED") throw new Error("not a directive name");
  const lines = text.split(/\r\n|\r|\n/);
  let pieces: string[] | null = null;
  let current: string | null = null;
  let found = false;
  for (const raw of lines) {
    let line = raw.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, ""));
    line = line.replace(/[ \t]+$/, "");
    if (line === "") continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const indent = line.slice(0, k);
    const content = line.slice(k);
    if (content.startsWith("#")) continue;
    const sp = spans(content);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== "#") continue;
      if (!isSep(content[i - 1])) continue;
      if (i + 1 < content.length && !isSep(content[i + 1])) continue;
      if (protectedAt(sp, i)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, "");
      break;
    }
    let started: string | null = null;
    let piece = "";
    if (indent === "") {
      let e = 0;
      while (e < code.length && !isSep(code[e])) e++;
      let word = code.slice(0, e);
      const rest = code.slice(e);
      if (word.endsWith(":") && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== "CITED") {
        started = word;
        piece = attrCut(rest);
      }
    }
    if (started !== null) {
      if (found) break;
      current = started;
      if (started === name) {
        found = true;
        pieces = [];
      }
      if (pieces !== null) pieces.push(piece);
    } else if (current !== null) {
      if (found && pieces !== null) pieces.push(attrCut(" " + code));
    }
  }
  if (pieces === null) return null;
  return pieces.filter((p) => p !== "").join(" ");
}
