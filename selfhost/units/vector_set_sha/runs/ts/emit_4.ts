import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;
const CAP = 416;

function isMap(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function own(o: Record<string, unknown>, k: string): unknown {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function render(v: unknown, d: number): string {
  if (d > CAP) throw new Error('nesting too deep');
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) {
    const parts: string[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      parts.push(render(v[i], d + 1));
    }
    return '[' + parts.join(',') + ']';
  }
  if (isMap(v)) {
    const t = own(v, 't');
    if (t === 'f64') {
      const bits = own(v, 'bits');
      if (typeof bits !== 'string' || !HEX16.test(bits)) {
        throw new Error('not canonical: an f64 tag without 16-hex bits');
      }
      return '{"bits":' + render(bits, d + 1) + ',"t":' + render('f64', d + 1) + '}';
    }
    if (t === 'throw') {
      return '{"t":' + render('throw', d + 1) + '}';
    }
    const parts: string[] = [];
    for (const k of Object.keys(v).sort()) {
      parts.push(JSON.stringify(k) + ':' + render(v[k], d + 1));
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical');
}

function project(list: unknown): Array<{ args: unknown; expected: unknown }> {
  if (!Array.isArray(list)) throw new Error('not a list');
  const out: Array<{ args: unknown; expected: unknown }> = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole');
    const c: unknown = list[i];
    if (!isMap(c)) throw new Error('case not a map');
    const args = own(c, 'args');
    const expected = own(c, 'expected');
    if (args === undefined || expected === undefined) throw new Error('missing key');
    out.push({ args, expected });
  }
  return out;
}

export default function vector_set_sha(oracle: unknown): string {
  if (!isMap(oracle)) throw new Error('oracle not a map');
  const frozen = project(own(oracle, 'frozen'));
  const heldout = project(own(oracle, 'heldout'));
  const canon = render({ frozen, heldout }, 0);
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
