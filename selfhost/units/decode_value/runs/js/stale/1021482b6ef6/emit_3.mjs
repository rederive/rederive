const B64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEC = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const KEYS = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};
const bad = (m) => { throw new Error('not a canonical tree: ' + m); };
const put = (o, k, value) => Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });

function dec(x) {
  if (!(x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string')) bad('not a node');
  if (!Object.hasOwn(KEYS, x.t)) bad('unknown tag');
  const t = x.t;
  for (const k of Object.keys(x)) if (!KEYS[t].includes(k)) bad('unexpected entry ' + k);
  const v = x.v;
  switch (t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'bool':
      if (typeof v !== 'boolean') bad('bool v');
      return v;
    case 'text':
      if (typeof v !== 'string') bad('text v');
      if (x.cu !== 'utf8' && x.cu !== 'utf16') bad('cu');
      if (x.cu === 'utf8' && !v.isWellFormed()) bad('utf8 not well-formed');
      return v;
    case 'bigint':
      if (typeof v !== 'string' || !DEC.test(v)) bad('bigint v');
      return BigInt(v);
    case 'i64':
    case 'u64': {
      if (typeof v !== 'string' || !DEC.test(v)) bad(t + ' v must be a decimal string');
      const n = BigInt(v);
      const lo = t === 'i64' ? -(2n ** 63n) : 0n;
      const hi = t === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (n < lo || n > hi) bad('out of range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': {
      if (typeof v !== 'string' || !B64.test(v)) bad('bytes v');
      const b = Buffer.from(v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== v) bad('padding bits');
      return new Uint8Array(b);
    }
    case 'f64': {
      if (typeof v !== 'string') bad('f64 v');
      const bits = x.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) bad('f64 bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (Number.isNaN(f) && bits !== '7ff8000000000000') bad('non-canonical NaN');
      return f;
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) bad('list v');
      const out = [];
      for (const e of v) out.push(dec(e));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) bad('map v');
      const o = {};
      let prev = null;
      for (const e of v) {
        if (!Array.isArray(e) || e.length !== 2) bad('map entry');
        const k = dec(e[0]);
        if (typeof k !== 'string') bad('map key not text');
        if (Object.hasOwn(o, k)) bad('duplicate key');
        if (prev !== null && !(prev < k)) bad('out of order');
        prev = k;
        put(o, k, dec(e[1]));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(v)) bad('record v');
      const o = {};
      for (const e of v) {
        if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string') bad('record field');
        if (Object.hasOwn(o, e[0])) bad('duplicate name');
        put(o, e[0], dec(e[1]));
      }
      return o;
    }
    case 'throw': {
      if (typeof x.msg !== 'string') bad('throw msg');
      return put({}, '__threw', x.msg);
    }
  }
  bad('unreachable');
}

export default function decode_value(tree) {
  return dec(tree);
}
