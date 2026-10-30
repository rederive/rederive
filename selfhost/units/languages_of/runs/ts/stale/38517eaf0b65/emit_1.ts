type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

const REGISTRY: readonly string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python']
const HIDDEN_TAIL = /\.sir[\p{White_Space}\p{Cc}\p{Cf}]+$/iu
const LANG_SUFFIX = /\.([^./\\]*)\.sir$/i

function isMap(v: Json | undefined): v is { readonly [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function has(m: { readonly [key: string]: Json }, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(m, k)
}

function claimOf(path: string): string | undefined {
  const base = (path.split(/[\\/]/).pop() ?? '').replace(/^[ \t]+|[ \t]+$/g, '')
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail')
  const m = LANG_SUFFIX.exec(base)
  if (m === null) return undefined
  const seg = m[1] ?? ''
  if (seg === '') throw new Error('empty language segment')
  return seg
}

function sight(id: string): string {
  if (!REGISTRY.includes(id)) throw new Error('not in registry')
  return id
}

export default function languages_of(input: Json): string[] {
  if (!isMap(input)) throw new Error('input must be a map')
  const out = new Set<string>()

  let files: readonly Json[] = []
  if (has(input, 'sirFiles')) {
    const f = input['sirFiles']
    if (!Array.isArray(f)) throw new Error('sirFiles must be a list')
    files = f as readonly Json[]
  }
  for (const el of files) {
    if (typeof el !== 'string') throw new Error('sirFiles element must be text')
    const c = claimOf(el)
    if (c !== undefined) out.add(sight(c))
  }

  let variants: { readonly [key: string]: Json } = {}
  if (has(input, 'variants')) {
    const v = input['variants']
    if (v !== null) {
      if (!isMap(v)) throw new Error('variants must be a map')
      variants = v
    }
  }
  const claimed = new Set<string>()
  for (const k of Object.keys(variants)) {
    const v = variants[k]
    if (!isMap(v)) throw new Error('variant must be a map')
    let own: string | undefined
    let sir: string | undefined
    if (has(v, 'lang')) {
      const l = v['lang']
      if (typeof l !== 'string') throw new Error('lang must be text')
      own = l
    }
    if (has(v, 'sir')) {
      const s = v['sir']
      if (typeof s !== 'string') throw new Error('sir must be text')
      sir = s
    }
    const keyLang = k.startsWith('lang:') ? k.slice(5) : undefined
    const pathLang = sir !== undefined ? claimOf(sir) : undefined
    const named: string[] = []
    if (keyLang !== undefined) named.push(keyLang)
    if (own !== undefined) named.push(own)
    if (pathLang !== undefined) named.push(pathLang)
    for (const n of named) if (n !== named[0]) throw new Error('variant names disagree')
    if (keyLang !== undefined && sir !== undefined && pathLang === undefined) {
      throw new Error('sir path names no language')
    }
    const id = named[0]
    if (id === undefined) continue
    sight(id)
    if (claimed.has(id)) throw new Error('two variants claim one language')
    claimed.add(id)
    out.add(id)
  }
  return Array.from(out).sort()
}
