// genInputs(n, rnd) for f64_canonical_bits(raw: text) -> text. Curated prefix first (round-robin over NaN / non-NaN /
// malformed so both the frozen head and the held-out tail carry every class), then a seeded fill.
const NAN = [
  'fff8000000000000',   // canonical quiet NaN with the sign bit set
  '7ff0000000000001',   // signalling NaN, lowest payload bit
  '7fffffffffffffff',   // all-ones payload
  'ffffffffffffffff',   // all-ones payload + sign
  'fff0000000000001',   // signalling, sign set
  '7ff8000000000001',   // quiet + payload
  '7ff4000000000000',   // signalling, top payload bit below the quiet bit
  'fff8000000000001',
  '7ff0000080000000',   // single bit 31
  '7ff0000100000000',   // single bit 32 (above a 32-bit word)
  '7ff7ffffffffffff',   // largest signalling payload
  'fffc000000000000',
  '7ff8000000000000',   // already canonical: output equals input
  '7ff0000000000400',
  'fff4000000000001',
];
const FINITE = [
  '0000000000000000', '8000000000000000',   // +0, -0 (distinct)
  '7ff0000000000000', 'fff0000000000000',   // +Inf, -Inf (exponent all ones, mantissa 0: NOT NaN)
  '0000000000000001', '8000000000000001',   // smallest subnormals
  '000fffffffffffff', '800fffffffffffff',   // largest subnormals
  '0010000000000000',                       // smallest normal
  '7fefffffffffffff', 'ffefffffffffffff',   // largest finite (boundary below the NaN/Inf exponent)
  '3ff0000000000000', 'bff0000000000000', '400921fb54442d18', '3fb999999999999a',
];
const BAD = [
  '',                        // empty
  '7FF8000000000000',        // uppercase
  '7ff800000000000',         // 15 digits
  '7ff80000000000000',       // 17 digits
  '7ff8000000000000\n',      // 16 digits + trailing newline (a dialect whose $ matches before a final newline accepts it)
  '+fffffffffffffff',        // 16 chars with a sign (a radix parser that accepts '+' would read it)
  '0x7ff8000000000000',      // prefixed
  '0x7ff80000000000',        // prefixed, 16 chars total
  ' 7ff800000000000',        // leading space, 16 chars
  '7ff8000000000000 ',       // trailing space
  '7ff800000000000g',        // non-hex letter
  '0000_00000000000',        // digit separator, 16 chars
  '-000000000000000',        // minus, 16 chars
  '７ff8000000000000',        // fullwidth digit
  '00000000000000é',         // 15 chars, 16 UTF-8 bytes
  '00000000000000000000',    // 20 digits (would wrap mod 2^64)
  '7fF8000000000000',        // mixed case
];
const HEX = '0123456789abcdef';
export function genInputs(n, rnd) {
  const out = []; const seen = new Set();
  const push = (s) => { if (!seen.has(s)) { seen.add(s); out.push([s]); } };
  const pattern = [NAN, FINITE, NAN, BAD]; const idx = [0, 0, 0, 0]; const lists = [NAN, FINITE, BAD];
  for (let k = 0, left = true; left; k++) {
    left = false; const L = pattern[k % 4]; const i = lists.indexOf(L);
    if (idx[i] < L.length) push(L[idx[i]++]);
    left = lists.some((l, j) => idx[j] < l.length);
  }
  const digit = () => HEX[Math.floor(rnd() * 16)];
  const rand64 = () => Array.from({ length: 16 }, digit).join('');
  const withTop = (top3, rest13) => top3 + rest13;
  let guard = 0;
  while (out.length < n && guard++ < n * 100) {
    const r = rnd();
    if (r < 0.35) {                      // random NaN: either sign, exponent all ones, nonzero mantissa
      const sign = rnd() < 0.5 ? '7ff' : 'fff';
      let m = Array.from({ length: 13 }, digit).join('');
      if (/^0+$/.test(m)) m = '0000000000001';
      push(withTop(sign, m));
    } else if (r < 0.45) {               // random single-bit NaN payload (bit 0..51), either sign
      const b = Math.floor(rnd() * 52); const m = (1n << BigInt(b)).toString(16).padStart(13, '0');
      push((rnd() < 0.5 ? '7ff' : 'fff') + m);
    } else if (r < 0.75) {               // random 64-bit pattern (almost always finite)
      push(rand64());
    } else if (r < 0.88) {               // subnormal, either sign
      push((rnd() < 0.5 ? '000' : '800') + Array.from({ length: 13 }, digit).join(''));
    } else {                             // malformed mutation of a valid pattern
      const s = rand64(); const m = Math.floor(rnd() * 4); const p = Math.floor(rnd() * 16);
      if (m === 0) push(s.slice(0, p) + s.slice(p + 1));
      else if (m === 1) push(s + digit());
      else if (m === 2) push(s.slice(0, p) + 'ABCDEFGXZ'[Math.floor(rnd() * 9)] + s.slice(p + 1));
      else push(s.toUpperCase().replace(/^[0-9]*$/, 'F' + s.slice(1)));
    }
  }
  return out.slice(0, Math.max(n, out.length));
}
