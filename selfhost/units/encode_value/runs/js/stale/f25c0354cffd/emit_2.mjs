const NUM = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGI = /^-?(?:0|[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const ESCAPED = new WeakSet();
const fail = (m) => { throw new Error(m); };

const isPlain = (v) => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

function parseType(src) {
  let pos = 0;
  const ws = () => { while (pos < src.length && ' \t\r\n'.includes(src[pos])) pos++; };
  const name = () => {
    const m = NAME.exec(src.slice(pos));
    if (!m) fail('name expected');
    pos += m[0].length;
    return m[0];
  };
  const expect = (c) => { ws(); if (src[pos] !== c) fail('expected ' + c); pos++; };
  const union = () => {
    const alts = [alt()];
    for (;;) {
      ws();
      if (src[pos] === '|') { pos++; alts.push(alt()); } else break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const alt = () => {
    ws();
    const n = name();
    if (SCALARS.has(n)) return { k: n };
    if (n !== 'tuple' && n !== 'list' && n !== 'map' && n !== 'record') fail('unknown type ' + n);
    if (src[pos] !== '[') fail('[ expected');
    pos++;
    if (n === 'list') { const t = union(); expect(']'); return { k: 'list', t }; }
    if (n === 'map') { const kt = union(); expect(','); const vt = union(); expect(']'); return { k: 'map', kt, vt }; }
    if (n === 'tuple') {
      const items = [union()];
      for (;;) { ws(); if (src[pos] === ',') { pos++; items.push(union()); } else break; }
      expect(']');
      return { k: 'tuple', items };
    }
    const fields = [];
    const seen = new Set();
    for (;;) {
      ws();
      const fn = name();
      if (seen.has(fn)) fail('dup field');
      seen.add(fn);
      expect(':');
      fields.push([fn, union()]);
      ws();
      if (src[pos] === ',') pos++; else break;
    }
    expect(']');
    return { k: 'record', fields };
  };
  const t = union();
  ws();
  if (pos !== src.length) fail('trailing');
  return t;
}

const bitsOf = (x) => {
  if (x !== x) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
};
const f64node = (x) => ({ t: 'f64', v: Object.is(x, -0) ? '-0' : String(x), bits: bitsOf(x) });

function canon(x) {
  if (typeof x === 'string') return JSON.stringify(x);
  if (typeof x === 'boolean') return x ? 'true' : 'false';
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  let o = x;
  if (x.t === 'throw') o = { t: 'throw' };
  else if (x.t === 'f64') o = { bits: x.bits, t: 'f64' };
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const sortPairs = (pairs) => {
  const keyed = pairs.map((p) => [p[0].t === 'text' ? p[0].v : canon(p[0]), p]);
  keyed.sort((a, b) => cmp(a[0], b[0]));
  return keyed.map((k) => k[1]);
};

const isObs = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !ESCAPED.has(v);

function resolve(v) {
  if (!isObs(v) || typeof v.__t !== 'string') return v;
  const tag = v.__t;
  if (tag === 'num') {
    const s = v.v;
    if (typeof s !== 'string') fail('num v');
    if (s === 'NaN') return NaN;
    if (s === 'Infinity') return Infinity;
    if (s === '-Infinity') return -Infinity;
    if (s === '-0') return -0;
    if (!NUM.test(s)) fail('num literal');
    return Number(s);
  }
  if (tag === 'bigint') {
    if (typeof v.v !== 'string' || !BIGI.test(v.v)) fail('bigint literal');
    return BigInt(v.v);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    const src = v.v;
    if (src === null || src === undefined) fail('obj v');
    const o = {};
    for (const k of Object.keys(src)) {
      Object.defineProperty(o, k, { value: src[k], enumerable: true, writable: true, configurable: true });
    }
    ESCAPED.add(o);
    return o;
  }
  return fail('unknown tag');
}

function obs(v) {
  if (!isObs(v)) return null;
  if (typeof v.__throw === 'string') return { t: 'throw', msg: v.__throw };
  if (typeof v.__threw === 'string') return { t: 'throw', msg: v.__threw };
  return null;
}

const textOk = (s) => typeof s === 'string' && s.isWellFormed();

function encJson(v) {
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') {
    if (!v.isWellFormed()) fail('text');
    return { t: 'text', v, cu: 'utf8' };
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) fail('hole');
      out.push(encJson(resolve(v[i])));
    }
    return { t: 'list', v: out };
  }
  if (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const pairs = [];
    for (const [k, val] of Object.entries(v)) {
      if (!k.isWellFormed()) fail('key');
      pairs.push([{ t: 'text', v: k, cu: 'utf8' }, encJson(resolve(val))]);
    }
    return { t: 'map', v: sortPairs(pairs) };
  }
  return fail('not json');
}

const intNode = (kind, lo, hi) => (v) => {
  if (!(typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v)))) fail('not integral');
  const b = BigInt(v);
  if (b < lo || b > hi) fail('range');
  return { t: kind, v: b.toString() };
};
const toI64 = intNode('i64', -(1n << 63n), (1n << 63n) - 1n);
const toU64 = intNode('u64', 0n, (1n << 64n) - 1n);

function enc(v, T) {
  const o = obs(v);
  if (o) return o;
  return encT(resolve(v), T);
}

function encT(v, T) {
  switch (T.k) {
    case 'union': {
      for (const a of T.alts) {
        try { return encT(v, a); } catch (e) { /* next */ }
      }
      return fail('union');
    }
    case 'none':
      if (v === null || v === undefined) return { t: 'none' };
      return fail('not none');
    case 'bool':
      if (typeof v === 'boolean') return { t: 'bool', v };
      return fail('not bool');
    case 'text':
      if (textOk(v)) return { t: 'text', v, cu: 'utf8' };
      return fail('not text');
    case 'f64':
      if (typeof v === 'number') return f64node(v);
      return fail('not f64');
    case 'i64': return toI64(v);
    case 'u64': return toU64(v);
    case 'bytes':
      if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
      return fail('not bytes');
    case 'json':
      if (v === undefined) fail('absent json');
      return encJson(v);
    case 'tuple':
      if (!Array.isArray(v) || v.length !== T.items.length) fail('not tuple');
      return { t: 'tuple', v: T.items.map((it, i) => enc(v[i], it)) };
    case 'list': {
      if (!Array.isArray(v)) fail('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], T.t));
      return { t: 'list', v: out };
    }
    case 'map': {
      let ents;
      if (v instanceof Map) ents = [...v];
      else if (isPlain(v)) ents = Object.entries(v);
      else return fail('not map');
      const pairs = ents.map(([k, val]) => [enc(k, T.kt), enc(val, T.vt)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) fail('not record');
      return {
        t: 'record',
        v: T.fields.map(([n, ft]) => [n, enc(Object.hasOwn(v, n) ? v[n] : undefined, ft)]),
      };
    }
  }
  return fail('bad type');
}

export default function encode_value(value, type) {
  const T = parseType(type);
  return enc(value, T);
}
