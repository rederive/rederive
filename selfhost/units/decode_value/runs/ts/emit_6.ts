const TAGS: Record<string, string[]> = {
  none: [], undefined: [],
  bool: ['v'], bigint: ['v'], bytes: ['v'], i64: ['v'], u64: ['v'],
  list: ['v'], tuple: ['v'], map: ['v'], record: ['v'],
  text: ['v', 'cu'], f64: ['v', 'bits'], throw: ['msg'],
};
const BASE64_CANONICAL = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const MAX_DEPTH = 100;

function bad(m: string): Error {
  return new Error('not a canonical tree: ' + m);
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

function has(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function decodeBytes(v: string): Uint8Array {
  const body = v.slice(7);
  let pad = 0;
  let core = body;
  if (body.endsWith('==')) { pad = 2; core = body.slice(0, -2); }
  else if (body.endsWith('=')) { pad = 1; core = body.slice(0, -1); }
  const vals: number[] = [];
  for (let i = 0; i < core.length; i++) vals.push(B64.indexOf(core.charAt(i)));
  if (pad === 2 && (vals[vals.length - 1] & 15) !== 0) throw bad('base64 padding bits');
  if (pad === 1 && (vals[vals.length - 1] & 3) !== 0) throw bad('base64 padding bits');
  const out: number[] = [];
  for (let i = 0; i < vals.length; i += 4) {
    const n = vals.length - i;
    const a = vals[i];
    const b = vals[i + 1];
    out.push(((a << 2) | (b >> 4)) & 255);
    if (n >= 3) {
      const c = vals[i + 2];
      out.push(((b << 4) | (c >> 2)) & 255);
      if (n >= 4) out.push(((c << 6) | vals[i + 3]) & 255);
    }
  }
  return new Uint8Array(out);
}

function dec(tree: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) throw bad('too deep');
  if (tree === null || typeof tree !== 'object' || Array.isArray(tree)) throw bad('not a node');
  const node = tree as Record<string, unknown>;
  if (!has(node, 't') || typeof node['t'] !== 'string') throw bad('not a node');
  const t = node['t'];
  if (!has(TAGS, t)) throw bad('unknown tag');
  const allowed = TAGS[t];
  for (const k of Object.keys(node)) {
    if (k !== 't' && allowed.indexOf(k) < 0) throw bad('unexpected entry ' + k);
  }
  const get = (k: string): unknown => {
    if (!has(node, k)) throw bad('missing ' + k);
    return node[k];
  };
  switch (t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'text': {
      const v = get('v');
      const cu = get('cu');
      if (typeof v !== 'string') throw bad('text v');
      if (cu !== 'utf8' && cu !== 'utf16') throw bad('text cu');
      const wf = wellFormed(v);
      if (cu === 'utf8' && !wf) throw bad('utf8 ill-formed');
      if (cu === 'utf16' && wf) throw bad('utf16 well-formed');
      return v;
    }
    case 'bool': {
      const v = get('v');
      if (typeof v !== 'boolean') throw bad('bool v');
      return v;
    }
    case 'bigint': {
      const v = get('v');
      if (typeof v !== 'string' || !DECIMAL.test(v)) throw bad('bigint v');
      return BigInt(v);
    }
    case 'i64':
    case 'u64': {
      const v = get('v');
      if (typeof v !== 'string' || !DECIMAL.test(v)) throw bad('int v');
      const n = BigInt(v);
      const lo = t === 'i64' ? -(2n ** 63n) : 0n;
      const hi = t === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (n < lo || n > hi) throw bad('out of range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': {
      const v = get('v');
      if (typeof v !== 'string' || !BASE64_CANONICAL.test(v)) throw bad('bytes v');
      return decodeBytes(v);
    }
    case 'f64': {
      const v = get('v');
      const bits = get('bits');
      if (typeof v !== 'string') throw bad('f64 v');
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw bad('f64 bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (f !== f && bits !== '7ff8000000000000') throw bad('NaN bits');
      return f;
    }
    case 'list':
    case 'tuple': {
      const v = get('v');
      if (!Array.isArray(v)) throw bad('list v');
      const out: unknown[] = [];
      for (const e of v as unknown[]) out.push(dec(e, depth + 1));
      return out;
    }
    case 'map': {
      const v = get('v');
      if (!Array.isArray(v)) throw bad('map v');
      const out: Record<string, unknown> = {};
      let prev: string | undefined;
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) throw bad('map entry');
        const pair = e as unknown[];
        const k = dec(pair[0], depth + 1);
        if (typeof k !== 'string') throw bad('map key');
        if (prev !== undefined && !(prev < k)) throw bad('map order');
        prev = k;
        put(out, k, dec(pair[1], depth + 1));
      }
      return out;
    }
    case 'record': {
      const v = get('v');
      if (!Array.isArray(v)) throw bad('record v');
      const out: Record<string, unknown> = {};
      const seen = new Set<string>();
      for (const e of v as unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) throw bad('record field');
        const pair = e as unknown[];
        const name = pair[0];
        if (typeof name !== 'string' || !wellFormed(name)) throw bad('record name');
        if (seen.has(name)) throw bad('dup record name');
        seen.add(name);
        put(out, name, dec(pair[1], depth + 1));
      }
      return out;
    }
    default: {
      const msg = get('msg');
      if (typeof msg !== 'string') throw bad('throw msg');
      const out: Record<string, unknown> = {};
      put(out, '__threw', msg);
      return out;
    }
  }
}

export default function decode_value(tree: unknown): unknown {
  return dec(tree, 0);
}
