const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const escaped = new WeakSet();

function fail(m) { throw new Error(m); }

function typeKey(t) {
  if (t.k === 'scalar') return t.name;
  if (t.k === 'list') return 'list[' + typeKey(t.item) + ']';
  if (t.k === 'tuple') return 'tuple[' + t.items.map(typeKey).join(',') + ']';
  if (t.k === 'map') return 'map[' + typeKey(t.key) + ',' + typeKey(t.val) + ']';
  if (t.k === 'record') return 'record[' + t.fields.map(([n, ft]) => n + ':' + typeKey(ft)).sort().join(',') + ']';
  return 'union{' + [...new Set(t.alts.map(typeKey))].sort().join('|') + '}';
}

function jsonReached(t) {
  switch (t.k) {
    case 'scalar': return ['none', 'bool', 'f64', 'text', 'json'].includes(t.name);
    case 'list': return jsonReached(t.item);
    case 'tuple': return t.items.every(jsonReached);
    case 'map': return t.key.k === 'scalar' && t.key.name === 'text' && jsonReached(t.val);
    case 'record': return t.fields.every(([, ft]) => jsonReached(ft));
    default: return t.alts.every(jsonReached);
  }
}

function covers(a, b) {
  if (typeKey(a) === typeKey(b)) return true;
  if (a.k === 'scalar' && a.name === 'json' && jsonReached(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every(([n, ft]) => b.fields.some(([m, gt]) => m === n && covers(ft, gt)))) return true;
  if (b.k === 'union' && b.alts.every(x => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some(x => covers(x, b))) return true;
  return false;
}

function parseType(src) {
  if (typeof src !== 'string') fail('type must be text');
  let p = 0;
  const n = src.length;
  const ws = () => { while (p < n && (src[p] === ' ' || src[p] === '\t' || src[p] === '\r' || src[p] === '\n')) p++; };
  const name = () => {
    ws();
    const m = NAME.exec(src.slice(p));
    if (!m) fail('name expected');
    p += m[0].length;
    return m[0];
  };
  const expect = c => { ws(); if (p >= n || src[p] !== c) fail('expected ' + c); p++; };
  const type = depth => {
    const alts = [alt(depth)];
    ws();
    while (p < n && src[p] === '|') {
      p++;
      alts.push(alt(depth));
      ws();
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) if (covers(alts[i], alts[j])) fail('unreachable alternative');
    }
    return { k: 'union', alts };
  };
  const alt = depth => {
    const nm = name();
    if (SCALARS.has(nm)) return { k: 'scalar', name: nm };
    if (nm !== 'tuple' && nm !== 'list' && nm !== 'map' && nm !== 'record') fail('unknown type ' + nm);
    const d = depth + 1;
    if (d > MAX_DEPTH) fail('type too deep');
    expect('[');
    let r;
    if (nm === 'list') {
      r = { k: 'list', item: type(d) };
    } else if (nm === 'tuple') {
      const items = [type(d)];
      ws();
      while (p < n && src[p] === ',') { p++; items.push(type(d)); ws(); }
      r = { k: 'tuple', items };
    } else if (nm === 'map') {
      const key = type(d);
      expect(',');
      const val = type(d);
      r = { k: 'map', key, val };
    } else {
      const fields = [];
      const seen = new Set();
      for (;;) {
        const fn = name();
        if (seen.has(fn)) fail('duplicate field');
        seen.add(fn);
        expect(':');
        fields.push([fn, type(d)]);
        ws();
        if (p < n && src[p] === ',') { p++; continue; }
        break;
      }
      r = { k: 'record', fields };
    }
    expect(']');
    return r;
  };
  const t = type(0);
  ws();
  if (p < n) fail('trailing input');
  return t;
}

function isPlain(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const pr = Object.getPrototypeOf(v);
  return pr === Object.prototype || pr === null;
}

function throwMarker(v) {
  if (!isPlain(v) || escaped.has(v)) return null;
  for (const key of ['__throw', '__threw']) {
    if (Object.hasOwn(v, key) && typeof v[key] === 'string' && Object.keys(v).length === 1) return v[key];
  }
  return null;
}

function resolveTag(v) {
  if (!isPlain(v) || escaped.has(v) || !Object.hasOwn(v, '__t') || typeof v.__t !== 'string') return v;
  const tag = v.__t;
  const get = k => (Object.hasOwn(v, k) ? v[k] : undefined);
  if (tag === 'num') {
    const s = get('v');
    if (typeof s !== 'string') fail('num v must be text');
    if (s === 'NaN') return NaN;
    if (s === 'Infinity') return Infinity;
    if (s === '-Infinity') return -Infinity;
    if (s === '-0') return -0;
    if (!NUM_LITERAL.test(s)) fail('bad num literal');
    const n = Number(s);
    if (n === 0 && /[1-9]/.test(s.replace(/[eE].*$/, ''))) fail('underflow');
    if (!Number.isFinite(n) || Object.is(n, -0)) fail('bad num');
    return n;
  }
  if (tag === 'bigint') {
    const s = get('v');
    if (typeof s !== 'string' || !BIGINT_LITERAL.test(s)) fail('bad bigint');
    return BigInt(s);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    const inner = get('v');
    if (!isPlain(inner)) fail('obj v must be a map');
    const o = {};
    for (const k of Object.keys(inner)) {
      Object.defineProperty(o, k, { value: inner[k], enumerable: true, writable: true, configurable: true });
    }
    escaped.add(o);
    return o;
  }
  fail('unknown tag');
}

function render(x) {
  return Object.is(x, -0) ? '-0' : String(x);
}

function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

function f64Node(x) {
  return { t: 'f64', v: render(x), bits: bits(x) };
}

function textOk(s) {
  return typeof s === 'string' && s.isWellFormed();
}

function canon(o) {
  if (o === null || typeof o !== 'object') return JSON.stringify(o);
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o.t === 'f64') o = { bits: o.bits, t: 'f64' };
  else if (o.t === 'throw') o = { t: 'throw' };
  return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}

function sortPairs(pairs) {
  const withKeys = pairs.map(p => ({ p, sk: p[0].t === 'text' ? p[0].v : canon(p[0]) }));
  withKeys.sort((x, y) => (x.sk < y.sk ? -1 : x.sk > y.sk ? 1 : 0));
  return withKeys.map(x => x.p);
}

function encJson(v, d) {
  if (d > MAX_VALUE_DEPTH) fail('too deep');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64Node(v);
  if (typeof v === 'string') {
    if (!v.isWellFormed()) fail('ill-formed text');
    return { t: 'text', v, cu: 'utf8' };
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) fail('hole');
      out.push(encJson(resolveTag(v[i]), d + 1));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = [];
    for (const [k, val] of Object.entries(v)) {
      if (!k.isWellFormed()) fail('ill-formed key');
      pairs.push([{ t: 'text', v: k, cu: 'utf8' }, encJson(resolveTag(val), d + 1)]);
    }
    return { t: 'map', v: sortPairs(pairs) };
  }
  fail('not json');
}

function intNode(v, t, lo, hi) {
  let b;
  if (typeof v === 'bigint') b = v;
  else if (typeof v === 'number' && Number.isInteger(v)) b = BigInt(v);
  else fail('not integral');
  if (b < lo || b > hi) fail('out of range');
  return { t, v: b.toString() };
}

function enc(v, T, d) {
  if (d > MAX_VALUE_DEPTH) fail('too deep');
  const msg = throwMarker(v);
  if (msg !== null) return { t: 'throw', msg };
  v = resolveTag(v);
  switch (T.k) {
    case 'union': {
      for (const a of T.alts) {
        try { return enc(v, a, d); } catch (e) { /* next */ }
      }
      fail('no alternative');
    }
    case 'scalar':
      switch (T.name) {
        case 'none':
          if (v === null || v === undefined) return { t: 'none' };
          fail('not none');
        case 'bool':
          if (typeof v === 'boolean') return { t: 'bool', v };
          fail('not bool');
        case 'text':
          if (textOk(v)) return { t: 'text', v, cu: 'utf8' };
          fail('not text');
        case 'f64':
          if (typeof v === 'number') return f64Node(v);
          fail('not number');
        case 'i64': return intNode(v, 'i64', -(2n ** 63n), 2n ** 63n - 1n);
        case 'u64': return intNode(v, 'u64', 0n, 2n ** 64n - 1n);
        case 'bytes':
          if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
          fail('not bytes');
        default:
          if (v === undefined) fail('absent');
          return encJson(v, d);
      }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== T.items.length) fail('tuple mismatch');
      return { t: 'tuple', v: T.items.map((it, i) => enc(v[i], it, d + 1)) };
    }
    case 'list': {
      if (!Array.isArray(v)) fail('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], T.item, d + 1));
      return { t: 'list', v: out };
    }
    case 'map': {
      let entries;
      if (v instanceof Map) entries = [...v];
      else if (isPlain(v)) entries = Object.entries(v);
      else fail('not map');
      const pairs = entries.map(([k, val]) => [enc(k, T.key, d + 1), enc(val, T.val, d + 1)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    default: {
      if (!isPlain(v)) fail('not record');
      return {
        t: 'record',
        v: T.fields.map(([n, ft]) => [n, enc(Object.hasOwn(v, n) ? v[n] : undefined, ft, d + 1)]),
      };
    }
  }
}

export default function encode_value(value, type) {
  const T = parseType(type);
  return enc(value, T, 0);
}
