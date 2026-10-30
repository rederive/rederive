const INVISIBLE = new RegExp(
  "^[\\u000a-\\u000d\\u007f-\\u00a0\\u00ad\\u034f\\u0600-\\u0605\\u061c\\u06dd\\u070f\\u0890\\u0891\\u08e2\\u115f\\u1160\\u1680\\u180b-\\u180e\\u2000-\\u200f\\u2028-\\u202f\\u205f-\\u2064\\u2066-\\u206f\\u2800\\u3000\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0\\ufff9-\\ufffb\\u{110bd}\\u{110cd}\\u{13430}-\\u{1343f}\\u{1bca0}-\\u{1bca3}\\u{1d173}-\\u{1d17a}\\u{e0001}\\u{e0020}-\\u{e007f}\\u{e0100}-\\u{e01ef}]$",
  "u",
);

const WIDTH = 80;

function hex(n: number, pad: number): string {
  return n.toString(16).padStart(pad, "0");
}

function esc(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x22) return '\\"';
  if (cp === 0x5c) return "\\\\";
  if (cp === 8) return "\\b";
  if (cp === 9) return "\\t";
  if (cp === 12) return "\\f";
  if (cp === 13) return "\\r";
  if (cp < 0x20) return "\\u" + hex(cp, 4);
  if (INVISIBLE.test(ch)) {
    return cp > 0xffff ? "\\u{" + hex(cp, 1) + "}" : "\\u" + hex(cp, 4);
  }
  return ch;
}

function windowOf(s: string[], c: number): string {
  const L = s.length;
  const end = Math.min(c + WIDTH, L);
  let out = '"';
  if (c > 0) out += "…";
  for (let i = c; i < end; i++) {
    const ch = s[i];
    if (ch !== undefined) out += esc(ch);
  }
  if (c + WIDTH < L) out += "…";
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
    const ca = Array.from(la);
    const cb = Array.from(lb);
    let c = 0;
    const m = Math.min(ca.length, cb.length);
    while (c < m && ca[c] === cb[c]) c++;
    return "line " + (i + 1) + ", col " + (c + 1) + ": existing " + windowOf(ca, c) + " vs profile " + windowOf(cb, c);
  }
  return "binary difference (the texts decode to the same UTF-8)";
}
