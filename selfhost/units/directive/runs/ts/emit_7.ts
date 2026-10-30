const NAME = /^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/;
const LINE_BREAK = /\r\n|\r|\n/;
const BOM_DROP = /^[ \t﻿]+/;
const SEP_TRIM = /^[ \t]+|[ \t]+$/g;
const OPENERS = " \t([{,=:;|<>!&-~";

function isSep(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function spansOf(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let i = 0;
  let lastClose = -1;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' && (i === 0 || OPENERS.includes(s[i - 1] as string) || i === lastClose)) {
      let j = i + 1;
      let closed = -1;
      while (j < s.length) {
        const d = s[j];
        if (d === "\\") {
          const cp = s.codePointAt(j + 1);
          if (cp === undefined) {
            j = s.length;
            break;
          }
          j += 1 + (cp > 0xffff ? 2 : 1);
        } else if (d === '"') {
          closed = j;
          break;
        } else {
          j++;
        }
      }
      if (closed < 0) break;
      spans.push([i, closed]);
      i = closed + 1;
      lastClose = i;
    } else {
      i++;
    }
  }
  return spans;
}

function protectedAt(spans: Array<[number, number]>, idx: number): boolean {
  for (const [a, b] of spans) {
    if (a < idx && idx < b) return true;
  }
  return false;
}

function attrCut(s: string): string {
  const spans = spansOf(s);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m: RegExpExecArray | null = re.exec(s);
  while (m !== null) {
    const kw = m[1] as string;
    const kwIdx = m.index + m[0].length - kw.length;
    if (!protectedAt(spans, kwIdx)) {
      return s.slice(0, m.index).replace(SEP_TRIM, "");
    }
    m = re.exec(s);
  }
  return s.replace(SEP_TRIM, "");
}

function commentCut(content: string): string {
  const spans = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (
      content[i] === "#" &&
      isSep(content[i - 1]) &&
      (i + 1 === content.length || isSep(content[i + 1])) &&
      !protectedAt(spans, i)
    ) {
      return content.slice(0, i).replace(/[ \t]+$/, "");
    }
  }
  return content;
}

export function directive(text: string, name: string): string | null {
  if (!NAME.test(name) || name === "CITED") {
    throw new Error("not a directive name: " + JSON.stringify(name));
  }
  const lines = text.split(LINE_BREAK);
  let current: string | null = null;
  let pieces: string[] = [];
  let found = false;
  for (const raw of lines) {
    const dropped = raw.replace(BOM_DROP, (lead) => lead.replace(/﻿/g, ""));
    const line = dropped.replace(/[ \t]+$/, "");
    if (line === "") continue;
    let k = 0;
    while (k < line.length && isSep(line[k])) k++;
    const indent = line.slice(0, k);
    const content = line.slice(k);
    if (content.startsWith("#")) continue;
    const code = commentCut(content);
    let startName: string | null = null;
    let rest = "";
    if (indent === "") {
      let e = 0;
      while (e < code.length && !isSep(code[e])) e++;
      let word = code.slice(0, e);
      rest = code.slice(e);
      if (word.endsWith(":") && NAME.test(word.slice(0, -1))) word = word.slice(0, -1);
      if (NAME.test(word) && word !== "CITED") startName = word;
    }
    if (startName !== null) {
      if (found) break;
      current = startName;
      if (current === name) {
        found = true;
        pieces = [attrCut(rest)];
      }
    } else if (current !== null && found) {
      pieces.push(attrCut(" " + code));
    }
  }
  if (!found) return null;
  return pieces.filter((p) => p !== "").join(" ");
}
