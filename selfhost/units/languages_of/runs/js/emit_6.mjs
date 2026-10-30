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
  if (!SIR_TAIL.test(base)) return undefined;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) throw new Error('unit name');
  if (segs.length > 2) throw new Error('too many segments');
  if (segs.length === 1) return undefined;
  if (segs[1] === '') throw new Error('empty lang');
  return segs[1];
}

function sight(id) {
  if (!REGISTRY.includes(id)) throw new Error('unknown language');
  return id;
}

export default function languages_of(input) {
  if (!isMap(input)) throw new Error('languagesOf takes a map');
  let files = input.sirFiles;
  if (files === undefined) files = [];
  if (!Array.isArray(files)) throw new Error('sirFiles must be a list');
  const out = new Set();
  for (const f of files) {
    if (typeof f !== 'string') throw new Error('sirFiles element must be text');
    const c = claimOf(f);
    if (c !== undefined) out.add(sight(c));
  }
  const variants = input.variants;
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants must be a map');
    const claimed = new Map();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant must be a map');
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error('lang must be text');
      let pathLang;
      const hasSir = v.sir !== undefined;
      if (hasSir) {
        if (typeof v.sir !== 'string') throw new Error('sir must be text');
        pathLang = claimOf(v.sir);
        if (!SIR_TAIL.test(baseOf(v.sir))) throw new Error('sir must name a .sir file');
      }
      let keyLang;
      if (k !== 'package') {
        if (!VARIANT_KEY.test(k)) throw new Error('bad variant key');
        keyLang = k.slice(5);
      }
      const own = v.lang;
      const named = [keyLang, own, pathLang].filter((x) => x !== undefined);
      for (const n of named) if (n !== named[0]) throw new Error('languages differ');
      if ((keyLang !== undefined || own !== undefined) && hasSir && pathLang === undefined) {
        throw new Error('sir names no language');
      }
      if (named.length === 0) continue;
      const id = sight(named[0]);
      if (claimed.has(id)) throw new Error('duplicate claim');
      claimed.set(id, k);
      out.add(id);
    }
  }
  return [...out].sort();
}
