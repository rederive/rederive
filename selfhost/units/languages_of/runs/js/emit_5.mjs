const REGISTRY = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/;
const SIR_TAIL = /\.[sS][iI][rR]$/;
const UNIT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/;
const VARIANT_KEY = /^lang:[a-z][a-z0-9]*$/;

const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const fail = (m) => { throw new Error(m); };

function baseOf(path) {
  return path.split(/[\\/]/).pop().replace(/^[ \t]+|[ \t]+$/g, '');
}

function claimOf(path) {
  const base = baseOf(path);
  if (HIDDEN_TAIL.test(base)) fail('hidden tail');
  if (!SIR_TAIL.test(base)) return undefined;
  const segs = base.slice(0, -4).split('.');
  if (segs[0] !== '' && !UNIT_NAME.test(segs[0])) fail('unit name');
  if (segs.length > 2) fail('too many segments');
  if (segs.length === 1) return undefined;
  if (segs[1] === '') fail('empty lang');
  return segs[1];
}

function sight(id) {
  if (!REGISTRY.includes(id)) fail('unknown language');
  return id;
}

export default function languages_of(input) {
  if (!isMap(input)) fail('input must be a map');
  let files = input.sirFiles;
  if (files === undefined) files = [];
  if (!Array.isArray(files)) fail('sirFiles must be a list');
  const out = new Set();
  for (const f of files) {
    if (typeof f !== 'string') fail('sirFiles element must be text');
    const c = claimOf(f);
    if (c !== undefined) out.add(sight(c));
  }
  const variants = input.variants;
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) fail('variants must be a map');
    const claimed = new Set();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) fail('variant must be a map');
      if (v.lang !== undefined && typeof v.lang !== 'string') fail('lang must be text');
      let pathLang;
      const hasSir = v.sir !== undefined;
      if (hasSir) {
        if (typeof v.sir !== 'string') fail('sir must be text');
        pathLang = claimOf(v.sir);
        if (!SIR_TAIL.test(baseOf(v.sir))) fail('sir must name a .sir file');
      }
      let keyLang;
      if (k === 'package') keyLang = undefined;
      else if (VARIANT_KEY.test(k)) keyLang = k.slice(5);
      else fail('bad variant key');
      const ownLang = v.lang;
      const named = [keyLang, ownLang, pathLang].filter((x) => x !== undefined);
      for (const n of named) if (n !== named[0]) fail('names differ');
      if ((keyLang !== undefined || ownLang !== undefined) && hasSir && pathLang === undefined) {
        fail('sir names no language');
      }
      if (named.length === 0) continue;
      const id = sight(named[0]);
      if (claimed.has(id)) fail('duplicate claim');
      claimed.add(id);
      out.add(id);
    }
  }
  return [...out].sort();
}
