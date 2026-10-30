// genInputs(n, rnd) for languages_of (round 5, rederive@bb8ded84fa50, FINDINGS #77: a variant key is `package` or
// `lang:<id>` with a lowercase id; a unit name, when present, is [A-Za-z0-9_][A-Za-z0-9_-]*; a variant's sir names a .sir
// file). A curated prefix that reaches every branch and every refusal, then a seeded fill that stays mostly inside the
// domain. variants maps are built with keys in ascending order (the canonical json map carries no order of its own; the
// result does not depend on it). Probes holding a lone surrogate cannot take the neutral codec and land in the js-only
// extension.
const REG = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const sortedMap = (entries) => Object.fromEntries([...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
const F = (...sirFiles) => [{ sirFiles }];
const V = (variants) => [{ variants: sortedMap(Object.entries(variants)) }];

const CURATED = [
  // ---- the first 24 (frozen): the domain and its boundaries, interleaved with the main refusals
  F('x.sir', 'x.ts.sir', 'x.rust.sir', 'x.ts.sir'),
  [{ sirFiles: ['u.python.sir', 'README.md'], variants: sortedMap([['lang:rust', { lang: 'rust', sir: 'sir/x.rust.sir' }], ['lang:ts', {}], ['package', { lang: 'php' }]]) }],
  F('x.sir', 'x.carried.json', 'x.inputs.mjs', 'README.md', 'ts.sir', '.sir', 'x.ts.sir.bak', 'x.ts.sir/', 'x.ts.sirx', 'x.ts.sir~',
    'x.ts.ſir', 'x.ts.ſir\u200b', 'x.ts.sır', 'x.ts.sİr\u0085', 'x.ts.sir.\u200b', 'README.md\u200b', 'x.ts.sir\\', 'x.ts.sir\u200b~', ''),
  F('/abs/dir.v2/u.ts.sir', 'a\\b\\c.csharp.sir', ' x.js.sir\t', 'x.rust.SIR', '.python.sir', 'x.php.sIr', 'kind-of.csharp.sir', '_9.js.sir', 'A-b_C.ts.sir'),
  F('a.b.ts.sir'),
  [{}],
  F('\u200bx.sir'),
  V({ 'lang:ts': { lang: 'ts', sir: 'a\\x.ts.SIR ', n: 3 }, package: { sir: 'x.rust.sir' }, 'lang:php': { lang: 'php', sir: 'u.php.sir' } }),
  V({ 'Lang:ts': {} }),
  F('x.ts.sir\u0085'),
  [{ sirFiles: ['x.ts.sir'], variants: { 'lang:ts': { sir: 'sir/x.ts.sir' } } }],
  V({ 'lang:rust': { lang: 'ts' } }),
  V({ package: { lang: 'ts', sir: 'u.sir' } }),
  F('x y.ts.sir'),
  V({ 'lang:ts': { sir: 'x.sir' } }),
  V({ 'lang:ts': {}, package: { lang: 'ts' } }),
  [{ sirFiles: [], variants: null, extra: 5 }],
  V({ package: { sir: 'README.md' } }),
  V({ 'lang:ts': 'ts' }),
  V({ ' lang:ts': {} }),
  F('C:\\units.v2\\x.rust.sir', 'x.go.sir/u.php.sir', ' \t dir/x.ts.sir \t ', 'x.python.Sir', 'x.ts.sir\t \t', '.sir', '..ts.sir/'),
  [null],
  [{ sirFiles: 'x.ts.sir' }],
  [{ variants: ['lang:ts'] }],
  // ---- held-out: the remaining refusals and their boundaries
  F('x.ts.sir', 3), V({ package: { sir: 7 } }), V({ 'lang:': {} }), F('x.ts.sir\u200b'), V({ package: { lang: 'rust', sir: 'x.ts.sir' } }),
  F('x.TS.sir'), F('x..sir'), F('...sir'), F('x.ts.sir\u{F0000}'), F('x.ts.sir\x7f'), F('a\nb.rust.sir'), F('x.sir\ud800'),
  F('a.b.sir'), V({ 'lang:TS': {} }), V({ package: { sir: '' } }), V({ package: { sir: '/' } }), V({ 'lang:ts': { sir: 'x.ts.sir.bak' } }),
  V({ 'lang:ts': { sir: 'a.b.ts.sir' } }), V({ package: { sir: 'x.ts.sir\u2028' } }), V({ package: { lang: null } }), V({ package: { lang: '' } }),
  V({ 'lang:go': {} }), V({ 'lang:ts\n': {} }), V({ 'lang:1ts': {} }), V({ 'lang:t-s': {} }), V({ default: {} }), V({ 'lаng:ts': {} }),
  V({ 'lang\u200b:ts': {} }), V({ 'lang：ts': {} }), V({ package: {}, 'lang:js': { sir: 'é.js.sir' } }), F('-x.ts.sir'), F('x\n.ts.sir'),
  F('é.sir'), F('.ts.sir', '_.php.sir'), V({ 'lang:csharp': { sir: '.csharp.sir' }, package: { sir: '/a/b/x.SIR' } }), F('x.\ud800.sir', 'x.ts.sir'),
  V({ 'lang:ts': { sir: 'u.sir\u200b~' } }), V({ package: { sir: 'x y.sir' } }), F('x.ts.sir\u200b~', 'x y.md', 'é.ts.sirx'),
  [7],
];

const UNITS = ['x', 'slug', 'get_rgb', 'kind-of', 'u2', 'A', '_', '9z', ''];
const BADUNITS = ['é', 'x y', '-x', 'a\u200b', 'x\n', '\u00a0x', 'a+b'];
const DIRS = ['', 'sir/', 'units/u/sir/', '/abs/p.q/', 'C:\\u\\sir\\', 'a.b\\c/', 'é dir/'];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const pad = (rnd) => pick(rnd, ['', '', '', '', ' ', '\t', '  ']);
const SIRS = ['sir', 'sir', 'sir', 'SIR', 'Sir', 'siR'];
const unit = (rnd) => { const r = rnd(); return r < 0.02 ? `${pick(rnd, UNITS)}.${pick(rnd, UNITS)}` : r < 0.04 ? pick(rnd, BADUNITS) : pick(rnd, UNITS); };

function langFile(rnd, id) { return `${pad(rnd)}${pick(rnd, DIRS)}${unit(rnd)}.${id}.${pick(rnd, SIRS)}${pad(rnd)}`; }

function randFile(rnd) {
  const r = rnd();
  if (r < 0.55) return langFile(rnd, pick(rnd, REG));
  if (r < 0.75) return `${pick(rnd, DIRS)}${unit(rnd)}.${pick(rnd, SIRS)}${pad(rnd)}`;
  if (r < 0.985) return `${pick(rnd, DIRS)}${pick(rnd, [...UNITS, ...BADUNITS])}.${pick(rnd, ['carried.json', 'oracle.json', 'inputs.mjs', 'ts.sir.bak', 'md', 'sirx', 'ts.sir~', 'ts.ſir'])}`;
  if (r < 0.993) return langFile(rnd, pick(rnd, ['go', 'TS', 'py', '', 'ts ']));          // registry / empty-segment refusal
  return `${pick(rnd, UNITS)}.${pick(rnd, REG)}.sir${pick(rnd, ['\u0085', '\u200b', '\u00a0', '\n', '\ufeff', 'é', '\u{E000}'])}`;   // hidden tail
}

function randVariant(rnd, id) {
  const r = rnd(), path = () => `${pick(rnd, DIRS)}${pick(rnd, UNITS)}.${id}.${pick(rnd, SIRS)}${pad(rnd)}`;
  const plain = () => `${pick(rnd, DIRS)}${pick(rnd, UNITS)}.${pick(rnd, SIRS)}`;
  if (r < 0.25) return [`lang:${id}`, sortedMap([['lang', id], ['sir', path()]])];
  if (r < 0.4) return [`lang:${id}`, {}];
  if (r < 0.52) return [`lang:${id}`, { sir: path() }];
  if (r < 0.62) return [`lang:${id}`, { lang: id }];
  if (r < 0.74) return ['package', pick(rnd, [{ lang: id }, { sir: path() }, sortedMap([['lang', id], ['sir', path()]])])];
  if (r < 0.9) return ['package', pick(rnd, [{}, { sir: plain() }])];
  // a refusal by chance: disagreement, a no-language sir under a named variant, a non-map variant, a non-text field,
  // a key outside the grammar, a sir that names no .sir file, a bad unit in the sir
  const other = pick(rnd, REG);
  return pick(rnd, [
    [`lang:${id}`, { lang: other }], [`lang:${id}`, { sir: `u.${other}.sir` }], [`lang:${id}`, { sir: plain() }],
    [`lang:${id}`, id], [`lang:${id}`, { lang: 1 }], [`lang:${id.toUpperCase()}`, {}], [`Lang:${id}`, {}], [`v_${id}`, {}],
    ['package', sortedMap([['lang', id], ['sir', 'u.sir']])], ['package', { sir: '' }], ['package', { sir: 'README.md' }],
    [`lang:${id}`, { sir: `x y.${id}.sir` }], ['default', { lang: id }],
  ]);
}

function randInput(rnd) {
  const o = {};
  if (rnd() < 0.85) o.sirFiles = Array.from({ length: Math.floor(rnd() * 5) }, () => randFile(rnd));
  if (rnd() < 0.6) {
    const ids = REG.filter(() => rnd() < 0.35);
    const entries = ids.map((id) => randVariant(rnd, id));
    o.variants = sortedMap(new Map(entries));      // a repeated key keeps its last entry
  }
  return [o];
}

export function genInputs(n, rnd) {
  const out = CURATED.map((a) => a.map((x) => structuredClone(x)));
  while (out.length < n) out.push(randInput(rnd));
  return out;
}
