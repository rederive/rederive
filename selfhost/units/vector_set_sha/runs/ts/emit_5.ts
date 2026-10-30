import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;
const MAX_DEPTH = 416;

function isMap(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function render(v: unknown, depth: number): string {
  if (depth > MAX_DEPTH) throw new Error('nesting too deep');
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      parts.push(render(v[i], depth + 1));
    }
    return '[' + parts.join(',') + ']';
  }
  if (isMap(v)) {
    const t = v['t'];
    if (t === 'f64') {
      const bits = v['bits'];
      if (depth + 1 > MAX_DEPTH) throw new Error('nesting too deep');
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw new Error('bad f64 bits');
      return '{"bits":' + JSON.stringify(bits) + ',"t":"f64"}';
    }
    if (t === 'throw') {
      if (depth + 1 > MAX_DEPTH) throw new Error('nesting too deep');
      return '{"t":"throw"}';
    }
    const keys = Object.keys(v).sort();
    const parts: string[] = [];
    for (const k of keys) {
      parts.push(JSON.stringify(k) + ':' + render(v[k], depth + 1));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical');
}

function project(list: unknown): { args: unknown; expected: unknown }[] {
  if (!Array.isArray(list)) throw new Error('not a list');
  const out: { args: unknown; expected: unknown }[] = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole');
    const c: unknown = list[i];
    if (!isMap(c)) throw new Error('case not a map');
    const args = c['args'];
    const expected = c['expected'];
    if (args === undefined || expected === undefined) throw new Error('missing key');
    out.push({ args, expected });
  }
  return out;
}

export default function vector_set_sha(oracle: unknown): string {
  if (!isMap(oracle)) throw new Error('oracle not a map');
  const frozen = project(oracle['frozen']);
  const heldout = project(oracle['heldout']);
  const canon = render({ frozen, heldout }, 0);
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
