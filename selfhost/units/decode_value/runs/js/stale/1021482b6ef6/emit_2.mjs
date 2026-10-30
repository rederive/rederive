const KEYS = {
  none: ['t'], undefined: ['t'],
  bool: ['t', 'v'], bigint: ['t', 'v'], bytes: ['t', 'v'], i64: ['t', 'v'], u64: ['t', 'v'],
  list: ['t', 'v'], tuple: ['t', 'v'], map: ['t', 'v'], record: ['t', 'v'],
  text: ['t', 'v', 'cu'], f64: ['t', 'v', 'bits'], throw: ['t', 'msg'],
};
const B64 = /^base64:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const DEC = /^(?:0|-?[1-9][0-9]*)$/;
const HEX16 = /^[0-9a-f]{16}$/;

const bad = (m) => { throw new Error('not a canonical tree: ' + m); };
const put = (o, k, value) => Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
const isNode = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && typeof x.t === 'string';
const dec = (s) => { if (typeof s !== 'string' || !DEC.test(s)) bad('decimal'); return BigInt(s); };
const pair = (e) => { if (!Array.isArray(e) || e.length !== 2) bad('pair'); return e; };

function decode(x) {
  if (!isNode(x)) bad('not a node');
  if (!Object.hasOwn(KEYS, x.t)) bad('unknown tag');
  const allowed = KEYS[x.t];
  for (const k of Object.keys(x)) if (!allowed.includes(k)) bad('extra entry ' + k);
  const has = (k) => Object.hasOwn(x, k);
  const v = has('v') ? x.v : undefined;
  switch (x.t) {
    case 'none': return null;
    case 'undefined': return undefined;
    case 'bool': if (typeof v !== 'boolean') bad('bool'); return v;
    case 'text': {
      if (typeof v !== 'string') bad('text');
      if (x.cu !== 'utf8' && x.cu !== 'utf16') bad('cu');
      if (x.cu === 'utf8' && !v.isWellFormed()) bad('ill-formed');
      return v;
    }
    case 'bigint': return dec(v);
    case 'i64': case 'u64': {
      const n = dec(v);
      const lo = x.t === 'i64' ? -(2n ** 63n) : 0n;
      const hi = x.t === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (n < lo || n > hi) bad('range');
      return n >= -(2n ** 53n) && n <= 2n ** 53n ? Number(n) : n;
    }
    case 'bytes': {
      if (typeof v !== 'string' || !B64.test(v)) bad('base64');
      const b = Buffer.from(v.slice(7), 'base64');
      if ('base64:' + b.toString('base64') !== v) bad('padding bits');
      return new Uint8Array(b);
    }
    case 'f64': {
      if (typeof v !== 'string') bad('f64 v');
      const bits = x.bits;
      if (typeof bits !== 'string' || !HEX16.test(bits)) bad('bits');
      const dv = new DataView(new ArrayBuffer(8));
      dv.setBigUint64(0, BigInt('0x' + bits));
      const f = dv.getFloat64(0);
      if (Number.isNaN(f) && bits !== '7ff8000000000000') bad('NaN');
      return f;
    }
    case 'list': case 'tuple': {
      if (!Array.isArray(v)) bad('list');
      return v.map(decode);
    }
    case 'map': {
      if (!Array.isArray(v)) bad('map');
      const o = {};
      let prev;
      for (const e of v) {
        const [ke, ve] = pair(e);
        const k = decode(ke);
        if (typeof k !== 'string') bad('key');
        if (Object.hasOwn(o, k)) bad('dup key');
        if (prev !== undefined && !(prev < k)) bad('order');
        prev = k;
        put(o, k, decode(ve));
      }
      return o;
    }
    case 'record': {
      if (!Array.isArray(v)) bad('record');
      const o = {};
      for (const e of v) {
        const [k, ve] = pair(e);
        if (typeof k !== 'string') bad('name');
        if (Object.hasOwn(o, k)) bad('dup name');
        put(o, k, decode(ve));
      }
      return o;
    }
    case 'throw': {
      if (!has('msg') || typeof x.msg !== 'string') bad('msg');
      return put({}, '__threw', x.msg);
    }
  }
  return bad('unreachable');
}

export default function decode_value(tree) {
  return decode(tree);
}
