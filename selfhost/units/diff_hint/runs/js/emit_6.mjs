const RANGES = [
  [0x0a, 0x0d], [0x7f, 0xa0], [0xad, 0xad], [0x34f, 0x34f], [0x600, 0x605], [0x61c, 0x61c],
  [0x6dd, 0x6dd], [0x70f, 0x70f], [0x890, 0x891], [0x8e2, 0x8e2], [0x115f, 0x1160],
  [0x1680, 0x1680], [0x180b, 0x180e], [0x2000, 0x200f], [0x2028, 0x202f], [0x205f, 0x2064],
  [0x2066, 0x206f], [0x2800, 0x2800], [0x3000, 0x3000], [0x3164, 0x3164], [0xfe00, 0xfe0f],
  [0xfeff, 0xfeff], [0xffa0, 0xffa0], [0xfff9, 0xfffb], [0x110bd, 0x110bd], [0x110cd, 0x110cd],
  [0x13430, 0x1343f], [0x1bca0, 0x1bca3], [0x1d173, 0x1d17a], [0xe0001, 0xe0001],
  [0xe0020, 0xe007f], [0xe0100, 0xe01ef],
];

function invisible(cp) {
  for (const [a, b] of RANGES) if (cp >= a && cp <= b) return true;
  return false;
}

function esc(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0x22) return '\\"';
  if (cp === 0x5c) return "\\\\";
  if (cp === 8) return "\\b";
  if (cp === 9) return "\\t";
  if (cp === 12) return "\\f";
  if (cp === 13) return "\\r";
  if (cp <= 0x1f) return "\\u" + cp.toString(16).padStart(4, "0");
  if (invisible(cp)) {
    if (cp > 0xffff) return "\\u{" + cp.toString(16) + "}";
    return "\\u" + cp.toString(16).padStart(4, "0");
  }
  return ch;
}

function win(cps, c) {
  const L = cps.length;
  const end = Math.min(c + 80, L);
  let s = '"';
  if (c > 0) s += "…";
  for (let i = c; i < end; i++) s += esc(cps[i]);
  if (c + 80 < L) s += "…";
  return s + '"';
}

export function diff_hint(existing, profile) {
  const a = existing.split("\n");
  const b = profile.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const k = String(i + 1);
    if (i >= a.length) {
      return "line " + k + ": existing has no line " + k + ", profile has " + win(Array.from(b[i]), 0);
    }
    if (i >= b.length) {
      return "line " + k + ": profile has no line " + k + ", existing has " + win(Array.from(a[i]), 0);
    }
    if (a[i] !== b[i]) {
      const x = Array.from(a[i]);
      const y = Array.from(b[i]);
      let c = 0;
      while (c < x.length && c < y.length && x[c] === y[c]) c++;
      return "line " + k + ", col " + (c + 1) + ": existing " + win(x, c) + " vs profile " + win(y, c);
    }
  }
  return "binary difference (the texts decode to the same UTF-8)";
}
