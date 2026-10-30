const KEYS = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};
const BASE64_CANONICAL = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DECIMAL = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const MAXD = 100;

function bad(m) { throw new Error('not a canonical tree: ' + m); }
function has(o, k) { return Object.hasOwn(o, k); }
function put(o, k, value) {
  Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
}
function isNode(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x) && has(x, 't') && typeof x.t === 'string';
}
function dec(s) {
  if (typeof s !== 'string' || !DECIMAL.test(s)) bad('decimal');
  return BigInt(s);
}
function get(node, k) {
  if (!has(node, k)) bad('missing ' + k);
  return node[k];
}

function go(x, d) {
  if (d > MAXD) bad('too deep');
  if (!isNode(x)) bad('a node is a map with a text t');
  const tag = x.t;
  if (!has(KEYS, tag)) bad('unknown tag');
  const allowed = KEYS[tag];
  for (const k of Object.keys(x)) if (!allowed.includes(k)) bad('unexpected entry ' + k);
  switch (tag) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'text': {
      const v = get(x, 'v'); const cu = get(x, 'cu');
      if (typeof v !== 'string') bad('text v');
      if (cu === 'utf8') { if (!v.isWellFormed()) bad('utf8 ill-formed'); }
      else if (cu === 'utf16') { if (v.isWellFormed()) bad('utf16 well-formed'); }
      else bad('cu');
      return v;
    }
    case 'bool': {
      const v = get(x, 'v');
      if (typeof v !== 'boolean') bad('bool v');
      return v;
    }
    case 'bigint': return dec(get(x, 'v'));
    case 'i64': case 'u64': {
      const n = dec(get(x, 'v'));
      const lo = tag === 'i64' ? -(2n ** 63n) : 0n;
      const hi = tag === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (n < lo || n > hi) bad('out of range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': {
      const v = get(x, 'v');
      if (typeof v !== 'string' || !BASE64_CANONICAL.test(v)) bad('base64');
      const b = Buffer.from(v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== v) bad('padding bits');
      return new Uint8Array(b);
    }
    case 'f64': {
      const v = get(x, 'v'); const bits = get(x, 'bits');
      if (typeof v !== 'string') bad('f64 v');
      if (typeof bits !== 'string' || !HEX16.test(bits)) bad('f64 bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (Number.isNaN(f) && bits !== '7ff8000000000000') bad('NaN bits');
      return f;
    }
    case 'list': case 'tuple': {
      const v = get(x, 'v');
      if (!Array.isArray(v)) bad('list v');
      const out = [];
      for (const e of v) out.push(go(e, d + 1));
      return out;
    }
    case 'map': {
      const v = get(x, 'v');
      if (!Array.isArray(v)) bad('map v');
      const o = {};
      let prev = null;
      for (const e of v) {
        if (!Array.isArray(e) || e.length !== 2) bad('map entry');
        const k = go(e[0], d + 1);
        if (typeof k !== 'string') bad('map key');
        if (has(o, k)) bad('duplicate key');
        if (prev !== null && !(prev < k)) bad('order');
        prev = k;
        put(o, k, go(e[1], d + 1));
      }
      return o;
    }
    case 'record': {
      const v = get(x, 'v');
      if (!Array.isArray(v)) bad('record v');
      const o = {};
      for (const f of v) {
        if (!Array.isArray(f) || f.length !== 2) bad('record field');
        const k = f[0];
        if (typeof k !== 'string' || !k.isWellFormed()) bad('record name');
        if (has(o, k)) bad('duplicate name');
        put(o, k, go(f[1], d + 1));
      }
      return o;
    }
    case 'throw': {
      const m = get(x, 'msg');
      if (typeof m !== 'string') bad('msg');
      const o = {};
      put(o, '__threw', m);
      return o;
    }
  }
  bad('unreachable');
}

export default function decode_value(tree) {
  return go(tree, 0);
}
