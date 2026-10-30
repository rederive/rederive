const INVISIBLE = new RegExp(
  "^[\\u000a-\\u000d\\u007f-\\u00a0\\u00ad\\u034f\\u0600-\\u0605\\u061c\\u06dd\\u070f\\u0890\\u0891\\u08e2\\u115f\\u1160\\u1680\\u180b-\\u180e\\u2000-\\u200f\\u2028-\\u202f\\u205f-\\u2064\\u2066-\\u206f\\u2800\\u3000\\u3164\\ufe00-\\ufe0f\\ufeff\\uffa0\\ufff9-\\ufffb\\u{110bd}\\u{110cd}\\u{13430}-\\u{1343f}\\u{1bca0}-\\u{1bca3}\\u{1d173}-\\u{1d17a}\\u{e0001}\\u{e0020}-\\u{e007f}\\u{e0100}-\\u{e01ef}]$",
  "u",
);

const WIDTH = 80;
const ELLIPSIS = "…";
const QUOTE = '"';

function hex(n: number, pad: number): string {
  return n.toString(16).padStart(pad, "0");
}

function escapeCp(ch: string): string {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp === 0x22) return '\\"';
  if (cp === 0x5c) return "\\\\";
  if (cp === 0x08) return "\\b";
  if (cp === 0x09) return "\\t";
  if (cp === 0x0c) return "\\f";
  if (cp === 0x0d) return "\\r";
  if (cp < 0x20) return "\\u" + hex(cp, 4);
  if (INVISIBLE.test(ch)) {
    return cp > 0xffff ? "\\u{" + hex(cp, 1) + "}" : "\\u" + hex(cp, 4);
  }
  return ch;
}

function windowOf(s: string[], c: number): string {
  const L = s.length;
  const end = Math.min(c + WIDTH, L);
  let out = QUOTE;
  if (c > 0) out += ELLIPSIS;
  for (let k = c; k < end; k++) {
    const ch = s[k];
    if (ch !== undefined) out += escapeCp(ch);
  }
  if (c + WIDTH < L) out += ELLIPSIS;
  return out + QUOTE;
}

export function diff_hint(existing: string, profile: string): string {
  const a = existing.split("\n");
  const b = profile.split("\n");
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const la = i < a.length ? a[i] : undefined;
    const lb = i < b.length ? b[i] : undefined;
    const num = String(i + 1);
    if (la === undefined && lb !== undefined) {
      return "line " + num + ": existing has no line " + num + ", profile has " + windowOf(Array.from(lb), 0);
    }
    if (lb === undefined && la !== undefined) {
      return "line " + num + ": profile has no line " + num + ", existing has " + windowOf(Array.from(la), 0);
    }
    if (la === undefined || lb === undefined || la === lb) continue;
    const pa = Array.from(la);
    const pb = Array.from(lb);
    let c = 0;
    while (c < pa.length && c < pb.length && pa[c] === pb[c]) c++;
    return "line " + num + ", col " + String(c + 1) + ": existing " + windowOf(pa, c) + " vs profile " + windowOf(pb, c);
  }
  return "binary difference (the texts decode to the same UTF-8)";
}
