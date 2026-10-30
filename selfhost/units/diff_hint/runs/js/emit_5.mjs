const INVISIBLE = new RegExp("^[\\u000a-\\u000d\\u007f-\\u00a0\\u00ad\\u034f\\u0600-\\u0605\\u061c\\u06dd\\u070f\\u0890\\u0891\\u08e2\\u115f\\u1160\\u1680\\u180b-\\u180e\\u2000-\\u200f\\u2028-\\u202f\\u205f-\\u2064\\u2066-\\u206f\\u2800\\u3000\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0\\ufff9-\\ufffb\\u{110bd}\\u{110cd}\\u{13430}-\\u{1343f}\\u{1bca0}-\\u{1bca3}\\u{1d173}-\\u{1d17a}\\u{e0001}\\u{e0020}-\\u{e007f}\\u{e0100}-\\u{e01ef}]$", "u");
const ELLIPSIS = "…";
const QUOTE = "\"";
const WIDTH = 80;

function hex4(n) {
  return n.toString(16).padStart(4, "0");
}

function esc(ch) {
  const n = ch.codePointAt(0);
  if (n === 0x22) return "\\\"";
  if (n === 0x5c) return "\\\\";
  if (n === 0x08) return "\\b";
  if (n === 0x09) return "\\t";
  if (n === 0x0c) return "\\f";
  if (n === 0x0d) return "\\r";
  if (n <= 0x1f) return "\\u" + hex4(n);
  if (INVISIBLE.test(ch)) {
    if (n <= 0xffff) return "\\u" + hex4(n);
    return "\\u{" + n.toString(16) + "}";
  }
  return ch;
}

function windowOf(cps, c) {
  const L = cps.length;
  const end = Math.min(c + WIDTH, L);
  let out = QUOTE;
  if (c > 0) out += ELLIPSIS;
  for (let i = c; i < end; i++) out += esc(cps[i]);
  if (c + WIDTH < L) out += ELLIPSIS;
  return out + QUOTE;
}

export function diff_hint(existing, profile) {
  const a = existing.split("\n");
  const b = profile.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const num = String(i + 1);
    if (i >= a.length) {
      return "line " + num + ": existing has no line " + num + ", profile has " + windowOf(Array.from(b[i]), 0);
    }
    if (i >= b.length) {
      return "line " + num + ": profile has no line " + num + ", existing has " + windowOf(Array.from(a[i]), 0);
    }
    if (a[i] !== b[i]) {
      const x = Array.from(a[i]);
      const y = Array.from(b[i]);
      let c = 0;
      while (c < x.length && c < y.length && x[c] === y[c]) c++;
      return "line " + num + ", col " + (c + 1) + ": existing " + windowOf(x, c) + " vs profile " + windowOf(y, c);
    }
  }
  return "binary difference (the texts decode to the same UTF-8)";
}
