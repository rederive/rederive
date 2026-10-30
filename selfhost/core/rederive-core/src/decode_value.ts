const TAGS: Record<string, readonly string[]> = Object.assign(Object.create(null) as Record<string, readonly string[]>, {
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
});

const B64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bad(msg: string): never {
  throw new Error('not a canonical tree: ' + msg);
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

function setOwn(o: Record<string, unknown>, k: string, v: unknown): void {
  Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function decodeBytes(v: unknown): Uint8Array {
  if (typeof v !== 'string' || !B64.test(v)) return bad('bytes base64');
  const body = v.slice(7);
  const vals: number[] = [];
  let pad = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body.charAt(i);
    if (ch === '=') pad++;
    else vals.push(ALPHA.indexOf(ch));
  }
  if (pad === 2 && (vals[vals.length - 1] & 0x0f) !== 0) bad('non-zero padding bits');
  if (pad === 1 && (vals[vals.length - 1] & 0x03) !== 0) bad('non-zero padding bits');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const n = vals.length - i;
    const a = vals[i];
    const b = vals[i + 1];
    out.push(((a << 2) | (b >> 4)) & 0xff);
    if (n >= 3) out.push((((b & 0x0f) << 4) | (vals[i + 2] >> 2)) & 0xff);
    if (n >= 4) out.push((((vals[i + 2] & 0x03) << 6) | vals[i + 3]) & 0xff);
  }
  return new Uint8Array(out);
}

function dec(tree: unknown, depth: number): unknown {
  if (depth > 100) bad('too deep');
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) return bad('a node is a map with a text t');
  const node = tree as Record<string, unknown>;
  const t = node['t'];
  if (typeof t !== 'string') return bad('a node is a map with a text t');
  if (!Object.prototype.hasOwnProperty.call(TAGS, t)) return bad('unknown tag');
  const allowed = TAGS[t];
  for (const k of Object.keys(node)) if (!allowed.includes(k)) bad('unexpected entry ' + k);
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(node, k);
  const v = node['v'];
  switch (t) {
    case 'none':
      return null;
    case 'undefined':
      return undefined;
    case 'text': {
      const cu = node['cu'];
      if (typeof v !== 'string') return bad('text v');
      if (cu === 'utf8') {
        if (!wellFormed(v)) bad('utf8 text ill-formed');
      } else if (cu === 'utf16') {
        if (wellFormed(v)) bad('utf16 text well-formed');
      } else bad('cu');
      return v;
    }
    case 'bool':
      if (typeof v !== 'boolean') return bad('bool v');
      return v;
    case 'bigint':
      if (typeof v !== 'string' || !DECIMAL.test(v)) return bad('bigint v');
      return BigInt(v);
    case 'i64':
    case 'u64': {
      if (typeof v !== 'string' || !DECIMAL.test(v)) return bad('integer v must be a decimal string');
      const n = BigInt(v);
      const lo = t === 'i64' ? -(BigInt(2) ** BigInt(63)) : BigInt(0);
      const hi = t === 'i64' ? BigInt(2) ** BigInt(63) - BigInt(1) : BigInt(2) ** BigInt(64) - BigInt(1);
      if (n < lo || n > hi) bad('out of range');
      const lim = BigInt(2) ** BigInt(53);
      if (n >= -lim && n <= lim) return Number(n);
      return n;
    }
    case 'bytes':
      return decodeBytes(v);
    case 'f64': {
      const bits = node['bits'];
      if (typeof v !== 'string') return bad('f64 v');
      if (typeof bits !== 'string' || !HEX16.test(bits)) return bad('f64 bits');
      const hi = parseInt(bits.slice(0, 8), 16);
      const lo = parseInt(bits.slice(8), 16);
      if (((hi >>> 20) & 0x7ff) === 0x7ff && ((hi & 0xfffff) !== 0 || lo !== 0) && bits !== '7ff8000000000000') {
        bad('non-canonical NaN');
      }
      const dv = new DataView(new ArrayBuffer(8));
      dv.setUint32(0, hi);
      dv.setUint32(4, lo);
      return dv.getFloat64(0);
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) return bad('list v');
      const out: unknown[] = [];
      for (const e of v as unknown[]) out.push(dec(e, depth + 1));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) return bad('map v');
      const out: Record<string, unknown> = {};
      let prev: string | undefined;
      for (const ent of v as unknown[]) {
        if (!Array.isArray(ent) || ent.length !== 2) return bad('map entry');
        const k = dec(ent[0], depth + 1);
        if (typeof k !== 'string') return bad('map key must be text');
        if (prev !== undefined && !(prev < k)) bad('map entries out of canonical order');
        prev = k;
        setOwn(out, k, dec(ent[1], depth + 1));
      }
      return out;
    }
    case 'record': {
      if (!Array.isArray(v)) return bad('record v');
      const out: Record<string, unknown> = {};
      const seen = new Set<string>();
      for (const f of v as unknown[]) {
        if (!Array.isArray(f) || f.length !== 2) return bad('record field');
        const name: unknown = f[0];
        if (typeof name !== 'string' || !wellFormed(name)) return bad('record name');
        if (seen.has(name)) bad('duplicate record name');
        seen.add(name);
        setOwn(out, name, dec(f[1], depth + 1));
      }
      return out;
    }
    case 'throw': {
      const msg = node['msg'];
      if (!has('msg') || typeof msg !== 'string') return bad('throw msg');
      const out: Record<string, unknown> = {};
      setOwn(out, '__threw', msg);
      return out;
    }
    default:
      return bad('unknown tag');
  }
}

export default function decode_value(tree: unknown): unknown {
  return dec(tree, 0);
}
