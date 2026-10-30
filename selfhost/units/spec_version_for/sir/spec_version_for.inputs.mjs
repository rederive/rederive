// Input generator for spec_version_for(features: list[text]) -> text.
// Curated coverage prefix first (every known feature, every INHERITED name, unknowns incl. case variants, duplicates,
// mixed lists, throw paths), then a seeded fill that stays mostly in-domain (known names). Round 2: the host's inherited
// member names (INHERITED) are now unknown names and throw like any other.
const KNOWN = ['vectors', 'carried-data', 'envelope', 'trace-seam', 'scheduler', 'lifecycle', 'par-interleaving', 'ring',
  'lang-variant', 'cross-lang-anchor'];
const INHERITED = ['__proto__', 'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  'toString', 'valueOf', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__'];
const UNKNOWN = ['', 'Vectors', 'RING', 'Ring', 'LANG-VARIANT', 'Lang-Variant', 'Carried-Data', 'vectors ', ' ring',
  'carried_data', 'par_interleaving', 'langvariant', 'nope', 'since', '$comment', 'features', 'implemented', 'prototype',
  '__proto', 'tostring', 'Constructor', 'HASOWNPROPERTY', 'vеctors', 'ring\n', '0.5', 'toString()'];
const UNKNOWN_SOLO = ['RING', 'vectors ', 'carried_data', 'tostring', 'v\u0435ctors', 'ring\n'];

const CURATED = [
  [[]],
  [['vectors']], [['carried-data']], [['envelope']], [['trace-seam']], [['scheduler']], [['lifecycle']],
  [['par-interleaving']], [['ring']], [['lang-variant']], [['cross-lang-anchor']],
  [['Vectors']], [['vectors', 'nope']], [['__proto__']], [['constructor', 'ring']], [['toString', 'lang-variant']],
  [['ring', 'ring']], [['lang-variant', 'vectors']], [['vectors', 'lang-variant']], [['envelope', 'scheduler', 'carried-data']],
  [['']], [['RING', 'ring']], [['ring', 'RING']], [[...KNOWN]],
  [[...KNOWN].reverse()], [['vectors', 'vectors', 'vectors']], [['cross-lang-anchor', 'cross-lang-anchor']],
  [['trace-seam', 'envelope']], [['lifecycle', 'par-interleaving', 'vectors']],
  [['hasOwnProperty']], [['toString']], [['valueOf']], [['__defineGetter__']],
  [['ring', 'constructor']], [['lang-variant', 'isPrototypeOf', 'vectors']], [[...INHERITED]],
  [['scheduler', 'envelope', 'ring']], [['trace-seam', 'trace-seam', 'carried-data']], [['lifecycle', 'cross-lang-anchor']],
  [['par-interleaving', 'vectors', 'envelope', 'lifecycle']], [['carried-data', 'vectors']], [['ring', 'scheduler']],
  ...UNKNOWN_SOLO.map((n) => [[n]]),
  [['nope', 'ring']], [['lang-variant', 'Ring', 'vectors']], [['since', '$comment', '0.5']],
  [['envelope', 'envelope', 'vectors']], [['cross-lang-anchor', 'ring', 'carried-data']], [['vectors', 'trace-seam']],
];

export function genInputs(n, rnd) {
  const out = CURATED.map((a) => [a[0].slice()]);
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const want = Math.max(n, CURATED.length + 24);   // always some seeded fill beyond the prefix
  while (out.length < want) {
    const len = Math.floor(rnd() * 7);              // 0..6 names
    const list = [];
    for (let i = 0; i < len; i++) {
      const r = rnd();
      list.push(r < 0.96 ? pick(KNOWN) : r < 0.98 ? pick(INHERITED) : pick(UNKNOWN));
    }
    out.push([list]);
  }
  return out;
}
