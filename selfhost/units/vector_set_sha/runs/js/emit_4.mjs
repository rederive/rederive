import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;
const CAP = 416;

function isMap(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

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
  if (isMap(v)) {
    if (v.t === 'f64') {
      const bits = v.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw new Error('not canonical: an f64 tag without 16-hex bits');
      return '{"bits":' + render(bits, d + 1) + ',"t":' + render('f64', d + 1) + '}';
    }
    if (v.t === 'throw') return '{"t":' + render('throw', d + 1) + '}';
    const keys = Object.keys(v).sort();
    const parts = [];
    for (const k of keys) parts.push(JSON.stringify(k) + ':' + render(v[k], d + 1));
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical: ' + (v === null ? 'none' : typeof v));
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
  const proj = { frozen: project(f), heldout: project(h) };
  const canon = render(proj, 0);
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
