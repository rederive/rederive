import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;
const CAP = 416;

function render(v, d) {
  if (d > CAP) throw new Error('nesting too deep');
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const parts = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('not canonical: hole');
      parts.push(render(v[i], d + 1));
    }
    return '[' + parts.join(',') + ']';
  }
  if (typeof v === 'object' && v !== null) {
    if (v.t === 'f64') {
      const bits = v.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      render('f64', d + 1);
      render(bits, d + 1);
      return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
    }
    if (v.t === 'throw') {
      render('throw', d + 1);
      return '{"t":"throw"}';
    }
    const keys = Object.keys(v).sort();
    const parts = [];
    for (const k of keys) {
      parts.push(JSON.stringify(k) + ':' + render(v[k], d + 1));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical: ' + (v === null ? 'null' : typeof v));
}

function cases(list) {
  if (!Array.isArray(list)) throw new Error('not a list');
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole');
    const c = list[i];
    if (typeof c !== 'object' || c === null || Array.isArray(c)) throw new Error('case not a map');
    if (c.args === undefined || c.expected === undefined) throw new Error('missing args/expected');
    out.push({ args: c.args, expected: c.expected });
  }
  return out;
}

export default function vector_set_sha(oracle) {
  if (typeof oracle !== 'object' || oracle === null || Array.isArray(oracle)) {
    throw new Error('oracle not a map');
  }
  const frozen = cases(oracle.frozen);
  const heldout = cases(oracle.heldout);
  const canon = render({ frozen, heldout }, 0);
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
