type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

const REGISTRY: readonly string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python']
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i

function isMap(v: Json | undefined): v is { readonly [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function claimOf(path: string): string | null {
  const base = (path.split(/[\\/]/).pop() ?? '').replace(/^[ \t]+|[ \t]+$/g, '')
  if (HIDDEN_TAIL.test(base)) throw new Error('invisible tail')
  const m = LANG_SUFFIX.exec(base)
  if (m === null) return null
  const seg = m[1] ?? ''
  if (seg === '') throw new Error('empty language segment')
  return seg
}

function sight(id: string): string {
  if (!REGISTRY.includes(id)) throw new Error('not in registry')
  return id
}

// languages_of: the sorted, de-duplicated registry languages a SIR bundle carries.
export default function languages_of(input: Json): string[] {
  if (!isMap(input)) throw new Error('input must be a map')
  const out = new Set<string>()
  const files = input['sirFiles']
  if (files !== undefined) {
    if (!Array.isArray(files)) throw new Error('sirFiles must be a list')
    for (const f of files as readonly Json[]) {
      if (typeof f !== 'string') throw new Error('path must be text')
      const c = claimOf(f)
      if (c !== null) out.add(sight(c))
    }
  }
  const variants = input['variants']
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants must be a map')
    const claimed = new Set<string>()
    for (const k of Object.keys(variants)) {
      const v = variants[k]
      if (!isMap(v)) throw new Error('variant must be a map')
      const own = v['lang']
      const sir = v['sir']
      if (own !== undefined && typeof own !== 'string') throw new Error('lang must be text')
      if (sir !== undefined && typeof sir !== 'string') throw new Error('sir must be text')
      const named: string[] = []
      let keyLang: string | undefined
      if (k.startsWith('lang:')) {
        keyLang = k.slice(5)
        named.push(keyLang)
      }
      if (own !== undefined) named.push(own)
      let pathLang: string | null = null
      if (sir !== undefined) {
        pathLang = claimOf(sir)
        if (pathLang !== null) named.push(pathLang)
      }
      for (const n of named) if (n !== named[0]) throw new Error('names disagree')
      if (keyLang !== undefined && sir !== undefined && pathLang === null) throw new Error('sir names no language')
      const id = named[0]
      if (id === undefined) continue
      sight(id)
      if (claimed.has(id)) throw new Error('duplicate claim')
      claimed.add(id)
      out.add(id)
    }
  }
  return Array.from(out).sort()
}
