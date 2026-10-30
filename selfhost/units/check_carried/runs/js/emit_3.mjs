import { createHash } from 'node:crypto';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function canon(v) {
  if (v === null) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || Object.is(v, -0)) throw new Error('carried: no canonical form');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (isMap(v)) {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('carried: no canonical form');
}

export default function checkCarried(decl, table) {
  if (!isMap(decl)) throw new Error('carried: decl must be a map');
  if (!Object.hasOwn(decl, 'assertions') || !Array.isArray(decl.assertions)) throw new Error('carried: assertions must be a list');
  const S = Object.hasOwn(decl, 'sha') ? decl.sha : undefined;
  const absent = S === undefined || S === null;
  if (!absent && !(typeof S === 'string' && /^[0-9a-f]{64}$/.test(S))) {
    throw new Error('carried: sha must be 64 lowercase hex');
  }
  if (!isMap(table)) throw new Error('carried: table must be a map');
  const text = canon(table);
  const assertions = decl.assertions;
  const eq = assertions.map((a) => {
    if (!isMap(a) || typeof a.expr !== 'string' || !Object.hasOwn(a, 'expr') || a.expr === '' || !Object.hasOwn(a, 'equals')) {
      throw new Error('carried: bad assertion');
    }
    return canon(a.equals);
  });
  const sha = createHash('sha256').update(Buffer.from(text)).digest('hex');
  const hashOk = absent ? null : S === sha;
  const entries = Object.keys(table).length;
  const results = assertions.map((a, i) => {
    let present = true;
    let got;
    if (a.expr === 'count') got = entries;
    else if (Object.hasOwn(table, a.expr)) got = table[a.expr];
    else { present = false; got = null; }
    const ok = present && canon(got) === eq[i];
    return { expr: a.expr, equals: a.equals, got, ok };
  });
  const attested = hashOk === true && results.length > 0 && results.every((r) => r.ok);
  let status;
  if (hashOk === null) status = 'unpinned';
  else if (hashOk === false) status = 'hash-mismatch';
  else if (results.length === 0) status = 'unattested';
  else if (attested) status = 'attested';
  else status = 'authority-FAIL';
  return { sha, hashOk, results, attested, status, entries };
}
