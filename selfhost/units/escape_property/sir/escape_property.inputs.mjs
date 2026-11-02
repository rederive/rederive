// Input generator for escape_property (pr-review.escapeProperty): genInputs(n, rnd) -> n argument lists.
// Curated prefix first (every escaped character, CRLF, runs, already-escaped text, pass-through punctuation, non-ASCII,
// lone surrogates, then the JS widening: every non-text kind the codec carries, and the throw path), then a seeded fill
// that is mostly text over a special-heavy alphabet with a minority of widened values.
const CURATED = [
  [''], ['plain'],
  ['%'], ['\r'], ['\n'], [':'], [','],
  ['\r\n'], ['::'], ['%25'], ['%3A%2C'],
  ['a:b,c=d'], ['x,title=injected::boom'], ['evil\n::error file=x::pwned'],
  ['caf\u00e9'], ['\ud800'],
  [null], [[1, 2, 3]], [{}], [42], [], [{ toString: 'x:y' }], [new String('boxed:,')], [true],
  ['='], ['src/a.js'], ['C:\\Users\\x\\file.js'],
  ['unit_x: language files left on the old contract'], ['Hidden test v3: answer rewritten'],
  ['line1\r\nline2\r\n'], ['\n\r'], ['%%25'],
  ['\t tab ; semi " quote \' apos `tick` <a> & | $ # @ ! ? * ( ) [ ] { } / \\'],
  ['\u65e5\u672c\u8a9e:\u30c6\u30b9\u30c8'], ['\ud83d\ude00,\ud83d\ude00'],
  ['\udc00'], ['a\ud800:b'], ['\u2028\u2029\u0085'], ['\uff1a\uff0c'], ['\u0000'],
  ['%0D%0A:,\r\n%'],
  [undefined], [false], [0], [-0], [-1.5], [1e21], [0.1], [NaN], [Infinity],
  [12345678901234567890n],
  [[]], [['a:b', 'c']], [[null, undefined, 1]], [[{}]], [{ a: 1 }], [[{ valueOf: 1, toString: 2 }]],
  [new Number(3.5)], [/a,b:c/g], [new Set([1, 2])], [Uint8Array.from([1, 2, 58])], [Buffer.from('a:b,\u00e9')], [-Infinity],
  ['first:', 'second,'],
];
const ALPHA = ['%', '\r', '\n', ':', ',', '=', 'a', 'b', 'Z', '0', '9', ' ', '.', '/', '-', '_', '\\', '"', '\t',
  '\u00e9', '\u65e5', '\ud83d\ude00', 'A', 'F', 'D', '2', '5', '%25', '::', '\r\n'];
const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
const text = (rnd, max) => { let s = ''; const len = Math.floor(rnd() * max); for (let i = 0; i < len; i++) s += pick(rnd, ALPHA); return s; };
function widened(rnd) {
  switch (Math.floor(rnd() * 9)) {
    case 0: return Math.floor(rnd() * 2000) - 1000;
    case 1: return (rnd() - 0.5) * 1e6;
    case 2: return rnd() < 0.5;
    case 3: return null;
    case 4: return [text(rnd, 4), Math.floor(rnd() * 10)];
    case 5: return { k: text(rnd, 3) };
    case 6: return new String(text(rnd, 6));
    case 7: return BigInt(Math.floor(rnd() * 1e9));
    default: return [text(rnd, 3), [text(rnd, 3), null]];
  }
}
export function genInputs(n, rnd) {
  const out = CURATED.map((a) => a.slice());
  while (out.length < n) out.push([rnd() < 0.85 ? text(rnd, 16) : widened(rnd)]);
  return out;
}
