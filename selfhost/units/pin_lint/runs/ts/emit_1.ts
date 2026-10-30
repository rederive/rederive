type Hit = { line: number; what: string; text: string };

const RANGES: number[][] = [
  [0x9, 0xd], [0x20, 0x20], [0x22, 0x22], [0x27, 0x27], [0xa0, 0xa0], [0xad, 0xad],
  [0x600, 0x605], [0x61c, 0x61c], [0x6dd, 0x6dd], [0x70f, 0x70f], [0x890, 0x891],
  [0x8e2, 0x8e2], [0x1680, 0x1680], [0x180e, 0x180e], [0x2000, 0x200f],
  [0x2028, 0x202f], [0x205f, 0x2064], [0x2066, 0x206f], [0x3000, 0x3000],
  [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0x110bd, 0x110bd], [0x110cd, 0x110cd],
  [0x13430, 0x1343f], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0001, 0xe0001],
  [0xe0020, 0xe007f],
];

const OPENERS = " \t([{,=:;|<>!&-~";
const NAMEFORM = /^[A-Z][A-Z0-9-]*$/;
const ATTRIBUTE = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;

function visible(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    let inv = false;
    for (const r of RANGES) {
      if (cp >= r[0] && cp <= r[1]) {
        inv = true;
        break;
      }
    }
    if (!inv) return true;
  }
  return false;
}

function isSp(c: string): boolean {
  return c === " " || c === "\t";
}

function trimSp(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isSp(s.charAt(a))) a++;
  while (b > a && isSp(s.charAt(b - 1))) b--;
  return s.slice(a, b);
}

function spans(s: string): boolean[] {
  const n = s.length;
  const inside: boolean[] = new Array<boolean>(n).fill(false);
  let prevClose = -2;
  let disabled = false;
  let i = 0;
  while (i < n) {
    if (s.charAt(i) === '"' && !disabled) {
      const opens = i === 0 || OPENERS.includes(s.charAt(i - 1)) || prevClose === i - 1;
      if (opens) {
        let j = i + 1;
        let found = -1;
        while (j < n) {
          const c = s.charAt(j);
          if (c === "\\") {
            const hi = s.charCodeAt(j + 1);
            const lo = s.charCodeAt(j + 2);
            if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) j += 3;
            else j += 2;
          } else if (c === '"') {
            found = j;
            break;
          } else j++;
        }
        if (found < 0) {
          disabled = true;
          i++;
          continue;
        }
        for (let k = i + 1; k <= found; k++) inside[k] = true;
        prevClose = found;
        i = found + 1;
        continue;
      }
    }
    i++;
  }
  return inside;
}

function codeOf(content: string): string {
  const inside = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (
      content.charAt(i) === "#" &&
      isSp(content.charAt(i - 1)) &&
      (i + 1 === content.length || isSp(content.charAt(i + 1))) &&
      !inside[i]
    ) {
      let e = i;
      while (e > 0 && isSp(content.charAt(e - 1))) e--;
      return content.slice(0, e);
    }
  }
  return content;
}

type Attr = { index: number; value: string };

function attrs(piece: string): Attr[] {
  const inside = spans(piece);
  const found: { index: number; end: number }[] = [];
  const re = new RegExp(ATTRIBUTE.source, "g");
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const word = m[1] ?? "";
    const first = m.index + m[0].length - word.length;
    if (!inside[first]) found.push({ index: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
    m = re.exec(piece);
  }
  const out: Attr[] = [];
  for (let k = 0; k < found.length; k++) {
    const cur = found[k];
    if (cur === undefined) continue;
    const nxt = found[k + 1];
    const stop = nxt === undefined ? piece.length : nxt.index;
    out.push({ index: cur.index, value: trimSp(piece.slice(cur.end, stop)) });
  }
  return out;
}

function normalize(raw: string): string {
  let i = 0;
  let lead = "";
  while (i < raw.length) {
    const c = raw.charAt(i);
    if (c === "﻿") i++;
    else if (isSp(c)) {
      lead += c;
      i++;
    } else break;
  }
  let s = lead + raw.slice(i);
  let b = s.length;
  while (b > 0 && isSp(s.charAt(b - 1))) b--;
  s = s.slice(0, b);
  return s;
}

type Pin = { line: number; text: string; earned: boolean; cited: boolean };

export default function pin_lint(text: string): { hits: Hit[]; pins: number } {
  const lines = text.split(/\r\n|\r|\n/);
  const pins: Pin[] = [];
  let cur: Pin | null = null;
  let pinCount = 0;
  for (let k = 0; k < lines.length; k++) {
    const norm = normalize(lines[k] ?? "");
    if (norm === "") continue;
    let a = 0;
    while (a < norm.length && isSp(norm.charAt(a))) a++;
    const indent = a;
    const content = norm.slice(a);
    if (content.charAt(0) === "#") continue;
    const code = codeOf(content);
    let isDirective = false;
    let name = "";
    let rest = "";
    if (indent === 0) {
      let e = 0;
      while (e < code.length && !isSp(code.charAt(e))) e++;
      const nm = code.slice(0, e);
      const base = nm.endsWith(":") ? nm.slice(0, -1) : nm;
      if (NAMEFORM.test(base) && base !== "CITED") {
        isDirective = true;
        name = base;
        rest = code.slice(e);
      }
    }
    if (isDirective) {
      cur = null;
      if (name === "PINNED" || name === "EARNED") {
        pinCount++;
        const at = attrs(rest);
        let cited = false;
        for (const x of at) if (visible(x.value)) cited = true;
        const earned = name === "EARNED";
        if (earned && !cited) {
          const first = at[0];
          const args = trimSp(first === undefined ? rest : rest.slice(0, first.index));
          if (visible(args)) cited = true;
        }
        cur = { line: k + 1, text: norm, earned, cited };
        pins.push(cur);
      }
    } else if (cur !== null) {
      const piece = " " + code;
      const at = attrs(piece);
      for (const x of at) if (visible(x.value)) cur.cited = true;
      if (cur.earned && !cur.cited) {
        const first = at[0];
        const pre = first === undefined ? piece : piece.slice(0, first.index);
        if (visible(pre)) cur.cited = true;
      }
    } else if (!isDirective) {
      // continuation of a non-pin directive or none: ignored
    }
  }
  const hits: Hit[] = [];
  for (const p of pins) {
    if (!p.cited) {
      hits.push({
        line: p.line,
        what: "pin without a citation",
        text: Array.from(p.text).slice(0, 96).join(""),
      });
    }
  }
  return { hits, pins: pinCount };
}
