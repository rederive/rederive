import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;
const CAP = 416;

function isMap(o) {
  if (o === null || typeof o !== 'object' || Array.isArray(o)) return false;
  const p = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;
}

function render(v, d) {
  if (d > CAP) throw new Error('nesting too deep');
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const parts = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      parts.push(render(v[i], d + 1));
    }
    return '[' + parts.join(',') + ']';
  }
  if (isMap(v)) {
    if (v.t === 'f64') {
      if (d + 1 > CAP) throw new Error('nesting too deep');
      const bits = v.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw new Error('not canonical: an f64 tag without 16-hex bits');
      return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
    }
    if (v.t === 'throw') {
      if (d + 1 > CAP) throw new Error('nesting too deep');
      return '{"t":"throw"}';
    }
    const keys = Object.keys(v).sort();
    const parts = [];
    for (const k of keys) parts.push(JSON.stringify(k) + ':' + render(v[k], d + 1));
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical');
}

function cases(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole');
    const c = list[i];
    if (!isMap(c)) throw new Error('case not a map');
    const args = c.args;
    const expected = c.expected;
    if (args === undefined || expected === undefined) throw new Error('missing args/expected');
    out.push({ args, expected });
  }
  return out;
}

export default function vector_set_sha(oracle) {
  if (!isMap(oracle)) throw new Error('oracle not a map');
  const f = oracle.frozen;
  const h = oracle.heldout;
  if (!Array.isArray(f) || !Array.isArray(h)) throw new Error('frozen/heldout not lists');
  const proj = { frozen: cases(f), heldout: cases(h) };
  const canon = render(proj, 0);
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
