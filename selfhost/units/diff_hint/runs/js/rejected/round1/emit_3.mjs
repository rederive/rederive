const INVISIBLE = /^[\u000a-\u000d\u007f- ­͏؀-؅؜۝܏࢐࢑࣢ᅟᅠ ᠋-᠎ -‏ -  -⁤⁦-⁯⠀　ㅤ︀-️﻿ﾠ￹-￻\u{110bd}\u{110cd}\u{13430}-\u{1343f}\u{1bca0}-\u{1bca3}\u{1d173}-\u{1d17a}\u{e0001}\u{e0020}-\u{e007f}\u{e0100}-\u{e01ef}]$/u;
const WIDTH = 80;
const hex4 = (n) => n.toString(16).padStart(4, '0');

function esc(ch) {
  const n = ch.codePointAt(0);
  if (n === 0x22) return '\\"';
  if (n === 0x5c) return '\\\\';
  if (n === 8) return '\\b';
  if (n === 9) return '\\t';
  if (n === 12) return '\\f';
  if (n === 13) return '\\r';
  if (n < 0x20) return '\\u' + hex4(n);
  if (INVISIBLE.test(ch)) {
    return n > 0xffff ? '\\u{' + n.toString(16) + '}' : '\\u' + hex4(n);
  }
  return ch;
}

function win(cps, c) {
  const L = cps.length;
  const end = Math.min(c + WIDTH, L);
  let s = '"';
  if (c > 0) s += '…';
  for (let i = c; i < end; i++) s += esc(cps[i]);
  if (c + WIDTH < L) s += '…';
  return s + '"';
}

export function diff_hint(existing, profile) {
  const a = existing.split('\n');
  const b = profile.split('\n');
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (i >= a.length) {
      return 'line ' + (i + 1) + ': existing has no line ' + (i + 1) + ', profile has ' + win(Array.from(b[i]), 0);
    }
    if (i >= b.length) {
      return 'line ' + (i + 1) + ': profile has no line ' + (i + 1) + ', existing has ' + win(Array.from(a[i]), 0);
    }
    if (a[i] !== b[i]) {
      const x = Array.from(a[i]);
      const y = Array.from(b[i]);
      let c = 0;
      while (c < x.length && c < y.length && x[c] === y[c]) c++;
      return 'line ' + (i + 1) + ', col ' + (c + 1) + ': existing ' + win(x, c) + ' vs profile ' + win(y, c);
    }
  }
  return 'binary difference (the texts decode to the same UTF-8)';
}

export default diff_hint;
