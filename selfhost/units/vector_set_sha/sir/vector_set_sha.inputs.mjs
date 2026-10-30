// Input generator for unit vector_set_sha (rederive cli/sir/canon.mjs vectorSetSha, authority bb8ded84fa50; round 5 re-cut).
// genInputs(n, rnd) -> [[oracle], ...]. An oracle is a json map with lists `frozen` and `heldout` of cases {name?, args,
// expected, ...}; args/expected are CANONICAL TREES (typed-value maps such as {t:'f64',bits}, {t:'text',v,cu}).
// Curated prefix: the minimal shapes, the ignored fields (name, extra case keys, extra top-level keys), the order and
// partition sensitivity, the projections inherited from canonical_string (f64 v ignored, throw msg ignored), then one probe
// per throw path (oracle not a map, frozen/heldout missing or not a list, case not a map, args/expected missing, raw
// number/none inside a tree, bad f64 bits), then the NESTING CAP (R5, round 5: canonicalString's raw cap 416): the deepest
// NEUTRAL values (depth 97 below args/expected = the codec's 100-value cap, measured from the oracle), then the cap itself:
// inside args/expected a reached value at depth 413 renders and 414 throws; an f64 or throw node renders at 412 and throws at
// 413 (its own texts sit one level lower); a 480-deep list throws. The cap probes nest past the codec's cap, so the lab routes
// them to the js-only extension; all are small and stamp on the DEFAULT stack. Then a seeded fill of realistic oracles. Never emitted: a "__t" key (the lab's
// legacy codec would decode it), a top-level {__throw} map, a "__proto__" key, any non-json host value.
const f64bits = (x) => { if (Number.isNaN(x)) return '7ff8000000000000'; const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, '0'); };
const f64str = (x) => Number.isNaN(x) ? 'NaN' : x === Infinity ? 'Infinity' : x === -Infinity ? '-Infinity' : Object.is(x, -0) ? '-0' : String(x);
const tf = (x) => ({ t: 'f64', v: f64str(x), bits: f64bits(x) });
const tt = (v) => ({ t: 'text', v, cu: 'utf8' });
const ti = (v) => ({ t: 'i64', v: String(v) });
const tb = (v) => ({ t: 'bool', v });
const NONE = { t: 'none' };
const TH = (msg) => ({ t: 'throw', msg });
const c = (args, expected, name) => (name === undefined ? { args, expected } : { name, args, expected });
const O = (frozen, heldout, extra = {}) => ({ mode: 'vectors', unit: 'u', ...extra, frozen, heldout });

const A = c([tt('a')], tf(1), 'v0');
const B = c([tf(-0), ti(7)], tt('x'), 'v1');
const C = c([NONE], TH('boom'), 'v2');
// wrap `leaf` in d lists: the leaf sits d levels below the value the case holds (R5's relative depth)
const nest = (d, leaf) => { let x = leaf; for (let i = 0; i < d; i++) x = [x]; return x; };
// the same depth as a chain of one-key maps (a map's value is one level below the map, its key is not counted)
const chain = (d, leaf) => { let x = leaf; for (let i = 0; i < d; i++) x = { k: x }; return x; };
const D = c([{ t: 'list', v: [tb(true), tt('é😀')] }], { t: 'map', v: [[tt('k'), tf(2.5)]] }, 'v3');

export function curated() {
  return [
    // ---- frozen (24): the shape and what counts
    { frozen: [], heldout: [] },
    O([], []),
    O([A], []),
    O([], [A]),
    O([A, B], [C]),
    O([B, A], [C]),
    O([A, B, C], []),
    O([A], [B, C]),
    O([{ ...A, name: 'renamed' }, B], [C]),
    O([{ args: A.args, expected: A.expected }, B], [C]),
    O([{ ...A, note: 'extra case key', mode: 'x' }, B], [C]),
    O([A, B], [C], { authority: 'rederive@abc', seed: 7, exportName: null, frozenSha: 'deadbeef' }),
    O([c([tt('a')], { t: 'f64', v: 'a different display', bits: f64bits(1) }, 'v0'), B], [C]),
    O([A, B], [c([NONE], TH('another message'), 'v2')]),
    O([A, B], [c([NONE], { t: 'throw' }, 'v2')]),
    O([c([tt('a')], { __throw: 'legacy throw' })], []),
    O([c('not a list', tt('r')), c({ t: 'map', v: [] }, true)], [c([], [])]),
    O([D], [c([{ zeta: 'z', alpha: 'a', '😀': 'e', '￿': 'f' }], 'quote " back \\ nl \n')]),
    {},
    { frozen: [] },
    O([c([1], tt('x'))], []),
    O([{ name: 'v0', args: [tt('a')] }], []),
    O([null], []),
    O([c([tt('a')], { t: 'f64', v: '1', bits: '3FF0000000000000' })], []),
    // ---- held-out: more throw paths, one per cause
    { heldout: [] },
    { frozen: null, heldout: [] },
    { frozen: [], heldout: 'abc' },
    { frozen: {}, heldout: [] },
    { frozen: [], heldout: { 0: A } },
    [],
    'oracle',
    null,
    42,
    O(['case'], []),
    O([[tt('a'), tf(1)]], []),
    O([{}], []),
    O([{ name: 'v0', expected: tt('a') }], []),
    O([c(null, tt('a'))], []),
    O([c([tt('a')], null)], []),
    O([], [c([tt('a')], 7)]),
    O([c([{ t: 'list', v: [null] }], tt('a'))], []),
    O([c([tt('a')], { t: 'f64', v: '1' })], []),
    O([c([tt('a')], { t: 'f64', bits: '3ff00000000000' })], []),
    // ---- held-out: in-domain edges
    O([c([], tt(''))], [c([], tt(''))]),
    O([A, A], [A]),
    O([c([{ t: 'f64', bits: f64bits(NaN), v: 'NaN', payload: 1 }], { t: 'throw', msg: null })], []),
    O([c([tt('\u0000\u001f\u007f ')], tt('/'))], []),
    O([c([{ b: 1, t: 'f64', bits: '0000000000000000' }], { t: 'F64', v: 'kept' })], []),
    O([c([nest(40, tt('deep but shallow of the cap'))], { k: nest(30, {}) })], []),
    // ---- held-out: the deepest values the neutral codec carries (97 below args/expected; rust's serde_json reads them)
    O([c(chain(97, []), tt('deepest neutral map chain'))], []),
    O([], [c([], nest(97, 's'))]),
    // ---- held-out: the R5 nesting cap, exactly at the boundary (js-only: past the codec's 100-value cap)
    O([c(chain(413, []), tt('deepest accepted'))], []),
    O([], [c([], nest(414, 's'))]),
    O([c(chain(412, tf(1)), tb(true))], []),
    O([c(chain(413, tf(1)), tb(true))], []),
    O([], [c([], chain(412, TH('deepest throw node')))]),
    O([c(nest(480, []), tt('far past the cap'))], []),
  ];
}

const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];
const TEXTS = ['', 'a', 'hello', 'é', '漢字', '😀', 'q"q', 'b\\s', 'tab\t', 'nl\n', '\u0001', '~', 'Z', '10', '2'];
const NUMS = [0, -0, 1, -1, 0.5, 1e-7, 1e21, 255, NaN, Infinity, -Infinity, 5e-324, 2 ** 53, -1234.5];
function tree(rnd, d) {
  const r = rnd();
  if (d <= 0 || r < 0.45) {
    const k = Math.floor(rnd() * 6);
    return k === 0 ? tt(pick(rnd, TEXTS)) : k === 1 ? tf(pick(rnd, NUMS)) : k === 2 ? ti(Math.floor(rnd() * 2001) - 1000) : k === 3 ? NONE : k === 4 ? tb(rnd() < 0.5) : TH(pick(rnd, TEXTS));
  }
  if (r < 0.7) return { t: 'list', v: Array.from({ length: Math.floor(rnd() * 4) }, () => tree(rnd, d - 1)) };
  if (r < 0.85) return { t: 'map', v: Array.from({ length: Math.floor(rnd() * 3) }, () => [tt(pick(rnd, TEXTS)), tree(rnd, d - 1)]) };
  return { t: 'tuple', v: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => tree(rnd, d - 1)) };
}
function randCase(rnd, i) {
  const args = Array.from({ length: Math.floor(rnd() * 4) }, () => tree(rnd, 2));
  const expected = rnd() < 0.15 ? TH('m' + i) : tree(rnd, 3);
  const k = { name: 'v' + i, args, expected };
  if (rnd() < 0.2) k.note = pick(rnd, TEXTS);
  if (rnd() < 0.1) delete k.name;
  return k;
}
function randOracle(rnd) {
  const nf = Math.floor(rnd() * 5), nh = Math.floor(rnd() * 6);
  const o = { frozen: Array.from({ length: nf }, (_, i) => randCase(rnd, i)), heldout: Array.from({ length: nh }, (_, i) => randCase(rnd, nf + i)) };
  if (rnd() < 0.5) Object.assign(o, { mode: 'vectors', unit: pick(rnd, ['u', 'canonical_string', 'x']) });
  if (rnd() < 0.2) o.seed = Math.floor(rnd() * 100);
  // rare: a case that breaks the domain (raw number in args, or a missing expected)
  if (rnd() < 0.08 && o.frozen.length) { if (rnd() < 0.5) o.frozen[0].args = [Math.floor(rnd() * 9)]; else delete o.frozen[0].expected; }
  return o;
}

export function genInputs(n, rnd) {
  const out = curated().map((o) => [o]);
  while (out.length < n) out.push([randOracle(rnd)]);
  return out;
}
