// Input generator for check_carried (rederive v05.checkCarried(decl, table)). genInputs(n, rnd) -> n argument lists
// [decl, table]. Curated coverage prefix first, then seeded random fill inside the envelope.
//
// Maps are built with every key as an OWN property (so "__proto__" is a key, never the prototype); M sorts insertion by
// UTF-16 code units, U keeps a given order (the round-5 package compares canonically, so order must not matter — U probes it).
import { createHash } from 'node:crypto';

const own = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
// M([[k, v], ...]) or M({..}) -> a plain map with keys inserted in sorted (UTF-16) order, values canonicalized deeply
function M(entries) {
  const ents = Array.isArray(entries) ? entries : Object.entries(entries);
  const o = {}; for (const [k, v] of [...ents].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) own(o, k, C(v));
  return o;
}
function C(v) {
  if (Array.isArray(v)) return v.map(C);
  if (v && typeof v === 'object') return M(Object.keys(v).map((k) => [k, v[k]]));
  return v;
}
// the canonical hash the declaration should carry (input construction only: a WRONG computation here would show up as an
// unexpected hash-mismatch in the stamp, never as a wrong expected)
function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (x && typeof x === 'object') return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x);
}
const shaOf = (t) => createHash('sha256').update(Buffer.from(canon(t))).digest('hex');
// U([[k, v], ...]) -> a plain map with keys inserted in the GIVEN order (an equals whose order differs from the table's)
function U(entries) { const o = {}; for (const [k, v] of entries) own(o, k, v); return o; }
const A = (expr, equals) => M([['equals', equals], ['expr', expr]]);
const D = (sha, assertions) => (sha === undefined ? M([['assertions', assertions]]) : M([['assertions', assertions], ['sha', sha]]));
const ZERO = '0'.repeat(64);

function curated() {
  const out = [];
  const T1 = M({ a: 1, b: 'two', c: true, d: null });
  const s1 = shaOf(T1);
  // status table: unpinned / hash-mismatch / unattested / attested / authority-FAIL, crossed with the pin
  out.push([D(undefined, []), T1]);
  out.push([D(s1, []), T1]);
  out.push([D(ZERO, []), T1]);
  out.push([D(s1, [A('count', 4)]), T1]);
  out.push([D(s1, [A('count', 5)]), T1]);
  out.push([D(ZERO, [A('count', 4)]), T1]);
  out.push([D(undefined, [A('count', 4), A('a', 1)]), T1]);
  // what is a PIN: absent or none = unpinned; a PRESENT sha that is not exactly 64 of 0-9a-f throws (the right digest
  // misspelled included) — round 5b
  out.push([D(null, [A('count', 4)]), T1]);
  out.push([D(s1.toUpperCase(), [A('count', 4)]), T1]);
  out.push([D(s1 + '\n', [A('count', 4)]), T1]);
  out.push([D('', []), T1]);
  out.push([D(false, [A('count', 4)]), T1]);
  // key lookups of every json kind, match and miss
  const T2 = M({ s: 'x', n: 2.5, i: 7, t: true, f: false, z: null, l: [1, 'a', null, [2]], m: { q: 1, p: [true] }, e: '', el: [], em: {} });
  const s2 = shaOf(T2);
  out.push([D(s2, [A('s', 'x'), A('n', 2.5), A('i', 7), A('t', true), A('f', false), A('z', null), A('l', [1, 'a', null, [2]]), A('m', { p: [true], q: 1 }), A('e', ''), A('el', []), A('em', {})]), T2]);
  out.push([D(s2, [A('s', 'X'), A('n', 2.50001), A('i', '7'), A('t', 1), A('f', null), A('z', false), A('l', [1, 'a', null]), A('m', { q: 1 }), A('e', null), A('el', {}), A('em', [])]), T2]);
  out.push([D(s2, [A('missing', null), A('missing', 0)]), T2]);
  out.push([D(s2, [A('l', [1, 'a', null, [2]]), A('count', 11), A('nope', 'x')]), T2]);
  // number equality by value (7.0, 25e-1); map equality is order-free (an UNSORTED equals map still matches)
  out.push([D(s2, [A('i', 7.0), A('n', 25e-1), A('m', U([['q', 1], ['p', [true]]]))]), T2]);
  const TN = M({ k: { '10': 1, '9': 2, b: { y: 1, x: 2 }, a: 3 } });
  out.push([D(shaOf(TN), [A('k', U([['b', U([['y', 1], ['x', 2]])], ['a', 3], ['9', 2], ['10', 1]])), A('k', U([['b', U([['y', 1], ['x', 2]])], ['a', 3], ['9', 2]]))]), TN]);
  // a real key named count is shadowed: count is ALWAYS the entry count
  const T3 = M({ count: 99, other: 1 });
  out.push([D(shaOf(T3), [A('count', 99), A('count', 2)]), T3]);
  // own keys only: __proto__ and the host's inherited member names are ABSENT unless the table holds them
  const Ta = M({ a: 1 }); const sa = shaOf(Ta);
  out.push([D(sa, [A('__proto__', {}), A('__proto__', null), A('constructor', null), A('toString', {}), A('hasOwnProperty', 'x'), A('valueOf', 0), A('undefined', null)]), Ta]);
  const TP = M([['__proto__', 5], ['a', 1], ['constructor', 'c']]);
  out.push([D(shaOf(TP), [A('__proto__', 5), A('constructor', 'c'), A('count', 3), A('__proto__', {})]), TP]);
  // absent entry vs an entry holding none: ABSENT never passes, whatever equals is
  out.push([D(shaOf(M({ z: null })), [A('z', null), A('y', null)]), M({ z: null })]);
  // extra assertion entries (got, ok, note) are dropped: a result is exactly expr, equals, got, ok; equals none is well-formed
  out.push([D(sa, [M({ equals: 1, expr: 'a', got: 'x', ok: false, note: 'extra' }), M({ equals: 2, expr: 'a', ok: true }), M({ equals: null, expr: 'a' })]), Ta]);
  // empty key and empty table
  out.push([D(shaOf(M([['', 'blank']])), [A('', 'blank')]), M([['', 'blank']])]);
  out.push([D(shaOf(M({})), [A('count', 0)]), M({})]);
  out.push([D(shaOf(M({})), [A('a', null)]), M({})]);
  // canonical form: nested sort at every depth, UTF-16 vs UTF-8 key order, integer-like keys, escapes, number spelling
  const NUMS = [0, 1, -1, 0.1, 1.5, 1e21, 1e-7, 1.5e-7, 123456789012345680000, 5e-324, 2 ** 53, 2 ** 53 + 2, 2 ** 64, 1.7976931348623157e308, -2.5e-10, 1e20, 0.000001];
  const STRS = ['"q"', 'back\\slash', 'nl\n', 'tab\t', 'cr\r', '\b\f', '\u0000\u0001\u001f', '\u007f', '  ', 'é日本', '\u{1F600}', '/', '  '];
  const T4 = M({
    '｡': 'halfwidth', '\u{1F600}': 'emoji', '10': 'ten', '9': 'nine', '01': 'z', B: 'upper', a: 'lower', 'é': 'e-acute',
    nest: { z: { y: 1, b: 2 }, a: [{ y: 1, x: 2 }, { '｡': 1, '\u{1F600}': 2 }] }, nums: NUMS, strs: STRS,
  });
  out.push([D(shaOf(T4), [A('count', 11), A('10', 'ten'), A('nest', { a: [{ x: 2, y: 1 }, { '｡': 1, '\u{1F600}': 2 }], z: { b: 2, y: 1 } })]), T4]);
  out.push([D(shaOf(T4), [A('nums', NUMS), A('strs', STRS)]), T4]);
  // equals holding a value no canonical form has (-0 / NaN / an infinity, at any depth) -> throws (round 5b); 0 is fine
  const Tz = M({ z: 0, n: null, l: [null], m: { a: 0 } }); const sz = shaOf(Tz);
  out.push([D(sz, [A('z', 0), A('m', { a: 0 }), A('l', [null])]), Tz]);
  out.push([D(sz, [A('z', -0)]), Tz]);
  out.push([D(sz, [A('z', 0), A('m', { a: -0 })]), Tz]);
  out.push([D(undefined, [A('n', NaN)]), Tz]);
  out.push([D(sz, [A('l', [Infinity])]), Tz]);
  // expr: any non-empty text is well-formed (blank and invisible text included, read as ABSENT keys); the empty text throws
  out.push([D(sz, [A(' ', null), A('\u200b', 0), A('0', 0)]), Tz]);
  out.push([D(sz, [A('', 0)]), Tz]);
  // OUT-OF-DOMAIN (chaos) -> throws: table not a map / holding an unrepresentable number
  out.push([D(null, []), [1, 2]]);
  out.push([D(null, []), null]);
  out.push([D(null, []), M({ a: -0 })]);
  out.push([D(null, []), M({ a: { b: [NaN] } })]);
  out.push([[], M({ a: 1 })]);
  // decl not a map holding an assertions list
  out.push([M({}), M({ a: 1 })]);
  out.push([null, M({ a: 1 })]);
  out.push([M({ assertions: {} }), M({ a: 1 })]);
  out.push([M({ assertions: null, sha: s1 }), T1]);
  // a malformed assertion -> throws, even after well-formed ones and with the right pin
  out.push([D(sa, [null]), Ta]);
  out.push([D(sa, [['a', 1]]), Ta]);
  out.push([D(sa, [M({ expr: 'a' })]), Ta]);
  out.push([D(sa, [M({ equals: 1 })]), Ta]);
  out.push([D(sa, [M({ equals: 1, expr: 1 })]), Ta]);
  out.push([D(sa, [A('a', 1), A('count', 1), true]), Ta]);
  return out;
}

const KEYS = ['a', 'b', 'c', 'k1', 'k2', 'name', 'x', 'é', '日', '\u{1F600}', '｡', '10', '9', '0', 'A', '_', '', 'count', 'undefined', '__proto__', 'constructor', 'toString'];
const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
function rval(rnd, depth) {
  const r = rnd();
  if (r < 0.15) return pick(rnd, ['', 'x', 'yes', 'é', 'a"b', 'l\nm', '\u{1F600}']);
  if (r < 0.3) return pick(rnd, [0, 1, -3, 2.5, 1e21, 1e-7, 0.1, 255, 65535]);
  if (r < 0.4) return rnd() < 0.5;
  if (r < 0.5) return null;
  if (r < 0.7 && depth < 2) { const n = Math.floor(rnd() * 3); return Array.from({ length: n }, () => rval(rnd, depth + 1)); }
  if (depth < 2) return rmap(rnd, depth + 1, 3);
  return Math.floor(rnd() * 100);
}
function rmap(rnd, depth, max) {
  const n = Math.floor(rnd() * (max + 1)); const ents = new Map();
  for (let i = 0; i < n; i++) ents.set(pick(rnd, KEYS), rval(rnd, depth));
  return M([...ents]);
}
function perturb(rnd, v) {
  if (typeof v === 'number') return v + 1;
  if (typeof v === 'string') return v + 'x';
  if (typeof v === 'boolean') return !v;
  if (v === null) return 0;
  if (Array.isArray(v)) return [...v, null];
  return M({ ...Object.fromEntries(Object.keys(v).map((k) => [k, v[k]])), zz: 1 });
}
// the same value with every map's keys in reverse insertion order (half the time): canonical equality ignores it
function reorder(rnd, v) {
  if (Array.isArray(v)) return v.map((x) => reorder(rnd, x));
  if (v && typeof v === 'object') return rnd() < 0.5 ? v : U(Object.keys(v).reverse().map((k) => [k, reorder(rnd, v[k])]));
  return v;
}
function random(rnd) {
  const table = rmap(rnd, 0, 6); const keys = Object.keys(table);
  const assertions = [];
  const na = Math.floor(rnd() * 4);
  for (let i = 0; i < na; i++) {
    const r = rnd();
    if (r < 0.3) assertions.push(A('count', rnd() < 0.7 ? keys.length : keys.length + 1));
    else if (r < 0.75 && keys.length) { const k = pick(rnd, keys); assertions.push(A(k, rnd() < 0.7 ? reorder(rnd, table[k]) : perturb(rnd, table[k]))); }
    else assertions.push(A(pick(rnd, KEYS), rval(rnd, 1)));
  }
  const rs = rnd(); const sha = rs < 0.55 ? shaOf(table) : rs < 0.65 ? undefined : rs < 0.7 ? null : rs < 0.8 ? ZERO : rs < 0.97 ? shaOf(M({ other: 1 })) : shaOf(table).toUpperCase();
  return [D(sha, assertions), table];
}

export function genInputs(n, rnd) {
  const out = curated();
  while (out.length < n) out.push(random(rnd));
  return out;
}
