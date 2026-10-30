// Input generator for parse_sig (selfhost Tier 1, round 5: the reader at rederive@bb8ded84fa50, after FINDINGS #74 #78 #79 —
// composites nest at most 16 deep, and an alternative an earlier one covers STRUCTURALLY is refused: the same type, json over a
// json-shaped type (now tuple and record of json-shaped parts too), pointwise list/list, tuple/tuple, map/map, record/record
// (the earlier's fields all present in the later), and through unions both ways).
// A curated prefix — valid SIGs and throw probes interleaved so the frozen slice (the first 24) teaches both, the round-5 cases
// first — then a seeded fill that builds a type TREE and a structurally weakened twin, so coverage is probed in both orders.
const nest = (d, inner, kinds = ['list']) => {
  let s = inner;
  for (let j = d - 1; j >= 0; j--) {
    const k = kinds[j % kinds.length];
    s = k === 'list' ? `list[${s}]` : k === 'tuple' ? `tuple[${s}]` : k === 'map' ? `map[text, ${s}]` : `record[x: ${s}]`;
  }
  return s;
};
const MIX = ['tuple', 'list', 'map', 'record'];
const UMIX = (d, leaf) => { let s = leaf; for (let j = 0; j < d; j++) s = j % 2 ? `record[x: ${s} | none, y: bool]` : `list[${s} | i64]`; return s; };
const VALID = [
  'f(a: text) -> text',
  'f(a: list[text] | list[text | none]) -> list[json] | map[json, json]',
  'f(a: tuple[json, json] | tuple[text]) -> map[json, json] | map[text, i64]',
  'f(a: record[a: text, b: none] | record[a: text]) -> record[x: text] | record[y: text]',
  'f(a: json | i64 | u64 | bytes | tuple[text, i64] | record[x: bytes] | map[json, text]) -> none',
  'f(a: list[json | i64] | list[u64], b: list[text] | tuple[text]) -> map[text, json] | record[a: text]',
  'pub fn f(s: text) -> text',
  'f(a: record[x: text, y: i64] | record[x: text, y: u64] | record[x: text]) -> list[text] | list[text | json]',
  `f(a: ${nest(16, 'text')}) -> none`,
  'f(a: text | json, b: i64 | u64 | bytes | json) -> f64 | none | json',
  `f(a: text) -> ${nest(16, 'i64', MIX)} | none`,
  'f(a: map[text, list[i64]] | map[text, list[text | i64]] | map[i64, text]) -> tuple[text, none] | tuple[none, text]',
  'export default function f(a: text): text',
  `f(a: ${UMIX(8, 'text')} | ${UMIX(8, 'u64')}) -> none`,
  'f( \t ):record[k: text | none, v: map[i64, tuple[bool, bool]]]',
  'f(a: tuple[text, i64] | tuple[text, i64, none] | tuple[json]) -> list[list[text]] | list[list[i64]]',
  'g(a: bytes, b: bool, c: none, d: i64, e: u64, f_2: f64) -> json',
  'pub\nfn\r\nf(a: text) -> u64',
  ' \r\n export\n default\tfunction  f ( a : text , b : i64 ) -> list [ text ]',
  'f(\n  a: text,\n  b: list[map[text, json]]\n) -> text | none',
  'f(a: record [x: text, y: i64]) -> tuple [text, i64, record[text: bool]]',
  'f(... xs: text) -> list[text]',
  'pub(fn: text) -> list[list[list[u64]]]',
  'pub fn fn(pub: text) -> none',
  'export(default: text) -> text',
  `f(a: tuple[${nest(15, 'text')}, ${nest(15, 'bool')}], b: ${nest(16, 'none', MIX)}) -> ${nest(16, 'f64')}`,
];
const THROWS = [
  'f(a: list[json] | list[text]) -> none',
  'f(a: json | tuple[text, list[f64]]) -> none',
  'f(a: record[a: text] | record[a: text, b: none]) -> none',
  'f(a: text) -> map[json, json] | map[text, text]',
  'f(a: json | record[x: none, y: map[text, bool]]) -> none',
  'f(a: tuple[json, text] | tuple[text, text]) -> none',
  'f(a: list[text | none] | list[text]) -> none',
  `f(a: ${nest(17, 'text')}) -> none`,
  'f(a: list[json | i64] | list[i64 | text]) -> none',
  'f(a: text) -> list[list[json]] | list[list[record[x: text, y: none]]]',
  'f(a: record[x: json] | record[x: text, y: i64]) -> none',
  `f(a: text) -> none | ${nest(17, 'u64', MIX)}`,
  'f(a: map[text, list[text | i64]] | map[text, list[i64]]) -> none',
  `f(a: ${UMIX(8, 'text')} | ${UMIX(8, 'text').replace('list[text | i64]', 'list[text]')}) -> none`,
  'f(a: json | text) -> none',
  'f(a: record[x: text, y: i64] | record[y: i64, x: text]) -> none',
  'f(a: text) -> none | none',
  'f(a: json | json) -> none',
  '',
  'fé(a: text) -> text',
  'f(text) -> i64', 'f(a: text,) -> text',
  'f(...xs: text, y: i64) -> none', 'f(. ..a: text) -> none',
  'f(a: text, a: i64) -> none',
  'f(a: text)',
  'f(a: list[]) -> none', 'f(a: record[text]) -> none', 'f(a: record[x: text, x: i64]) -> none',
  'f(a: text) -> text || none',
  'f(a: text) -> text # comment',
  '﻿f(a: text) -> text', 'f(a: text)\u000B-> text', 'f(a: text) -> text',
  'pub fn(a: text) -> text', 'pub fn',
];

const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const JSONISH = ['none', 'bool', 'f64', 'text', 'json'];
const NAMES = ['a', 'b', 'xs', 'input', 'opts', 'n', 'key_', 'Value', '_s'];
const FNAMES = ['f', 'parse', 'get_rgb', 'min_indent', 'x9', 'encode_value', '_cmp', 'pub', 'fn'];
const FIELDS = ['a', 'b', 'c', 'x', 'y', 'A'];

export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const ws = () => pick(['', '', '', ' ', ' ', '  ', '\n ', '\t', '\r\n']);
  const sp = () => pick([' ', ' ', '\t', ' \n', '\n', '  ', '\r\n\t']);
  // a type TREE: { k } scalar | { k: 'union', alts } (alts never unions) | tuple | list | map | record (unique field names)
  const alt = (d) => {
    const r = rnd();
    if (d <= 0 || r < 0.42) return { k: pick(SCALARS) };
    if (r < 0.56) return { k: 'list', item: tree(d - 1) };
    if (r < 0.68) return { k: 'map', key: rnd() < 0.6 ? { k: 'text' } : tree(d - 1), val: tree(d - 1) };
    if (r < 0.82) return { k: 'tuple', items: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => tree(d - 1)) };
    const names = FIELDS.filter(() => rnd() < 0.4); if (!names.length) names.push(pick(FIELDS));
    return { k: 'record', fields: names.map((f) => [f, tree(d - 1)]) };
  };
  const tree = (d) => {
    if (rnd() < 0.72) return alt(d);
    const alts = [alt(d)]; const want = rnd() < 0.3 ? 3 : 2;   // distinct by spelling (a repeat is the curated prefix's job)
    for (let g = 0; alts.length < want && g < 8; g++) { const a = alt(d); if (!alts.some((x) => JSON.stringify(x) === JSON.stringify(a))) alts.push(a); }
    return mkUnion(alts);
  };
  const altsOf = (t) => (t.k === 'union' ? t.alts : [t]);
  const mkUnion = (alts) => (alts.length === 1 ? alts[0] : { k: 'union', alts });
  // a twin of t that t covers (mostly): a json made json-shaped, union alternatives dropped or shuffled, record fields added /
  // reordered — and now and then one leaf changed so the twin escapes coverage
  const jsonShaped = (d) => { const r = rnd(); if (d <= 0 || r < 0.5) return { k: pick(JSONISH) };
    if (r < 0.65) return { k: 'list', item: jsonShaped(d - 1) }; if (r < 0.8) return { k: 'map', key: { k: 'text' }, val: jsonShaped(d - 1) };
    if (r < 0.9) return { k: 'tuple', items: [jsonShaped(d - 1), jsonShaped(d - 1)] }; return { k: 'record', fields: [['a', jsonShaped(d - 1)]] }; };
  const weaken = (t, d) => {
    if (rnd() < 0.06) return { k: pick(SCALARS) };   // escape coverage
    switch (t.k) {
      case 'json': return rnd() < 0.7 ? jsonShaped(d) : t;
      case 'list': return { k: 'list', item: weaken(t.item, d - 1) };
      case 'map': return { k: 'map', key: weaken(t.key, d - 1), val: weaken(t.val, d - 1) };
      case 'tuple': return rnd() < 0.08 ? { k: 'tuple', items: [...t.items, { k: 'none' }] } : { k: 'tuple', items: t.items.map((x) => weaken(x, d - 1)) };
      case 'record': { const fs = t.fields.map(([f, x]) => [f, weaken(x, d - 1)]); if (rnd() < 0.4) { const extra = FIELDS.find((f) => !fs.some(([g]) => g === f)); if (extra) fs.push([extra, alt(1)]); }
        if (rnd() < 0.4) fs.reverse(); if (rnd() < 0.1 && fs.length > 1) fs.pop(); return { k: 'record', fields: fs }; }
      case 'union': { const keep = t.alts.filter(() => rnd() < 0.7).map((x) => weaken(x, d)); if (!keep.length) keep.push(t.alts[0]); if (rnd() < 0.4) keep.reverse(); return mkUnion(keep); }
      default: return t;
    }
  };
  const show = (t) => {
    switch (t.k) {
      case 'union': return t.alts.map(show).join(ws() + '|' + ws());
      case 'list': return `list${ws()}[${ws()}${show(t.item)}${ws()}]`;
      case 'map': return `map${ws()}[${show(t.key)},${ws()}${show(t.val)}]`;
      case 'tuple': return `tuple${ws()}[${t.items.map(show).join(',' + ws())}]`;
      case 'record': return `record[${ws()}${t.fields.map(([f, x]) => `${f}${ws()}:${ws()}${show(x)}`).join(', ')}]`;
      default: return t.k;
    }
  };
  const type = (d) => {
    const r = rnd();
    if (r < 0.75) return show(tree(d));
    const t = alt(rnd() < 0.8 ? Math.max(d, 1) : d); let w = weaken(t, d);   // a coverage pair, in either order (earlier covers later -> throws)
    if (JSON.stringify(w) === JSON.stringify(t) && rnd() < 0.85) w = t.k === 'json' ? jsonShaped(d) : { k: pick(SCALARS.filter((x) => x !== t.k)) };
    const pair = rnd() < 0.5 ? [t, w] : [w, t];
    return show(mkUnion([...pair.flatMap(altsOf)]));
  };
  const sig = () => {
    const k = Math.floor(rnd() * 4);
    const args = Array.from({ length: k }, (_, i) => `${pick(NAMES)}${i}${ws()}:${ws()}${type(2)}`);
    if (k > 0 && rnd() < 0.25) args[k - 1] = '...' + ws() + args[k - 1];
    const pre = pick(['', '', '', `pub${sp()}fn${sp()}`, `export${sp()}default${sp()}function${sp()}`]);
    const sep = pick([' -> ', '->', ': ', ' : ', '\n-> ']);
    const res = rnd() < 0.05 ? nest(15 + Math.floor(rnd() * 3), pick(SCALARS), pick([['list'], MIX])) : type(3);
    return `${ws()}${pre}${pick(FNAMES)}${ws()}(${ws()}${args.join(ws() + ',' + ws())}${ws()})${sep}${res}${ws()}`;
  };
  const curated = [];
  for (let j = 0; j < Math.max(VALID.length, THROWS.length); j++) {
    if (j < VALID.length) curated.push(VALID[j]);
    if (j < THROWS.length) curated.push(THROWS[j]);
  }
  const out = curated.slice(0, n).map((s) => [s]);
  while (out.length < n) out.push([sig()]);
  return out;
}
