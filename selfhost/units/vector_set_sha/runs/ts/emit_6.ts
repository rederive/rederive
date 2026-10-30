import { createHash } from 'node:crypto';

const HEX16 = /^[0-9a-f]{16}$/;
const CAP = 416;

function isMap(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function own(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function render(v: unknown, depth: number): string {
  if (depth > CAP) throw new Error('nesting too deep');
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
    const t = own(v, 't') ? v['t'] : undefined;
    if (t === 'f64') {
      const bits = own(v, 'bits') ? v['bits'] : undefined;
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw new Error('bad f64 bits');
      return '{"bits":' + render(bits, depth + 1) + ',"t":' + render('f64', depth + 1) + '}';
    }
    if (t === 'throw') {
      return '{"t":' + render('throw', depth + 1) + '}';
    }
    const keys = Object.keys(v).sort();
    const parts: string[] = [];
    for (const k of keys) parts.push(JSON.stringify(k) + ':' + render(v[k], depth + 1));
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not canonical');
}

function cases(list: unknown, depth: number): string {
  if (!Array.isArray(list)) throw new Error('not a list');
  const parts: string[] = [];
  for (let i = 0; i < list.length; i++) {
    if (!(i in list)) throw new Error('hole');
    const c: unknown = list[i];
    if (!isMap(c)) throw new Error('case not a map');
    const a = own(c, 'args') ? c['args'] : undefined;
    const e = own(c, 'expected') ? c['expected'] : undefined;
    if (a === undefined || e === undefined) throw new Error('missing args/expected');
    const cd = depth + 1;
    if (cd > CAP) throw new Error('nesting too deep');
    parts.push('{"args":' + render(a, cd + 1) + ',"expected":' + render(e, cd + 1) + '}');
  }
  return '[' + parts.join(',') + ']';
}

export default function vector_set_sha(oracle: unknown): string {
  if (!isMap(oracle)) throw new Error('oracle not a map');
  if (!own(oracle, 'frozen') || !own(oracle, 'heldout')) throw new Error('missing key');
  const f = oracle['frozen'];
  const h = oracle['heldout'];
  if (!Array.isArray(f) || !Array.isArray(h)) throw new Error('not lists');
  const canon = '{"frozen":' + cases(f, 1) + ',"heldout":' + cases(h, 1) + '}';
  return createHash('sha256').update(canon, 'utf8').digest('hex');
}
