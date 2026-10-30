// rust_reshape input generator: genInputs(n, rnd) -> [v, t] argument lists. t is a type tree (canon.mjs parseType's shape);
// v is a json value, usually in the rust harness's POSITIONAL form (records as lists in declared field order).
import { parseType } from '../../../.authority/bb8ded84fa50/cli/sir/canon.mjs';
const P = parseType;
const R = (n, t) => ({ k: 'record', fields: n.map((name, i) => [name, t[i]]) });
const I64 = { k: 'i64' }, TXT = { k: 'text' }, NONE = { k: 'none' };

const REC_AB = R(['a', 'b'], [I64, I64]);
const CURATED = [
  // R1 none passes whatever t is; R2 non-container kinds and non-map trees: v unchanged (json is never descended into)
  [null, null], [5, P('i64')], [[1, 2], P('json')], [[1, 2], { k: 'nope' }], [[1, 2], 'record'], [[1], { k: 'Record', fields: [['a', I64]] }],
  // R3 union: only an option (exactly two alternatives, exactly one of them none) is followed
  [[1, 'x'], P('none | record[a: i64, b: text]')], [[1, 2], { k: 'union', alts: [REC_AB, NONE] }], [[1, 99], P('record[x: f64] | list[f64]')],
  [[1, 2], { k: 'union', alts: [REC_AB] }], [[1, 2], { k: 'union', alts: [NONE, REC_AB, NONE] }], [[1, 2], { k: 'union', alts: [NONE, NONE] }],
  [[1, 2], { k: 'union', alts: [{ k: 'NONE' }, REC_AB] }], [[1, 2], { k: 'union', alts: [NONE, 5] }],
  [[[1, 2]], P('list[record[a: i64, b: i64]] | none')], [[[1, 2]], P('list[record[a: i64, b: i64]] | text | none')],
  // R4 record: reshaped only at the exact field count
  [[1, 'x'], P('record[a: i64, b: text]')], [[1, 'x', 99], P('record[a: i64, b: text]')], [[1], P('record[a: i64, b: text]')],
  [[], { k: 'record', fields: [] }], [[7], { k: 'record', fields: [] }], [{ a: 1, b: 'x' }, P('record[a: i64, b: text]')],
  [[[1, 2], [3, [4, 5]]], P('record[p: record[x: i64, y: i64], q: tuple[i64, record[m: i64, n: i64]]]')],
  [[1, 2, 3], R(['b', 'a', 'b'], [I64, I64, I64])], [[1, 'v', 3], { k: 'record', fields: [['__proto__', I64], ['__t', TXT], ['', I64]] }],
  [[null, [1]], { k: 'record', fields: [['a'], ['b', P('tuple[i64]'), 'extra']] }], [[1], { k: 'record', fields: 5 }],
  [[1, 2], { k: 'record', fields: [null] }],
  // R5 tuple
  [[1, [2, 3], [4, 5]], P('tuple[i64, record[a: i64, b: i64]]')], [[[1], [2], [3], [4]], { k: 'tuple', items: [0, 'record', [R(['a'], [I64])], R(['a'], [I64])] }],
  [[[1]], { k: 'tuple', items: 'ab' }], [[], { k: 'tuple' }],
  // R6 list, R7 map
  [[null, null], { k: 'list' }], [[[[1]], []], P('list[list[record[a: i64]]]')], [{ a: [1] }, P('list[record[a: i64]]')],
  [JSON.parse('{"p": [1, 2], "q": [1], "r": null, "__proto__": [3, 4]}'), P('map[text, record[x: i64, y: i64]]')], [[[1, 2]], P('map[text, record[x: i64, y: i64]]')],
  [{ '': { s: [[1]] } }, P('map[text, map[text, list[record[a: i64]]]]')], [{}, { k: 'map' }], [{ a: null }, { k: 'map' }],
  // throws (one per path)
  [1, null], [[1], { k: 'list' }], [[1], { k: 'tuple' }], [[1], { k: 'record' }], [[1], { k: 'record', fields: [5] }],
  [[1], { k: 'record', fields: [['a']] }], [[1], { k: 'union' }], [[1], { k: 'union', alts: [REC_AB, null] }], [{ a: 1 }, { k: 'map' }],
];

// ---- random fill: a random type, a positional value for it, sometimes a wrong-shape value
const NAMES = ['a', 'b', 'x', 'y', 'id', 'name', 'n_2', 'Z'];
function genType(rnd, d) {
  const r = rnd();
  if (d <= 0 || r < 0.3) return ['text', 'i64', 'u64', 'f64', 'bool', 'json'][Math.floor(rnd() * 6)];
  if (r < 0.5) { const k = 1 + Math.floor(rnd() * 3), used = new Set(), fs = [];
    for (let i = 0; i < k; i++) { let nm; do nm = NAMES[Math.floor(rnd() * NAMES.length)]; while (used.has(nm)); used.add(nm); fs.push(`${nm}: ${genType(rnd, d - 1)}`); }
    return `record[${fs.join(', ')}]`; }
  if (r < 0.6) { const k = 1 + Math.floor(rnd() * 3); return `tuple[${Array.from({ length: k }, () => genType(rnd, d - 1)).join(', ')}]`; }
  if (r < 0.72) return `list[${genType(rnd, d - 1)}]`;
  if (r < 0.82) return `map[text, ${genType(rnd, d - 1)}]`;
  if (r < 0.92) return rnd() < 0.5 ? `${genType(rnd, d - 1)} | none` : `none | ${genType(rnd, d - 1)}`;
  return `${genType(rnd, d - 1)} | ${genType(rnd, d - 1)}`;
}
const TEXTS = ['', 'x', 'héllo', '日本', 'a b', '__t'];
function scalar(rnd) { const r = rnd(); return r < 0.25 ? Math.floor(rnd() * 200) - 100 : r < 0.4 ? Math.floor(rnd() * 40) / 4 : r < 0.6 ? TEXTS[Math.floor(rnd() * TEXTS.length)] : r < 0.75 ? rnd() < 0.5 : r < 0.85 ? null : r < 0.93 ? [Math.floor(rnd() * 9)] : { q: Math.floor(rnd() * 9) }; }
function genValue(t, rnd, d = 0) {
  if (rnd() < 0.08 && d > 0) return scalar(rnd);   // a wrong-shape value anywhere below the top
  switch (t.k) {
    case 'text': return TEXTS[Math.floor(rnd() * TEXTS.length)];
    case 'i64': case 'u64': return Math.floor(rnd() * 1000) - (t.k === 'i64' ? 500 : 0);
    case 'f64': return Math.floor(rnd() * 400) / 8 - 25;
    case 'bool': return rnd() < 0.5;
    case 'json': return scalar(rnd);
    case 'none': return null;
    case 'record': { const xs = t.fields.map(([, ft]) => genValue(ft, rnd, d + 1));
      const r = rnd(); if (r < 0.12) xs.push(scalar(rnd)); else if (r < 0.22) xs.pop();   // a longer / shorter list than the fields
      if (rnd() < 0.08) return Object.fromEntries(t.fields.map(([n], i) => [n, xs[i] ?? null]));   // already named
      return xs; }
    case 'tuple': { const xs = t.items.map((it) => genValue(it, rnd, d + 1)); const r = rnd(); if (r < 0.1) xs.push(scalar(rnd)); else if (r < 0.15) xs.pop(); return xs; }
    case 'list': return Array.from({ length: Math.floor(rnd() * 3) }, () => genValue(t.item, rnd, d + 1));
    case 'map': { if (rnd() < 0.08) return [genValue(t.val, rnd, d + 1)]; const o = {}; for (let i = Math.floor(rnd() * 3); i > 0; i--) o[NAMES[Math.floor(rnd() * NAMES.length)]] = genValue(t.val, rnd, d + 1); return o; }
    case 'union': { if (t.alts.some((a) => a.k === 'none') && rnd() < 0.25) return null; const alts = t.alts.filter((a) => a.k !== 'none'); return genValue(alts[Math.floor(rnd() * alts.length)], rnd, d + 1); }
  }
  return null;
}

export function genInputs(n, rnd) {
  const out = CURATED.map(([v, t]) => [v, t]);
  let guard = 0;
  while (out.length < n && guard++ < n * 50) {
    let t; try { t = P(genType(rnd, 1 + Math.floor(rnd() * 3))); } catch { continue; }   // an unreachable union alternative is a grammar error
    out.push([genValue(t, rnd), t]);
  }
  return out;
}
