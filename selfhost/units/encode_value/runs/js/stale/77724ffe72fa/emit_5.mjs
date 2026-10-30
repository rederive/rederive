const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const COMPOSITES = new Set(['tuple', 'list', 'map', 'record']);
const NUM_LIT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIG_LIT = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const ESCAPED = new WeakSet();

function fail(m) { throw new Error(m); }

function parseTypeText(s) {
  let p = 0;
  const ws = () => { while (p < s.length && (s[p] === ' ' || s[p] === '\t' || s[p] === '\r' || s[p] === '\n')) p++; };
  const word = () => { const m = NAME.exec(s.slice(p)); if (!m) fail('bad type at ' + p); p += m[0].length; return m[0]; };
  const expect = (c) => { ws(); if (s[p] !== c) fail('expected ' + c + ' at ' + p); p++; };
  function type(d) {
    const alts = [];
    const seen = new Set();
    for (;;) {
      ws();
      const a = alt(d);
      const key = JSON.stringify(a);
      if (seen.has(key)) fail('duplicate alternative');
      seen.add(key);
      alts.push(a);
      ws();
      if (s[p] === '|') { p++; continue; }
      break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  }
  function alt(d) {
    const w = word();
    if (SCALARS.has(w)) return { k: 'scalar', n: w };
    if (!COMPOSITES.has(w)) fail('unknown type ' + w);
    const nd = d + 1;
    if (nd > 256) fail('too deep');
    expect('[');
    let node;
    if (w === 'list') {
      node = { k: 'list', item: type(nd) };
    } else if (w === 'tuple') {
      const items = [type(nd)];
      for (;;) { ws(); if (s[p] === ',') { p++; items.push(type(nd)); } else break; }
      node = { k: 'tuple', items };
    } else if (w === 'map') {
      const key = type(nd);
      expect(',');
      const val = type(nd);
      node = { k: 'map', key, val };
    } else {
      const fields = [];
      const names = new Set();
      for (;;) {
        ws();
        const n = word();
        if (names.has(n)) fail('duplicate field');
        names.add(n);
        expect(':');
        fields.push([n, type(nd)]);
        ws();
        if (s[p] === ',') { p++; continue; }
        break;
      }
      node = { k: 'record', fields };
    }
    expect(']');
    return node;
  }
  const t = type(0);
  ws();
  if (p !== s.length) fail('trailing text');
  return t;
}

const isPlain = (x) => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const pr = Object.getPrototypeOf(x);
  return pr === Object.prototype || pr === null;
};
const marker = (v, key) => isPlain(v) && !ESCAPED.has(v) && Object.hasOwn(v, key) && typeof v[key] === 'string';
const wf = (s) => typeof s === 'string' && s.isWellFormed();

function resolveTag(v) {
  if (!marker(v, '__t')) return v;
  const tag = v.__t;
  const hv = Object.hasOwn(v, 'v');
  if (tag === 'num') {
    if (!hv || typeof v.v !== 'string') fail('num: v must be text');
    const s = v.v;
    if (s === 'NaN') return NaN;
    if (s === 'Infinity') return Infinity;
    if (s === '-Infinity') return -Infinity;
    if (s === '-0') return -0;
    if (!NUM_LIT.test(s)) fail('num: bad literal');
    const n = Number(s);
    if (!Number.isFinite(n) || Object.is(n, -0)) fail('num: not representable');
    return n;
  }
  if (tag === 'bigint') {
    if (!hv || typeof v.v !== 'string' || !BIG_LIT.test(v.v)) fail('bigint: bad v');
    return BigInt(v.v);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (!hv || !isPlain(v.v)) fail('obj: v must be a map');
    const o = {};
    for (const k of Object.keys(v.v)) {
      Object.defineProperty(o, k, { value: v.v[k], enumerable: true, writable: true, configurable: true });
    }
    ESCAPED.add(o);
    return o;
  }
  fail('unknown tag');
}

const buf = new DataView(new ArrayBuffer(8));
function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  buf.setFloat64(0, x, false);
  return buf.getBigUint64(0, false).toString(16).padStart(16, '0');
}
const f64node = (x) => ({ t: 'f64', v: Object.is(x, -0) ? '-0' : String(x), bits: bits(x) });

function canon(o) {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (typeof o === 'string') return JSON.stringify(o);
  if (typeof o === 'boolean') return String(o);
  if (o !== null && typeof o === 'object') {
    let r = o;
    if (o.t === 'f64') r = { bits: o.bits, t: 'f64' };
    else if (o.t === 'throw') r = { t: 'throw' };
    return '{' + Object.keys(r).sort().map((k) => JSON.stringify(k) + ':' + canon(r[k])).join(',') + '}';
  }
  return JSON.stringify(o);
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
function sortPairs(pairs) {
  const keyed = pairs.map((pr) => ({ pr, sk: pr[0].t === 'text' ? pr[0].v : canon(pr[0]) }));
  keyed.sort((a, b) => cmp(a.sk, b.sk));
  return keyed.map((e) => e.pr);
}

function json(v) {
  v = resolveTag(v);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') {
    if (!wf(v)) fail('ill-formed text');
    return { t: 'text', v, cu: 'utf8' };
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) fail('hole');
      out.push(json(v[i]));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = [];
    for (const k of Object.keys(v)) {
      if (!wf(k)) fail('ill-formed key');
      pairs.push([{ t: 'text', v: k, cu: 'utf8' }, json(v[k])]);
    }
    return { t: 'map', v: sortPairs(pairs) };
  }
  fail('not json');
}

const I64 = [-(2n ** 63n), 2n ** 63n - 1n];
const U64 = [0n, 2n ** 64n - 1n];

function enc(v, ty) {
  if (marker(v, '__throw')) return { t: 'throw', msg: v.__throw };
  if (marker(v, '__threw')) return { t: 'throw', msg: v.__threw };
  v = resolveTag(v);
  return encR(v, ty);
}

function encR(v, ty) {
  switch (ty.k) {
    case 'union': {
      for (const a of ty.alts) {
        try { return enc(v, a); } catch (e) { /* next */ }
      }
      fail('no alternative');
    }
    case 'scalar': return scalar(v, ty.n);
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== ty.items.length) fail('not tuple');
      return { t: 'tuple', v: ty.items.map((it, i) => enc(v[i], it)) };
    }
    case 'list': {
      if (!Array.isArray(v)) fail('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], ty.item));
      return { t: 'list', v: out };
    }
    case 'map': {
      let entries;
      if (v instanceof Map) entries = [...v];
      else if (isPlain(v)) entries = Object.entries(v);
      else fail('not map');
      const pairs = entries.map(([k, x]) => [enc(k, ty.key), enc(x, ty.val)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) fail('not record');
      return {
        t: 'record',
        v: ty.fields.map(([n, ft]) => [n, enc(Object.hasOwn(v, n) ? v[n] : undefined, ft)]),
      };
    }
  }
  fail('bad type');
}

function intNode(v, tn, range) {
  if (!(typeof v === 'bigint' || Number.isInteger(v))) fail('not integral');
  const b = BigInt(v);
  if (b < range[0] || b > range[1]) fail('out of range');
  return { t: tn, v: b.toString() };
}

function scalar(v, n) {
  switch (n) {
    case 'none':
      if (v === null || v === undefined) return { t: 'none' };
      fail('not none');
    case 'bool':
      if (typeof v === 'boolean') return { t: 'bool', v };
      fail('not bool');
    case 'text':
      if (wf(v)) return { t: 'text', v, cu: 'utf8' };
      fail('not text');
    case 'f64':
      if (typeof v === 'number') return f64node(v);
      fail('not number');
    case 'i64': return intNode(v, 'i64', I64);
    case 'u64': return intNode(v, 'u64', U64);
    case 'bytes':
      if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
      fail('not bytes');
    case 'json':
      return json(v);
  }
  fail('bad scalar');
}

export default function encode_value(value, type) {
  if (typeof type !== 'string') fail('type must be text');
  const ty = parseTypeText(type);
  return enc(value, ty);
}
