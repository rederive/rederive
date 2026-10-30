const ESCAPED = new WeakSet();
const NUM_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIG_RE = /^-?(?:0|[1-9][0-9]*)$/;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const KEYWORDS = new Set(['tuple', 'list', 'map', 'record']);

function parseType(s) {
  if (typeof s !== 'string') throw new Error('type not text');
  let pos = 0;
  const ws = () => { while (pos < s.length && ' \t\r\n'.includes(s[pos])) pos++; };
  const expect = (c) => { ws(); if (s[pos] !== c) throw new Error('expected ' + c); pos++; };
  const name = () => {
    const m = NAME_RE.exec(s.slice(pos));
    if (!m) throw new Error('bad name');
    pos += m[0].length;
    return m[0];
  };
  const type = () => {
    const alts = [alt()];
    ws();
    while (s[pos] === '|') { pos++; alts.push(alt()); ws(); }
    return alts.length > 1 ? { k: 'union', alts } : alts[0];
  };
  const alt = () => {
    ws();
    const n = name();
    if (SCALARS.has(n)) return { k: n };
    if (!KEYWORDS.has(n)) throw new Error('unknown type ' + n);
    if (s[pos] !== '[') throw new Error('expected [');
    pos++;
    if (n === 'list') { const t = type(); expect(']'); return { k: 'list', t }; }
    if (n === 'map') { const a = type(); expect(','); const b = type(); expect(']'); return { k: 'map', key: a, val: b }; }
    if (n === 'tuple') {
      const items = [type()];
      ws();
      while (s[pos] === ',') { pos++; items.push(type()); ws(); }
      expect(']');
      return { k: 'tuple', items };
    }
    const fields = [];
    const seen = new Set();
    for (;;) {
      ws();
      const fn = name();
      if (seen.has(fn)) throw new Error('dup field');
      seen.add(fn);
      expect(':');
      fields.push([fn, type()]);
      ws();
      if (s[pos] === ',') { pos++; continue; }
      break;
    }
    expect(']');
    return { k: 'record', fields };
  };
  const t = type();
  ws();
  if (pos !== s.length) throw new Error('trailing input');
  return t;
}

const isObj = (v) => v !== null && typeof v === 'object';
const isPlain = (v) => {
  if (!isObj(v) || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};

function resolve(v) {
  if (!isObj(v) || Array.isArray(v) || ESCAPED.has(v) || typeof v.__t !== 'string') return v;
  switch (v.__t) {
    case 'num': {
      const s = v.v;
      if (typeof s !== 'string') throw new Error('bad num');
      if (s === 'NaN') return NaN;
      if (s === 'Infinity') return Infinity;
      if (s === '-Infinity') return -Infinity;
      if (s === '-0') return -0;
      if (!NUM_RE.test(s)) throw new Error('bad num');
      return Number(s);
    }
    case 'bigint': {
      const s = v.v;
      if (typeof s !== 'string' || !BIG_RE.test(s)) throw new Error('bad bigint');
      return BigInt(s);
    }
    case 'undef': return undefined;
    case 'obj': {
      const src = v.v;
      const keys = Object.keys(src);
      const o = {};
      for (const k of keys) {
        Object.defineProperty(o, k, { value: src[k], enumerable: true, writable: true, configurable: true });
      }
      ESCAPED.add(o);
      return o;
    }
    default: throw new Error('bad tag');
  }
}

function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

function f64node(x) {
  return { t: 'f64', v: Object.is(x, -0) ? '-0' : String(x), bits: bits(x) };
}

function canon(n) {
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  if (typeof n === 'string') return JSON.stringify(n);
  if (typeof n === 'boolean') return String(n);
  if (n.t === 'f64') n = { bits: n.bits, t: 'f64' };
  else if (n.t === 'throw') n = { t: 'throw' };
  return '{' + Object.keys(n).sort().map((k) => JSON.stringify(k) + ':' + canon(n[k])).join(',') + '}';
}

function sortPairs(pairs) {
  const keyed = pairs.map((p) => ({ p, k: p[0].t === 'text' ? p[0].v : canon(p[0]) }));
  keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return keyed.map((e) => e.p);
}

function textNode(v) {
  if (typeof v !== 'string' || !v.isWellFormed()) throw new Error('not text');
  return { t: 'text', v, cu: 'utf8' };
}

function throwObs(v) {
  if (!isObj(v) || Array.isArray(v) || ESCAPED.has(v)) return null;
  if (typeof v.__throw === 'string') return v.__throw;
  if (typeof v.__threw === 'string') return v.__threw;
  return null;
}

function encJ(v0) {
  const v = resolve(v0);
  if (v === undefined) throw new Error('absent in json');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encJ(v[i]));
    }
    return { t: 'list', v: out };
  }
  if (isObj(v) && Object.getPrototypeOf(v) === Object.prototype) {
    const pairs = Object.entries(v).map(([k, x]) => [textNode(k), encJ(x)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function intNode(v, kind) {
  if (!(typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v)))) throw new Error('not integral');
  const b = BigInt(v);
  const lo = kind === 'i64' ? -(1n << 63n) : 0n;
  const hi = kind === 'i64' ? (1n << 63n) - 1n : (1n << 64n) - 1n;
  if (b < lo || b > hi) throw new Error('range');
  return { t: kind, v: b.toString() };
}

function encode(value, ty) {
  const obs = throwObs(value);
  if (obs !== null) return { t: 'throw', msg: obs };
  const v = resolve(value);
  switch (ty.k) {
    case 'union': {
      for (const a of ty.alts) {
        try { return encode(v, a); } catch (e) { /* next */ }
      }
      throw new Error('union');
    }
    case 'none':
      if (v === null || v === undefined) return { t: 'none' };
      throw new Error('not none');
    case 'bool':
      if (typeof v === 'boolean') return { t: 'bool', v };
      throw new Error('not bool');
    case 'text': return textNode(v);
    case 'f64':
      if (typeof v === 'number') return f64node(v);
      throw new Error('not f64');
    case 'i64':
    case 'u64': return intNode(v, ty.k);
    case 'bytes':
      if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
      throw new Error('not bytes');
    case 'json': return encJ(v);
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== ty.items.length) throw new Error('not tuple');
      return { t: 'tuple', v: ty.items.map((it, i) => encode(v[i], it)) };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(encode(v[i], ty.t));
      return { t: 'list', v: out };
    }
    case 'map': {
      let entries;
      if (v instanceof Map) entries = [...v];
      else if (isPlain(v)) entries = Object.entries(v);
      else throw new Error('not map');
      const pairs = entries.map(([k, x]) => [encode(k, ty.key), encode(x, ty.val)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) throw new Error('not record');
      return {
        t: 'record',
        v: ty.fields.map(([n, ft]) => [n, encode(Object.hasOwn(v, n) ? v[n] : undefined, ft)]),
      };
    }
  }
  throw new Error('bad type');
}

export default function encode_value(value, type) {
  return encode(value, parseType(type));
}
