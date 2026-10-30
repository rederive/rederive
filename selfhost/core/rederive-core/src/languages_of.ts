type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

const REGISTRY: readonly string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python']
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/
const SIR_TAIL = /\.[sS][iI][rR]$/
const UNIT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/
const VARIANT_KEY = /^lang:[a-z][a-z0-9]*$/

type JMap = { readonly [key: string]: Json }

function isMap(v: Json | undefined): v is JMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function baseOf(path: string): string {
  const b = path.split(/[\\/]/).pop() ?? ''
  return b.replace(/^[ \t]+|[ \t]+$/g, '')
}

function claimOf(path: string): string | null {
  const base = baseOf(path)
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail')
  if (!SIR_TAIL.test(base)) return null
  const segs = base.slice(0, -4).split('.')
  const unit = segs[0] ?? ''
  if (unit !== '' && !UNIT_NAME.test(unit)) throw new Error('bad unit')
  if (segs.length > 2) throw new Error('too many segments')
  if (segs.length === 1) return null
  const lang = segs[1] ?? ''
  if (lang === '') throw new Error('empty lang')
  return lang
}

function sight(id: string): string {
  if (!REGISTRY.includes(id)) throw new Error('unknown language')
  return id
}

export default function languages_of(input: Json): string[] {
  if (!isMap(input)) throw new Error('input must be a map')
  const out = new Set<string>()
  const files = input['sirFiles']
  let list: readonly Json[] = []
  if (files !== undefined) {
    if (!Array.isArray(files)) throw new Error('sirFiles must be a list')
    list = files
  }
  for (const f of list) {
    if (typeof f !== 'string') throw new Error('sirFiles element must be text')
    const c = claimOf(f)
    if (c !== null) out.add(sight(c))
  }
  const variants = input['variants']
  if (variants !== undefined && variants !== null) {
    if (!isMap(variants)) throw new Error('variants must be a map')
    const claimed = new Set<string>()
    for (const [k, v] of Object.entries(variants)) {
      if (!isMap(v)) throw new Error('variant must be a map')
      const lang = v['lang']
      const sir = v['sir']
      if (lang !== undefined && typeof lang !== 'string') throw new Error('lang must be text')
      if (sir !== undefined && typeof sir !== 'string') throw new Error('sir must be text')
      let pathLang: string | null = null
      if (typeof sir === 'string') {
        pathLang = claimOf(sir)
        if (!SIR_TAIL.test(baseOf(sir))) throw new Error('sir must name a .sir file')
      }
      let keyLang: string | null = null
      if (k !== 'package') {
        if (!VARIANT_KEY.test(k)) throw new Error('bad variant key')
        keyLang = k.slice(5)
      }
      const named: string[] = []
      if (keyLang !== null) named.push(keyLang)
      if (typeof lang === 'string') named.push(lang)
      if (pathLang !== null) named.push(pathLang)
      const first = named[0]
      for (const n of named) if (n !== first) throw new Error('names disagree')
      if ((keyLang !== null || typeof lang === 'string') && typeof sir === 'string' && pathLang === null) {
        throw new Error('sir names no language')
      }
      if (first === undefined) continue
      sight(first)
      if (claimed.has(first)) throw new Error('duplicate claim')
      claimed.add(first)
      out.add(first)
    }
  }
  return [...out].sort()
}
