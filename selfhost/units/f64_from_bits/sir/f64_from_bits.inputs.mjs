// f64_from_bits input generator (round 2, strict decoder): curated prefix interleaving IEEE-754 landmarks with one probe per
// throw class, then a seeded fill of well-formed 16-lowercase-hex patterns stratified by exponent region.
const HEX = '0123456789abcdef';
const WELL = [
  '0000000000000000', '8000000000000000', '3ff0000000000000', 'bff0000000000000', '400921fb54442d18',
  '0000000000000001', '000fffffffffffff', '0010000000000000', '7fefffffffffffff', 'ffefffffffffffff',
  '7ff0000000000000', 'fff0000000000000', '7ff8000000000000', 'fff8000000000000', '7ff0000000000001',
  '7ff4000000000000', 'ffffffffffffffff', '3fb999999999999a', '4330000000000000', '43e0000000000000',
];
const THROWS = [
  '',                                  // empty
  '3ff000000000000',                   // 15 digits (short)
  '03ff0000000000000',                 // 17 digits (long)
  '3FF0000000000000',                  // uppercase
  '3ff0000000000000\n',                // trailing line feed (end-of-text anchor is strict)
  ' 3ff0000000000000',                 // leading whitespace
  '3ff0000000000000 ',                 // trailing whitespace
  '0x3ff00000000000',                  // prefix, 16 chars total
  '3ff000000000000g',                  // non-hex letter, 16 chars
  '-3ff000000000000',                  // sign, 16 chars
  '3ff00000000000００',        // fullwidth digits, 16 chars
  '3ff0 00000000000',                  // interior space, 16 chars
];
const CURATED = [];
for (let i = 0; i < Math.max(WELL.length, THROWS.length); i++) { if (i < WELL.length) CURATED.push(WELL[i]); if (i < THROWS.length) CURATED.push(THROWS[i]); }

export function genInputs(n, rnd) {
  const out = CURATED.map((s) => [s]);
  const pick = (s) => s[Math.floor(rnd() * s.length)];
  const hex = (k) => { let s = ''; for (let i = 0; i < k; i++) s += pick(HEX); return s; };
  while (out.length < n) {
    const r = rnd();
    const s = r < 0.6 ? hex(16)                                                   // arbitrary pattern
      : r < 0.8 ? pick(['7ff', 'fff']) + hex(13)                                  // all-exponent: NaN / infinity
      : pick(['000', '800']) + hex(13);                                           // zero exponent: subnormal / zero
    out.push([s]);
  }
  return out;
}
