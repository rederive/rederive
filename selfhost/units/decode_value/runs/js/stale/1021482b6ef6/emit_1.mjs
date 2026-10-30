const B64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEC = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;
const KEYS = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};

function fail(m) {
  throw new Error('not a canonical tree: ' + m);
}

function put(o, k, value) {
  Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
}

function dec(x) {
  if (!(x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string')) fail('not a node');
  if (!Object.hasOwn(KEYS, x.t)) fail('unknown tag');
  const allowed = KEYS[x.t];
  for (const k of Object.keys(x)) if (!allowed.includes(k)) fail('unexpected entry ' + k);
  const t = x.t;
  const v = x.v;
  switch (t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'bool':
      if (typeof v !== 'boolean') fail('bool v');
      return v;
    case 'text':
      if (typeof v !== 'string') fail('text v');
      if (x.cu !== 'utf8' && x.cu !== 'utf16') fail('text cu');
      if (x.cu === 'utf8' && !v.isWellFormed()) fail('text not well-formed');
      return v;
    case 'bigint':
      if (typeof v !== 'string' || !DEC.test(v)) fail('bigint v');
      return BigInt(v);
    case 'i64':
    case 'u64': {
      if (typeof v !== 'string' || !DEC.test(v)) fail('int v');
      const n = BigInt(v);
      if (t === 'i64') {
        if (n < -(2n ** 63n) || n > 2n ** 63n - 1n) fail('i64 range');
      } else if (n < 0n || n > 2n ** 64n - 1n) fail('u64 range');
      if (n >= -(2n ** 53n) && n <= 2n ** 53n) return Number(n);
      return n;
    }
    case 'bytes': {
      if (typeof v !== 'string' || !B64.test(v)) fail('bytes v');
      const b = Buffer.from(v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== v) fail('padding bits');
      return new Uint8Array(b);
    }
    case 'f64': {
      if (typeof v !== 'string') fail('f64 v');
      const bits = x.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) fail('f64 bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (Number.isNaN(f) && bits !== '7ff8000000000000') fail('NaN bits');
      return f;
    }
    case 'list':
    case 'tuple': {
      if (!Array.isArray(v)) fail('list v');
      const out = [];
      for (const e of v) out.push(dec(e));
      return out;
    }
    case 'map': {
      if (!Array.isArray(v)) fail('map v');
      const o = {};
      let prev;
      let first = true;
      for (const e of v) {
        if (!Array.isArray(e) || e.length !== 2) fail('map entry');
        const k = dec(e[0]);
        if (typeof k !== 'string') fail('map key');
        if (Object.hasOwn(o, k)) fail('duplicate key');
        if (!first && !(prev < k)) fail('key order');
        first = false;
        prev = k;
        put(o, k, dec(e[1]));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(v)) fail('record v');
      const o = {};
      for (const e of v) {
        if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string') fail('record field');
        if (Object.hasOwn(o, e[0])) fail('duplicate name');
        put(o, e[0], dec(e[1]));
      }
      return o;
    }
    case 'throw': {
      if (typeof x.msg !== 'string') fail('throw msg');
      const o = {};
      put(o, '__threw', x.msg);
      return o;
    }
  }
  fail('unreachable');
}

export default function decode_value(tree) {
  return dec(tree);
}
