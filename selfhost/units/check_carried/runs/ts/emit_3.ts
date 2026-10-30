import { createHash } from 'node:crypto'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type AssertionResult = { expr: string, equals: Json, got: Json, ok: boolean }
type CarriedCheck = { sha: string, hashOk: boolean | null, results: AssertionResult[], attested: boolean, status: string, entries: number }

function isMap(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function canon(v: Json): string {
  if (v === null) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Object.is(v, -0)) throw new Error('carried: no canonical form')
    return JSON.stringify(v)
  }
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'
  if (isMap(v)) {
    const parts: string[] = []
    for (const k of Object.keys(v).sort()) {
      parts.push(JSON.stringify(k) + ':' + canon(v[k] as Json))
    }
    return '{' + parts.join(',') + '}'
  }
  throw new Error('carried: not json')
}

export default function checkCarried(decl: Json, table: Json): CarriedCheck {
  if (!isMap(decl)) throw new Error('carried: decl must be a map')
  if (!Object.hasOwn(decl, 'assertions')) throw new Error('carried: assertions required')
  const assertions = decl['assertions']
  if (!Array.isArray(assertions)) throw new Error('carried: assertions must be a list')
  const S: Json | undefined = Object.hasOwn(decl, 'sha') ? decl['sha'] : undefined
  let pin: string | null = null
  if (S !== undefined && S !== null) {
    if (typeof S !== 'string' || !/^[0-9a-f]{64}$/.test(S)) throw new Error('carried: sha must be 64 lowercase hex')
    pin = S
  }
  if (!isMap(table)) throw new Error('carried: table must be a map')
  const sha = createHash('sha256').update(Buffer.from(canon(table))).digest('hex')
  const hashOk: boolean | null = pin === null ? null : pin === sha
  const keys = Object.keys(table)
  const entries = keys.length
  const results: AssertionResult[] = []
  const pending: { expr: string, equals: Json }[] = []
  for (const a of assertions) {
    if (!isMap(a)) throw new Error('carried: assertion must be a map')
    if (!Object.hasOwn(a, 'expr') || !Object.hasOwn(a, 'equals')) throw new Error('carried: assertion needs expr and equals')
    const expr = a['expr']
    if (typeof expr !== 'string' || expr === '') throw new Error('carried: bad expr')
    const equals = a['equals'] as Json
    canon(equals)
    pending.push({ expr, equals })
  }
  for (const { expr, equals } of pending) {
    let present = false
    let got: Json = null
    if (expr === 'count') {
      present = true
      got = entries
    } else if (Object.hasOwn(table, expr)) {
      present = true
      got = table[expr] as Json
    }
    const ok = present && canon(got) === canon(equals)
    results.push({ expr, equals, got, ok })
  }
  const attested = hashOk === true && results.length > 0 && results.every((r) => r.ok)
  let status: string
  if (hashOk === null) status = 'unpinned'
  else if (hashOk === false) status = 'hash-mismatch'
  else if (results.length === 0) status = 'unattested'
  else if (attested) status = 'attested'
  else status = 'authority-FAIL'
  return { sha, hashOk, results, attested, status, entries }
}
