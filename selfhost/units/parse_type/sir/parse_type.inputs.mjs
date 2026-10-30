// parse_type input generator (round 5, FINDINGS #74 #78 #79: coverage is STRUCTURAL — same type, json over json-shaped parts
// incl. tuple and record, list/tuple/map pointwise, a record over one with at least its fields, unions both sides — and the
// nesting cap is MAX_DEPTH 16, so every legal parse is a value the codec carries and the 16/17 boundary is in the oracle).
// genInputs(n, rnd) -> n argument lists [s]. A curated prefix interleaved across groups (valid texts of every form; one probe
// per throw class; the coverage rule on both sides of the order), then a seeded fill of random type trees rendered with random
// ASCII spacing, whose unions sometimes repeat an earlier alternative REORDERED or hold json beside a json-shaped alternative,
// a share of them mutated by one character edit.
const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const nest = (d, name = 'list', inner = 'text') => `${name}[`.repeat(d) + inner + ']'.repeat(d);
const mixed = (d) => { let s = 'i64'; for (let i = 0; i < d; i++) s = [`list[${s}]`, `tuple[bool, ${s}]`, `map[text, ${s}]`, `record[f${i}: ${s}]`][i % 4]; return s; };
// a record chain whose every field is a union: 5 result-tree levels per type level, the deepest result a legal type yields
const recUnion = (d) => { let s = 'i64'; for (let i = 0; i < d; i++) s = `record[f: ${s} | none]`; return s; };
const GROUPS = [
  // scalars, with whitespace at the ends
  ['text', ' \t i64\r\n'],
  // composites, whitespace between tokens, field names
  ['record[a: text, b: i64 | none]', 'record[ x :map[text, i64] , y\t: tuple[bool, bytes] ]',
    'record[text: text, list: i64, _1: none]', 'record[A: i64, a: i64]'],
  // whitespace between a composite name and "["
  ['list [text]', 'map\n[ text ,i64 ]'],
  // the nesting cap: depth 16 parses, 17 throws, far deeper throws cleanly; siblings do not add up
  [nest(16), nest(17), mixed(16), recUnion(16), `tuple[${nest(15)}, ${nest(15)}]`, `tuple[${nest(14)}, ${nest(16)}]`,
    recUnion(17), nest(2000)],
  // plain unions
  ['  f64\t|\nnone  ', 'tuple[text | none, i64] | list[bool]'],
  // the same alternative up to union order and record field order (throw) beside look-alikes that differ (parse)
  ['none | none', 'list[text | none] | list[none | text]', 'record[a: text, b: i64] | record[b: i64, a: text]',
    'record[a: text, b: i64] | record[b: text, a: i64]', 'tuple[text, i64] | tuple[i64, text]',
    'list[list[text | none] | i64] | list[i64 | list[none | text]]'],
  // json coverage, both sides of the order; tuples and records of json-shaped parts are json-shaped
  ['json | text', 'text | json', 'json | map[text | none, json]', 'json | bytes', 'f64 | json | i64',
    'json | tuple[text, f64]', 'json | tuple[text, i64]', 'json | record[a: text, b: list[none]]', 'json | record[a: bytes]'],
  // structural coverage: pointwise list / tuple / map, a record over one with MORE fields, unions on either side; no
  // cross-kind and no joint coverage
  ['list[json] | list[text]', 'map[text, json] | map[text, text]', 'tuple[json, i64] | tuple[text, i64]',
    'record[a: text] | record[a: text, b: none]', 'record[a: text, b: none] | record[a: text]',
    'record[a: json] | record[b: text, a: f64]', 'map[text | none, i64] | map[text, i64]', 'list[text | none] | list[text]',
    'list[text] | list[text | none]', 'list[json] | list[text | none]', 'list[text] | tuple[text]',
    'map[text, text] | record[a: text]', 'tuple[text] | tuple[none] | tuple[text | none]'],
  // throws: names, whitespace class, empty, brackets, part counts, union segments, record fields, trailing junk
  ['Text', '\u00a0text', 'text\u000c', '', 'list[text', 'list[text]]', 'list[text, i64]', 'tuple[]',
    'text || none', 'record[text]', 'record[a: text, a: i64]', 'list[text] x'],
];
// round-robin over the groups so the frozen slice (the first 24) already spans every group
const CURATED = []; for (let i = 0; GROUPS.some((g) => i < g.length); i++) for (const g of GROUPS) if (i < g.length) CURATED.push(g[i]);
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const SP = ['', '', '', ' ', ' ', '  ', '\t', '\n', '\r\n'];
const sp = (rnd) => pick(rnd, SP);
const NAMES = ['a', 'id', 'b2', 'name', '_x', 'Tags'];
const JSONISH = [{ k: 'text' }, { k: 'none' }, { k: 'f64' }, { k: 'bool' }, { k: 'list', item: { k: 'f64' } },
  { k: 'map', key: { k: 'text' }, val: { k: 'json' } }, { k: 'list', item: { k: 'union', alts: [{ k: 'text' }, { k: 'none' }] } },
  { k: 'map', key: { k: 'i64' }, val: { k: 'json' } }, { k: 'list', item: { k: 'bytes' } }, { k: 'u64' },
  { k: 'tuple', items: [{ k: 'text' }, { k: 'f64' }] }, { k: 'record', fields: [['a', { k: 'none' }]] }];
const shuffle = (rnd, a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// a variant of t that an earlier t covers (json -> a json-shaped part, a union -> one of its alts, a record + a field) or that
// breaks coverage (a scalar swapped, a record field dropped) — the structural rule decided on both sides
function narrow(rnd, t) {
  const r = rnd();
  switch (t.k) {
    case 'json': return r < 0.8 ? pick(rnd, JSONISH) : { k: 'bytes' };
    case 'union': return r < 0.7 ? narrow(rnd, pick(rnd, t.alts)) : t;
    case 'list': return { k: 'list', item: narrow(rnd, t.item) };
    case 'tuple': { const i = Math.floor(rnd() * t.items.length); return { k: 'tuple', items: t.items.map((x, j) => (j === i ? narrow(rnd, x) : x)) }; }
    case 'map': return r < 0.5 ? { k: 'map', key: t.key, val: narrow(rnd, t.val) } : { k: 'map', key: narrow(rnd, t.key), val: t.val };
    case 'record': {
      const free = NAMES.filter((n) => !t.fields.some(([m]) => m === n));
      if (r < 0.35 && free.length) return { k: 'record', fields: [...t.fields, [pick(rnd, free), pick(rnd, JSONISH)]] };
      if (r < 0.5 && t.fields.length > 1) return { k: 'record', fields: t.fields.slice(1) };
      const i = Math.floor(rnd() * t.fields.length); return { k: 'record', fields: t.fields.map(([n, f], j) => [n, j === i ? narrow(rnd, f) : f]) };
    }
    default: return r < 0.6 ? t : { k: pick(rnd, SCALARS) };
  }
}
// a random type TREE (alts of a union are never unions)
function gen(rnd, depth, top = true) {
  const r = rnd();
  if (depth <= 0 || r < 0.3) return { k: pick(rnd, SCALARS) };
  const k = depth - 1;
  if (r < 0.44) return { k: 'list', item: gen(rnd, k) };
  if (r < 0.54) { const m = 1 + Math.floor(rnd() * 3); return { k: 'tuple', items: Array.from({ length: m }, () => gen(rnd, k)) }; }
  if (r < 0.64) return { k: 'map', key: rnd() < 0.6 ? { k: 'text' } : gen(rnd, k, false), val: gen(rnd, k) };
  if (r < 0.76) { const pool = [...NAMES]; const m = 1 + Math.floor(rnd() * 3); return { k: 'record', fields: Array.from({ length: m }, () => [pool.splice(Math.floor(rnd() * pool.length), 1)[0], gen(rnd, k)]) }; }
  const m = 2 + Math.floor(rnd() * 2); const alts = [];
  for (let i = 0; i < m; i++) {
    const q = rnd();
    if (q < 0.15 && alts.length) alts.push({ ...pick(rnd, alts), perm: true });   // the same alternative, rendered reordered
    else if (q < 0.3 && alts.length) alts.push(narrow(rnd, pick(rnd, alts)));      // an earlier alternative, narrowed or widened
    else if (q < 0.4) alts.push({ k: 'json' });
    else if (q < 0.5) alts.push(pick(rnd, JSONISH));
    else { let a = gen(rnd, k, false); while (a.k === 'union') a = gen(rnd, k, false); alts.push(a); }
  }
  return { k: 'union', alts };
}
function render(rnd, t, perm = false) {
  const R = (x) => sp(rnd) + render(rnd, x, perm || !!x.perm) + sp(rnd);
  switch (t.k) {
    case 'union': return (perm ? shuffle(rnd, t.alts) : t.alts).map((a) => render(rnd, a, perm || !!a.perm)).join(pick(rnd, ['|', ' | ', ' |', '| ', '\n| ']));
    case 'list': return `list${sp(rnd)}[${R(t.item)}]`;
    case 'tuple': return `tuple[${t.items.map(R).join(',')}]`;
    case 'map': return `map[${R(t.key)},${R(t.val)}]`;
    case 'record': return `record[${(perm ? shuffle(rnd, t.fields) : t.fields).map(([n, f]) => `${sp(rnd)}${n}${sp(rnd)}:${R(f)}`).join(',')}]`;
    default: return t.k;
  }
}
const EDITS = ['[', ']', ',', '|', ':', ' ', 'x', '1'];
function mutate(rnd, s) {
  const i = Math.floor(rnd() * (s.length + 1));
  if (rnd() < 0.4 && s.length) return s.slice(0, i) + s.slice(i + 1);
  return s.slice(0, i) + pick(rnd, EDITS) + s.slice(i);
}
export function genInputs(n, rnd) {
  const out = CURATED.map((s) => [s]);
  while (out.length < n) {
    let s = sp(rnd) + render(rnd, gen(rnd, 1 + Math.floor(rnd() * 3))) + sp(rnd);
    if (rnd() < 0.2) s = mutate(rnd, s);
    out.push([s]);
  }
  return out;
}
