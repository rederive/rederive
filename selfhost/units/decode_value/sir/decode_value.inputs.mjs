// decode_value input generator (round 5, rederive@bb8ded84fa50) — one tree per argument list. Curated prefix: every tag, the
// ±2^53 number/big-integer boundary and the i64/u64 range edges, f64 specials from bits, canonical base64, text-keyed maps in
// UTF-16 order, records, js-native tags, result maps carrying codec marker keys (__t / __throw / __threw — IN since round 4:
// every driver marker-escapes a returned value, FINDINGS #55 #58), the R15 depth boundary (100 legal, 101 refused), then one probe per
// refusal (the round-4 ones: utf16 on well-formed text, inherited tag names, an ill-formed record name); then a seeded fill.
const N = { t: 'none' };
const B = (v) => ({ t: 'bool', v });
const T = (v) => ({ t: 'text', v, cu: 'utf8' });
const T16 = (v) => ({ t: 'text', v, cu: 'utf16' });
const I = (v) => ({ t: 'i64', v: String(v) });
const U = (v) => ({ t: 'u64', v: String(v) });
const QNAN = '7ff8000000000000';
const bitsOf = (x) => { if (Number.isNaN(x)) return QNAN; const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, '0'); };
const f64str = (x) => Number.isNaN(x) ? 'NaN' : Object.is(x, -0) ? '-0' : String(x);
const F = (x) => ({ t: 'f64', v: f64str(x), bits: bitsOf(x) });
const FB = (bits, v = '?') => ({ t: 'f64', v, bits });
const Y = (bytes) => ({ t: 'bytes', v: 'base64:' + Buffer.from(bytes).toString('base64') });
const L = (...v) => ({ t: 'list', v });
const P = (...v) => ({ t: 'tuple', v });
const M = (...v) => ({ t: 'map', v });
const R = (...v) => ({ t: 'record', v });
const X = (msg) => ({ t: 'throw', msg });
const BI = (v) => ({ t: 'bigint', v });

const P53 = 2n ** 53n;
// k nodes of one container kind around a leaf: the leaf sits at depth k (R15: root 0, each child one deeper, > 100 throws).
// The NEUTRAL oracle carries the tree as a json value (>= 2 json levels per node) under the codec's 100-value cap, so only
// k <= 49 is shared; every deeper probe is routed to the js envelope extension (legacy-codec args), where the boundary grades.
// Never a throw node at depth 100: it decodes, but its result is 101 values deep and no driver can grade it (FINDINGS, r5).
const chain = (k, leaf = N) => { let x = leaf; for (let i = 0; i < k; i++) x = L(x); return x; };
const mchain = (k, leaf = N) => { let x = leaf; for (let i = 0; i < k; i++) x = M([T('k'), x]); return x; };
const rchain = (k, leaf = N) => { let x = leaf; for (let i = 0; i < k; i++) x = R(['f', x]); return x; };
const pchain = (k, leaf = N) => { let x = leaf; for (let i = 0; i < k; i++) x = P(x); return x; };
const curated = [
  // ---- frozen (24): every tag, the boundaries, a throw node and a marker-keyed map as RESULTS, then twelve refusals (the
  // round-4 ones among them: an inherited tag name, utf16 on well-formed text, an ill-formed record name)
  N, B(true), T('héllo wörld ☃ 😀'), L(F(1.5), F(-0), F(NaN), F(Infinity), F(-Infinity), FB('0000000000000001', '5e-324')),
  L(I(-42), I(P53), I(P53 + 1n), I(-P53), I(-P53 - 1n), U(2n ** 64n - 1n)), Y([1, 2, 3]), L(P(I(1), T('x'), N), L()),
  M([T('a'), I(1)], [T('b'), L(F(2.25), B(false))]), R(['name', T('n')], ['n', I(7)]), X('top'), M([T('__threw'), T('top map')]), T16('a\ud800b'),
  { t: 'constructor' }, T16('plain'), R(['a\ud800', N]), M([T('b'), I(1)], [T('a'), I(2)]), FB('fff8000000000000', 'NaN'), { t: 'bytes', v: 'base64:AR==' },
  null, { t: 'none', v: 5 }, I('-0'), I(2n ** 63n), { t: 'bool', v: 'true' }, L(T('ok'), { t: 'nope' }),
  // ---- held-out: accepted forms, bundled
  L(I(2n ** 63n - 1n), I(-(2n ** 63n)), U(0), U(P53), I(-(P53 - 1n)), I('9007199254740991'), Y([]), Y([255]), Y([0, 255]), Y([251, 255, 191]), T(''),
    // accepted although encode never emits it: an f64 display v that disagrees with its bits (R9)
    FB('3ff0000000000000', 'banana'), FB('4000000000000000', ''), FB('7ff0000000000000', 'NaN')),
  L(BI('123'), BI('-99999999999999999999999999'), BI('0'), { t: 'undefined' }, T16('\ud83d'), T16('x\ude00y'), M(), R(), P()),
  X(''),
  // UTF-16 key order: '' first, a prefix before its extension, upper before lower, an astral (surrogate D83D) BEFORE U+FF61
  M([T(''), N], [T('1'), T('y')], [T('A'), T('z')], [T('__proto__'), T('v')], [T('a'), I(1)], [T('ab'), I(2)], [T('constructor'), N], [T('😀'), B(true)], [T('｡'), B(false)]),
  L(M([T16('\ud800'), N], [T16('\udc00'), N]), R(['b', I(1)], ['a', T('any order')], ['__proto__', B(false)], ['', N], ['a😀', N])),
  L(X('inner'), T('after'), M([T('k'), X('deep')]), L(L(L(F(0.1)))), M([T('x'), R(['y', P(B(true), U(3))])])),
  // result maps carrying a codec marker key: ordinary maps at the top level and nested, never a throw or a codec tag
  M([T('__throw'), T('legacy')]), M([T('__t'), T('num')], [T('v'), T('1')]),
  L(R(['__threw', T('rec')]), M([T('__threw'), T('x')], [T('y'), N]), M([T('__t'), T('zzz')]), M([T('__t'), I(5)]), M([T('a'), M([T('__t'), T('obj')], [T('v'), M()])])),
  // R15
  chain(49),   // the deepest tree the shared oracle holds
  chain(100),  // exactly at the cap: the innermost node at depth 100 decodes
  // at the cap over every container kind, the key position, empty containers and scalar leaves, bundled one level down
  L(chain(99, M()), chain(99, R()), chain(99, P()), chain(99, L()), chain(99, T('leaf')), chain(99, Y([1])), mchain(99, I(5)), rchain(99, F(0.5)), pchain(99, B(true)), chain(98, M([T('key at 100'), N]))),
  // one past the cap: a position at depth 101, whatever it holds
  chain(101), mchain(101), rchain(100, R(['a', N])), chain(100, M([T('a'), N])), chain(100, L({ t: 'nope' })),
  // ---- refusals: one probe per path ("not a canonical tree")
  [T('a')], { t: 5 }, { t: 'toString' }, { __threw: 'x' }, { t: 'text', v: 'x' }, { t: 'text', v: 'a\ud800', cu: 'utf8' }, L(T('ok'), T16('ok')),
  { t: 'bytes', v: 'AQID' }, { t: 'bytes', v: 'base64:-_8' }, { t: 'bytes', v: 'base64:AQID\n' },
  { t: 'f64', bits: '3ff0000000000000' }, FB('3FF0000000000000'), FB('3ff0000000000000\n'), FB('7ff0000000000001'),
  I('5\n'), U(-1), U(2n ** 64n),
  { t: 'list', v: 'ab' }, { t: 'map', v: [[T('k')]] }, M([X('k'), T('x')]), M([T16('k'), N]), M([T('a'), I(1)], [T('a'), I(2)]), M([T('｡'), N], [T('😀'), N]),
  { t: 'record', v: [[1, N]] }, R(['a', I(1)], ['a', T('dup')]), R(['\udc00', N]),
  { t: 'throw', msg: 5 },
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const CHARS = ['a', 'b', 'z', 'K', '0', '9', ' ', '-', '_', 'é', 'ß', 'Ж', '中', '☃', '😀', '｡', '￿', '"', '\\', '\n', '\t', ','];
const rtext = (rnd) => { let s = ''; const n = Math.floor(rnd() * 7); for (let i = 0; i < n; i++) s += pick(rnd, CHARS); return s; };
const rbig = (rnd, lim) => { let b = 0n; for (let i = 0; i < 4; i++) b = (b << 16n) | BigInt(Math.floor(rnd() * 65536)); return b % lim; };
const SPECIAL = [0, -0, 1, -1, 0.5, 0.1, 1e21, 1e-7, 123.456, -2.5e-300, 5e-324, 1.7976931348623157e308, NaN, Infinity, -Infinity, 9007199254740993];
function rint(rnd, k) {
  const C = k === 'u64' ? U : I; const r = rnd();
  if (r < 0.15) { const e = pick(rnd, [0n, 1n, P53 - 1n, P53, P53 + 1n]); return C(k === 'u64' || rnd() < 0.5 ? e : -e); }
  if (r < 0.9) { const v = BigInt(Math.floor(rnd() * 2000001)) - 1000000n; return C(k === 'u64' && v < 0n ? -v : v); }
  return C(rbig(rnd, k === 'u64' ? 2n ** 64n : 2n ** 63n) - (k === 'i64' && rnd() < 0.5 ? 2n ** 62n : 0n));
}
const rf64 = (rnd) => (rnd() < 0.4 ? F(pick(rnd, SPECIAL)) : F((rnd() - 0.5) * 10 ** Math.floor(rnd() * 12 - 4)));
// a key of one or two characters holding a JSON-escaped character (" \\ newline tab) is lengthened: Node 24.16's JSON.parse
// remembers such keys ACROSS calls ("\\" then "\"" reads "\\"; "\\\\" then "\\a" reads "\\\\"; FINDINGS #51), which would
// corrupt a stored expected. Canonical map entries: unique text keys in ascending UTF-16 code-unit order.
const rkey = (rnd) => { const k = rtext(rnd); return k.length <= 2 && /["\\\n\t]/.test(k) ? k + 'aa' : k; };
const sortedKeys = (rnd, n) => [...new Set(Array.from({ length: n }, () => rkey(rnd)))].sort();
function rtree(rnd, depth) {
  const r = rnd();
  if (depth <= 0 || r < 0.45) {
    const s = rnd();
    if (s < 0.08) return N; if (s < 0.18) return B(rnd() < 0.5); if (s < 0.45) return T(rtext(rnd));
    if (s < 0.65) return rint(rnd, rnd() < 0.7 ? 'i64' : 'u64'); if (s < 0.9) return rf64(rnd);
    if (s < 0.95) return Y(Array.from({ length: Math.floor(rnd() * 6) }, () => Math.floor(rnd() * 256)));
    if (s < 0.98) return X(rtext(rnd));
    return T16(pick(rnd, ['\ud800', '\udfff', 'a\udbff', '\udc00z']));
  }
  const n = Math.floor(rnd() * 4); const kids = () => Array.from({ length: n }, () => rtree(rnd, depth - 1));
  if (r < 0.62) return L(...kids()); if (r < 0.72) return P(...kids());
  if (r < 0.88) return M(...sortedKeys(rnd, n).map((k) => [T(k), rtree(rnd, depth - 1)]));
  const names = [...new Set(Array.from({ length: n }, () => rkey(rnd)))]; return R(...names.map((k) => [k, rtree(rnd, depth - 1)]));
}

export function genInputs(n, rnd) {
  const out = curated.map((t) => [t]);
  while (out.length < n) out.push([rtree(rnd, 3)]);
  return out;
}
