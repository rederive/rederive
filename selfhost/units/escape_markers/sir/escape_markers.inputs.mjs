// escape_markers input generator (selfhost Tier 2, round 5). genInputs(n, rnd) -> n argument lists [value].
// Curated prefix first (every branch + boundary of canon.escapeMarkers), then seeded random JSON-ish trees with Maps.
// Every value survives the v0.4 legacy codec round trip the stamp applies (a Buffer stays a Buffer). Deliberately NOT emitted:
// Date / class instances / null-prototype objects / Map subclasses (the codec flattens them to a plain object or a plain Map,
// so the oracle could only ever record the flattened case), symbols, functions. Round 5i: also NOT emitted — values whose RESULT
// the js-native codec cannot encode: RegExp, boxed primitives, and any result node deeper than 100 (a hole counts there for
// the codec, never for escapeMarkers). Round 5j (#153): Sets are descended, so __t-keyed Set members are emitted again.

const CAP = 100;   // MAX_VALUE_DEPTH of the authority (round 5, #78)
const wrapA = (k, leaf) => { let v = leaf; for (let i = 0; i < k; i++) v = [v]; return v; };
const wrapM = (k, leaf, key) => { let v = leaf; for (let i = 0; i < k; i++) v = { [key]: v }; return v; };
const wrapMix = (k, leaf) => { let v = leaf; for (let i = 0; i < k; i++) v = i % 2 ? [v] : { k: v }; return v; };
const wrapMap = (k, leaf) => { let v = leaf; for (let i = 0; i < k; i++) v = new Map([['k', v]]); return v; };
const sparse = (len, entries) => { const a = new Array(len); for (const [i, x] of entries) a[i] = x; return a; };
const protoKey = () => JSON.parse('{"__proto__":{"__t":"x"},"a":1}');   // an OWN "__proto__" key

function curated() {
  return [
    // --- the three marker keys, text values (frozen-slice essentials)
    [{ __t: 'bigint', v: '1' }],
    [{ __throw: 'boom' }],
    [{ __threw: 'boom' }],
    // --- presence, not value type: non-text marker values
    [{ __t: 5 }],
    [{ __throw: null }],
    [{ __threw: [1, 2] }],
    // --- plain maps with no marker key, and look-alike keys
    [{ a: 1, b: 'x' }],
    [{ __T: 'x', _t: 'y', '__t ': 'z', __throws: 'w', threw: 1, t: 2 }],
    // --- nesting: markers at depth, inside lists, inside an escaped map
    [{ a: { b: { __threw: 'deep' } } }],
    [[1, { __t: 'num', v: 'NaN' }, [{ __throw: 'x' }]]],
    [{ __t: 'obj', v: { __throw: 'inner' } }],
    [{ __threw: 'x', __throw: 'y', __t: 'z', z: 1 }],
    // --- the JS Map (#81): values AND keys descended, the Map itself never wrapped
    [new Map([['a', { __throw: 'boom' }]])],
    [new Map([['__t', 'x'], ['__throw', 'y']])],
    [new Map([[{ __t: 'k' }, 1], [2, { a: { __threw: 'v' } }]])],
    [{ m: new Map([['x', [{ __threw: 'y' }]]]) }],
    // --- holes, pass-through
    [sparse(3, [[0, 1], [2, { __t: 'h' }]])],
    [new Set([{ __t: 'bigint', v: '1' }, { __throw: 'in-set' }])],   // #153 collision probe: Set members escaped (else this grades as Set{1n})
    [Buffer.from([0, 95, 255])],
    // --- the depth cap (100): the leaf counts, a hole is never visited, a Map entry is one deeper
    [wrapA(CAP, 1)],
    [wrapA(CAP + 1, 1)],
    [wrapMap(CAP, 'x')],
    [wrapMap(CAP + 1, 'x')],
    [null],
    // ---- held-out from here on (heldout = vectors 24..71)
    [{ __t: { a: 1 } }],
    [{ __throw: true }],
    [{ b: 1, 2: 'two', a: { __t: 1 }, 1: 'one' }],
    [sparse(4, [])],
    [[[sparse(2, [[1, { __threw: 'x' }]])]]],
    [new Map()],
    [new Map([[null, { __t: 1 }], [NaN, [{ __throw: 'n' }]], [3n, new Map([['__threw', { __threw: 'mm' }]])]])],
    [new Map([[[{ __t: 'listkey' }], new Set([{ __t: 's' }])]])],
    [new Map([['u', Uint8Array.from([1])], ['b', Buffer.from([2])], ['d', undefined]])],
    [{ __t: 'map', entries: [] }],
    ['__t'],
    [-0],
    [{}],
    [3.5],
    [true],
    [''],
    [NaN],
    [Infinity],
    [undefined],
    [12345678901234567890n],
    [new Set([[{ __t: 'listed' }], { __threw: 'x' }, new Set([{ __t: 'inner' }])])],   // members escaped at every Set depth
    [new Set([1n])],                                       // the collision probe's contrast: a real bigint member
    [Uint8Array.from([0, 95, 255])],
    [{ a: undefined, __t: undefined }],
    [[undefined, , null]],
    [protoKey()],
    [{ é: { __t: 'ü' }, '😀': [{ __threw: '' }] }],
    [{ __t: '' }],
    [{ v: { v: { __throw: 'v' } } }],
    [[[[{ __t: 'a' }], { __threw: 'b' }], { c: [{ __throw: 'd' }] }]],
    [{ m: new Map([['k', 1]]), u: Uint8Array.from([1]), s: new Set([1]), n: { __t: 1 } }],
    // --- the depth cap, more shapes
    [wrapA(CAP, [])],
    [wrapA(CAP, [0])],
    [wrapA(CAP - 1, sparse(2, []))],   // round 5i: holes at depth 100 — the deepest a hole can sit in an ENCODABLE result
    [wrapA(CAP, sparse(2, [[1, 0]]))],
    [wrapM(CAP, 'x', 'k')],
    [wrapM(CAP + 1, 'x', 'k')],
    [wrapM(CAP / 2, {}, '__t')],   // #155: every level escaped -> the escaped result is 2 x 50 = 100 deep, the deepest that grades
    [wrapMix(CAP, 'leaf')],
    [wrapMix(CAP + 1, 'leaf')],
    [wrapA(CAP - 1, new Map([[{ __t: 'key-at-cap' }, 1]]))],
    [wrapA(CAP - 1, new Map([[1, [0]]]))],
    [wrapA(CAP - 1, new Map([[[0], 1]]))],
    [wrapA(CAP, new Map())],
    [wrapA(CAP, new Map([['k', 1]]))],
    [wrapA(CAP, new Set())],          // an empty Set at the cap returns
    [wrapA(CAP - 1, new Set([1]))],   // a Set member at depth 100 returns
    [wrapA(CAP, new Set([1]))],       // a Set member at depth 101 throws (#153: members count toward R1)
  ];
}

const KEYS = ['__t', '__throw', '__threw', 'v', 'a', 'b', '__T', '_t', 'x y', '0', '10', 'é', '__proto__', 't'];
const TEXTS = ['', 'obj', 'bigint', 'num', 'x', 'boom', 'é', '😀', '__t'];
function scalar(rnd) {
  const r = rnd();
  if (r < 0.3) return TEXTS[Math.floor(rnd() * TEXTS.length)];
  if (r < 0.55) return Math.floor(rnd() * 2001) - 1000;
  if (r < 0.65) return Math.floor(rnd() * 1e6) / 64;
  if (r < 0.75) return rnd() < 0.5;
  if (r < 0.85) return null;
  if (r < 0.9) return undefined;
  if (r < 0.94) return [NaN, -0, Infinity, -Infinity][Math.floor(rnd() * 4)];
  if (r < 0.96) return BigInt(Math.floor(rnd() * 1e9));
  if (r < 0.98) return rnd() < 0.5 ? Buffer.from([Math.floor(rnd() * 256)]) : Uint8Array.from([Math.floor(rnd() * 256)]);
  return new Set([{ __t: 'm' }]);
}
function tree(rnd, d) {
  const r = rnd();
  if (d <= 0 || r < 0.3) return scalar(rnd);
  if (r < 0.45) {
    const len = Math.floor(rnd() * 5); const a = new Array(len);
    for (let i = 0; i < len; i++) if (rnd() > 0.15) a[i] = tree(rnd, d - 1);   // ~15% holes
    return a;
  }
  if (r < 0.6) {
    const m = new Map(); const k = Math.floor(rnd() * 4);
    for (let i = 0; i < k; i++) {
      const kr = rnd();
      const key = kr < 0.5 ? KEYS[Math.floor(rnd() * KEYS.length)] : kr < 0.7 ? Math.floor(rnd() * 10) : kr < 0.8 ? null : tree(rnd, d - 1);
      m.set(key, tree(rnd, d - 1));
    }
    return m;
  }
  const o = {}; const k = Math.floor(rnd() * 5);
  for (let i = 0; i < k; i++) {
    const key = KEYS[Math.floor(rnd() * KEYS.length)];
    Object.defineProperty(o, key, { value: tree(rnd, d - 1), enumerable: true, writable: true, configurable: true });
  }
  return o;
}

export function genInputs(n, rnd) {
  const out = curated();
  while (out.length < n) {
    const d = 1 + Math.floor(rnd() * 6);
    out.push([tree(rnd, d)]);
  }
  return out;
}
