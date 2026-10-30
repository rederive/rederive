// Input generator for unit canonical_string (rederive cli/sir/canon.mjs canonicalString, authority bb8ded84fa50).
// genInputs(n, rnd) -> [[value], ...]. The domain is a CANONICAL TREE (text, bool, list, map; numbers and none only as tagged
// maps). Curated prefix first (frozen = the first 24: the format, the projections, the key-order and escaping traps, two
// throws), then held-out traps, then ONE out-of-domain probe per throw rule, then a seeded fill of realistic typed values
// and vector-set shapes. js-only probes (absent value, hole, big integer, host object, lone surrogate) are routed to the js
// extension by tooling. Never emitted: callables/symbols (not codec-faithful), null-prototype objects (the legacy codec
// rebuilds them as plain maps), a "__proto__" key, shared nesting deeper than value depth 100 (the neutral codec's cap).
// Round 5: the nesting cap (R10, a node deeper than RAW_CAP = 416 throws) is probed by the CAP probes below, now ON: 416 is
// far inside the default host stack (the stamp STOPS on a host overflow, so a clean stamp proves it) and inside the js
// extension's codec. They are deeper than the neutral codec's 100 value levels, so encode-oracle routes them to the js
// extension (js, ts graded); rust never receives them (its language file: R10 ungraded there). The deepest SHARED vectors sit
// exactly at value depth 100 (rust: 101 levels on its args line, under serde_json's 128).
export const CAP_PROBES = true;
const f64bits = (x) => { if (Number.isNaN(x)) return '7ff8000000000000'; const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, '0'); };
const f64str = (x) => Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : Object.is(x, -0) ? '-0' : String(x);
const tf = (x) => ({ t: 'f64', v: f64str(x), bits: f64bits(x) });
const tt = (v) => ({ t: 'text', v, cu: 'utf8' });
const NONE = { t: 'none' };
const ti = (v) => ({ t: 'i64', v: String(v) });
// the json -> typed-tree tagging the lab's encoder performs (json maps sorted by key code units)
const tagJson = (v) => v === null ? NONE : typeof v === 'boolean' ? { t: 'bool', v } : typeof v === 'number' ? tf(v) : typeof v === 'string' ? tt(v)
  : Array.isArray(v) ? { t: 'list', v: v.map(tagJson) } : { t: 'map', v: Object.keys(v).sort().map((k) => [tt(k), tagJson(v[k])]) };
const vecSet = (frozen, heldout) => ({ frozen: frozen.map(([args, expected]) => ({ args, expected })), heldout: heldout.map(([args, expected]) => ({ args, expected })) });
const deepList = (d, leaf) => { let v = leaf; for (let i = 0; i < d; i++) v = { t: 'list', v: [v] }; return v; };
// raw (untagged) chains: the innermost node sits at node depth k (the top value is depth 0)
const rawList = (k, leaf) => { let v = leaf; for (let i = 0; i < k; i++) v = [v]; return v; };
const rawMap = (k, leaf) => { let v = leaf; for (let i = 0; i < k; i++) v = { a: v }; return v; };
const CAP = 416;   // RAW_CAP = 4 x MAX_VALUE_DEPTH + 16
const ALL_CTRL = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('');

export const capProbes = () => [
    rawList(CAP, 'x'),                              // text leaf at depth 416: renders
    rawList(CAP + 1, 'x'),                          // text leaf at depth 417: throws
    rawMap(CAP, true),                              // bool leaf at depth 416 under maps: renders
    rawMap(CAP + 1, true),                          // at 417: throws
    rawList(CAP, []),                               // the innermost EMPTY list at depth 416: renders
    rawList(CAP - 1, { t: 'f64', bits: '3ff0000000000000' }),   // f64 map at 415, its projected entries at 416: renders
    rawList(CAP, { t: 'f64', bits: '3ff0000000000000' }),       // f64 map at 416, projected bits at 417: throws
    rawList(CAP, { t: 'throw', msg: 'm' }),         // throw map at 416: its projected "t" text sits at 417 -> throws
    { t: 'throw', msg: rawList(CAP + 1, 'x') },     // a too-deep tree under a DROPPED key is never examined: renders
    { t: 'f64', bits: '0000000000000000', v: rawMap(CAP + 1, null) },   // dropped under f64, a raw none at 418 too: renders
    deepList(207, tt('leaf')),                      // a typed list chain, 2 depths per level: text node at 414, its v at 415: renders
    deepList(208, tt('leaf')),                      // text node at 416, its entries at 417: throws
];

export function curated() {
  return [
    // ---- frozen (24)
    'plain text',
    true,
    [],
    {},
    tf(1),
    tf(NaN),
    { t: 'f64', v: 'display hint ignored', bits: '8000000000000000', extra: 'dropped' },
    { t: 'throw', msg: 'boom' },
    { t: 'list', v: [ti(42), tt('x'), NONE, { t: 'bool', v: true }] },
    { t: 'map', v: [[tt('a'), tf(Infinity)], [tt('k'), tf(-0)]] },
    { t: 'record', v: [['result', tt('r')], ['post', { t: 'map', v: [] }]] },
    vecSet([[[tt('a'), tf(2)], tt('"a"')], [[NONE], { t: 'throw', msg: 'x' }]], [[[tf(-1.5)], { t: 'bool', v: false }]]),
    { b: 'x', a: [true, false], c: {} },
    'q"uote back\\slash',
    '\b\f\n\r\t',
    { '10': 'a', '2': 'b', '': 'c', B: 'd', a: 'e', é: 'f' },
    { '': '1', '😀': '2', '￿': '3', z: '4' },
    [[], {}, [[]], { a: {} }, ''],
    'a b c/d\x7fe',
    { t: 'f64' },
    [1, 'x'],
    { t: 'f64', bits: 'not dropped', v: 1 },
    { t: 'tuple', v: [tf(-0), tf(NaN), tf(-Infinity), tf(255), tf(1e-7), tf(5e-324), tf(1e21)] },
    tagJson({ name: 'x', list: [1, null, 'two', false], nested: { k: -0.5 } }),
    // ---- held-out: in-domain traps
    ALL_CTRL,
    '😀é漢字 ﻿',
    { aa: '1', a: '2', ab: '3', '': '4', A: '5', '~': '6', 'a\u0000': '7' },
    { '"': '1', '\n': '2', '\\': '3', '\u0001': '4', '\u007f': '5', ' ': '6' },
    { 'Ā': '1', 'ā': '2', 'z': '3', '￯': '4', '𐀀': '5', '퟿': '6' },
    { '1': 'x', '01': 'y', '-1': 'z', '1.5': 'w', '9': 'v', '10': 'u' },
    { t: 'f64', bits: '0000000000000000', v: 7, junk: [1, null] },
    { t: 'throw', msg: 5, other: null },
    { t: 'F64', bits: 'x', v: 'y' },
    { t: 'f64 ', bits: 'x' },
    { t: ['f64'], bits: 'x' },
    { t: true, v: 'x' },
    { t: 'bytes', v: 'base64:AAEC/w==' },
    [{ t: 'f64', v: 'a', bits: '3ff0000000000000', c: 'drop' }, { k: { t: 'throw', msg: 'deep' } }],
    vecSet([], [[[{ t: 'map', v: [[tt('😀'), tf(1)], [tt(''), tf(2)]] }], tt('{"":2}')]]),
    { unit: 'x', sig: 'f(a: json) -> text', encoding: 'sir-canonical-v1', ...vecSet([[[tt('')], tt('""')]], []) },
    '',
    // ---- held-out: the nesting cap (R10), deepest accepted and first refused (js extension: see CAP_PROBES)
    ...(CAP_PROBES ? capProbes() : []),
    rawList(99, { t: 'f64', bits: '0000000000000001' }),    // the deepest shared: 99 lists + a map, its bits at value depth 100
    rawList(100, 'x'),                              // a text leaf at value depth 100 (rust: 101 levels on the args line)
    // ---- held-out: one out-of-domain probe per throw rule
    3,                                              // raw number
    { t: 'list', v: [NONE, 0] },                    // raw number nested
    null,                                           // raw none
    { a: null },                                    // raw none nested
    { t: 'f64', bits: '3FF0000000000000' },         // upper-case hex bits
    { t: 'f64', bits: '3ff000000000000' },          // 15 hex digits
    { t: 'f64', bits: 1 },                          // bits not text
    { t: 'f64', bits: '3ff0000000000000\n' },      // 16 hex + a trailing line feed (17 characters)
    [undefined],                                    // js: absent value
    [tt('a'), , tt('b')],                           // js: hole
    10n,                                            // js: big integer
    new Map([['a', 'b']]),                          // js: host object
    '\ud800 lone',                                  // js: unpaired surrogate (renders, escaped)
  ];
}

const KEYS = ['a', 'b', 'B', 'aa', '', '10', '2', 'v', 'bits', 'msg', 'é', '😀', '', '￿', '"', '\n', 'k\\', ' ', 'z'];
const STRS = ['', 'x', 'f64', 'throw', 'a"b', '\\', '\t\u0000\u001f', ' ', '😀', 'é', '/', '\u007f', 'null', 'utf8'];
const NUMS = [0, -0, 1, -1, 0.5, 1e21, 1e-7, 123.456, NaN, Infinity, -Infinity, 2 ** 53, 7e-10, 5e-324];

export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const leaf = () => { const s = rnd(); return s < 0.35 ? tf(pick(NUMS)) : s < 0.6 ? tt(pick(STRS)) : s < 0.7 ? NONE : s < 0.8 ? { t: 'bool', v: rnd() < 0.5 } : s < 0.9 ? ti(Math.floor(rnd() * 1e6) - 5e5) : { t: 'throw', msg: pick(STRS) }; };
  const typed = (d) => {
    const r = rnd(); if (d <= 0 || r < 0.35) return leaf();
    const len = Math.floor(rnd() * 4);
    if (r < 0.6) return { t: pick(['list', 'tuple']), v: Array.from({ length: len }, () => typed(d - 1)) };
    if (r < 0.85) return { t: 'map', v: Array.from({ length: len }, () => [tt(pick(KEYS)), typed(d - 1)]) };
    return { t: 'record', v: Array.from({ length: len }, () => [pick(KEYS), typed(d - 1)]) };
  };
  const out = curated().map((v) => [v]);
  while (out.length < n) {
    const k = rnd();
    if (k < 0.5) out.push([typed(1 + Math.floor(rnd() * 4))]);
    else out.push([vecSet(Array.from({ length: 1 + Math.floor(rnd() * 2) }, () => [[typed(2)], typed(2)]), Array.from({ length: Math.floor(rnd() * 2) }, () => [[typed(1), typed(1)], typed(2)]))]);
  }
  return out;
}
