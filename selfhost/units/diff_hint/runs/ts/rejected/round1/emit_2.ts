const INVISIBLE = /^[\u000a-\u000d\u007f- ­͏؀-؅؜۝܏࢐࢑࣢ᅟᅠ ᠋-᠎ -‏ -  -⁤⁦-⁯⠀　ㅤ︀-️﻿ﾠ￹-￻\u{110bd}\u{110cd}\u{13430}-\u{1343f}\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0001}\u{e0020}-\u{e007f}\u{e0100}-\u{e01ef}]$/u;
const ELLIPSIS = "…";
const WIDTH = 80;

function hex(n: number, w: number): string {
  return n.toString(16).padStart(w, "0");
}

function esc(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x22) return '\\"';
  if (cp === 0x5c) return "\\\\";
  if (cp === 0x08) return "\\b";
  if (cp === 0x09) return "\\t";
  if (cp === 0x0c) return "\\f";
  if (cp === 0x0d) return "\\r";
  if (cp <= 0x1f) return "\\u" + hex(cp, 4);
  if (INVISIBLE.test(ch)) {
    return cp > 0xffff ? "\\u{" + hex(cp, 1) + "}" : "\\u" + hex(cp, 4);
  }
  return ch;
}

function win(s: string[], c: number): string {
  const end = Math.min(c + WIDTH, s.length);
  let out = '"';
  if (c > 0) out += ELLIPSIS;
  for (let i = c; i < end; i++) out += esc(s[i] ?? "");
  if (c + WIDTH < s.length) out += ELLIPSIS;
  return out + '"';
}

export function diff_hint(existing: string, profile: string): string {
  const a = existing.split("\n");
  const b = profile.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const la = i < a.length ? a[i] : undefined;
    const lb = i < b.length ? b[i] : undefined;
    if (la === undefined && lb !== undefined) {
      return "line " + (i + 1) + ": existing has no line " + (i + 1) + ", profile has " + win(Array.from(lb), 0);
    }
    if (lb === undefined && la !== undefined) {
      return "line " + (i + 1) + ": profile has no line " + (i + 1) + ", existing has " + win(Array.from(la), 0);
    }
    if (la !== undefined && lb !== undefined && la !== lb) {
      const x = Array.from(la);
      const y = Array.from(lb);
      let c = 0;
      while (c < x.length && c < y.length && x[c] === y[c]) c++;
      return "line " + (i + 1) + ", col " + (c + 1) + ": existing " + win(x, c) + " vs profile " + win(y, c);
    }
  }
  return "binary difference (the texts decode to the same UTF-8)";
}
