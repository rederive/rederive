const B64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEC = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const KEYS = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};
const MAXD = 100;

function bad(m) { throw new Error('not a canonical tree: ' + m); }

function setKey(o, k, value) {
  Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
}

function dec(x, d) {
  if (d > MAXD) bad('too deep');
  if (!(x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string')) bad('a node is a map with a text t');
  const t = x.t;
  if (!Object.hasOwn(KEYS, t)) bad('unknown tag');
  const allowed = KEYS[t];
  for (const k of Object.keys(x)) if (!allowed.includes(k)) bad('unexpected entry ' + k);
  for (const k of allowed) if (!Object.hasOwn(x, k)) bad('missing ' + k);
  switch (t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'bool':
      if (typeof x.v !== 'boolean') bad('bool v');
      return x.v;
    case 'text': {
      const v = x.v;
      if (typeof v !== 'string') bad('text v');
      if (x.cu === 'utf8') { if (!v.isWellFormed()) bad('utf8 ill-formed'); }
      else if (x.cu === 'utf16') { if (v.isWellFormed()) bad('utf16 well-formed'); }
      else bad('cu');
      return v;
    }
    case 'bigint':
      if (typeof x.v !== 'string' || !DEC.test(x.v)) bad('bigint v');
      return BigInt(x.v);
    case 'i64':
    case 'u64': {
      if (typeof x.v !== 'string' || !DEC.test(x.v)) bad('v must be a decimal string');
      const n = BigInt(x.v);
      const lo = t === 'i64' ? -(2n ** 63n) : 0n;
      const hi = t === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (n < lo || n > hi) bad('out of range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': {
      const v = x.v;
      if (typeof v !== 'string' || !B64.test(v)) bad('base64');
      const b = Buffer.from(v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== v) bad('padding bits');
      return new Uint8Array(b);
    }
    case 'f64': {
      if (typeof x.v !== 'string') bad('f64 v');
      const bits = x.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) bad('f64 bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const r = dv.getFloat64(0);
      if (Number.isNaN(r) && bits !== '7ff8000000000000') bad('NaN bits');
      return r;
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(x.v)) bad('v must be a list');
      return x.v.map((e) => dec(e, d + 1));
    }
    case 'map': {
      if (!Array.isArray(x.v)) bad('v must be a list');
      const o = {};
      let prev;
      let first = true;
      for (const e of x.v) {
        if (!Array.isArray(e) || e.length !== 2) bad('map entry');
        const k = dec(e[0], d + 1);
        if (typeof k !== 'string') bad('map key');
        if (Object.hasOwn(o, k)) bad('duplicate key');
        if (!first && !(prev < k)) bad('out of order');
        first = false;
        prev = k;
        setKey(o, k, dec(e[1], d + 1));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(x.v)) bad('v must be a list');
      const o = {};
      for (const f of x.v) {
        if (!Array.isArray(f) || f.length !== 2) bad('record field');
        const k = f[0];
        if (typeof k !== 'string' || !k.isWellFormed()) bad('record name');
        if (Object.hasOwn(o, k)) bad('duplicate name');
        setKey(o, k, dec(f[1], d + 1));
      }
      return o;
    }
    case 'throw': {
      if (typeof x.msg !== 'string') bad('throw msg');
      const o = {};
      setKey(o, '__threw', x.msg);
      return o;
    }
  }
  bad('unreachable');
}

export default function decode_value(tree) {
  return dec(tree, 0);
}
