import { createHash } from 'node:crypto';

const isMap = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const own = (o, k) => Object.hasOwn(o, k);
const getOwn = (o, k) => Object.getOwnPropertyDescriptor(o, k).value;

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
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(getOwn(v, k))).join(',') + '}';
  }
  throw new Error('carried: no canonical form');
}

export default function checkCarried(decl, table) {
  if (!isMap(decl)) throw new Error('carried: decl must be a map');
  if (!own(decl, 'assertions') || !Array.isArray(getOwn(decl, 'assertions'))) throw new Error('carried: assertions must be a list');
  const assertions = getOwn(decl, 'assertions');
  const S = own(decl, 'sha') ? getOwn(decl, 'sha') : undefined;
  const absent = S === undefined || S === null;
  if (!absent && !(typeof S === 'string' && /^[0-9a-f]{64}$/.test(S))) {
    throw new Error('carried: sha must be 64 lowercase hex');
  }
  if (!isMap(table)) throw new Error('carried: table must be a map');
  const sha = createHash('sha256').update(Buffer.from(canon(table))).digest('hex');
  const eq = [];
  for (const A of assertions) {
    if (!isMap(A) || !own(A, 'expr') || typeof getOwn(A, 'expr') !== 'string' || getOwn(A, 'expr') === '' || !own(A, 'equals')) {
      throw new Error('carried: bad assertion');
    }
    eq.push(canon(getOwn(A, 'equals')));
  }
  const hashOk = absent ? null : S === sha;
  const entries = Object.keys(table).length;
  const results = assertions.map((A, i) => {
    const expr = getOwn(A, 'expr');
    const equals = getOwn(A, 'equals');
    let got;
    let present = true;
    if (expr === 'count') got = entries;
    else if (own(table, expr)) got = getOwn(table, expr);
    else present = false;
    const ok = present && canon(got) === eq[i];
    return { expr, equals, got: present ? got : undefined, ok };
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
