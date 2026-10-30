const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const OPENERS = " \t([{,=:;|<>!&-~";

type Span = [number, number];

function isSep(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function spansOf(s: string): Span[] {
  const out: Span[] = [];
  let prevEnd = -1;
  let i = 0;
  while (i < s.length) {
    const opens =
      s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1] ?? "\u0000") || i === prevEnd);
    if (!opens) {
      i++;
      continue;
    }
    let j = i + 1;
    let closed = -1;
    while (j < s.length) {
      const c = s[j];
      if (c === "\\") {
        if (j + 1 >= s.length) break;
        const cp = s.codePointAt(j + 1) ?? 0;
        j += 1 + (cp > 0xffff ? 2 : 1);
      } else if (c === '"') {
        closed = j;
        break;
      } else {
        j++;
      }
    }
    if (closed < 0) break;
    out.push([i, closed + 1]);
    prevEnd = closed + 1;
    i = closed + 1;
  }
  return out;
}

function inside(spans: Span[], i: number): boolean {
  for (const [a, b] of spans) if (a < i && i < b) return true;
  return false;
}

function trimSep(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, "");
}

function attrCut(s: string): string {
  const spans = spansOf(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    const kw = m.index + m[0].length - m[1].length;
    if (!inside(spans, kw)) return trimSep(s.slice(0, m.index));
    m = re.exec(s);
  }
  return trimSep(s);
}

function cutComment(content: string): string {
  const spans = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] !== "#") continue;
    if (!isSep(content[i - 1])) continue;
    if (i + 1 < content.length && !isSep(content[i + 1])) continue;
    if (inside(spans, i)) continue;
    return content.slice(0, i).replace(/[ \t]+$/, "");
  }
  return content;
}

export function directive(text: string, name: string): string | null {
  if (!NAME.test(name) || name === "CITED") throw new Error('not a directive name: "' + name + '"');
  const lines = text.split(/\r\n|\r|\n/);
  let current: string | null = null;
  let pieces: string[] = [];
  let found = false;
  for (const raw of lines) {
    const line = raw.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, "")).replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = (/^[ \t]*/.exec(line) ?? [""])[0];
    const content = line.slice(indent.length);
    if (content.startsWith("#")) continue;
    const code = cutComment(content);
    let started: string | null = null;
    let rest = "";
    if (indent === "") {
      let k = 0;
      while (k < code.length && !isSep(code[k])) k++;
      let word = code.slice(0, k);
      rest = code.slice(k);
      if (!NAME.test(word) && word.endsWith(":")) word = word.slice(0, -1);
      if (NAME.test(word) && word !== "CITED") started = word;
    }
    if (started !== null) {
      if (found) break;
      current = started;
      pieces = [];
      if (started === name) found = true;
      if (found) pieces.push(attrCut(rest));
    } else if (current !== null && found) {
      pieces.push(attrCut(" " + code));
    }
  }
  if (!found) return null;
  return pieces.filter((p) => p !== "").join(" ");
}
