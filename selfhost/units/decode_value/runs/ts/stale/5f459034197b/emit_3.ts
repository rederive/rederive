const KEYS: Record<string, string[]> = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};
const BASE64_CANONICAL = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fail(m: string): never {
  throw new Error('not a canonical tree: ' + m);
}

function put(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function decimal(v: unknown): bigint {
  if (typeof v !== 'string' || !DECIMAL.test(v)) fail('v must be a decimal string');
  return BigInt(v);
}

function decodeBytes(v: unknown): Uint8Array {
  if (typeof v !== 'string' || !BASE64_CANONICAL.test(v)) fail('bad base64');
  const s = v.slice(7);
  const out: number[] = [];
  let i = 0;
  while (i < s.length) {
    const g = s.slice(i, i + 4);
    i += 4;
    const pad = g.indexOf('=');
    const body = pad < 0 ? g : g.slice(0, pad);
    const idx: number[] = [];
    for (const c of body) idx.push(ALPHA.indexOf(c));
    if (idx.length === 4) {
      out.push((idx[0] << 2) | (idx[1] >> 4), ((idx[1] & 15) << 4) | (idx[2] >> 2), ((idx[2] & 3) << 6) | idx[3]);
    } else if (idx.length === 3) {
      if ((idx[2] & 3) !== 0) fail('non-zero padding bits');
      out.push((idx[0] << 2) | (idx[1] >> 4), ((idx[1] & 15) << 4) | (idx[2] >> 2));
    } else {
      if ((idx[1] & 15) !== 0) fail('non-zero padding bits');
      out.push((idx[0] << 2) | (idx[1] >> 4));
    }
  }
  return new Uint8Array(out);
}

function dec(tree: unknown): unknown {
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) fail('not a node');
  const node = tree as Record<string, unknown>;
  const t = node['t'];
  if (typeof t !== 'string') fail('t must be text');
  if (!Object.prototype.hasOwnProperty.call(KEYS, t)) fail('unknown tag');
  const allowed = KEYS[t];
  for (const k of Object.keys(node)) if (!allowed.includes(k)) fail('unexpected entry ' + k);
  const v = node['v'];
  switch (t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'text': {
      const cu = node['cu'];
      if (typeof v !== 'string') fail('text v');
      if (cu !== 'utf8' && cu !== 'utf16') fail('bad cu');
      if (cu === 'utf8' && !v.isWellFormed()) fail('not well-formed');
      return v;
    }
    case 'bool':
      if (typeof v !== 'boolean') fail('bool v');
      return v;
    case 'bigint': return decimal(v);
    case 'i64':
    case 'u64': {
      const n = decimal(v);
      const lo = t === 'i64' ? -(2n ** 63n) : 0n;
      const hi = t === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (n < lo || n > hi) fail('out of range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': return decodeBytes(v);
    case 'f64': {
      const bits = node['bits'];
      if (typeof v !== 'string') fail('f64 v');
      if (typeof bits !== 'string' || !HEX16.test(bits)) fail('bad bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (Number.isNaN(f) && bits !== '7ff8000000000000') fail('non-canonical NaN');
      return f;
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) fail('v must be a list');
      const out: unknown[] = [];
      for (const e of v as unknown[]) out.push(dec(e));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) fail('v must be a list');
      const o: Record<string, unknown> = {};
      let prev: string | undefined;
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('entry must be a pair');
        const k = dec(e[0]);
        if (typeof k !== 'string') fail('key must be text');
        if (prev !== undefined && !(prev < k)) fail('map entries out of canonical order');
        prev = k;
        put(o, k, dec(e[1]));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(v)) fail('v must be a list');
      const o: Record<string, unknown> = {};
      const seen = new Set<string>();
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string') fail('bad field');
        const k: string = e[0];
        if (seen.has(k)) fail('duplicate name');
        seen.add(k);
        put(o, k, dec(e[1]));
      }
      return o;
    }
    default: {
      const msg = node['msg'];
      if (typeof msg !== 'string') fail('throw msg');
      const o: Record<string, unknown> = {};
      put(o, '__threw', msg);
      return o;
    }
  }
}

export default function decode_value(tree: unknown): unknown {
  return dec(tree);
}
