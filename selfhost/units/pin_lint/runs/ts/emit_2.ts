type Hit = { line: number; what: string; text: string };
type Result = { hits: Hit[]; pins: number };

const INV: number[] = [
  0x9, 0xd, 0x20, 0x20, 0x22, 0x22, 0x27, 0x27, 0xa0, 0xa0, 0xad, 0xad, 0x600, 0x605, 0x61c, 0x61c,
  0x6dd, 0x6dd, 0x70f, 0x70f, 0x890, 0x891, 0x8e2, 0x8e2, 0x1680, 0x1680, 0x180e, 0x180e,
  0x2000, 0x200f, 0x2028, 0x202f, 0x205f, 0x2064, 0x2066, 0x206f, 0x3000, 0x3000, 0xfeff, 0xfeff,
  0xfff9, 0xfffb, 0x110bd, 0x110bd, 0x110cd, 0x110cd, 0x13430, 0x1343f, 0x1bca0, 0x1bca3,
  0x1d173, 0x1d17a, 0xe0001, 0xe0001, 0xe0020, 0xe007f,
];

const OPENERS = " \t([{,=:;|<>!&-~";
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const NAMEFORM = /^[A-Z][A-Z0-9-]*:?$/;

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

function trimEndSp(s: string): string {
  let b = s.length;
  while (b > 0 && isSp(s.charAt(b - 1))) b--;
  return s.slice(0, b);
}

function visible(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    let inv = false;
    for (let i = 0; i < INV.length; i += 2) {
      if (cp >= INV[i] && cp <= INV[i + 1]) {
        inv = true;
        break;
      }
    }
    if (!inv) return true;
  }
  return false;
}

function spans(s: string): number[][] {
  const out: number[][] = [];
  let lastClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s.charAt(i) === '"') {
      const opens = i === 0 || OPENERS.includes(s.charAt(i - 1)) || i === lastClose + 1;
      if (opens) {
        let j = i + 1;
        let close = -1;
        while (j < s.length) {
          const c = s.charAt(j);
          if (c === "\\") {
            const cp = s.codePointAt(j + 1);
            if (cp === undefined) {
              j = s.length;
              break;
            }
            j += 1 + (cp > 0xffff ? 2 : 1);
            continue;
          }
          if (c === '"') {
            close = j;
            break;
          }
          j++;
        }
        if (close < 0) break;
        out.push([i, close]);
        lastClose = close;
        i = close + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

function inside(sp: number[][], pos: number): boolean {
  for (const r of sp) if (pos > r[0] && pos <= r[1]) return true;
  return false;
}

function codeOf(content: string): string {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (
      content.charAt(i) === "#" &&
      isSp(content.charAt(i - 1)) &&
      (i + 1 === content.length || isSp(content.charAt(i + 1))) &&
      !inside(sp, i)
    ) {
      return trimEndSp(content.slice(0, i));
    }
  }
  return content;
}

type Attr = { index: number; end: number };

function attrs(piece: string): Attr[] {
  const sp = spans(piece);
  const out: Attr[] = [];
  for (const m of piece.matchAll(ATTR)) {
    const idx = m.index ?? 0;
    const end = idx + m[0].length;
    const start = end - m[1].length;
    if (!inside(sp, start)) out.push({ index: idx, end });
  }
  return out;
}

function values(piece: string): { vals: string[]; pre: string } {
  const a = attrs(piece);
  const vals: string[] = [];
  for (let k = 0; k < a.length; k++) {
    const stop = k + 1 < a.length ? a[k + 1].index : piece.length;
    vals.push(trimSp(piece.slice(a[k].end, stop)));
  }
  const pre = a.length > 0 ? piece.slice(0, a[0].index) : piece;
  return { vals, pre };
}

type Pin = { line: number; text: string; name: string; cited: boolean; earnedText: boolean };

export default function pin_lint(text: string): Result {
  const lines = text.split(/\r\n|\r|\n/);
  const pins: Pin[] = [];
  let cur: Pin | null = null;
  let curDir = false;
  for (let k = 0; k < lines.length; k++) {
    const raw = lines[k];
    let p = 0;
    while (p < raw.length && (isSp(raw.charAt(p)) || raw.charAt(p) === "﻿")) p++;
    const lead = raw.slice(0, p).split("﻿").join("");
    const norm = trimEndSp(lead + raw.slice(p));
    if (norm === "") continue;
    let ind = 0;
    while (ind < norm.length && isSp(norm.charAt(ind))) ind++;
    const content = norm.slice(ind);
    if (content.charAt(0) === "#") continue;
    const code = codeOf(content);
    let isDir = false;
    if (ind === 0) {
      let e = 0;
      while (e < code.length && !isSp(code.charAt(e))) e++;
      const name = code.slice(0, e);
      if (NAMEFORM.test(name) && name !== "CITED" && name !== "CITED:") {
        isDir = true;
        const nm = name.endsWith(":") ? name.slice(0, -1) : name;
        const rest = code.slice(e);
        curDir = nm === "PINNED" || nm === "EARNED";
        if (curDir) {
          const v = values(rest);
          const pin: Pin = {
            line: k + 1,
            text: norm,
            name: nm,
            cited: v.vals.some(visible),
            earnedText: nm === "EARNED" && visible(trimSp(v.pre)),
          };
          pins.push(pin);
          cur = pin;
        } else {
          cur = null;
        }
      }
    }
    if (!isDir && curDir && cur !== null) {
      const v = values(" " + code);
      if (v.vals.some(visible)) cur.cited = true;
      if (cur.name === "EARNED" && visible(v.pre)) cur.earnedText = true;
    }
  }
  const hits: Hit[] = [];
  for (const pin of pins) {
    if (!pin.cited && !pin.earnedText) {
      hits.push({
        line: pin.line,
        what: "pin without a citation",
        text: Array.from(pin.text).slice(0, 96).join(""),
      });
    }
  }
  return { hits, pins: pins.length };
}
