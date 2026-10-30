const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const ESCAPED = new WeakSet();

const fail = (m) => { throw new Error(m); };

// type key for SAME comparison
function typeKey(t) {
  switch (t.k) {
    case 's': return t.n;
    case 'list': return 'list(' + typeKey(t.item) + ')';
    case 'tuple': return 'tuple(' + t.items.map(typeKey).join(',') + ')';
    case 'map': return 'map(' + typeKey(t.key) + ',' + typeKey(t.val) + ')';
    case 'record': return 'rec(' + t.fields.map(([n, ft]) => n + ':' + typeKey(ft)).sort().join(',') + ')';
    default: return 'union(' + [...new Set(t.alts.map(typeKey))].sort().join('|') + ')';
  }
}

function jsonReached(t) {
  switch (t.k) {
    case 's': return t.n === 'none' || t.n === 'bool' || t.n === 'f64' || t.n === 'text' || t.n === 'json';
    case 'list': return jsonReached(t.item);
    case 'tuple': return t.items.every(jsonReached);
    case 'map': return t.key.k === 's' && t.key.n === 'text' && jsonReached(t.val);
    case 'record': return t.fields.every(([, ft]) => jsonReached(ft));
    default: return t.alts.every(jsonReached);
  }
}

function covers(a, b) {
  if (typeKey(a) === typeKey(b)) return true;
  if (a.k === 's' && a.n === 'json' && jsonReached(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every(([n, ft]) => { const o = b.fields.find((f) => f[0] === n); return o && covers(ft, o[1]); })) return true;
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(s) {
  if (typeof s !== 'string') fail('type');
  let i = 0;
  let depth = 0;
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++; };
  const word = () => {
    ws();
    const m = NAME.exec(s.slice(i));
    if (!m) fail('name');
    i += m[0].length;
    return m[0];
  };
  const expect = (c) => { ws(); if (s[i] !== c) fail('expected ' + c); i++; };
  const union = () => {
    const alts = [alt()];
    ws();
    while (s[i] === '|') {
      i++;
      alts.push(alt());
      ws();
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let x = 0; x < j; x++) if (covers(alts[x], alts[j])) fail('unreachable alternative');
    }
    return { k: 'union', alts };
  };
  const enter = () => { depth++; if (depth > MAX_DEPTH) fail('depth'); expect('['); };
  const leave = () => { expect(']'); depth--; };
  const alt = () => {
    const w = word();
    if (SCALARS.has(w)) return { k: 's', n: w };
    if (w === 'list') { enter(); const item = union(); leave(); return { k: 'list', item }; }
    if (w === 'tuple') {
      enter();
      const items = [union()];
      ws();
      while (s[i] === ',') { i++; items.push(union()); ws(); }
      leave();
      return { k: 'tuple', items };
    }
    if (w === 'map') {
      enter();
      const key = union();
      expect(',');
      const val = union();
      leave();
      return { k: 'map', key, val };
    }
    if (w === 'record') {
      enter();
      const fields = [];
      const one = () => {
        const n = word();
        expect(':');
        if (fields.some((f) => f[0] === n)) fail('dup field');
        fields.push([n, union()]);
      };
      one();
      ws();
      while (s[i] === ',') { i++; one(); ws(); }
      leave();
      return { k: 'record', fields };
    }
    return fail('unknown type name');
  };
  const t = union();
  ws();
  if (i !== s.length) fail('trailing');
  return t;
}

const plainObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const marker = (v, key) => plainObj(v) && !ESCAPED.has(v) && Object.hasOwn(v, key) && typeof v[key] === 'string';
const throwMarker = (v, key) => marker(v, key) && Object.keys(v).length === 1;
const ownGet = (v, k) => (Object.hasOwn(v, k) ? v[k] : undefined);

function f64bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}
const f64str = (x) => (Object.is(x, -0) ? '-0' : String(x));
const textNode = (s) => ({ t: 'text', v: s, cu: 'utf8' });
const f64Node = (x) => ({ t: 'f64', v: f64str(x), bits: f64bits(x) });

function canon(n) {
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  if (typeof n === 'string') return JSON.stringify(n);
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (n !== null && typeof n === 'object') {
    if (n.t === 'f64') n = { bits: n.bits, t: 'f64' };
    else if (n.t === 'throw') n = { t: 'throw' };
    return '{' + Object.keys(n).sort().map((k) => JSON.stringify(k) + ':' + canon(n[k])).join(',') + '}';
  }
  return String(n);
}

function sortPairs(pairs) {
  const keyed = pairs.map((p) => ({ p, s: p[0].t === 'text' ? p[0].v : canon(p[0]) }));
  keyed.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  return keyed.map((x) => x.p);
}

function resolveTag(v) {
  if (!marker(v, '__t')) return v;
  const tag = v.__t;
  if (tag === 'num') {
    const s = ownGet(v, 'v');
    if (typeof s !== 'string') fail('num v');
    if (s === 'NaN') return NaN;
    if (s === 'Infinity') return Infinity;
    if (s === '-Infinity') return -Infinity;
    if (s === '-0') return -0;
    if (!NUM_LITERAL.test(s)) fail('num literal');
    const n = Number(s);
    if (n === 0 && /[1-9]/.test(s.replace(/[eE].*$/, ''))) fail('underflow');
    if (!Number.isFinite(n) || Object.is(n, -0)) fail('num range');
    return n;
  }
  if (tag === 'bigint') {
    const s = ownGet(v, 'v');
    if (typeof s !== 'string' || !BIGINT_LITERAL.test(s)) fail('bigint');
    return BigInt(s);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    const inner = ownGet(v, 'v');
    if (!plainObj(inner)) fail('obj v');
    const o = {};
    for (const k of Object.keys(inner)) {
      Object.defineProperty(o, k, { value: inner[k], enumerable: true, writable: true, configurable: true });
    }
    ESCAPED.add(o);
    return o;
  }
  return fail('unknown tag');
}

const isInt = (v) => typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v));

function encJson(v, depth) {
  if (depth > MAX_VALUE_DEPTH) fail('depth');
  return jsonBody(resolveTag(v), depth);
}

function jsonBody(v, depth) {
  if (v === undefined) fail('absent in json');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64Node(v);
  if (typeof v === 'string') {
    if (!v.isWellFormed()) fail('text');
    return textNode(v);
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) fail('hole');
      out.push(encJson(v[i], depth + 1));
    }
    return { t: 'list', v: out };
  }
  if (plainObj(v)) {
    const pairs = [];
    for (const [k, x] of Object.entries(v)) {
      if (!k.isWellFormed()) fail('key');
      pairs.push([textNode(k), encJson(x, depth + 1)]);
    }
    return { t: 'map', v: sortPairs(pairs) };
  }
  return fail('json kind');
}

function enc(v, t, depth) {
  if (depth > MAX_VALUE_DEPTH) fail('depth');
  if (throwMarker(v, '__throw')) return { t: 'throw', msg: v.__throw };
  if (throwMarker(v, '__threw')) return { t: 'throw', msg: v.__threw };
  v = resolveTag(v);
  if (t.k === 'union') {
    for (const a of t.alts) {
      try { return body(v, a, depth); } catch (e) { /* next */ }
    }
    return fail('no alternative');
  }
  return body(v, t, depth);
}

function body(v, t, depth) {
  if (depth > MAX_VALUE_DEPTH) fail('depth');
  switch (t.k) {
    case 's':
      switch (t.n) {
        case 'none':
          if (v === null || v === undefined) return { t: 'none' };
          return fail('none');
        case 'bool':
          if (typeof v === 'boolean') return { t: 'bool', v };
          return fail('bool');
        case 'text':
          if (typeof v === 'string' && v.isWellFormed()) return textNode(v);
          return fail('text');
        case 'f64':
          if (typeof v === 'number') return f64Node(v);
          return fail('f64');
        case 'i64':
        case 'u64': {
          if (!isInt(v)) fail('int');
          const b = BigInt(v);
          const lo = t.n === 'i64' ? -(2n ** 63n) : 0n;
          const hi = t.n === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
          if (b < lo || b > hi) fail('range');
          return { t: t.n, v: b.toString() };
        }
        case 'bytes':
          if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
          return fail('bytes');
        default:
          return jsonBody(v, depth);
      }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) fail('tuple');
      const out = [];
      for (let i = 0; i < t.items.length; i++) out.push(enc(v[i], t.items[i], depth + 1));
      return { t: 'tuple', v: out };
    }
    case 'list': {
      if (!Array.isArray(v)) fail('list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item, depth + 1));
      return { t: 'list', v: out };
    }
    case 'map': {
      let entries;
      if (v instanceof Map) entries = [...v];
      else if (plainObj(v)) entries = Object.entries(v);
      else return fail('map');
      const pairs = [];
      for (const [k, x] of entries) pairs.push([enc(k, t.key, depth + 1), enc(x, t.val, depth + 1)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!plainObj(v)) fail('record');
      const out = [];
      for (const [n, ft] of t.fields) out.push([n, enc(ownGet(v, n), ft, depth + 1)]);
      return { t: 'record', v: out };
    }
    default:
      return fail('type');
  }
}

export default function encode_value(value, type) {
  const t = parseType(type);
  return enc(value, t, 0);
}
