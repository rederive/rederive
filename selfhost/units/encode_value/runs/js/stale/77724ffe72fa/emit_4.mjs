const WS = ' \t\r\n';
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const NUM_LIT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIG_LIT = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const ESCAPED = new WeakSet();

function parseType(text) {
  let p = 0;
  let depth = 0;
  const fail = (m) => { throw new Error('bad type: ' + m); };
  const ws = () => { while (p < text.length && WS.includes(text[p])) p++; };
  const expect = (c) => { ws(); if (text[p] !== c) fail('expected ' + c); p++; };
  const name = () => {
    ws();
    const m = NAME.exec(text.slice(p));
    if (!m) fail('name');
    p += m[0].length;
    return m[0];
  };
  function union() {
    const alts = [alt()];
    const seen = new Set([JSON.stringify(alts[0])]);
    for (;;) {
      ws();
      if (text[p] !== '|') break;
      p++;
      const a = alt();
      const key = JSON.stringify(a);
      if (seen.has(key)) fail('duplicate alternative');
      seen.add(key);
      alts.push(a);
    }
    return alts.length === 1 ? alts[0] : { k: 'union', a: alts };
  }
  function alt() {
    const n = name();
    if (SCALARS.has(n)) return { k: n };
    if (n !== 'tuple' && n !== 'list' && n !== 'map' && n !== 'record') fail('unknown ' + n);
    if (++depth > 256) fail('too deep');
    expect('[');
    let node;
    if (n === 'list') {
      node = { k: 'list', i: union() };
    } else if (n === 'map') {
      const k = union();
      expect(',');
      node = { k: 'map', key: k, val: union() };
    } else if (n === 'tuple') {
      const items = [union()];
      for (;;) { ws(); if (text[p] !== ',') break; p++; items.push(union()); }
      node = { k: 'tuple', items };
    } else {
      const fields = [];
      const names = new Set();
      for (;;) {
        const fn = name();
        if (names.has(fn)) fail('dup field');
        names.add(fn);
        expect(':');
        fields.push([fn, union()]);
        ws();
        if (text[p] !== ',') break;
        p++;
      }
      node = { k: 'record', f: fields };
    }
    expect(']');
    depth--;
    return node;
  }
  const t = union();
  ws();
  if (p !== text.length) fail('trailing');
  return t;
}

const isList = Array.isArray;
function isPlain(x) {
  if (x === null || typeof x !== 'object' || isList(x)) return false;
  const pr = Object.getPrototypeOf(x);
  return pr === Object.prototype || pr === null;
}
function marker(v, key) {
  return isPlain(v) && !ESCAPED.has(v) && Object.hasOwn(v, key) && typeof v[key] === 'string';
}
const own = (o, k) => (Object.hasOwn(o, k) ? o[k] : undefined);

function legacy(v) {
  const tag = v.__t;
  if (tag === 'num') {
    const s = own(v, 'v');
    if (typeof s !== 'string') throw new Error('num v');
    if (s === 'NaN') return NaN;
    if (s === 'Infinity') return Infinity;
    if (s === '-Infinity') return -Infinity;
    if (s === '-0') return -0;
    if (!NUM_LIT.test(s)) throw new Error('num literal');
    const n = Number(s);
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('num range');
    return n;
  }
  if (tag === 'bigint') {
    const s = own(v, 'v');
    if (typeof s !== 'string' || !BIG_LIT.test(s)) throw new Error('bigint');
    return BigInt(s);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    const inner = own(v, 'v');
    if (!isPlain(inner)) throw new Error('obj v');
    const o = {};
    for (const k of Object.keys(inner)) {
      Object.defineProperty(o, k, { value: inner[k], enumerable: true, writable: true, configurable: true });
    }
    ESCAPED.add(o);
    return o;
  }
  throw new Error('unknown tag');
}

class Thr { constructor(m) { this.m = m; } }

function resolve(v) {
  if (marker(v, '__throw')) return new Thr(v.__throw);
  if (marker(v, '__threw')) return new Thr(v.__threw);
  if (marker(v, '__t')) return legacy(v);
  return v;
}
const rv = (v) => (marker(v, '__t') ? legacy(v) : v);

function render(x) { return Object.is(x, -0) ? '-0' : String(x); }
function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}
const text = (s) => {
  if (typeof s !== 'string' || !s.isWellFormed()) throw new Error('not text');
  return { cu: 'utf8', t: 'text', v: s };
};

function canon(n) {
  if (isList(n)) return '[' + n.map(canon).join(',') + ']';
  if (n !== null && typeof n === 'object') {
    if (n.t === 'f64') n = { bits: n.bits, t: 'f64' };
    else if (n.t === 'throw') n = { t: 'throw' };
    return '{' + Object.keys(n).sort().map((k) => JSON.stringify(k) + ':' + canon(n[k])).join(',') + '}';
  }
  return JSON.stringify(n);
}
function sortPairs(pairs) {
  const sk = (k) => (k.t === 'text' ? k.v : canon(k));
  const dec = pairs.map((p) => [sk(p[0]), p]);
  dec.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return dec.map((d) => d[1]);
}

const I64 = [-(2n ** 63n), 2n ** 63n - 1n];
const U64 = [0n, 2n ** 64n - 1n];
function integral(x, r) {
  if (!(typeof x === 'bigint' || (typeof x === 'number' && Number.isInteger(x)))) throw new Error('not integral');
  const b = BigInt(x);
  if (b < r[0] || b > r[1]) throw new Error('range');
  return b.toString();
}

function ej(v) {
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return { t: 'f64', v: render(v), bits: bits(v) };
  if (typeof v === 'string') return text(v);
  if (isList(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(ej(rv(v[i])));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = Object.entries(v).map(([k, x]) => [text(k), ej(rv(x))]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function encode(v, t) {
  const r = resolve(v);
  if (r instanceof Thr) return { t: 'throw', msg: r.m };
  return enc(r, t);
}

function enc(v, t) {
  switch (t.k) {
    case 'union': {
      for (const a of t.a) {
        try { return enc(v, a); } catch (e) { /* next */ }
      }
      throw new Error('no alternative');
    }
    case 'none':
      if (v === null || v === undefined) return { t: 'none' };
      throw new Error('not none');
    case 'bool':
      if (typeof v === 'boolean') return { t: 'bool', v };
      throw new Error('not bool');
    case 'text': return text(v);
    case 'f64':
      if (typeof v !== 'number') throw new Error('not f64');
      return { t: 'f64', v: render(v), bits: bits(v) };
    case 'i64': return { t: 'i64', v: integral(v, I64) };
    case 'u64': return { t: 'u64', v: integral(v, U64) };
    case 'bytes':
      if (!(v instanceof Uint8Array)) throw new Error('not bytes');
      return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
    case 'json': return ej(v);
    case 'tuple': {
      if (!isList(v) || v.length !== t.items.length) throw new Error('tuple');
      return { t: 'tuple', v: t.items.map((it, i) => encode(v[i], it)) };
    }
    case 'list': {
      if (!isList(v)) throw new Error('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(encode(v[i], t.i));
      return { t: 'list', v: out };
    }
    case 'map': {
      let ents;
      if (v instanceof Map) ents = [...v];
      else if (isPlain(v)) ents = Object.entries(v);
      else throw new Error('not map');
      const pairs = ents.map(([k, x]) => [encode(k, t.key), encode(x, t.val)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) throw new Error('not record');
      return { t: 'record', v: t.f.map(([n, ft]) => [n, encode(own(v, n), ft)]) };
    }
  }
  throw new Error('bad type');
}

export default function encode_value(value, type) {
  const t = parseType(String(type));
  return encode(value, t);
}
