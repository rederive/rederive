// cmp_ver input generator (round 2: the strict-version kernel). Curated prefix first — the first 24 become the frozen
// slice, so it opens with the gate cases, padding, huge segments and one probe per throw class — then seeded fill
// that is mostly VALID versions (in-domain), with a minority of malformed ones.
const BIG = '123456789012345678901234567890';
const CURATED = [
  ['0.5', '0.4'], ['0.4', '0.5'], ['0.4', '0.4'],
  ['0.5', '0.5.0'], ['1', '1.0.0.0'], ['0.4', '0.4.0.0.0.1'],     // padding
  ['0.10', '0.9'], ['10', '9'], ['2', '10'],                        // integer, not lexical/decimal
  ['9007199254740993', '9007199254740992'],                         // beyond f64: exact
  [BIG + '1', BIG + '0'], ['0.' + BIG, '0.' + BIG],                 // huge segments
  ['1' + '0'.repeat(400), '9'.repeat(400)],
  // one probe per throw class
  ['', '0.4'],            // empty
  ['0.05', '0.5'],        // leading zero
  ['0.5-rc1', '0.4'],     // suffix
  ['v1.0', '0.4'],        // prefix
  ['-1', '0'],            // sign
  [' 0.5', '0.5'],        // whitespace
  ['0.5', '0.4\n'],       // trailing newline, b side
  ['0..5', '0'],          // empty segment
  ['0.4.', '0.4'],        // trailing dot
  ['٥', '5'],        // non-ASCII digit
  ['1e3', '1000'],        // exponent spelling
  // more throw spellings (held-out)
  ['.5', '0'], ['+5', '5'], ['0x10', '16'], ['00', '0'], ['01', '1'], ['0.5', ''], ['NaN', '0'], ['Infinity', '1'],
  ['1.5.', '1'], ['.', '0'], ['5 ', '5'], ['﻿5', '5'], [' 5', '5'], ['５', '5'], ['1_0', '10'],
  ['0.5\n', '0.5'], ['\n0.5', '0.5'], ['0.4', 'x'], ['a', 'b'], ['1,0', '1'], ['0b1', '1'], ['-0', '0'],
  // more valid shapes (held-out)
  ['0', '0'], ['0', '0.0.0'], ['0.0.1', '0'], ['1.2.3', '1.2.3'], ['1.2.3', '1.2.4'], ['1.2.10', '1.2.9'],
  ['3', '2.99'], ['18446744073709551616', '18446744073709551615'], ['9223372036854775808', '9223372036854775807'],
  ['0.' + '9'.repeat(25), '0.' + '1' + '0'.repeat(25)], ['1.0.0.0.0.0.0.0.0.0.0.1', '1'],
];
const seg = (rnd) => {
  const r = rnd();
  if (r < 0.15) return '0';
  if (r < 0.85) return String(1 + Math.floor(rnd() * 12));
  const L = 2 + Math.floor(rnd() * 30); let s = String(1 + Math.floor(rnd() * 9));
  for (let i = 1; i < L; i++) s += Math.floor(rnd() * 10); return s;
};
const ver = (rnd) => Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => seg(rnd)).join('.');
const BAD = ['', '0.05', '0.5-rc1', 'v1', '-1', ' 1', '1 ', '1..2', '1.', '.1', '01', '1e3', '١'];
export function genInputs(n, rnd) {
  const out = CURATED.map((a) => a.slice());
  while (out.length < n) {
    const a = ver(rnd);
    const r = rnd();
    const b = r < 0.2 ? a : r < 0.35 ? a + '.0'.repeat(1 + Math.floor(rnd() * 3)) : ver(rnd);
    if (rnd() < 0.1) out.push(rnd() < 0.5 ? [BAD[Math.floor(rnd() * BAD.length)], b] : [a, BAD[Math.floor(rnd() * BAD.length)]]);
    else out.push(rnd() < 0.5 ? [a, b] : [b, a]);
  }
  return out;
}
