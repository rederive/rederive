// carried_canonical input generator (round 2, authority b15b56613f9d): curated coverage prefix, then seeded fill. Maps at
// EVERY depth are built in a shuffled insertion order (the unit sorts every level itself); index-like keys, codec-marker
// keys and "__proto__" are ordinary keys. One probe per throw class; the random fill stays inside the domain.
const own = (pairs) => { const o = {}; for (const [k, v] of pairs) Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true }); return o; };
const KEYS = ['a', 'b', 'B', 'Z', 'zz', 'red', 'green', 'blue', 'aliceblue', '', ' ', '/', '"', '\\', '\n', '\t', '\u0001', '\u001f',
  '\u007f', ' ', 'é', '가', '！', '', '\u{1F600}', '\u{1D49C}', '0', '1', '2', '9', '10', '100', '01', '-1', '1.5',
  '1e3', '4294967294', '4294967295', '9007199254740993', 'a1', '_', '~', '__proto__', '__t', '__throw', 'constructor', 'toString'];
const NUMS = [0, 1, -1, 255, 128, 0.5, 0.1, -2.5, 1 / 3, 100, 1e20, 1e21, 123456789012345680000, 1.5e300, 1e-6, 1e-7, 1.23e-18,
  5e-324, 1.7976931348623157e308, 9007199254740993, -1e21, 4294967295];
const STRS = ['', 'x', 'hello world', 'quote"in', 'back\\slash', 'nl\nand\ttab', '\b\f\r', '\u0000\u001f', '\u007f', '  ',
  'slash/ok', 'é', '\u{1F600}', '<>&\''];
export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const shuffled = (o) => { const ks = Object.keys(o); for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]]; } return own(ks.map((k) => [k, o[k]])); };
  const mapOf = (m, d) => { const pairs = []; for (let i = 0; i < m; i++) pairs.push([pick(KEYS), val(d)]); return shuffled(own(pairs)); };
  const val = (d) => {
    const r = rnd();
    if (d <= 0 || r < 0.35) { const x = pick(NUMS) * (rnd() < 0.2 ? -1 : 1); return x === 0 ? 0 : x; }   // never -0 in the fill
    if (r < 0.55) return pick(STRS);
    if (r < 0.62) return rnd() < 0.5;
    if (r < 0.66) return null;
    if (r < 0.83) return Array.from({ length: Math.floor(rnd() * 4) }, () => val(d - 1));
    return mapOf(1 + Math.floor(rnd() * 4), d - 1);
  };
  const hole = [1, 2, 3]; delete hole[1];
  const curated = [
    [{}],
    [{ red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], aliceblue: [240, 248, 255] }],   // the typical carried table
    [{ b: 1, a: 2, c: 3 }],
    [{ B: 1, a: 2, Z: 3, _: 4, '~': 5 }],
    [{ 10: 'ten', 9: 'nine', 2: 'two', a: 'a', 0: 'zero', 100: 'h' }],                            // index-like keys sort as text
    [{ '01': 1, 1: 2, '-1': 3, '1.5': 4, '1e3': 5, 'a1': 6, '4294967295': 7, '4294967294': 8 }],
    [{ '！': 'fullwidth', '\u{1F600}': 'astral', '': 'private', 'é': 'e-acute', '가': 'hangul' }],   // code units vs code points
    [{ '': 'empty key', ' ': 'space', '"': 'quote', '\\': 'backslash', '/': 'solidus' }],
    [{ '\n': 1, '\t': 2, '\u0001': 3, '\u001f': 4, '\u007f': 5, ' ': 6, A: 7 }],              // escaped keys sort on raw units
    [{ s: 'nl\nand\ttab', c: '\b\f\r', z: '\u0000\u001f', d: '\u007f', l: '  ', q: 'quote"in\\', u: 'é\u{1F600}/' }],
    [{ n: [0, 1, -1, 0.5, 0.1, 1 / 3, 100, 1e20, 1e21, 123456789012345680000, 1e-6, 1e-7, 1.23e-18, 5e-324, 1.7976931348623157e308, -1e21, 9007199254740993, 2 ** 53] }],
    [{ big: 1e21, small: 1e-7, edge6: 0.000001, edge20: 100000000000000000000, neg: -0.000001234 }],
    [{ t: true, f: false, z: null, e: [], m: {} }],
    [{ outer: { z: 1, b: 2, 10: 3, 9: 4, '\u{1F600}': 5, '！': 6 }, list: [{ y: 1, x: 2 }, [{ a: 'b', 1: 'a' }]] }],   // nested, unsorted insertion
    [{ deep: { z: { y: { c: [1, [2, [3, { e: 'end', d: 'd' }]]], b: 0 } }, a: 1 } }],
    [own([['__proto__', { b: 1, a: 2 }], ['z', 1], ['__t', 'num'], ['__throw', 'x']])],              // reserved-looking keys are ordinary
    [{ constructor: 1, toString: 'x', hasOwnProperty: true }],
    // throw classes inside the abstract SIG (graded in every language that can carry them)
    [{ a: 1, nan: NaN }],
    [{ inf: Infinity }],
    [{ ninf: [1, -Infinity] }],
    [{ m: { negzero: -0 } }],
    [{ deep: [{ x: [0, -0] }] }],
    // OUT-OF-DOMAIN probes (js widening; the neutral encoder routes them to the js-only extension)
    [null],                                        // non-map table
    [undefined],
    ['ab'],
    [7],
    [[1, 'x']],                                    // a list is not a map
    [new Map([['a', 1]])],
    [{ a: undefined, b: 1 }],                      // undefined value
    [{ l: [undefined, 1] }],
    [{ h: hole }],                                 // array hole
    [{ big: 10n }],                                // bigint
    [{ boxed: new Number(1) }],                    // boxed wrapper
    [{ re: /x/g }],
    [{ set: new Set([1]) }],
    [{ bytes: new Uint8Array([1, 2]) }],
    [{ '\ud800': 'lone \udc00 surrogates', b: 1 }], // lone surrogates escape as lowercase \\uXXXX (no throw)
  ];
  const out = curated.slice(0, n);
  while (out.length < n) out.push([mapOf(Math.floor(rnd() * 7), rnd() < 0.5 ? 1 : 3)]);
  return out;
}
