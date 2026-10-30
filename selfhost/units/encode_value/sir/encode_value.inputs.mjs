// encode_value input generator: genInputs(n, rnd) -> list of [value, type] argument lists.
// Curated coverage prefix first (dense vectors: a `list[X | json]` shows per element whether X accepts it), then a seeded
// random fill of in-envelope json values against random type strings. Deterministic from rnd().
// The stamp takes 24 frozen + 48 held-out = 72 inputs: the curated prefix is sized to exactly that, so every probe lands.

// ---- curated prefix -------------------------------------------------------------------------------------------------
const TWO_ORDER_KEYS = { a: 1, 'a ': 2, 'a!': 3, aA: 4, 'a\n': 5, '"': 6, '\\': 7, '\u{1F600}': 8, '': 9, '\u007f': 10, '\u0001': 11, 'é': 12, '': 13 };

// k nested lists around a leaf (R13). Under `json` the outermost list is depth 0 and the leaf depth k: nest(100) is AT the cap
// (encodes), nest(101) past it (throws). EVERY vector must fit the codec's 100-value cap on BOTH sides — its args AND its
// expected result (the shared codec and the js extension's encodeJsNative cap alike; FINDINGS #137). An encoded node tree nests
// 2 json levels per list level and 3 per map level (+1 for a leaf node's members), so a result fits only while the value is at
// most 49 list levels deep (nest(49) fits, nest(50) does not) or 33 map levels (nestMap(33) fits, nestMap(34) does not) —
// computed against the real encoder + both codecs, not guessed. So the cap is pinned from two sides: ACCEPT by the deepest
// probes whose result still fits (shared vectors), REFUSE by past-cap ARGS whose result is a throw, a shallow node (their args
// are past the shared codec's cap, so they ride the js extension). No probe sits between (value depth 50..100 under lists,
// 34..100 under maps): its result is unencodable by any oracle codec.
const nest = (k, leaf = 0) => { let v = leaf; for (let i = 0; i < k; i++) v = [v]; return v; };
const nestMap = (k, leaf = 0) => { let v = leaf; for (let i = 0; i < k; i++) v = { k: v }; return v; };
const deep = (n, leaf = 'text') => 'list['.repeat(n) + leaf + ']'.repeat(n);   // R1 type cap: 16 composites deep parse, 17 throw

function curated() {
  const proto = { ['__proto__']: 1, a: 2 };   // an OWN key spelled __proto__ (computed key), never the prototype
  const num = (v) => ({ __t: 'num', v });
  const big = (v) => ({ __t: 'bigint', v });
  const obj = (v) => ({ __t: 'obj', v });
  return [
    // --- frozen-facing spread (first 24) ---
    ['hello', 'text'],
    [{ b: 1, a: 'x', c: [true, null] }, 'json'],
    [[1, 1.5, 9007199254740992, 9223372036854774784, 9223372036854775808, -9223372036854775808, -9223372036854777856, 1e300, 0.1, -7], 'list[i64 | json]'],
    [[0, -1, 18446744073709549568, 18446744073709551616, 9223372036854775808, 2.5], 'list[u64 | json]'],
    [[0, 1.5, -2.5e-7, 1e21, 1e20, 123456789012345680000, 5e-324, 1.7976931348623157e308, 0.000001, 1e-7, 0.000001234, 100, 9007199254740994, -1e21, 123.456, 2 ** -1074 * 3, -1928372706752270.2, 74379223166033.62], 'list[f64]'],
    [[NaN, -0, Infinity, -Infinity], 'list[f64]'],
    [TWO_ORDER_KEYS, 'map[text, f64]'],
    [{ a: 'x', c: null, extra: 1 }, 'record[a: text, b: none, c: text | none, d: none | json]'],
    [[1, 1.5, 'x', null, true], 'list[i64 | f64 | text | none | bool]'],
    // R3 marker shape: exactly one own text member is a throw; any other member makes it a map
    [[{ __throw: 'a' }, { __threw: 'b' }, { __throw: 5 }, { __throw: 'a', x: 1 }, { __threw: 'b', __throw: 'c' }, { __t: 'num', v: '5', __throw: 'x' }, 'ok'], 'list[text | json]'],
    [{ __throw: 'boom' }, 'i64'],
    [{ __throw: 'boom', a: 1 }, 'record[a: f64]'],
    [obj('ab'), 'json'],
    [[1, 'a', null], 'tuple[i64, text, none]'],
    [nest(49), 'json'],   // R13 accept bound: the deepest list nesting whose RESULT fits the codec cap
    [[true, 0, 1, 'true', null], 'list[bool | json]'],
    [{ z: [{ y: null }], a: {}, m: 'é\u{1F600}', n: -3.25 }, 'json'],
    [[num('1E3'), num('1000.0'), num('-Infinity'), num('0.5e-2'), num('0e5'), num('0.000'), num('3e-324'), num('-0'), num('NaN'), { __t: 'num', v: '5', x: 1 }], 'list[f64]'],
    [num('1e-400'), 'f64'],
    [obj({ __t: 'num', __throw: 'x', k: [1] }), 'json'],
    ['x', ' \t text \n'],
    [[['x']], 'list[json] | list[text]'],
    [{ a: 'x', b: 5 }, 'record[a: text, b: none] | record[a: text]'],
    [nest(101), 'json'],
    // --- held-out-facing (subtle points) ---
    [TWO_ORDER_KEYS, 'json'],
    [[-0, -0, -0], 'tuple[i64, u64, json]'],
    [{ a: { __throw: 'x' }, b: { __threw: 'y' } }, 'json'],
    [[{ __threw: 'x', __t: 'obj', v: {} }, { __throw: 'q', a: { __throw: 'r' } }], 'list[json]'],
    [proto, 'map[text, f64]'],
    [proto, 'record[__proto__: f64, constructor: text | none, a: u64]'],
    [{}, 'record[a: json]'],
    [['x', 'y'], 'map[text, text]'],
    [['p', 'q'], 'record[a: text]'],
    // grammar: every one of these throws
    [1, 'TEXT'],
    ['x', 'text|'],
    [[1], 'list[f64, text]'],
    [{ tex: 'q' }, 'record[text]'],
    [{ a: 1 }, 'record[a: f64, a: f64]'],
    [{ a: 'x' }, 'record[a: text, b: none] | record[b: none, a: text]'],
    [null, 'json | none'],
    [['a'], 'json | tuple[text]'],
    [{ a: 'x', b: { __t: 'undef' } }, 'json | record[a: text]'],
    [{ a: 'x' }, 'record[a: text] | record[a: text, b: none]'],
    [{}, 'map[text, json] | map[text, text]'],
    [[], 'list[text | json] | list[json]'],
    [[], deep(17)],
    // grammar: these parse (whitespace between any tokens; distinct, reachable alternatives; the cap itself)
    [['a', null], 'tuple[text, none] | tuple[none, text]'],
    [['a', null], 'list[text] | list[text | none]'],
    [[big('5')], 'json | tuple[i64]'],
    [{ a: 1 }, 'json | map[json, f64]'],
    [[nest(15, 'z'), nest(14, [])], 'tuple[' + deep(15) + ', ' + deep(15) + ']'],
    [{ a: [{ k: [nest(12, 'q')] }] }, 'record[a: ' + 'list[map[text, list[' + deep(12) + ']]]' + ']'],
    // legacy codec tags carried in the value
    [num('-0.0'), 'f64'],
    [num('-1e-400'), 'json'],
    [num('1e999'), 'f64 | none'],
    [[big('9223372036854775807'), big('0'), big('-5'), num('2.5'), { __t: 'undef' }, big('5'), 5], 'list[i64 | none | json]'],
    [big('-0'), 'i64'],
    [big('18446744073709551615'), 'f64 | json | i64 | u64'],
    [{ a: { __t: 'undef' } }, 'record[a: none, b: f64 | none]'],
    [{ __t: 'regex', source: 'a', flags: '' }, 'json'],
    [obj({ __throw: 'x' }), 'text | none | json'],
    [obj({ a: { __throw: 'x' }, b: num('2') }), 'map[text, text | f64]'],
    [obj({ v: '7', __t: 'x' }), 'record[v: text, __t: text]'],
    // R13 the value-depth cap: a child value is one deeper; unions, the json position and tags add nothing
    [[nest(48), nest(47, { a: [] })], 'list[none | json] | none'],
    [nest(101), 'list[json] | none'],
    [nestMap(32, obj({ k: num('1') })), 'json'],   // accept bound for maps: the escaped map's entry value sits at depth 33
    [nestMap(101), 'json'],
    [nest(100, obj({ a: num('1') })), 'json'],   // refuse: the escaped map at depth 100 is fine, its entry value (a child) at 101 throws
    [nest(16, nest(85)), deep(16, 'json')],
    // js-only envelope widening (no language-neutral form; routed to the js extension by the encoder)
    [[2n ** 63n, 2n ** 64n - 1n], 'list[u64]'],
    [new Map([['b', 1], [2, 2], ['a', 3]]), 'map[text | i64, f64]'],
    ['\ud800', 'text'],
  ];
}

// ---- random fill ----------------------------------------------------------------------------------------------------
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const SCALARS = ['text', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const NAMES = ['a', 'b', 'k', 'x y', 'é', '0', '1', 'v', 'Z'];
const IDENTS = ['a', 'b', 'k', 'v', 'x_y', 'Z', '_q', 'n1'];
const STRS = ['', 'a', 'B', 'hello world', 'é', '\u{1F600}', '', 'tab\there', 'q"uote', 'back\\slash', '\u0001', ' lead', 'a!', 'a '];
const NUMS = [0, 1, -1, 2, 1.5, -2.75, 100, 1e21, 1e-7, 0.1, 9007199254740993, 9223372036854775808, -9223372036854775808, 18446744073709551616, 3.14159, 255, -1e300];
const ws = (rnd) => pick(rnd, ['', '', '', ' ', '  ', '\t']);

const kw = (rnd, w) => w + (rnd() < 0.15 ? pick(rnd, [' ', '\t', '\n ']) : '') + '[';   // whitespace may sit between a keyword and its bracket

function genType(rnd, d) {
  const r = rnd();
  if (d <= 0 || r < 0.4) return pick(rnd, SCALARS);
  if (r < 0.55) return `${kw(rnd, 'list')}${ws(rnd)}${genType(rnd, d - 1)}${ws(rnd)}]`;
  if (r < 0.67) { const k = 1 + Math.floor(rnd() * 3); return `${kw(rnd, 'tuple')}${Array.from({ length: k }, () => genType(rnd, d - 1)).join(',' + ws(rnd))}]`; }
  if (r < 0.78) return `${kw(rnd, 'map')}${pick(rnd, ['text', 'json', 'text | none', 'none | text'])}, ${genType(rnd, d - 1)}]`;
  if (r < 0.88) { const k = 1 + Math.floor(rnd() * 3); const names = [...new Set(Array.from({ length: k }, () => pick(rnd, IDENTS)))]; return `${kw(rnd, 'record')}${names.map((nm) => `${nm}${ws(rnd)}:${ws(rnd)}${genType(rnd, d - 1)}`).join(', ')}]`; }
  if (r < 0.93) {   // R2 structural coverage: two alternatives of ONE shape (list / tuple / map pointwise, record field subsets)
    const a = genType(rnd, d - 1), b = genType(rnd, d - 1), wrap = (x) => (x.includes('|') && rnd() < 0.5 ? `list[${x}]` : x);
    const shape = pick(rnd, ['list', 'tuple', 'map', 'record', 'json']);
    if (shape === 'list') return `list[${a}] | list[${b}]`;
    if (shape === 'tuple') return rnd() < 0.7 ? `tuple[${a}, text] | tuple[${b}, text]` : `tuple[${a}] | tuple[${b}, none]`;
    if (shape === 'map') return `map[${pick(rnd, ['text', 'text | none', 'json'])}, ${a}] | map[${pick(rnd, ['text', 'text | none', 'json'])}, ${b}]`;
    if (shape === 'record') { const f1 = rnd() < 0.5 ? `a: ${a}` : `a: ${a}, b: ${wrap(b)}`, f2 = pick(rnd, [`a: ${b}`, `b: ${b}, a: ${a}`, `a: ${b}, c: none`]); return `record[${f1}] | record[${f2}]`; }
    return `json | ${a}`;
  }
  const k = 2 + Math.floor(rnd() * 2); let alts = Array.from({ length: k }, () => genType(rnd, d - 1)).map((t) => (t.includes('|') ? `list[${t}]` : t));
  if (rnd() < 0.85) alts = [...new Set(alts)];   // mostly distinct alternatives; a repeat or an unreachable one (a refusal) now and then
  return alts.length > 1 ? alts.join(ws(rnd) + '|' + ws(rnd)) : alts[0];
}

const TAGS = [{ __t: 'num', v: '2.5' }, { __t: 'num', v: 'NaN' }, { __t: 'num', v: '-0' }, { __t: 'num', v: '1E2' }, { __t: 'num', v: '1e-400' }, { __t: 'bigint', v: '12' }, { __t: 'undef' }, { __t: 'obj', v: { __t: 'q', k: 1 } }, { __throw: 'x' }, { __threw: 'y' }, { __throw: 'x', k: 1 }];

function randJson(rnd, d) {
  const r = rnd();
  if (r < 0.04) return structuredClone(pick(rnd, TAGS));
  if (r < 0.12) return null;
  if (r < 0.22) return rnd() < 0.5;
  if (r < 0.45) return pick(rnd, NUMS);
  if (r < 0.68 || d <= 0) return pick(rnd, STRS);
  if (r < 0.84) return Array.from({ length: Math.floor(rnd() * 4) }, () => randJson(rnd, d - 1));
  const o = {}; for (let i = Math.floor(rnd() * 4); i > 0; i--) o[pick(rnd, NAMES.concat(STRS.slice(0, 6)))] = randJson(rnd, d - 1); return o;
}

// split a type string at top-level `sep` (bracket depth 0), mirroring the grammar
function splitTop(s, sep) { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '[') depth++; if (ch === ']') depth--; if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()).filter(Boolean); }

// a value that (usually) fits the type string
function fitValue(rnd, t, d) {
  t = t.trim();
  if (rnd() < 0.12) return randJson(rnd, 2);   // deliberate misfit
  const alts = splitTop(t, '|'); if (alts.length > 1) return fitValue(rnd, pick(rnd, alts), d);
  let m;
  if ((m = t.match(/^list\s*\[(.*)\]$/s))) return Array.from({ length: Math.floor(rnd() * 4) }, () => fitValue(rnd, m[1], d - 1));
  if ((m = t.match(/^tuple\s*\[(.*)\]$/s))) return splitTop(m[1], ',').map((it) => fitValue(rnd, it, d - 1));
  if ((m = t.match(/^map\s*\[(.*)\]$/s))) { const [, v] = splitTop(m[1], ','); const o = {}; for (let i = Math.floor(rnd() * 4); i > 0; i--) o[pick(rnd, STRS)] = fitValue(rnd, v, d - 1); return o; }
  if ((m = t.match(/^record\s*\[(.*)\]$/s))) { const o = {}; for (const p of splitTop(m[1], ',')) { const i = p.indexOf(':'); if (rnd() < 0.85) o[p.slice(0, i).trim()] = fitValue(rnd, p.slice(i + 1), d - 1); } return o; }
  switch (t) {
    case 'text': return pick(rnd, STRS);
    case 'bool': return rnd() < 0.5;
    case 'none': return null;
    case 'i64': return pick(rnd, [0, 1, -1, 42, -9223372036854775808, 9223372036854774784, 9007199254740993, 1.5]);
    case 'u64': return pick(rnd, [0, 1, 42, 18446744073709549568, 9223372036854775808, -1]);
    case 'f64': return pick(rnd, NUMS);
    default: return randJson(rnd, 2);
  }
}

export function genInputs(n, rnd) {
  const out = curated();
  while (out.length < n) {
    if (rnd() < 0.03) {   // R13 from both sides of what an oracle can carry: past the cap (a throw) or within the result bound
      const t = pick(rnd, ['json', 'list[json] | json', 'none | json']), f = pick(rnd, [nest, nestMap]);
      const k = rnd() < 0.5 ? 101 + Math.floor(rnd() * 4) : (f === nest ? 44 : 28) + Math.floor(rnd() * 5);   // leaf adds <= 1 level: <= 49 / <= 33
      out.push([f(k, randJson(rnd, 1)), t]); continue;
    }
    const t = genType(rnd, 2); out.push([fitValue(rnd, t, 2), t]);
  }
  return out;
}
