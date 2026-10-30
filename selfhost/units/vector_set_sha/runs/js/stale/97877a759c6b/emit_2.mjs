import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;

function isMap(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;
}

function canon(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const parts = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('not canonical: hole');
      parts.push(canon(v[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (isMap(v)) {
    if (v.t === 'f64') {
      if (typeof v.bits !== 'string' || !HEX16.test(v.bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      return '{"bits":' + JSON.stringify(v.bits) + ',"t":"f64"}';
    }
    if (v.t === 'throw') return '{"t":"throw"}';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('not canonical: ' + (v === null ? 'null' : typeof v));
}

function project(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole in case list');
    const c = list[i];
    if (!isMap(c)) throw new Error('case is not a map');
    if (c.args === undefined || c.expected === undefined) throw new Error('case missing args/expected');
    out.push({ args: c.args, expected: c.expected });
  }
  return out;
}

export default function vector_set_sha(oracle) {
  if (!isMap(oracle)) throw new Error('oracle is not a map');
  const f = oracle.frozen;
  const h = oracle.heldout;
  if (!Array.isArray(f) || !Array.isArray(h)) throw new Error('frozen/heldout must be lists');
  const projection = { frozen: project(f), heldout: project(h) };
  return createHash('sha256').update(canon(projection), 'utf8').digest('hex');
}
