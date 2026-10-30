const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu;
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i;
const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function claimOf(path) {
  const base = path.split(/[\\/]/).pop().replace(/^[ \t]+|[ \t]+$/g, '');
  if (HIDDEN_TAIL.test(base)) throw new Error('invisible tail');
  const m = LANG_SUFFIX.exec(base);
  if (!m) return undefined;
  if (m[1] === '') throw new Error('empty language segment');
  return m[1];
}

function sight(id) {
  if (!REGISTRY.includes(id)) throw new Error('not in registry');
  return id;
}

export default function languages_of(input) {
  if (!isMap(input)) throw new Error('takes a map');
  const out = new Set();
  let files = input.sirFiles;
  if (files === undefined) files = [];
  if (!Array.isArray(files)) throw new Error('sirFiles must be a list');
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('path must be text');
    const c = claimOf(f);
    if (c !== undefined) out.add(sight(c));
  }
  const variants = input.variants;
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants must be a map');
    const claimed = new Set();
    for (const k of Object.keys(variants)) {
      const v = variants[k];
      if (!isMap(v)) throw new Error('variant must be a map');
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang must be text');
      if (v.sir !== undefined && typeof v.sir !== 'string') throw new Error('sir must be text');
      const named = [];
      const hasKey = k.startsWith('lang:');
      if (hasKey) named.push(k.slice(5));
      if (v.lang !== undefined) named.push(v.lang);
      let pathLang;
      if (v.sir !== undefined) {
        pathLang = claimOf(v.sir);
        if (pathLang !== undefined) named.push(pathLang);
      }
      for (const n of named) if (n !== named[0]) throw new Error('names disagree');
      if (hasKey && v.sir !== undefined && pathLang === undefined) throw new Error('sir names no language');
      if (named.length === 0) continue;
      const id = sight(named[0]);
      if (claimed.has(id)) throw new Error('duplicate claim');
      claimed.add(id);
      out.add(id);
    }
  }
  return [...out].sort();
}
