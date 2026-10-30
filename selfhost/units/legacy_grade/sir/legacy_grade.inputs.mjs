// legacy_grade input generator — grade(gots, vectors) over rdv's v0.4 legacy codec (cli/verdict.mts).
// Each argument list is [gots, vectors]; a call carries at most 8 failing vectors so its `miss` list reveals every outcome.
// SHARED calls hold only json values (f64 specials included) and every plain map is built in UTF-16 key order — the
// canonical codec re-sorts maps, so an unsorted map would reach a decoded artifact in a different order than the stamp saw.
// HOST calls (Set, Map, RegExp, bigint, boxed, Uint8Array, holes, undefined) route to the js-only extension, whose codec
// keeps insertion order; only the KEY-ORDER call relies on that. Never a Buffer (structuredClone turns it into a plain
// Uint8Array for the stamp while the stored args say Buffer) and never a boxed -0/NaN/Infinity got (the lab's legacy
// decoder rebuilds a boxed number from its encoded payload without decoding it).

const isPlain = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
function sortDeep(v) {
  if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) if (i in v) a[i] = sortDeep(v[i]); return a; }
  if (v instanceof Set) return new Set([...v].map(sortDeep));
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [sortDeep(k), sortDeep(x)]));
  if (!isPlain(v)) return v;
  const o = {}; for (const k of Object.keys(v).sort()) Object.defineProperty(o, k, { value: sortDeep(v[k]), enumerable: true, writable: true, configurable: true }); return o;
}
// the stored (legacy) spelling of a host value — what an oracle's `expected` holds as plain data
function tagOf(v) {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (Object.is(v, -0)) return { __t: 'num', v: '-0' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) return { __t: 'boxed', k: v.constructor.name, v: tagOf(v.valueOf()) };
  if (v instanceof Set) return { __t: 'set', values: [...v].map(tagOf) };
  if (v instanceof Map) return { __t: 'map', entries: [...v].map(([k, x]) => [tagOf(k), tagOf(x)]) };
  if (v instanceof Uint8Array) return { __t: 'u8', bytes: Array.from(v), buf: false };
  if (Array.isArray(v)) { let holes = false; for (let i = 0; i < v.length; i++) if (!(i in v)) holes = true; if (!holes) return v.map(tagOf); const entries = []; for (let i = 0; i < v.length; i++) if (i in v) entries.push([i, tagOf(v[i])]); return { __t: 'sparse', length: v.length, entries }; }
  if (isPlain(v)) { const o = {}; for (const k of Object.keys(v)) o[k] = tagOf(v[k]); return ('__t' in o || '__throw' in o || '__threw' in o) ? { __t: 'obj', v: o } : o; }
  return v;
}
const holes = (len, pairs) => { const a = new Array(len); for (const [i, x] of pairs) a[i] = x; return a; };
// one call from [name, got, expected] triples; `gots` may be cut shorter / padded by the caller
const call = (triples, { sort = true, gots } = {}) => {
  const g = gots ?? triples.map((t) => t[1]); const vs = triples.map(([name, , expected]) => (expected === OMIT ? { name } : { name, expected }));
  return sort ? sortDeep([g, vs]) : [g, vs];
};
const OMIT = Symbol('omit');
const N = (x) => ({ __t: 'num', v: x });

function curated() {
  const C = [];
  // ---- frozen-slice representatives (the first 24 calls teach) ----
  C.push(call([]));                                                                        // empty: 0/0, full
  C.push(call([['a0', 1, 1], ['a1', 'a', 'a'], ['a2', null, null], ['a3', true, 1], ['a4', [1, [2]], [1, [2]]],
    ['a5', { a: 1, b: { c: 'x' } }, { a: 1, b: { c: 'x' } }], ['a6', { a: 1 }, { a: 1, b: 2 }], ['a7', [1, 2], [2, 1]]]));
  C.push(call([['f0', -0, N('-0')], ['f1', -0, 0], ['f2', 0, -0], ['f3', NaN, N('NaN')], ['f4', NaN, NaN],
    ['f5', Infinity, N('Infinity')], ['f6', -Infinity, N('Infinity')], ['f7', [-0, { k: -Infinity }], [N('-0'), { k: N('-Infinity') }]]]));
  C.push(call([['t0', { __throw: 'a' }, { __throw: 'b' }], ['t1', { __throw: 'a', x: 1 }, { __throw: 5 }], ['t2', { __throw: 'a' }, 5],
    ['t3', 5, { __throw: 'a' }], ['t4', { __throw: 'a' }, { __t: 'obj', v: { __throw: 'a' } }], ['t5', { __t: 'obj', v: { __throw: 'a' } }, { __throw: 'a' }],
    ['t6', [{ __throw: 'a' }], [{ __throw: 'a' }]], ['t7', { __throw: null }, { __throw: 'z', __t: 'num', v: 'bad' }]]));
  C.push(call([['e0', { __t: 'num', v: '-0' }, { __t: 'obj', v: { __t: 'num', v: '-0' } }], ['e1', { __t: 'num', v: '-0' }, { __t: 'num', v: '-0' }],
    ['e2', { __threw: 'x' }, { __threw: 'x' }], ['e3', { __threw: 'x' }, { __throw: 'x' }], ['e4', { __t: 'obj', v: { a: 1 } }, { __t: 'obj', v: { __t: 'obj', v: { a: 1 } } }],
    ['e5', { a: 1 }, { __t: 'obj', v: { a: 1 } }], ['e6', { __t: 'zzz', a: 1 }, { __t: 'zzz', a: 1 }], ['e7', { __t: 5 }, { __t: 5 }]]));
  C.push([[{ __throw: 'boom' }], [{ name: 'x0', expected: { __t: 'num', v: 'bad' } }]].map(sortDeep));   // both throws: revive never runs
  C.push(call([['n0', 1, N('1')]]));                                                        // throws: num tag outside the four
  C.push(call([['h0', undefined, { __t: 'undef' }], ['h1', undefined, undefined], ['h2', null, { __t: 'undef' }], ['h3', [undefined], [{ __t: 'undef' }]],
    ['h4', { a: undefined }, { a: { __t: 'undef' } }], ['h5', { a: undefined }, {}]]));
  C.push(call([['b0', 12n, { __t: 'bigint', v: '12' }], ['b1', 31n, { __t: 'bigint', v: '0x1f' }], ['b2', 42n, { __t: 'bigint', v: ' 42 ' }], ['b3', 0n, { __t: 'bigint', v: '' }],
    ['b4', 5n, { __t: 'bigint', v: 5 }], ['b5', 12n, 12], ['b6', 12n, 12n], ['b7', -7n, { __t: 'bigint', v: '-7' }]]));
  C.push(call([['u0', [1], 1], ['u1', 'x', { __t: 'undef' }], ['u2', 'y', { __t: 'undef', extra: 1 }], ['u3', 'z', null]], { gots: [1] }));   // gots shorter than vectors
  C.push(call([['x0', 1, { __t: 'obj', v: null }]]));                                       // throws: obj tag over none
  C.push(call([['r0', /a/gi, { __t: 'regex', source: 'a', flags: 'ig' }], ['r1', new RegExp(''), { __t: 'regex', source: '', flags: '' }], ['r2', /a\/b/, { __t: 'regex', source: 'a/b', flags: '' }],
    ['r3', /a/, { __t: 'regex', source: 'a', flags: 'g' }], ['r4', /a/dgimsuy, { __t: 'regex', source: 'a', flags: 'yusmigd' }], ['r5', /x/, { __t: 'regex' }], ['r6', new RegExp('(?:)'), { __t: 'regex' }],
    ['r7', /\n/, { __t: 'regex', source: '\n', flags: '' }]]));
  C.push(call([['m0', 0, 0], ['m1', 1, 2], ['m2', 2, 3], ['m3', 3, 3], ['m4', 4, 5], ['m5', 5, 6], ['m6', 6, 7], ['m7', 7, 8], ['m8', 8, 9], ['m9', 9, 10], ['m10', 10, 11], ['m11', 11, 11]]));   // the cap of 8
  C.push(call([['s0', new Set([1]), { __t: 'set', values: [1, 1] }], ['s1', new Set([0]), { __t: 'set', values: [N('-0'), 0] }], ['s2', new Set([NaN]), { __t: 'set', values: [N('NaN'), N('NaN')] }],
    ['s3', new Set([[1], [1]]), { __t: 'set', values: [[1], [1]] }], ['s4', new Set(), { __t: 'set' }], ['s5', new Set([1, 2]), { __t: 'set', values: [2, 1] }], ['s6', new Set(), { __t: 'set', values: 0 }],
    ['s7', new Set([1]), [1]]]));
  C.push(call([['k0', 1, { __t: 'bigint', v: 'abc' }]]));                                   // throws: bigint text outside the grammar
  C.push(call([['p0', [1, 2], { __t: 'sparse', length: 2, entries: [[0, 1], [1, 2]] }], ['p1', [], { __t: 'sparse', length: 0, entries: [] }], ['p2', [null], { __t: 'sparse', entries: [] }],
    ['p3', ['2', 5], { __t: 'sparse', length: '2', entries: [[1, 5]] }], ['p4', [1, 5], { __t: 'sparse', length: 2, entries: [['1', 5], [0, 1]] }], ['p5', [true], { __t: 'sparse', length: true }],
    ['p6', [1, 2], { __t: 'sparse', length: 2, entries: [[0, 1], [1, 2], [0, 7]] }], ['p7', [7, 2], { __t: 'sparse', length: 2, entries: [[0, 1], [1, 2], [0, 7]] }]]));
  C.push(call([['o0', new Map([[1, 'b']]), { __t: 'map', entries: [[1, 'a'], [1, 'b']] }], ['o1', new Map([[0, 1]]), { __t: 'map', entries: [[N('-0'), 1]] }], ['o2', new Map([['a', 'b']]), { __t: 'map', entries: ['ab'] }],
    ['o3', new Map([[1, undefined]]), { __t: 'map', entries: [[1]] }], ['o4', new Map([[1, 2]]), { __t: 'map', entries: [[1, 2, 3]] }], ['o5', new Map(), { __t: 'map' }],
    ['o6', new Map([[{ a: 1 }, 2]]), { __t: 'map', entries: [[{ a: 1 }, 2]] }], ['o7', new Map([['a', 1], ['b', 2]]), { __t: 'map', entries: [['b', 2], ['a', 1]] }]]));
  C.push(call([['q0', { a: NaN }, { a: N('NaN') }], ['q1', [NaN, { a: -0 }], [N('NaN'), { __t: 'obj', v: { a: N('-0') } }]], ['q2', { a: { b: Infinity } }, { a: { b: N('Infinity') } }],
    ['q3', { __t: 'set', values: [] }, { __t: 'set', values: [] }], ['q4', { __t: 'map', entries: [] }, { __t: 'map', entries: [] }], ['q5', { __t: 'regex', source: 'a', flags: '' }, { __t: 'regex', source: 'a', flags: '' }],
    ['q6', { __t: 'bigint', v: '1' }, { __t: 'bigint', v: '1' }], ['q7', { __t: 'undef' }, { __t: 'undef' }]]));
  C.push(call([['g0', 1, { __t: 'regex', source: 'a', flags: 'gg' }]]));                   // throws: regex flags
  C.push(call([['w0', new Uint8Array([1, 2]), { __t: 'u8', bytes: [1, 2], buf: false }], ['w1', new Uint8Array([1, 2]), { __t: 'u8', bytes: [1, 2], buf: true }],
    ['w2', new Uint8Array([0, 255, 1, 7, 0, 0, 1]), { __t: 'u8', bytes: [256, -1, 1.5, '7', 'a', null, true], buf: false }], ['w3', new Uint8Array([1, 2]), { __t: 'u8', bytes: '12', buf: false }],
    ['w4', new Uint8Array([]), { __t: 'u8', bytes: 5, buf: false }], ['w5', new Uint8Array([1]), { __t: 'u8', bytes: [1], buf: 0 }], ['w6', new Uint8Array([1]), { __t: 'u8', bytes: [1] }],
    ['w7', new Uint8Array([49, 50]), { __t: 'u8', bytes: '12', buf: 1 }]]));
  C.push(call([['c0', 1, 2], ['c1', 1, 1], ['c2', 'a', 'b'], ['c2', 'b', 'b'], ['c2', [], {}], ['c3', {}, []], ['c4', '1', 1], ['c5', false, 0], ['c6', null, false], ['c7', 0.5, 0.25], ['c8', 'x', 'x']]));   // duplicate names
  C.push(call([['d0', { __throw: 'a' }, { __throw: 'b' }], ['d1', 1, 1], ['d2', 1, { __t: 'obj', v: [1] }]]));   // throws on the LAST vector after passes
  C.push(call([['z0', [1, 2, 3, 4], [1, 2, 3, 4]], ['z1', 2, 2]], { gots: [[1, 2, 3, 4], 2, 'extra', { __throw: 'x' }] }));   // gots longer than vectors
  C.push(call([['j0', new Number(12), { __t: 'boxed', k: 'Number', v: '12' }], ['j1', new String('5'), { __t: 'boxed', k: 'String', v: 5 }], ['j2', new Boolean(true), { __t: 'boxed', k: 'Foo', v: 'x' }],
    ['j3', new Boolean(false), { __t: 'boxed', v: '' }], ['j4', new Number(0), { __t: 'boxed', k: 'Number', v: null }], ['j5', new String('null'), { __t: 'boxed', k: 'String', v: null }],
    ['j6', new Number(1), { __t: 'boxed', k: 'Number', v: true }], ['j7', new Number(12), 12]]));
  // ---- held-out slice ----
  C.push(call([['i0', new Number(3.5), { __t: 'boxed', k: 'Number', v: ' 3.5 ' }], ['i1', new String('undefined'), { __t: 'boxed', k: 'String' }], ['i2', new Boolean(false), { __t: 'boxed', k: 'Boolean', v: 0 }],
    ['i3', new Boolean(true), { __t: 'boxed', k: 'Boolean', v: 'x' }], ['i4', new String('true'), { __t: 'boxed', k: 'String', v: true }], ['i5', new Number(0), { __t: 'boxed', k: 'Number', v: '' }],
    ['i6', new Boolean(false), { __t: 'boxed', k: 'Boolean', v: N('NaN') }], ['i7', new String('a'), new String('a')]]));
  C.push(call([['v0', holes(3, [[0, 1], [2, 3]]), { __t: 'sparse', length: 3, entries: [[0, 1], [2, 3]] }], ['v1', holes(2, []), { __t: 'sparse', length: 2, entries: [] }],
    ['v2', holes(6, [[5, 1]]), { __t: 'sparse', length: 2, entries: [[5, 1]] }], ['v3', holes(2, []), { __t: 'sparse', length: 2, entries: [[-1, 7]] }],
    ['v4', [undefined, undefined], { __t: 'sparse', length: 2, entries: [] }], ['v5', holes(3, [[0, 1], [2, 3]]), holes(3, [[0, 1], [2, 3]])], ['v6', [1, undefined, 3], holes(3, [[0, 1], [2, 3]])],
    ['v7', [undefined, 5], { __t: 'sparse', entries: [[1, 5]] }]]));
  C.push(call([['y0', {}, new Set([1])], ['y1', {}, new Map([[1, 2]])], ['y2', {}, /a/g], ['y3', { 0: 1, 1: 2 }, new Uint8Array([1, 2])],
    ['y4', { 0: 'a', 1: 'b' }, new String('ab')], ['y5', {}, new Number(5)], ['y6', new Set([1]), new Set([1])], ['y7', 5n, 5n]]));   // host values in EXPECTED
  C.push(call([['o8', 1, { __t: 'obj', v: 'x' }]]));                                         // throws: obj tag over text
  C.push(call([['k1', 1, { __t: 'bigint', v: 1.5 }]]));                                      // throws: bigint over a fraction
  C.push(call([['g1', 1, { __t: 'regex', source: '(', flags: '' }]]));                      // throws: regex source
  C.push(call([['s8', 1, { __t: 'set', values: 'ab' }]]));                                   // throws: set values not a list
  C.push(call([['o9', 1, { __t: 'map', entries: [5] }]]));                                   // throws: map entry not iterable
  C.push(call([['w8', 1, { __t: 'u8', buf: false }]]));                                      // throws: u8 without bytes
  C.push(call([['v8', 1, { __t: 'sparse', length: -1, entries: [] }]]));                     // throws: sparse length
  C.push(call([['n1', [1], [{ a: { __t: 'num', v: '2' } }]]]));                              // throws: nested num tag
  C.push(call([['t8', 5, { __throw: 'z', __t: 'num', v: 'bad' }]]));                        // throws: a sentinel expected whose got did not throw
  C.push(call([['n2', 1, N(0)]]));                                                           // throws: num tag over a number
  C.push(call([['o10', 1, { __t: 'map', entries: 'xy' }]]));                                 // throws: map entries text
  C.push(call([['v9', 1, { __t: 'sparse', length: 2, entries: 5 }]]));                       // throws: sparse entries not iterable
  C.push(call([['k2', 1, { __t: 'bigint', v: null }]]));                                     // throws: bigint over none
  // key order (host extension: the legacy codec keeps insertion order); the undefined got routes the call there
  C.push(call([['ko0', { a: 1, b: 2 }, { b: 2, a: 1 }], ['ko1', { b: 1, 1: 2 }, { 1: 2, b: 1 }], ['ko2', { a: 1, b: 2 }, { __t: 'obj', v: { b: 2, a: 1 } }],
    ['ko3', { b: 2, a: 1 }, { b: 2, a: 1 }], ['ko4', undefined, { __t: 'undef' }]], { sort: false }));
  // chaos: wrong shapes of the two arguments (host extension: none / a missing field are outside the abstract SIG)
  C.push([null, [{ name: 'c0', expected: 1 }]]);                                            // gots none -> throws
  C.push([null, []]);                                                                         // gots none, no vectors
  C.push([[1], null]);                                                                        // vectors none -> throws
  C.push([[1], [null]]);                                                                      // a vector none -> throws
  C.push(call([['mx0', undefined, OMIT], ['mx1', 1, OMIT]], { gots: [] }));                  // expected absent
  C.push(call([['nest0', [new Set([1n]), new Map([['k', /x/g]])], tagOf([new Set([1n]), new Map([['k', /x/g]])])],
    ['nest1', new Map([[new Set([1]), [undefined]]]), tagOf(new Map([[new Set([1]), [undefined]]]))], ['nest2', new Set([new Map()]), tagOf(new Set([new Set()]))]]));
  C.push(call([['sh0', { __throw: 'm' }, { __throw: 'n', __t: 'obj' }], ['sh1', { __threw: 'm' }, { __threw: 'm', __t: 'obj', v: { __threw: 'm' } }],
    ['sh2', [{ __t: 'undef' }], [{ __t: 'obj', v: { __t: 'undef' } }]], ['sh3', { k: { __throw: 1 } }, { k: { __throw: 1 } }], ['sh4', 'k', { __t: 'boxed', k: 'String', v: 'k' }]]));
  return C;
}

// ---- seeded fill: real-domain grade calls ----
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const TEXT = ['', 'a', 'b', 'abc', 'Hello', 'é', '日本', '\n', 'x y', '__t', '0'];
const KEYS = ['a', 'b', 'c', 'k', 'z', '0', '10', 'name', 'É', '_x'];
function jsonVal(rnd, d = 0) {
  const r = rnd();
  if (d > 2 || r < 0.45) return pick(rnd, [0, 1, -1, 2.5, 1e21, -0, NaN, Infinity, -Infinity, null, true, false, ...TEXT, 7, 255]);
  if (r < 0.7) { const n = Math.floor(rnd() * 4); return Array.from({ length: n }, () => jsonVal(rnd, d + 1)); }
  const o = {}; const n = Math.floor(rnd() * 4); for (let i = 0; i < n; i++) o[pick(rnd, KEYS)] = jsonVal(rnd, d + 1); return o;
}
function hostVal(rnd, d = 0) {
  const r = rnd();
  if (d > 2 || r < 0.3) return jsonVal(rnd, 3);
  const k = Math.floor(rnd() * 10);
  if (k === 0) return undefined;
  if (k === 1) return BigInt(Math.floor(rnd() * 2000) - 1000);
  if (k === 2) return pick(rnd, [/a+/g, /^x$/im, new RegExp(''), /[0-9]/u, /a.b/s, /q/y]);
  if (k === 3) return pick(rnd, [new Number(4), new String('hi'), new Boolean(true), new Boolean(false), new Number(0.5)]);
  if (k === 4) return new Set(Array.from({ length: Math.floor(rnd() * 3) }, () => hostVal(rnd, d + 1)));
  if (k === 5) return new Map(Array.from({ length: Math.floor(rnd() * 3) }, () => [hostVal(rnd, d + 1), hostVal(rnd, d + 1)]));
  if (k === 6) return new Uint8Array(Array.from({ length: Math.floor(rnd() * 4) }, () => Math.floor(rnd() * 256)));
  if (k === 7) { const len = 1 + Math.floor(rnd() * 4); const a = new Array(len); for (let i = 0; i < len; i++) if (rnd() < 0.5) a[i] = hostVal(rnd, d + 1); return a; }
  if (k === 8) return [hostVal(rnd, d + 1), hostVal(rnd, d + 1)];
  const o = {}; o[pick(rnd, KEYS)] = hostVal(rnd, d + 1); return o;
}
// the expected side: a stored spelling of the got (pass), the got itself, a perturbation (fail) or a throw sentinel
function expectedFor(rnd, got, host) {
  const r = rnd();
  if (r < 0.4) return tagOf(got);
  if (r < 0.55) return host ? got : sortDeep(got);
  if (r < 0.65) return { __throw: pick(rnd, ['e', 'boom']) };
  if (r < 0.8) return tagOf(host ? hostVal(rnd) : jsonVal(rnd));
  return host ? hostVal(rnd) : jsonVal(rnd);
}
function randomCall(rnd, j) {
  const host = rnd() < 0.4; const n = 1 + Math.floor(rnd() * 8); const triples = [];
  for (let i = 0; i < n; i++) {
    let got = host ? hostVal(rnd) : jsonVal(rnd);
    if (rnd() < 0.12) got = { __throw: pick(rnd, ['x', 'TypeError: y']) };
    triples.push([`r${j}_${i}`, got, expectedFor(rnd, got, host)]);
  }
  return call(triples);
}

export function genInputs(n, rnd) {
  const out = curated();
  for (let j = 0; out.length < n; j++) out.push(randomCall(rnd, j));
  return out;
}
