const BASE64_CANONICAL = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;

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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function fail(why: string): never {
  throw new Error('not a canonical tree: ' + why);
}

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function put(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function decodeBytes(v: string): Uint8Array {
  if (!BASE64_CANONICAL.test(v)) fail('bytes base64');
  const body = v.slice(7);
  let end = body.length;
  let pad = 0;
  if (body.endsWith('==')) {
    pad = 2;
    end -= 2;
  } else if (body.endsWith('=')) {
    pad = 1;
    end -= 1;
  }
  const vals: number[] = [];
  for (let i = 0; i < end; i++) vals.push(B64.indexOf(body.charAt(i)));
  const out: number[] = [];
  const full = pad === 0 ? vals.length : vals.length - (4 - pad - 1 + 0) ;
  let i = 0;
  for (; i + 4 <= vals.length; i += 4) {
    const n = (vals[i] << 18) | (vals[i + 1] << 12) | (vals[i + 2] << 6) | vals[i + 3];
    out.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  void full;
  if (pad === 2) {
    if ((vals[i + 1] & 15) !== 0) fail('bytes base64 has non-zero padding bits');
    out.push(((vals[i] << 2) | (vals[i + 1] >> 4)) & 255);
  } else if (pad === 1) {
    if ((vals[i + 2] & 3) !== 0) fail('bytes base64 has non-zero padding bits');
    const n = (vals[i] << 10) | (vals[i + 1] << 4) | (vals[i + 2] >> 2);
    out.push((n >> 8) & 255, n & 255);
  }
  return new Uint8Array(out);
}

function decNode(node: unknown): unknown {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) fail('not a node');
  const n = node as Record<string, unknown>;
  const t = n['t'];
  if (typeof t !== 'string') fail('t must be text');
  if (!Object.prototype.hasOwnProperty.call(NODE_KEYS, t)) fail('unknown tag "' + t + '"');
  const allowed = NODE_KEYS[t];
  for (const k of Object.keys(n)) if (allowed.indexOf(k) < 0) fail('a ' + t + ' node has only its keys (got ' + k + ')');
  for (const k of allowed) if (!Object.prototype.hasOwnProperty.call(n, k)) fail(t + ' missing ' + k);
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
      if (cu !== 'utf8' && cu !== 'utf16') fail('text cu');
      if (cu === 'utf8' && !wellFormed(v)) fail('utf8 text not well-formed');
      return v;
    }
    case 'bigint':
    case 'i64':
    case 'u64': {
      if (typeof v !== 'string' || !DECIMAL.test(v)) fail(t + ' v must be a decimal string');
      const b = BigInt(v as string);
      if (t === 'bigint') return b;
      const two63 = BigInt('9223372036854775808');
      if (t === 'i64') {
        if (b < -two63 || b > two63 - BigInt(1)) fail('i64 out of range');
      } else if (b < BigInt(0) || b > two63 * BigInt(2) - BigInt(1)) fail('u64 out of range');
      const lim = BigInt('9007199254740992');
      if (b >= -lim && b <= lim) return Number(b);
      return b;
    }
    case 'bytes':
      if (typeof v !== 'string') fail('bytes v');
      return decodeBytes(v);
    case 'f64': {
      if (typeof v !== 'string') fail('f64 v');
      const bits = n['bits'];
      if (typeof bits !== 'string' || !HEX16.test(bits)) fail('f64 bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + (bits as string)));
      const f = dv.getFloat64(0);
      if (f !== f && bits !== '7ff8000000000000') fail('f64 NaN bits must be canonical');
      return f;
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) fail(t + ' v');
      const out: unknown[] = [];
      for (const e of v as unknown[]) out.push(decNode(e));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) fail('map v');
      const out: Record<string, unknown> = {};
      let prev: string | null = null;
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('map entry');
        const pair = e as unknown[];
        const k = decNode(pair[0]);
        if (typeof k !== 'string') fail('map key must be text');
        if (prev !== null && !(prev < k)) fail('map entries out of canonical order');
        const val = decNode(pair[1]);
        put(out, k as string, val);
        prev = k as string;
      }
      return out;
    }
    case 'record': {
      if (!Array.isArray(v)) fail('record v');
      const out: Record<string, unknown> = {};
      const seen = new Set<string>();
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) fail('record field');
        const pair = e as unknown[];
        const name = pair[0];
        if (typeof name !== 'string') fail('record name');
        if (seen.has(name as string)) fail('duplicate record name');
        seen.add(name as string);
        put(out, name as string, decNode(pair[1]));
      }
      return out;
    }
    default: {
      const msg = n['msg'];
      if (typeof msg !== 'string') fail('throw msg');
      const out: Record<string, unknown> = {};
      put(out, '__threw', msg);
      return out;
    }
  }
}

export default function decode_value(tree: unknown): unknown {
  return decNode(tree);
}
