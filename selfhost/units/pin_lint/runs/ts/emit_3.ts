type Hit = { line: number; what: string; text: string };
type Span = { open: number; close: number };
type Attr = { word: string; index: number; wordPos: number; end: number };

const OPENERS = new Set<string>([" ", "\t", "(", "[", "{", ",", "=", ":", ";", "|", "<", ">", "!", "&", "-", "~"]);

const INVIS: number[][] = [
  [0x9, 0xd], [0x20, 0x20], [0x22, 0x22], [0x27, 0x27], [0xa0, 0xa0], [0xad, 0xad],
  [0x600, 0x605], [0x61c, 0x61c], [0x6dd, 0x6dd], [0x70f, 0x70f], [0x890, 0x891], [0x8e2, 0x8e2],
  [0x1680, 0x1680], [0x180e, 0x180e], [0x2000, 0x200f], [0x2028, 0x202f], [0x205f, 0x2064],
  [0x2066, 0x206f], [0x3000, 0x3000], [0xfeff, 0xfeff], [0xfff9, 0xfffb], [0x110bd, 0x110bd],
  [0x110cd, 0x110cd], [0x13430, 0x1343f], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a],
  [0xe0001, 0xe0001], [0xe0020, 0xe007f],
];

function visible(s: string): boolean {
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    let inv = false;
    for (const r of INVIS) {
      if (cp >= r[0] && cp <= r[1]) { inv = true; break; }
    }
    if (!inv) return true;
  }
  return false;
}

function isSP(c: string): boolean {
  return c === " " || c === "\t";
}

function trimSP(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && isSP(s.charAt(a))) a++;
  while (b > a && isSP(s.charAt(b - 1))) b--;
  return s.slice(a, b);
}

function trimEndSP(s: string): string {
  let b = s.length;
  while (b > 0 && isSP(s.charAt(b - 1))) b--;
  return s.slice(0, b);
}

function spans(s: string): Span[] {
  const out: Span[] = [];
  const n = s.length;
  let i = 0;
  let prevClose = -2;
  while (i < n) {
    if (s.charAt(i) === '"' && (i === 0 || OPENERS.has(s.charAt(i - 1)) || i === prevClose + 1)) {
      let j = i + 1;
      let closed = false;
      while (j < n) {
        const c = s.charAt(j);
        if (c === "\\") {
          if (j + 1 < n) {
            const cp = s.codePointAt(j + 1) ?? 0;
            j += 1 + (cp > 0xffff ? 2 : 1);
          } else {
            j = n;
          }
        } else if (c === '"') {
          closed = true;
          break;
        } else {
          j++;
        }
      }
      if (!closed) break;
      out.push({ open: i, close: j });
      prevClose = j;
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

function inside(sp: Span[], pos: number): boolean {
  for (const x of sp) {
    if (pos > x.open && pos <= x.close) return true;
  }
  return false;
}

function codeOf(content: string): string {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (
      content.charAt(i) === "#" &&
      isSP(content.charAt(i - 1)) &&
      (i + 1 >= content.length || isSP(content.charAt(i + 1))) &&
      !inside(sp, i)
    ) {
      return trimEndSP(content.slice(0, i));
    }
  }
  return content;
}

function attrs(piece: string): Attr[] {
  const sp = spans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const out: Attr[] = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const word = m[1];
    const end = m.index + m[0].length;
    const wordPos = end - word.length;
    if (!inside(sp, wordPos)) out.push({ word, index: m.index, wordPos, end });
    m = re.exec(piece);
  }
  return out;
}

function values(piece: string, at: Attr[]): string[] {
  const vs: string[] = [];
  for (let k = 0; k < at.length; k++) {
    const stop = k + 1 < at.length ? at[k + 1].index : piece.length;
    vs.push(trimSP(piece.slice(at[k].end, stop)));
  }
  return vs;
}

function normalize(raw: string): string {
  let i = 0;
  let lead = "";
  while (i < raw.length) {
    const c = raw.charAt(i);
    if (c === "﻿") { i++; continue; }
    if (isSP(c)) { lead += c; i++; continue; }
    break;
  }
  return trimEndSP(lead + raw.slice(i));
}

type Pin = { line: number; text: string; earned: boolean; cited: boolean };

export default function pin_lint(text: string): { hits: { line: number; what: string; text: string }[]; pins: number } {
  const lines = text.split(/\r\n|\r|\n/);
  const nameForm = /^[A-Z][A-Z0-9-]*$/;
  const pins: Pin[] = [];
  let cur: Pin | null = null;
  for (let k = 0; k < lines.length; k++) {
    const line = normalize(lines[k]);
    if (line === "") continue;
    let a = 0;
    while (a < line.length && isSP(line.charAt(a))) a++;
    const indent = line.slice(0, a);
    const content = line.slice(a);
    if (content.charAt(0) === "#") continue;
    const code = codeOf(content);
    let isDir = false;
    let name = "";
    let rest = "";
    if (indent === "") {
      let e = 0;
      while (e < code.length && !isSP(code.charAt(e))) e++;
      let nm = code.slice(0, e);
      if (nm.endsWith(":")) nm = nm.slice(0, -1);
      if (nameForm.test(nm) && nm !== "CITED") {
        isDir = true;
        name = nm;
        rest = code.slice(e);
      }
    }
    if (isDir) {
      cur = null;
      if (name === "PINNED" || name === "EARNED") {
        const at = attrs(rest);
        const earned = name === "EARNED";
        let cited = values(rest, at).some(visible);
        if (!cited && earned) {
          const args = trimSP(at.length > 0 ? rest.slice(0, at[0].index) : rest);
          if (visible(args)) cited = true;
        }
        cur = { line: k + 1, text: line, earned, cited };
        pins.push(cur);
      } else {
        cur = { line: 0, text: "", earned: false, cited: true };
      }
    } else if (cur !== null && cur.line > 0 && !cur.cited) {
      const piece = " " + code;
      const at = attrs(piece);
      if (values(piece, at).some(visible)) {
        cur.cited = true;
      } else if (cur.earned) {
        const pre = trimSP(at.length > 0 ? piece.slice(0, at[0].index) : piece);
        if (visible(pre)) cur.cited = true;
      }
    }
  }
  const hits: Hit[] = [];
  for (const p of pins) {
    if (!p.cited) {
      hits.push({ line: p.line, what: "pin without a citation", text: Array.from(p.text).slice(0, 96).join("") });
    }
  }
  return { hits, pins: pins.length };
}
