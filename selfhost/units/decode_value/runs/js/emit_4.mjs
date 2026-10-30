const KEYS = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};
const B64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEC = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const bad = (m) => new Error('not a canonical tree: ' + m);
const put = (o, k, value) => Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
const isPair = (e) => Array.isArray(e) && e.length === 2;

function dec(x, d) {
  if (d > 100) throw bad('too deep');
  if (!(x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string')) throw bad('not a node');
  if (!Object.hasOwn(KEYS, x.t)) throw bad('unknown tag');
  const allowed = KEYS[x.t];
  for (const k of Object.keys(x)) if (!allowed.includes(k)) throw bad('unexpected entry ' + k);
  const v = x.v;
  switch (x.t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'bool':
      if (typeof v !== 'boolean') throw bad('bool v');
      return v;
    case 'text':
      if (typeof v !== 'string') throw bad('text v');
      if (x.cu === 'utf8') { if (!v.isWellFormed()) throw bad('utf8 ill-formed'); }
      else if (x.cu === 'utf16') { if (v.isWellFormed()) throw bad('utf16 well-formed'); }
      else throw bad('cu');
      return v;
    case 'bigint':
      if (typeof v !== 'string' || !DEC.test(v)) throw bad('decimal');
      return BigInt(v);
    case 'i64':
    case 'u64': {
      if (typeof v !== 'string' || !DEC.test(v)) throw bad('decimal');
      const n = BigInt(v);
      if (x.t === 'i64') { if (n < -(2n ** 63n) || n > 2n ** 63n - 1n) throw bad('range'); }
      else if (n < 0n || n > 2n ** 64n - 1n) throw bad('range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': {
      if (typeof v !== 'string' || !B64.test(v)) throw bad('base64');
      const b = Buffer.from(v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== v) throw bad('padding bits');
      return new Uint8Array(b);
    }
    case 'f64': {
      if (typeof v !== 'string') throw bad('f64 v');
      const bits = x.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) throw bad('bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (Number.isNaN(f) && bits !== '7ff8000000000000') throw bad('NaN');
      return f;
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) throw bad('list v');
      const out = [];
      for (const e of v) out.push(dec(e, d + 1));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) throw bad('map v');
      const o = {};
      let prev = null;
      for (const e of v) {
        if (!isPair(e)) throw bad('map entry');
        const k = dec(e[0], d + 1);
        if (typeof k !== 'string') throw bad('map key');
        if (Object.hasOwn(o, k)) throw bad('dup key');
        if (prev !== null && !(prev < k)) throw bad('order');
        prev = k;
        put(o, k, dec(e[1], d + 1));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(v)) throw bad('record v');
      const o = {};
      for (const f of v) {
        if (!isPair(f)) throw bad('record field');
        const k = f[0];
        if (typeof k !== 'string' || !k.isWellFormed()) throw bad('record name');
        if (Object.hasOwn(o, k)) throw bad('dup name');
        put(o, k, dec(f[1], d + 1));
      }
      return o;
    }
    case 'throw': {
      if (typeof x.msg !== 'string') throw bad('throw msg');
      return put({}, '__threw', x.msg);
    }
  }
  throw bad('unreachable');
}

export default function decode_value(tree) {
  return dec(tree, 0);
}
