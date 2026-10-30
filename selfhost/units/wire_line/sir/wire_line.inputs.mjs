// Input generator for wire_line = wireLine(args, sig) of rederive@f68cca701417 cli/lang/rust.mjs (round 5j contract fix).
// Each input is [args, sig]: args = the decoded-native argument list, sig = a PARSED SIG tree (built with the pinned
// authority's own parseSig, so every curated tree is one the real pipeline produces; the chaos trees are hand-built).
// HOST KEY ORDER (selfhost #156): the shared oracle carries every map as a canonical map (keys sorted by UTF-16 code units),
// so an artifact receives a map whose non-index keys were created in sorted order — whatever order the generator wrote. Every
// input is therefore passed through sortKeys() (deep) BEFORE it is returned, so the real function sees what an artifact sees.
// The only inputs that keep an unsorted order are the KEY-ORDER PROBES (keyOrderProbes), and each one carries a value the
// neutral codec refuses (a big integer or a lone surrogate) so encode-oracle routes it to the js extension, whose legacy
// codec keeps insertion order. They sit in the frozen slice.
import { parseSig } from '../../../.authority/f68cca701417/cli/sir/canon.mjs';

const S = (text) => parseSig(text);
const u8 = (...b) => Uint8Array.from(b);
const holey = (xs, i) => { const a = [...xs]; delete a[i]; return a; };

// js-extension only (each holds a neutral-refused value): host key order of json maps and of CARRY's first reason
const PROBES = new WeakSet();
function keyOrderProbes() {
  const ps = [
    [[{ t: true, k: [1, { z: 2.5, y: 'é😀' }], n: null, b: 9007199254740993n }], S('f(m: json) -> text')],
    [[{ z: 1, 10: 2, a: 3n, 2: 4, '-1': 5 }, { b: 1.5, a: 'x' }], S('f(m: json, n: map[text, f64]) -> text')],
    [[{ b: NaN, a: 'x\ud800' }], S('f(m: json) -> text')],
  ];
  for (const p of ps) PROBES.add(p);
  return ps;
}

function curated() {
  return [
    // ---- frozen-first: the main routes and every narrowing reason
    [['hi', true, 7], S('f(a: text, b: bool, c: i64) -> text')],
    [[1.5, -0, NaN, Infinity, -Infinity, 5e-324], S('f(...x: f64) -> text')],
    [[{ a: NaN }], S('f(m: json) -> text')],
    [[{ k: [1, { y: 'é😀', z: 2.5 }], n: null, t: true }], S('f(m: json) -> text')],
    ...keyOrderProbes(),
    [[{ a: 1.5, b: 'x' }, 2], S('f(m: map[text, f64], n: i64) -> text')],
    [[[1, 2, 3], ['a', 'b'], [0.5, NaN, -0], []], S('f(xs: list[i64], ys: list[text], zs: list[f64], e: list[bool]) -> text')],
    [[[1, 'x', 2.5, true]], S('f(t: tuple[i64, text, f64, bool]) -> text')],
    [[{ name: 'n', score: -0, tags: ['a'] }], S('f(r: record[score: f64, name: text, tags: list[text]]) -> text')],
    [[null, undefined, 2.5], S('f(a: f64 | none, b: text | none, c: none | f64) -> text')],
    [[9007199254740993n, 18446744073709551615n, -9223372036854775808n], S('f(a: i64, b: u64, c: i64) -> text')],
    [['x', 1, -0, NaN], S('f(a: text, ...rest: f64) -> text')],
    [[1, 2], S('f(a: i64) -> text')],
    [{ a: 1 }, S('f(a: i64) -> text')],
    [[u8(1, 2, 255)], S('f(b: bytes) -> text')],
    [[NaN], S('f(x: text | f64) -> text')],
    [['\ud800'], S('f(a: text) -> text')],
    [[[1, { 'a\udc00': 1 }]], S('f(m: json) -> text')],
    [[holey([1, 2, 3], 1)], S('f(xs: list[i64]) -> text')],
    [[new Map([['a', 1]])], S('f(m: json) -> text')],
    [[{ a: 'x' }], S('f(r: record[a: text, b: text | none, c: text]) -> text')],
    [[{ a: 2 ** 53, b: 2 ** 53 + 2 }], S('f(m: map[text, f64]) -> text')],
    // ---- held-out: further routes, edges and accidents
    [[], S('f(a: i64, ...r: text) -> text')],
    [[[1, 2, 3], ['a', 'b', 'c'], [undefined, 'q']], S('f(t: tuple[i64], u: tuple[text, text, text], w: tuple[f64 | none, text]) -> text')],
    [[holey([1, 2, 3], 1)], S('f(t: tuple[i64, i64 | none, i64]) -> text')],
    [holey([1, 2], 0), S('f(a: i64 | none, b: i64) -> text')],
    [[{ a: 1, extra: NaN }, {}], S('f(r: record[a: i64, b: text | none], s: record[__proto__: text | none]) -> text')],
    [[{}, { constructor: 'c', toString: 't' }], S('f(r: record[constructor: text | none], s: record[toString: text, constructor: text]) -> text')],
    [[new Map([['a', 1]])], S('f(r: record[a: i64]) -> text')],
    [[{ x: { a: NaN } }], S('f(r: record[x: json]) -> text')],
    [[[[{ a: 2 }, [1]], [{}, 'x']]], S('f(xs: list[tuple[json, list[i64]]]) -> text')],
    [[{ a: NaN }, 'not a list'], S('f(m: json, xs: list[i64]) -> text')],
    [[u8(7, 9)], S('f(xs: list[i64]) -> text')],
    [[[1, 2]], S('f(t: tuple[i64, i64, i64]) -> text')],
    [[[1, holey([1, 2, 3], 0)]], S('f(m: json) -> text')],
    [[Buffer.from([1, 2])], S('f(m: json) -> text')],
    [[/ab+/g], S('f(m: json) -> text')],
    [[new Number(3)], S('f(m: json) -> text')],
    [[-(2n ** 63n) - 1n], S('f(m: json) -> text')],
    [[undefined, [undefined]], S('f(m: json, n: list[json]) -> text')],
    [[[1, undefined]], S('f(m: json) -> text')],
    [[2 ** 53, -(2 ** 53), 4503599627370495.5, 0.1, 1e-7, 123.456, [18446744073709551615n, -9223372036854775808n, 3n]], S('f(...xs: json) -> text')],
    [[[1, [-(2 ** 53) - 2]]], S('f(m: json) -> text')],
    [[2n ** 53n + 1n, 3n, 2 ** 63, 2 ** 62, 4611686018427387904n], S('f(a: f64, b: f64, c: u64, d: i64, e: i64) -> text')],
    [[new String('x'), 1, 'true'], S('f(a: text, b: text, c: bool) -> text')],
    [['q"\\\n\t\b\f\r\u0001\u001f\u007f  é😀', ''], S('f(a: text, b: text) -> text')],
    [[{ a: 1 }, { b: -0 }], S('f(a: map[text, i64] | none, b: map[text, f64] | none) -> text')],
    [[5n, [1, 'a'], 1.5, { b: [true], a: null }], S('f(a: i64 | text, b: list[i64] | text, c: f64 | text, d: text | json) -> text')],
    [[undefined, null], S('f(a: text | f64, b: bool | f64 | none) -> text')],
    [[{ '-1': 'a', '01': 'b', 4294967295: 'c', 7: 'd' }, { 'a"b': 1, 'k\n': 2 }], S('f(m: json, n: map[text, i64]) -> text')],
    // #119 (r5b): the absent value, holes and integer-slot reasons
    [[undefined, [undefined], [undefined, undefined]], S('f(a: none, b: list[none], c: tuple[none, f64 | none]) -> text')],
    [[['x', undefined]], S('f(t: tuple[text, text]) -> text')],
    [[holey([1, 2, 3], 1)], S('f(t: tuple[i64, i64]) -> text')],
    [[-1], S('f(a: u64) -> text')],
    [[2.5], S('f(a: i64) -> text')],
    [holey([1, 2, 3, 4], 3), S('f(a: i64) -> text')],
    // chaos: malformed args / hand-built sig trees
    [null, S('f(a: i64) -> text')],
    [[1], {}],
    [[NaN, 2], { args: [{ name: 'a' }, { name: 'b', type: { k: 'f64' } }] }],
    [[1, 2], { args: [{ name: 'a', type: { k: 'f64' }, rest: true }, { name: 'b', type: { k: 'text' } }] }],
    [[1, 2], { args: [{ name: 'a', type: { k: 'i64' } }, { name: 'r', rest: true }] }],
    [[1], { args: [{ name: 'a', type: { k: 'i64' } }, { name: 'r', rest: true }] }],
    [[NaN], { args: [{ name: 'a', type: { k: 'union', alts: [{ k: 'text' }] } }] }],
    [[5], { args: [{ name: 'a', type: { k: 'union' } }] }],
    [[[1]], { args: [{ name: 'a', type: { k: 'list' } }] }],
    [[[1]], { args: [{ name: 'a', type: { k: 'tuple' } }] }],
    [[{}], { args: [{ name: 'a', type: { k: 'record' } }] }],
    [[NaN], { args: [{ name: 'a', type: { k: 'zzz' } }] }],
    [[1], { args: [{ name: 'a', type: {} }] }],
    [[undefined], { args: [{ name: 'a' }] }],
    [[undefined], { args: [{ name: 'a', type: { k: 'union' } }] }],
    [['x'], { args: [{ name: 'a', type: { k: 'tuple' } }] }],
    [holey([1, 2, 3], 2), { args: [{ name: 'a', type: {} }, { name: 'b', type: { k: 'i64' } }, { name: 'c', type: { k: 'i64' } }] }],
  ];
}

// ---- seeded random fill: random SIG trees (through the real parseSig) and mostly in-type values with specials
const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
const TEXTS = ['', 'a', 'hello', 'q"x', 'back\\slash', 'nl\nend', 'tab\t', '\u0000\u0008', 'é', '日本', '😀', ' ', '3ff0000000000000', '\ud83d', 'x\udc00'];
const F64S = [0, -0, 1, -1.5, 0.1, 1e21, 1e-7, 5e-324, 1.7976931348623157e308, NaN, Infinity, -Infinity, 2 ** 53 + 2, 2 ** 63];
const I64S = [0, 1, -1, 42, -0, 2 ** 31, -(2 ** 31), 9007199254740991, 2 ** 53, 9007199254740993n, 9223372036854775807n, -9223372036854775808n, 9223372036854775808n, 2.5];
const U64S = [0, 1, 255, -1, 4294967296, 9007199254740991, 18446744073709551615n, 18446744073709551616n, 9223372036854775808n];
const KEYS = ['a', 'b', 'k', 'x', 'zz', 'é', '2', '10'];
const SCALARS = ['text', 'bool', 'i64', 'u64', 'f64', 'json', 'bytes'];
const ODD = [null, undefined, 'odd', 3, true, 7n, [1], { o: 1 }, u8(4)];   // an out-of-kind value at a typed position

function genType(rnd, d) {
  const r = rnd();
  if (d >= 2 || r < 0.45) return pick(rnd, SCALARS);
  if (r < 0.57) return `list[${genType(rnd, d + 1)}]`;
  if (r < 0.67) { const n = 1 + Math.floor(rnd() * 3); return `tuple[${Array.from({ length: n }, () => genType(rnd, d + 1)).join(', ')}]`; }
  if (r < 0.76) return `map[text, ${genType(rnd, d + 1)}]`;
  if (r < 0.86) { const names = ['id', 'name', 'v', 'w'].slice(0, 1 + Math.floor(rnd() * 3)); return `record[${names.map((n) => `${n}: ${genType(rnd, d + 1)}`).join(', ')}]`; }
  if (r < 0.95) { const t = genType(rnd, d + 1); return t === 'json' ? 'f64 | none' : t.includes('|') ? t : `${t} | none`; }
  return pick(rnd, ['text | f64', 'f64 | text', 'i64 | text', 'bool | f64 | none']);
}

function sortedObj(entries) { const o = {}; for (const [k, v] of [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) o[k] = v; return o; }
function genJson(rnd, d) {
  const r = rnd();
  if (d >= 3 || r < 0.5) return pick(rnd, [null, true, false, 0, -0, 2.5, NaN, Infinity, 'x', '', 'é😀', 7, 12n, 2 ** 63, 'a\ud800']);
  if (r < 0.75) { const a = Array.from({ length: Math.floor(rnd() * 3) }, () => genJson(rnd, d + 1)); if (a.length > 1 && rnd() < 0.08) delete a[0]; return a; }
  const ks = [...new Set(Array.from({ length: Math.floor(rnd() * 3) }, () => pick(rnd, KEYS)))];
  return sortedObj(ks.map((k) => [k, genJson(rnd, d + 1)]));
}
function genValue(rnd, t) {
  if (rnd() < 0.04) return pick(rnd, ODD);
  switch (t.k) {
    case 'text': return pick(rnd, TEXTS);
    case 'bool': return rnd() < 0.5;
    case 'f64': return pick(rnd, F64S);
    case 'i64': return pick(rnd, I64S);
    case 'u64': return pick(rnd, U64S);
    case 'bytes': return Uint8Array.from({ length: Math.floor(rnd() * 4) }, () => Math.floor(rnd() * 256));
    case 'json': return genJson(rnd, 0);
    case 'none': return null;
    case 'list': return Array.from({ length: Math.floor(rnd() * 4) }, () => genValue(rnd, t.item));
    case 'tuple': return t.items.map((it) => genValue(rnd, it));
    case 'map': { const ks = [...new Set(Array.from({ length: Math.floor(rnd() * 3) }, () => pick(rnd, KEYS)))]; return sortedObj(ks.map((k) => [k, genValue(rnd, t.val)])); }
    case 'record': { const o = {}; for (const [n, ft] of t.fields) if (rnd() < 0.92) o[n] = genValue(rnd, ft); return sortedObj(Object.entries(o)); }
    case 'union': return genValue(rnd, pick(rnd, t.alts));
    default: return null;
  }
}
function randomCase(rnd) {
  const nArgs = Math.floor(rnd() * 4); const params = Array.from({ length: nArgs }, (_, i) => `p${i}: ${genType(rnd, 0)}`);
  const rest = rnd() < 0.15 ? `...r: ${genType(rnd, 1)}` : null; if (rest) params.push(rest);
  const sig = S(`f(${params.join(', ')}) -> text`);
  const args = sig.args.filter((a) => !a.rest).map((a) => genValue(rnd, a.type));
  const restA = sig.args.find((a) => a.rest); if (restA) for (let i = Math.floor(rnd() * 3); i > 0; i--) args.push(genValue(rnd, restA.type));
  if (!restA && rnd() < 0.04) args.push(genJson(rnd, 1));   // a surplus argument beyond the SIG
  return [args, sig];
}

// deep copy with every plain map's keys created in sorted UTF-16 order (holes, absent values and host objects kept as they are)
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
function sortKeys(v) {
  if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) if (i in v) a[i] = sortKeys(v[i]); return a; }
  if (!isPlain(v)) return v;
  const o = Object.create(Object.getPrototypeOf(v));
  for (const k of Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) Object.defineProperty(o, k, { value: sortKeys(v[k]), enumerable: true, writable: true, configurable: true });
  return o;
}

export function genInputs(n, rnd) {
  const out = curated().map((c) => (PROBES.has(c) ? c : sortKeys(c)));
  while (out.length < n) out.push(sortKeys(randomCase(rnd)));
  return out;
}
