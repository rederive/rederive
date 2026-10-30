const INVISIBLE = /^[\u000a-\u000d\u007f- ­͏؀-؅؜۝܏࢐࢑࣢ᅟᅠ ᠋-᠎ -‏ -  -⁤⁦-⁯⠀　ㅤ︀-️﻿ﾠ￹-￻\u{110bd}\u{110cd}\u{13430}-\u{1343f}\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0001}\u{e0020}-\u{e007f}\u{e0100}-\u{e01ef}]$/u;

const WIDTH = 80;

function hex4(n: number): string {
  return n.toString(16).padStart(4, "0");
}

function escapeCp(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x22) return '\\"';
  if (cp === 0x5c) return "\\\\";
  if (cp === 0x08) return "\\b";
  if (cp === 0x09) return "\\t";
  if (cp === 0x0c) return "\\f";
  if (cp === 0x0d) return "\\r";
  if (cp <= 0x1f) return "\\u" + hex4(cp);
  if (INVISIBLE.test(ch)) {
    if (cp > 0xffff) return "\\u{" + cp.toString(16) + "}";
    return "\\u" + hex4(cp);
  }
  return ch;
}

function windowOf(s: string[], c: number): string {
  const end = Math.min(c + WIDTH, s.length);
  let out = '"';
  if (c > 0) out += "…";
  for (let i = c; i < end; i++) {
    const ch = s[i];
    if (ch !== undefined) out += escapeCp(ch);
  }
  if (c + WIDTH < s.length) out += "…";
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
      return "line " + (i + 1) + ": existing has no line " + (i + 1) + ", profile has " + windowOf(Array.from(lb), 0);
    }
    if (lb === undefined && la !== undefined) {
      return "line " + (i + 1) + ": profile has no line " + (i + 1) + ", existing has " + windowOf(Array.from(la), 0);
    }
    if (la === undefined || lb === undefined) continue;
    if (la === lb) continue;
    const pa = Array.from(la);
    const pb = Array.from(lb);
    let c = 0;
    const m = Math.min(pa.length, pb.length);
    while (c < m && pa[c] === pb[c]) c++;
    return "line " + (i + 1) + ", col " + (c + 1) + ": existing " + windowOf(pa, c) + " vs profile " + windowOf(pb, c);
  }
  return "binary difference (the texts decode to the same UTF-8)";
}
