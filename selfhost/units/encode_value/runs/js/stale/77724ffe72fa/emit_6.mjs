const NUM = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIG = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const COMPOSITES = new Set(['tuple', 'list', 'map', 'record']);
const escaped = new WeakSet();

function parseType(src) {
  let pos = 0;
  let depth = 0;
  const bad = (m) => { throw new Error('type: ' + m + ' at ' + pos); };
  const ws = () => { while (pos < src.length && ' \t\r\n'.includes(src[pos])) pos++; };
  const name = () => {
    ws();
    NAME.lastIndex = pos;
    const m = NAME.exec(src);
    if (!m) bad('name expected');
    pos += m[0].length;
    return m[0];
  };
  const expect = (c) => { ws(); if (src[pos] !== c) bad('expected ' + c); pos++; };
  const peek = () => { ws(); return src[pos]; };
  function type() {
    const alts = [alt()];
    while (peek() === '|') { pos++; alts.push(alt()); }
    if (alts.length === 1) return alts[0];
    const seen = new Set();
    for (const a of alts) {
      const k = JSON.stringify(a);
      if (seen.has(k)) bad('duplicate alternative');
      seen.add(k);
    }
    return { k: 'union', alts };
  }
  function alt() {
    const n = name();
    if (SCALARS.has(n)) return { k: n };
    if (!COMPOSITES.has(n)) bad('unknown name');
    depth++;
    if (depth > 256) bad('too deep');
    expect('[');
    let node;
    if (n === 'list') {
      node = { k: 'list', item: type() };
    } else if (n === 'map') {
      const key = type();
      expect(',');
      node = { k: 'map', key, val: type() };
    } else if (n === 'tuple') {
      const items = [type()];
      while (peek() === ',') { pos++; items.push(type()); }
      node = { k: 'tuple', items };
    } else {
      const fields = [];
      const names = new Set();
      for (;;) {
        const fn = name();
        if (names.has(fn)) bad('duplicate field');
        names.add(fn);
        expect(':');
        fields.push([fn, type()]);
        if (peek() === ',') { pos++; continue; }
        break;
      }
      node = { k: 'record', fields };
    }
    expect(']');
    depth--;
    return node;
  }
  const t = type();
  ws();
  if (pos !== src.length) bad('trailing text');
  return t;
}

const isList = Array.isArray;
function plain(x) {
  if (x === null || typeof x !== 'object' || isList(x)) return false;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null;
}
const text = (x) => typeof x === 'string' && x.isWellFormed();
function marker(v, key) {
  return plain(v) && !escaped.has(v) && Object.hasOwn(v, key) && typeof v[key] === 'string';
}

function resolve(v) {
  if (!marker(v, '__t')) return v;
  const tag = v.__t;
  const pv = Object.hasOwn(v, 'v') ? v.v : undefined;
  if (tag === 'num') {
    if (typeof pv !== 'string') throw new Error('num: v must be text');
    if (pv === 'NaN') return NaN;
    if (pv === 'Infinity') return Infinity;
    if (pv === '-Infinity') return -Infinity;
    if (pv === '-0') return -0;
    if (!NUM.test(pv)) throw new Error('num: bad literal');
    const n = Number(pv);
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('num: no own spelling');
    return n;
  }
  if (tag === 'bigint') {
    if (typeof pv !== 'string' || !BIG.test(pv)) throw new Error('bigint: bad v');
    return BigInt(pv);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (!plain(pv)) throw new Error('obj: v must be a map');
    const o = {};
    for (const k of Object.keys(pv)) {
      Object.defineProperty(o, k, { value: pv[k], enumerable: true, writable: true, configurable: true });
    }
    escaped.add(o);
    return o;
  }
  throw new Error('unknown tag');
}

function render(x) {
  return Object.is(x, -0) ? '-0' : String(x);
}
function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x, false);
  return dv.getBigUint64(0, false).toString(16).padStart(16, '0');
}
function f64node(x) {
  return { t: 'f64', v: render(x), bits: bits(x) };
}
function textNode(s) {
  return { t: 'text', v: s, cu: 'utf8' };
}
function canonVal(n) {
  if (isList(n)) return n.map(canonVal);
  if (n !== null && typeof n === 'object') {
    if (n.t === 'f64') return { bits: n.bits, t: 'f64' };
    if (n.t === 'throw') return { t: 'throw' };
    const o = {};
    for (const k of Object.keys(n).sort()) o[k] = canonVal(n[k]);
    return o;
  }
  return n;
}
function canon(n) {
  return JSON.stringify(canonVal(n), (k, v) => {
    if (v !== null && typeof v === 'object' && !isList(v)) {
      const o = {};
      for (const kk of Object.keys(v).sort()) o[kk] = v[kk];
      return o;
    }
    return v;
  });
}
function sortPairs(pairs) {
  const keyed = pairs.map((p) => ({ p, s: p[0].t === 'text' ? p[0].v : canon(p[0]) }));
  keyed.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  return keyed.map((x) => x.p);
}

function encJson(v0) {
  const v = resolve(v0);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') {
    if (!v.isWellFormed()) throw new Error('not well-formed');
    return textNode(v);
  }
  if (isList(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encJson(v[i]));
    }
    return { t: 'list', v: out };
  }
  if (plain(v)) {
    const pairs = [];
    for (const k of Object.keys(v)) {
      if (!k.isWellFormed()) throw new Error('not well-formed');
      pairs.push([textNode(k), encJson(v[k])]);
    }
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function encTyped(v, t) {
  if (marker(v, '__throw')) return { t: 'throw', msg: v.__throw };
  if (marker(v, '__threw')) return { t: 'throw', msg: v.__threw };
  return apply(resolve(v), t);
}

function integral(v, lo, hi, tn) {
  if (!(typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v)))) throw new Error('not integral');
  const b = BigInt(v);
  if (b < lo || b > hi) throw new Error('out of range');
  return { t: tn, v: b.toString() };
}

function apply(v, t) {
  switch (t.k) {
    case 'none':
      if (v === null || v === undefined) return { t: 'none' };
      throw new Error('not none');
    case 'bool':
      if (typeof v === 'boolean') return { t: 'bool', v };
      throw new Error('not bool');
    case 'text':
      if (text(v)) return textNode(v);
      throw new Error('not text');
    case 'f64':
      if (typeof v === 'number') return f64node(v);
      throw new Error('not number');
    case 'i64':
      return integral(v, -(1n << 63n), (1n << 63n) - 1n, 'i64');
    case 'u64':
      return integral(v, 0n, (1n << 64n) - 1n, 'u64');
    case 'bytes':
      if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
      throw new Error('not bytes');
    case 'json':
      return encJson(v);
    case 'tuple': {
      if (!isList(v) || v.length !== t.items.length) throw new Error('bad tuple');
      const out = [];
      for (let i = 0; i < t.items.length; i++) out.push(encTyped(v[i], t.items[i]));
      return { t: 'tuple', v: out };
    }
    case 'list': {
      if (!isList(v)) throw new Error('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(encTyped(v[i], t.item));
      return { t: 'list', v: out };
    }
    case 'map': {
      let entries;
      if (v instanceof Map) entries = [...v];
      else if (plain(v)) entries = Object.entries(v);
      else throw new Error('not map');
      const pairs = entries.map(([k, x]) => [encTyped(k, t.key), encTyped(x, t.val)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!plain(v)) throw new Error('not record');
      const out = t.fields.map(([n, ft]) => [n, encTyped(Object.hasOwn(v, n) ? v[n] : undefined, ft)]);
      return { t: 'record', v: out };
    }
    case 'union': {
      for (const a of t.alts) {
        try {
          return apply(v, a);
        } catch (e) { /* try next */ }
      }
      throw new Error('no alternative');
    }
  }
  throw new Error('bad type');
}

export default function encode_value(value, type) {
  const t = parseType(type);
  if (marker(value, '__throw')) return { t: 'throw', msg: value.__throw };
  if (marker(value, '__threw')) return { t: 'throw', msg: value.__threw };
  return apply(resolve(value), t);
}
