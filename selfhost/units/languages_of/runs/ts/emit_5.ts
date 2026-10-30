type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

const REGISTRY: readonly string[] = ['js', 'ts', 'rust', 'php', 'csharp', 'python']
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/
const SIR_TAIL = /\.[sS][iI][rR]$/
const UNIT_NAME = /^[A-Za-z0-9_][A-Za-z0-9_-]*$/
const VARIANT_KEY = /^lang:[a-z][a-z0-9]*$/

function isMap(v: Json | undefined): v is { readonly [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function baseOf(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? ''
  return last.replace(/^[ \t]+|[ \t]+$/g, '')
}

function claimOf(path: string): string | undefined {
  const base = baseOf(path)
  if (HIDDEN_TAIL.test(base)) throw new Error('hidden tail')
  if (!SIR_TAIL.test(base)) return undefined
  const segs = base.slice(0, -4).split('.')
  const unit = segs[0] ?? ''
  if (unit !== '' && !UNIT_NAME.test(unit)) throw new Error('bad unit')
  if (segs.length > 2) throw new Error('too many segments')
  if (segs.length === 1) return undefined
  const lang = segs[1] ?? ''
  if (lang === '') throw new Error('empty lang')
  return lang
}

function sight(id: string, out: Set<string>): void {
  if (!REGISTRY.includes(id)) throw new Error('unknown language')
  out.add(id)
}

export default function languages_of(input: Json): string[] {
  if (!isMap(input)) throw new Error('input must be a map')
  const out = new Set<string>()
  const files = input['sirFiles']
  if (files !== undefined) {
    if (!Array.isArray(files)) throw new Error('sirFiles must be a list')
    for (const f of files as readonly Json[]) {
      if (typeof f !== 'string') throw new Error('sirFiles element must be text')
      const c = claimOf(f)
      if (c !== undefined) sight(c, out)
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
      let pathLang: string | undefined
      if (typeof sir === 'string') {
        pathLang = claimOf(sir)
        if (!SIR_TAIL.test(baseOf(sir))) throw new Error('sir must name a .sir file')
      }
      if (k !== 'package' && !VARIANT_KEY.test(k)) throw new Error('bad variant key')
      const keyLang = k === 'package' ? undefined : k.slice(5)
      const named: string[] = []
      if (keyLang !== undefined) named.push(keyLang)
      if (own !== undefined) named.push(own)
      if (pathLang !== undefined) named.push(pathLang)
      for (const n of named) if (n !== named[0]) throw new Error('names disagree')
      if ((keyLang !== undefined || own !== undefined) && sir !== undefined && pathLang === undefined) {
        throw new Error('sir names no language')
      }
      if (named.length === 0) continue
      const id = named[0] ?? ''
      sight(id, out)
      if (claimed.has(id)) throw new Error('duplicate claim')
      claimed.add(id)
    }
  }
  return Array.from(out).sort()
}
