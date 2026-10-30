type Obj = Record<string, unknown>;

const KEYS: Record<string, string[]> = {
  none: ['t'],
  undefined: ['t'],
  bool: ['t', 'v'],
  bigint: ['t', 'v'],
  bytes: ['t', 'v'],
  i64: ['t', 'v'],
  u64: ['t', 'v'],
  list: ['t', 'v'],
  tuple: ['t', 'v'],
  map: ['t', 'v'],
  record: ['t', 'v'],
  text: ['t', 'v', 'cu'],
  f64: ['t', 'v', 'bits'],
  throw: ['t', 'msg'],
};

const BASE64_CANONICAL = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fail(m: string): never {
  throw new Error('not a canonical tree: ' + m);
}

function has(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function put(o: Obj, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function decodeBytes(v: string): Uint8Array {
  const body = v.slice(7);
  let pad = 0;
  let end = body.length;
  while (end > 0 && body.charAt(end - 1) === '=') {
    pad++;
    end--;
  }
  const vals: number[] = [];
  for (let i = 0; i < end; i++) vals.push(B64.indexOf(body.charAt(i)));
  if (pad === 2 && (vals[vals.length - 1] & 15) !== 0) fail('non-zero padding bits');
  if (pad === 1 && (vals[vals.length - 1] & 3) !== 0) fail('non-zero padding bits');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const a = vals[i];
    const b = vals[i + 1];
    const c = i + 2 < vals.length ? vals[i + 2] : -1;
    const d = i + 3 < vals.length ? vals[i + 3] : -1;
    out.push(((a << 2) | (b >> 4)) & 255);
    if (c >= 0) out.push(((b << 4) | (c >> 2)) & 255);
    if (d >= 0) out.push(((c << 6) | d) & 255);
  }
  return new Uint8Array(out);
}

function dec(node: unknown, depth: number): unknown {
  if (depth > 100) fail('too deep');
  if (typeof node !== 'object' || node === null || Array.isArray(node)) fail('a node is a map with a text t');
  const n = node as Obj;
  const t = n['t'];
  if (typeof t !== 'string') fail('a node is a map with a text t');
  if (!has(KEYS, t)) fail('unknown tag');
  const allowed = KEYS[t];
  for (const k of Object.keys(n)) if (allowed.indexOf(k) < 0) fail('unexpected entry ' + k);
  const v = n['v'];
  switch (t) {
    case 'none':
      return null;
    case 'undefined':
      return undefined;
    case 'bool':
      if (typeof v !== 'boolean') fail('bool v');
      return v;
    case 'text': {
      if (typeof v !== 'string') fail('text v');
      const cu = n['cu'];
      if (cu === 'utf8') {
        if (!wellFormed(v)) fail('utf8 text not well-formed');
      } else if (cu === 'utf16') {
        if (wellFormed(v)) fail('utf16 text that is well-formed');
      } else fail('cu');
      return v;
    }
    case 'bigint':
      if (typeof v !== 'string' || !DECIMAL.test(v)) fail('bigint v');
      return BigInt(v);
    case 'i64':
    case 'u64': {
      if (typeof v !== 'string' || !DECIMAL.test(v)) fail('v must be a decimal string');
      const x = BigInt(v);
      const lo = t === 'i64' ? -(BigInt(2) ** BigInt(63)) : BigInt(0);
      const hi = t === 'i64' ? BigInt(2) ** BigInt(63) - BigInt(1) : BigInt(2) ** BigInt(64) - BigInt(1);
      if (x < lo || x > hi) fail('out of range');
      const lim = BigInt(2) ** BigInt(53);
      if (x >= -lim && x <= lim) return Number(x);
      return x;
    }
    case 'bytes':
      if (typeof v !== 'string' || !BASE64_CANONICAL.test(v)) fail('bytes v');
      return decodeBytes(v);
    case 'f64': {
      if (typeof v !== 'string') fail('f64 v');
      const bits = n['bits'];
      if (typeof bits !== 'string' || !HEX16.test(bits)) fail('f64 bits');
      const hi = parseInt(bits.slice(0, 8), 16);
      const lo = parseInt(bits.slice(8), 16);
      const exp = (hi >>> 20) & 0x7ff;
      const mant = (hi & 0xfffff) !== 0 || lo !== 0;
      if (exp === 0x7ff && mant && bits !== '7ff8000000000000') fail('non-canonical NaN');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setUint32(0, hi);
      dv.setUint32(4, lo);
      return dv.getFloat64(0);
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) fail('list v');
      const out: unknown[] = [];
      for (const e of v as unknown[]) out.push(dec(e, depth + 1));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) fail('map v');
      const out: Obj = {};
      let prev: string | null = null;
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('map entry');
        const pair = e as unknown[];
        const k = dec(pair[0], depth + 1);
        if (typeof k !== 'string') fail('map key not text');
        if (prev !== null && !(prev < k)) fail('map entries out of order');
        prev = k;
        put(out, k, dec(pair[1], depth + 1));
      }
      return out;
    }
    case 'record': {
      if (!Array.isArray(v)) fail('record v');
      const out: Obj = {};
      const seen: Obj = {};
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('record field');
        const pair = e as unknown[];
        const name = pair[0];
        if (typeof name !== 'string' || !wellFormed(name)) fail('record name');
        if (has(seen, name)) fail('repeated record name');
        put(seen, name, true);
        put(out, name, dec(pair[1], depth + 1));
      }
      return out;
    }
    case 'throw': {
      const msg = n['msg'];
      if (typeof msg !== 'string') fail('throw msg');
      const out: Obj = {};
      put(out, '__threw', msg);
      return out;
    }
    default:
      return fail('unknown tag');
  }
}

export default function decode_value(tree: unknown): unknown {
  return dec(tree, 0);
}
