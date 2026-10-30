const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/;
const SIR_TAIL = /\.[sS][iI][rR]$/;
const UNIT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const VARIANT_KEY = /^lang:[a-z][a-z0-9]*$/;

const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function baseOf(path) {
  return path.split(/[\\/]/).pop().replace(/^[ \t]+|[ \t]+$/g, '');
}

function claimOf(path) {
  const base = baseOf(path);
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail');
  if (!SIR_TAIL.test(base)) return null;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('bad unit');
  if (segs.length > 2) throw new Error('too many segments');
  if (segs.length === 1) return null;
  if (segs[1] === '') throw new Error('empty lang');
  return segs[1];
}

function sight(id) {
  if (!REGISTRY.includes(id)) throw new Error('unknown language');
  return id;
}

export default function languages_of(input) {
  if (!isMap(input)) throw new Error('languagesOf takes a map');
  const out = new Set();
  let files = input.sirFiles;
  if (files === undefined) files = [];
  if (!Array.isArray(files)) throw new Error('sirFiles must be a list');
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('sirFiles element not text');
    const c = claimOf(f);
    if (c !== null) out.add(sight(c));
  }
  const variants = input.variants;
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants must be a map');
    const claimed = new Set();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant is a map');
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang not text');
      const hasSir = v.sir !== undefined;
      let pathLang = null;
      if (hasSir) {
        if (typeof v.sir !== 'string') throw new Error('sir not text');
        pathLang = claimOf(v.sir);
        if (!SIR_TAIL.test(baseOf(v.sir))) throw new Error('sir not a .sir file');
      }
      let keyLang = null;
      if (k === 'package') keyLang = null;
      else if (VARIANT_KEY.test(k)) keyLang = k.slice(5);
      else throw new Error('bad variant key');
      const own = v.lang !== undefined ? v.lang : null;
      const named = [keyLang, own, pathLang].filter((x) => x !== null);
      for (const n of named) if (n !== named[0]) throw new Error('names disagree');
      if ((keyLang !== null || own !== null) && hasSir && pathLang === null) throw new Error('sir names no language');
      if (named.length === 0) continue;
      const id = sight(named[0]);
      if (claimed.has(id)) throw new Error('duplicate claim');
      claimed.add(id);
      out.add(id);
    }
  }
  return [...out].sort();
}
