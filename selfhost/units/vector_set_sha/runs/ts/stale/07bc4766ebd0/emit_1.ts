import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;

function isPlain(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
}

function canon(v: unknown): string {
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('not canonical: hole');
      parts.push(canon(v[i]));
    }
    return '[' + parts.join(',') + ']';
  }
  if (isPlain(v)) {
    if (v['t'] === 'f64') {
      const bits = v['bits'];
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw new Error('not canonical: an f64 tag without 16-hex bits');
      return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
    }
    if (v['t'] === 'throw') return '{"t":"throw"}';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  }
  throw new Error('not canonical: ' + typeof v);
}

function project(list: unknown): { args: unknown; expected: unknown }[] {
  if (!Array.isArray(list)) throw new Error('not a list');
  const out: { args: unknown; expected: unknown }[] = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole');
    const c: unknown = list[i];
    if (!isPlain(c)) throw new Error('case not a map');
    const args = c['args'];
    const expected = c['expected'];
    if (args === undefined || expected === undefined) throw new Error('missing args/expected');
    out.push({ args, expected });
  }
  return out;
}

export default function vector_set_sha(oracle: unknown): string {
  if (!isPlain(oracle)) throw new Error('oracle not a map');
  const frozen = project(oracle['frozen']);
  const heldout = project(oracle['heldout']);
  const text = canon({ frozen, heldout });
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
