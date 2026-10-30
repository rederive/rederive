type Rec = Record<string, unknown>;

const NODE_KEYS: Record<string, string[]> = {
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

function fail(msg: string): never {
  throw new Error('not a canonical tree: ' + msg);
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

function setKey(o: Rec, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function decimal(v: unknown): bigint {
  if (typeof v !== 'string' || !DECIMAL.test(v)) fail('v must be a decimal string');
  return BigInt(v as string);
}

function decodeBytes(v: unknown): Uint8Array {
  if (typeof v !== 'string' || !BASE64_CANONICAL.test(v)) fail('bad base64');
  const body = (v as string).slice(7);
  const out: number[] = [];
  let padLen = 0;
  if (body.endsWith('==')) padLen = 2;
  else if (body.endsWith('=')) padLen = 1;
  const chars = body.slice(0, body.length - padLen);
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < chars.length; i++) {
    acc = (acc << 6) | B64.indexOf(chars[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
      acc &= (1 << bits) - 1;
    }
  }
  if (acc !== 0) fail('non-zero padding bits');
  return new Uint8Array(out);
}

function decodeF64(n: Rec): number {
  if (typeof n['v'] !== 'string') fail('f64 v must be text');
  const bits = n['bits'];
  if (typeof bits !== 'string' || !HEX16.test(bits)) fail('f64 bits');
  const b = bits as string;
  const hi = parseInt(b.slice(0, 8), 16);
  const lo = parseInt(b.slice(8), 16);
  const dv = new DataView(new ArrayBuffer(8));
  dv.setUint32(0, hi);
  dv.setUint32(4, lo);
  const x = dv.getFloat64(0);
  if (x !== x && b !== '7ff8000000000000') fail('non-canonical NaN');
  return x;
}

function node(x: unknown): Rec {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) fail('not a node');
  const n = x as Rec;
  const t = n['t'];
  if (typeof t !== 'string') fail('t must be text');
  if (!Object.prototype.hasOwnProperty.call(NODE_KEYS, t as string)) fail('unknown tag');
  const allowed = NODE_KEYS[t as string];
  for (const k of Object.keys(n)) {
    if (allowed.indexOf(k) < 0) fail('unexpected entry ' + k);
  }
  return n;
}

function dec(x: unknown): unknown {
  const n = node(x);
  const t = n['t'] as string;
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
      if (cu !== 'utf8' && cu !== 'utf16') fail('bad cu');
      if (cu === 'utf8' && !wellFormed(v as string)) fail('not well-formed');
      return v;
    }
    case 'bigint':
      return decimal(v);
    case 'i64':
    case 'u64': {
      const b = decimal(v);
      const lo = t === 'i64' ? BigInt('-9223372036854775808') : BigInt(0);
      const hi = t === 'i64' ? BigInt('9223372036854775807') : BigInt('18446744073709551615');
      if (b < lo || b > hi) fail('out of range');
      const lim = BigInt('9007199254740992');
      if (b >= -lim && b <= lim) return Number(b);
      return b;
    }
    case 'bytes':
      return decodeBytes(v);
    case 'f64':
      return decodeF64(n);
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) fail('v must be a list');
      return (v as unknown[]).map((e) => dec(e));
    }
    case 'map': {
      if (!Array.isArray(v)) fail('v must be a list');
      const o: Rec = {};
      let prev: string | null = null;
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('entry must be a pair');
        const pair = e as unknown[];
        const k = dec(pair[0]);
        if (typeof k !== 'string') fail('map key must be text');
        const ks = k as string;
        if (prev !== null && !(prev < ks)) fail('map entries out of canonical order');
        prev = ks;
        setKey(o, ks, dec(pair[1]));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(v)) fail('v must be a list');
      const o: Rec = {};
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('field must be a pair');
        const pair = e as unknown[];
        const k = pair[0];
        if (typeof k !== 'string') fail('record name must be text');
        const ks = k as string;
        if (Object.prototype.hasOwnProperty.call(o, ks)) fail('duplicate record name');
        setKey(o, ks, dec(pair[1]));
      }
      return o;
    }
    case 'throw': {
      const msg = n['msg'];
      if (typeof msg !== 'string') fail('throw msg must be text');
      const o: Rec = {};
      setKey(o, '__threw', msg);
      return o;
    }
    default:
      return fail('unknown tag');
  }
}

export default function decode_value(tree: unknown): unknown {
  return dec(tree);
}
