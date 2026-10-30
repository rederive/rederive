type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type JMap = { readonly [key: string]: Json };

const REGISTRY: readonly string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python'];
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu;
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i;

function isMap(v: Json | undefined): v is JMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function claimOf(path: string): string | null {
  const base = (path.split(/[\\/]/).pop() ?? '').replace(/^[ \t]+|[ \t]+$/g, '');
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail');
  const m = LANG_SUFFIX.exec(base);
  if (m === null) return null;
  const seg = m[1] ?? '';
  if (seg === '') throw new Error('empty language segment');
  return seg;
}

function sight(id: string): string {
  if (!REGISTRY.includes(id)) throw new Error('not in registry');
  return id;
}

export default function languages_of(input: Json): string[] {
  if (!isMap(input)) throw new Error('input must be a map');
  const out = new Set<string>();

  const files = input['sirFiles'];
  if (files !== undefined) {
    if (!Array.isArray(files)) throw new Error('sirFiles must be a list');
    for (const f of files as readonly Json[]) {
      if (typeof f !== 'string') throw new Error('sirFiles element must be text');
      const c = claimOf(f);
      if (c !== null) out.add(sight(c));
    }
  }

  const variants = input['variants'];
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants must be a map');
    const claimed = new Set<string>();
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant must be a map');
      const lang = v['lang'];
      const sir = v['sir'];
      if (lang !== undefined && typeof lang !== 'string') throw new Error('lang must be text');
      if (sir !== undefined && typeof sir !== 'string') throw new Error('sir must be text');
      const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined;
      const pathLang = sir !== undefined ? claimOf(sir) : undefined;
      const named: string[] = [];
      if (keyLang !== undefined) named.push(keyLang);
      if (lang !== undefined) named.push(lang);
      if (pathLang !== undefined && pathLang !== null) named.push(pathLang);
      for (const n of named) if (n !== named[0]) throw new Error('names disagree');
      if (keyLang !== undefined && sir !== undefined && pathLang === null) throw new Error('sir names no language');
      const id = named[0];
      if (id === undefined) continue;
      sight(id);
      if (claimed.has(id)) throw new Error('duplicate claim');
      claimed.add(id);
      out.add(id);
    }
  }

  return Array.from(out).sort();
}
