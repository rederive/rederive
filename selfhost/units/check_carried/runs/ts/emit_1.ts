import { createHash } from 'node:crypto';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type AssertionResult = { expr: string, equals: Json, got: Json, ok: boolean };
type CarriedCheck = { sha: string, hashOk: boolean | null, results: AssertionResult[], attested: boolean, status: string, entries: number };

function isMap(v: Json | undefined): v is { [key: string]: Json } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function canon(v: Json): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Object.is(v, -0)) throw new Error('carried: no canonical form');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (isMap(v)) {
    const parts: string[] = [];
    for (const k of Object.keys(v).sort()) {
      parts.push(JSON.stringify(k) + ':' + canon(v[k] as Json));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('carried: no canonical form');
}

export default function checkCarried(decl: Json, table: Json): CarriedCheck {
  if (!isMap(decl)) throw new Error('carried: decl must be a map');
  const assertionsRaw: Json | undefined = Object.hasOwn(decl, 'assertions') ? decl['assertions'] : undefined;
  if (!Array.isArray(assertionsRaw)) throw new Error('carried: assertions must be a list');
  const s: Json | undefined = Object.hasOwn(decl, 'sha') ? decl['sha'] : undefined;
  const pinned = s !== undefined && s !== null;
  if (pinned && !(typeof s === 'string' && /^[0-9a-f]{64}$/.test(s))) {
    throw new Error('carried: sha must be 64 lowercase hex');
  }
  if (!isMap(table)) throw new Error('carried: table must be a map');
  const sha = createHash('sha256').update(Buffer.from(canon(table))).digest('hex');
  const hashOk: boolean | null = pinned ? s === sha : null;
  const items: { expr: string, equals: Json }[] = [];
  for (const a of assertionsRaw) {
    if (!isMap(a)) throw new Error('carried: bad assertion');
    const expr = Object.hasOwn(a, 'expr') ? a['expr'] : undefined;
    if (typeof expr !== 'string' || expr === '') throw new Error('carried: bad assertion');
    if (!Object.hasOwn(a, 'equals')) throw new Error('carried: bad assertion');
    const equals = a['equals'] as Json;
    canon(equals);
    items.push({ expr, equals });
  }
  const entries = Object.keys(table).length;
  const results: AssertionResult[] = [];
  for (const it of items) {
    let present = false;
    let got: Json = null;
    if (it.expr === 'count') {
      present = true;
      got = entries;
    } else if (Object.hasOwn(table, it.expr)) {
      present = true;
      got = table[it.expr] as Json;
    }
    const ok = present && canon(got) === canon(it.equals);
    results.push({ expr: it.expr, equals: it.equals, got, ok });
  }
  const attested = hashOk === true && results.length > 0 && results.every((r) => r.ok);
  let status: string;
  if (hashOk === null) status = 'unpinned';
  else if (hashOk === false) status = 'hash-mismatch';
  else if (results.length === 0) status = 'unattested';
  else if (attested) status = 'attested';
  else status = 'authority-FAIL';
  return { sha, hashOk, results, attested, status, entries };
}
