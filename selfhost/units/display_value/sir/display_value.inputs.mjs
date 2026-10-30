// display_value input generator: genInputs(n, rnd) -> list of [tv] argument lists.
// Curated coverage prefix first (the first 24 become the frozen slice), then seeded random trees.
// Domain: tv is json. Leaf fields (v of text/bool/f64/i64/u64/bytes/bigint, msg of throw) hold text, bool, none or are absent;
// record field names are text. Numbers appear only where the code never prints them (as a node, as a t).
const T = (v) => ({ t: 'text', v, cu: 'utf8' });
const F = (v, bits) => ({ t: 'f64', v, bits });
const I = (v) => ({ t: 'i64', v });
const U = (v) => ({ t: 'u64', v });
const L = (...v) => ({ t: 'list', v });
const TU = (...v) => ({ t: 'tuple', v });
const M = (...v) => ({ t: 'map', v });
const R = (...v) => ({ t: 'record', v });
const NONE = { t: 'none' };
const ESC = 'q"b\\s/n\nr\rt\tb\bf\fz\u0000o\u001fd\u007fls ps  é😀';

function deep(k) { let x = I('7'); for (let i = 0; i < k; i++) x = L(x); return x; }

const CURATED = [
  // ---- frozen slice (first 24): every node kind well-formed, the joiners, escaping, the fallbacks, one throw
  [T('hello')],
  [T(ESC)],
  [T('')],
  [F('1.5', '3ff8000000000000')],
  [F('NaN', '7ff8000000000000')],
  [I('-9223372036854775808')],
  [U('18446744073709551615')],
  [{ t: 'bool', v: true }],
  [{ t: 'bool', v: false }],
  [NONE],
  [{ t: 'undefined' }],
  [{ t: 'bytes', v: 'base64:AQID' }],
  [{ t: 'throw', msg: 'boom "x"\n' }],
  [{ t: 'throw' }],
  [L(I('1'), T('a,b'), NONE)],
  [TU(F('-0', '8000000000000000'), { t: 'bool', v: true })],
  [M([T('k'), I('1')], [T('a b'), L()])],
  [M([T('z'), I('1')], [T('a'), I('2')])],
  [R(['name', T('x')], ['a:1, b', I('2')], ['', L()], ['A_9', I('3')])],
  [R()],
  [{ t: 'bigint', v: '12' }],
  [{ t: 'zzz', v: 'x' }],
  [L({ t: 'text' }, { t: 'f64', v: null })],
  [null],
  // ---- held-out curated: malformed nodes, absent fields, every throw path, depth, collisions
  [{ t: 'text' }],
  [{ t: 'text', v: null }],
  [{ t: 'text', v: true }],
  [{ t: 'f64' }],
  [{ t: 'i64', v: null }],
  [R(['a', { t: 'text' }], ['b', { t: 'i64', v: null }], ['c', { t: 'bool' }])],
  [M([{ t: 'text' }, { t: 'f64', v: null }])],
  [TU({ t: 'bytes' }, { t: 'u64' }, { t: 'i64', v: '' })],
  [{ t: 'bool', v: 'yes' }],
  [{ t: 'bool' }],
  [{ t: 'bool', v: null }],
  [{ t: 'throw', msg: null }],
  [{ t: 'throw', msg: false }],
  [{ t: 'throw', msg: '' }],
  [{ t: 'text', v: 'x', cu: 'utf16', extra: [1, 2] }],
  [{ t: 'TEXT', v: 'x' }],
  [{ t: ['list'], v: [] }],
  [{}],
  ['list'],
  [42],
  [[{ t: 'none' }]],
  [L('x', 3, false, [], {})],
  [R(['a', NONE, 'ignored', 9])],
  [M([T('k'), NONE, 'ignored'])],
  [R('ab')],
  [M('x😀')],
  [R(['a'])],
  [R({})],
  [R(null)],
  [L(null)],
  [{ t: 'list' }],
  [{ t: 'map', v: { a: 1 } }],
  [{ t: 'record', v: NONE }],
  [R(['a:1, b', I('2')])],
  [R([' {x}"\\\n', T('"')])],
  [M([I('1'), F('1', '3ff0000000000000')], [U('1'), { t: 'bytes', v: '1' }])],
  [deep(40)],
  [R(['r', R(['m', M([T('k'), L(TU(T('deep'), { t: 'undefined' }))])])])],
  [T('lone \ud800 x \udfff')],
  // round 5 (#95): FIELDNAME identifier test and the bigint row
  [R(['_', I('1')], ['a', I('2')], ['Z9_z', I('3')], ['1a', I('4')], ['a b', I('5')], ['a-b', I('6')], ['é', I('7')], ['a\n', I('8')], ['\na', I('9')], ['x"y\\', I('10')], ['日本', I('11')], ['a\u0000', I('12')], ['😀', I('13')], ['$a', I('14')], ['a.b', I('15')])],
  [R(':x', '1x', '_z', 'é1', 'ab', '😀x', '"q')],
  [{ t: 'bigint' }],
  [{ t: 'bigint', v: null }],
  [L({ t: 'bigint', v: true }, { t: 'bigint', v: false }, { t: 'bigint', v: '' }, { t: 'bigint', v: '-123456789012345678901234567890' }, { t: 'bigint' }, { t: 'bigint', v: null })],
  [M([{ t: 'bigint', v: '7' }, { t: 'bigint' }])],
  [R(['big', { t: 'bigint', v: '9' }], ['x y', { t: 'bigint', v: null }])],
];

const ALPHA = ['a', 'b', 'Z', '0', ' ', ',', ':', '{', '}', '[', ']', '"', '\\', '/', '\n', '\t', '\r', '\b', '\f', '\u0000', '\u0001', '\u001f', '\u007f', '\u0085', ' ', ' ', 'é', '日', '😀'];

export function genInputs(n, rnd) {
  const out = CURATED.map((a) => a);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const txt = () => { let s = ''; const k = Math.floor(rnd() * 6); for (let i = 0; i < k; i++) s += pick(ALPHA); return s; };
  const leafField = (bool) => { const r = rnd(); return r < 0.8 ? { has: true, v: r < 0.6 ? txt() : pick(['1', '-0', 'NaN', '1e+21', '255', '']) } : r < 0.9 ? { has: true, v: null } : r < 0.95 && bool ? { has: true, v: rnd() < 0.5 } : { has: false }; };
  const withV = (t, f) => (f.has ? { t, v: f.v } : { t });
  const IDCH = ['a', 'Z', '_', '0', '9', 'q'];
  const fname = () => { const r = rnd(); if (r < 0.4) { let s = pick(['a', 'Z', '_', 'x']); const k = Math.floor(rnd() * 4); for (let i = 0; i < k; i++) s += pick(IDCH); return s; } if (r < 0.6) { let s = pick(['a', '_', '1', '']); const k = Math.floor(rnd() * 3); for (let i = 0; i < k; i++) s += pick(IDCH); return s + (rnd() < 0.5 ? pick(ALPHA) : ''); } return txt(); };
  const node = (d) => {
    const r = rnd();
    if (d <= 0 || r < 0.45) {
      const k = pick(['text', 'f64', 'i64', 'u64', 'bool', 'none', 'undefined', 'bytes', 'throw', 'unknown', 'text', 'i64', 'bigint']);
      if (k === 'none' || k === 'undefined') return { t: k };
      if (k === 'unknown') return pick([{ t: 'Text', v: 'x' }, 'stray', { v: 'no tag' }, { t: 'BigInt', v: '1' }]);
      if (k === 'bigint') { const q = rnd(); return q < 0.7 ? { t: 'bigint', v: pick(['0', '-1', '12', '18446744073709551616', '']) } : q < 0.8 ? { t: 'bigint' } : q < 0.9 ? { t: 'bigint', v: null } : { t: 'bigint', v: rnd() < 0.5 }; }
      if (k === 'bool') { const q = rnd(); return q < 0.8 ? { t: 'bool', v: q < 0.4 } : withV('bool', leafField(true)); }
      if (k === 'throw') { const q = rnd(); return q < 0.7 ? { t: 'throw', msg: txt() } : q < 0.85 ? { t: 'throw' } : { t: 'throw', msg: null }; }
      if (k === 'text') { const q = rnd(); return q < 0.85 ? T(txt()) : q < 0.92 ? { t: 'text', v: null } : { t: 'text', v: rnd() < 0.5 }; }
      return withV(k, rnd() < 0.85 ? { has: true, v: k === 'bytes' ? 'base64:' + pick(['', 'AQ==', 'AAEC', 'zz']) : pick(['0', '1', '-1', '42', '1.5', '-0', 'NaN', 'Infinity', '9007199254740993']) } : leafField());
    }
    const w = Math.floor(rnd() * 4);
    const kids = () => Array.from({ length: w }, () => node(d - 1));
    const c = pick(['list', 'tuple', 'map', 'record']);
    if (c === 'list' || c === 'tuple') return { t: c, v: kids() };
    if (c === 'map') return { t: 'map', v: Array.from({ length: w }, () => [rnd() < 0.85 ? T(txt()) : node(d - 1), node(d - 1)]) };
    return { t: 'record', v: Array.from({ length: w }, () => [fname(), node(d - 1)]) };
  };
  while (out.length < n) out.push([node(1 + Math.floor(rnd() * 4))]);
  return out;
}
