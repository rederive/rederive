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
  let S;
  if (Object.hasOwn(decl, 'sha')) S = decl.sha;
  const absent = S === undefined || S === null;
  if (!absent && !(typeof S === 'string' && /^[0-9a-f]{64}$/.test(S))) throw new Error('carried: sha must be 64 lowercase hex');
  if (!isMap(table)) throw new Error('carried: table must be a map');
  const sha = createHash('sha256').update(Buffer.from(canon(table), 'utf8')).digest('hex');
  const assertions = decl.assertions;
  for (const A of assertions) {
    if (!isMap(A) || !Object.hasOwn(A, 'expr') || typeof A.expr !== 'string' || A.expr === '' || !Object.hasOwn(A, 'equals')) {
      throw new Error('carried: bad assertion');
    }
    canon(A.equals);
  }
  const entries = Object.keys(table).length;
  const hashOk = absent ? null : S === sha;
  const results = assertions.map((A) => {
    let got;
    let present = true;
    if (A.expr === 'count') got = entries;
    else if (Object.hasOwn(table, A.expr)) got = table[A.expr];
    else present = false;
    const ok = present && canon(got) === canon(A.equals);
    return { expr: A.expr, equals: A.equals, got: present ? got : null, ok };
  });
  const attested = hashOk === true && assertions.length > 0 && results.every((r) => r.ok);
  let status;
  if (hashOk === null) status = 'unpinned';
  else if (hashOk === false) status = 'hash-mismatch';
  else if (assertions.length === 0) status = 'unattested';
  else if (attested) status = 'attested';
  else status = 'authority-FAIL';
  return { sha, hashOk, results, attested, status, entries };
}
