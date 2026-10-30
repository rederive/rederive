const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const ESCAPED = new WeakSet();

const fail = (m) => { throw new Error(m); };

// ---- type parsing ----
function key(t) {
  switch (t.k) {
    case 'scalar': return 's:' + t.name;
    case 'list': return 'l(' + key(t.item) + ')';
    case 'tuple': return 't(' + t.items.map(key).join(',') + ')';
    case 'map': return 'm(' + key(t.key) + ',' + key(t.val) + ')';
    case 'record': return 'r(' + t.fields.map(([n, ft]) => n + ':' + key(ft)).sort().join(',') + ')';
    default: return 'u(' + t.alts.map(key).sort().join(',') + ')';
  }
}
const isScalar = (t, n) => t.k === 'scalar' && t.name === n;
function reached(t) {
  switch (t.k) {
    case 'scalar': return ['none', 'bool', 'f64', 'text', 'json'].includes(t.name);
    case 'list': return reached(t.item);
    case 'tuple': return t.items.every(reached);
    case 'map': return isScalar(t.key, 'text') && reached(t.val);
    case 'record': return t.fields.every(([, ft]) => reached(ft));
    default: return t.alts.every(reached);
  }
}
function covers(a, b) {
  if (key(a) === key(b)) return true;
  if (isScalar(a, 'json') && reached(b)) return true;
  if (a.k === b.k) {
    if (a.k === 'list' && covers(a.item, b.item)) return true;
    if (a.k === 'tuple' && a.items.length === b.items.length && a.items.every((x, i) => covers(x, b.items[i]))) return true;
    if (a.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
    if (a.k === 'record' && a.fields.every(([n, ft]) => {
      const f = b.fields.find((g) => g[0] === n);
      return f !== undefined && covers(ft, f[1]);
    })) return true;
  }
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  return false;
}
function parseType(text) {
  let p = 0;
  let depth = 0;
  const ws = () => { while (p < text.length && ' \t\r\n'.includes(text[p])) p++; };
  const expect = (c) => { ws(); if (text[p] !== c) fail('expected ' + c); p++; };
  const ident = () => {
    ws();
    const m = NAME.exec(text.slice(p));
    if (!m) fail('expected name');
    p += m[0].length;
    return m[0];
  };
  function alt() {
    const id = ident();
    if (SCALARS.has(id)) return { k: 'scalar', name: id };
    if (id !== 'tuple' && id !== 'list' && id !== 'map' && id !== 'record') fail('unknown type ' + id);
    if (++depth > MAX_DEPTH) fail('type too deep');
    expect('[');
    let r;
    if (id === 'tuple') {
      const items = [union()];
      for (ws(); text[p] === ','; ws()) { p++; items.push(union()); }
      r = { k: 'tuple', items };
    } else if (id === 'list') {
      r = { k: 'list', item: union() };
    } else if (id === 'map') {
      const kt = union();
      expect(',');
      r = { k: 'map', key: kt, val: union() };
    } else {
      const fields = [];
      const seen = new Set();
      const field = () => {
        const n = ident();
        if (seen.has(n)) fail('duplicate field');
        seen.add(n);
        expect(':');
        fields.push([n, union()]);
      };
      field();
      for (ws(); text[p] === ','; ws()) { p++; field(); }
      r = { k: 'record', fields };
    }
    expect(']');
    depth--;
    return r;
  }
  function union() {
    const alts = [alt()];
    for (ws(); text[p] === '|'; ws()) { p++; alts.push(alt()); }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) if (covers(alts[i], alts[j])) fail('unreachable alternative');
    }
    return { k: 'union', alts };
  }
  const t = union();
  ws();
  if (p !== text.length) fail('trailing text');
  return t;
}

// ---- values ----
const isPlain = (x) => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const pr = Object.getPrototypeOf(x);
  return pr === Object.prototype || pr === null;
};
const isMarker = (v, k) => isPlain(v) && !ESCAPED.has(v) && Object.hasOwn(v, k) && typeof v[k] === 'string';
const throwMarker = (v) => {
  for (const k of ['__throw', '__threw']) {
    if (isMarker(v, k) && Object.keys(v).length === 1) return v[k];
  }
  return undefined;
};
function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}
const render = (x) => (Object.is(x, -0) ? '-0' : String(x));
const f64node = (x) => ({ t: 'f64', v: render(x), bits: bits(x) });
const textNode = (s) => {
  if (!s.isWellFormed()) fail('ill-formed text');
  return { t: 'text', v: s, cu: 'utf8' };
};

function resolveTag(v) {
  if (!isMarker(v, '__t')) return v;
  const tag = v.__t;
  const pv = Object.hasOwn(v, 'v') ? v.v : undefined;
  if (tag === 'num') {
    if (typeof pv !== 'string') fail('num v');
    if (pv === 'NaN') return NaN;
    if (pv === 'Infinity') return Infinity;
    if (pv === '-Infinity') return -Infinity;
    if (pv === '-0') return -0;
    if (!NUM_LITERAL.test(pv)) fail('bad num');
    const n = Number(pv);
    if (n === 0) {
      if (/[1-9]/.test(pv.replace(/[eE].*$/, ''))) fail('underflow');
    }
    if (!Number.isFinite(n) || Object.is(n, -0)) fail('bad num');
    return n;
  }
  if (tag === 'bigint') {
    if (typeof pv !== 'string' || !BIGINT_LITERAL.test(pv)) fail('bad bigint');
    return BigInt(pv);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (!isPlain(pv)) fail('obj v');
    const o = {};
    for (const k of Object.keys(pv)) {
      Object.defineProperty(o, k, { value: pv[k], enumerable: true, writable: true, configurable: true });
    }
    ESCAPED.add(o);
    return o;
  }
  return fail('unknown tag');
}

function canon(o) {
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o !== null && typeof o === 'object') {
    let src = o;
    if (o.t === 'f64') src = { bits: o.bits, t: 'f64' };
    else if (o.t === 'throw') src = { t: 'throw' };
    return '{' + Object.keys(src).sort().map((k) => JSON.stringify(k) + ':' + canon(src[k])).join(',') + '}';
  }
  return JSON.stringify(o);
}
function sortPairs(pairs) {
  const keyed = pairs.map((p) => ({ p, s: p[0].t === 'text' ? p[0].v : canon(p[0]) }));
  keyed.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  return keyed.map((x) => x.p);
}

function encJson(v, d) {
  if (v === undefined) fail('absent in json');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) fail('hole');
      out.push(jsonChild(v[i], d + 1));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = Object.entries(v).map(([k, x]) => [textNode(k), jsonChild(x, d + 1)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  return fail('not json');
}
function jsonChild(v, d) {
  if (d > MAX_VALUE_DEPTH) fail('too deep');
  return encJson(resolveTag(v), d);
}

function intNode(v, name, lo, hi) {
  let b;
  if (typeof v === 'bigint') b = v;
  else if (typeof v === 'number' && Number.isInteger(v)) b = BigInt(v);
  else fail('not integral');
  if (b < lo || b > hi) fail('out of range');
  return { t: name, v: b.toString() };
}

function body(v, t, d) {
  if (t.k === 'scalar') {
    switch (t.name) {
      case 'none':
        if (v === null || v === undefined) return { t: 'none' };
        return fail('not none');
      case 'bool':
        if (typeof v === 'boolean') return { t: 'bool', v };
        return fail('not bool');
      case 'text':
        if (typeof v === 'string') return textNode(v);
        return fail('not text');
      case 'f64':
        if (typeof v === 'number') return f64node(v);
        return fail('not number');
      case 'i64': return intNode(v, 'i64', -(1n << 63n), (1n << 63n) - 1n);
      case 'u64': return intNode(v, 'u64', 0n, (1n << 64n) - 1n);
      case 'bytes':
        if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
        return fail('not bytes');
      default: return encJson(v, d);
    }
  }
  if (t.k === 'tuple') {
    if (!Array.isArray(v) || v.length !== t.items.length) fail('tuple shape');
    return { t: 'tuple', v: t.items.map((it, i) => enc(v[i], it, d + 1)) };
  }
  if (t.k === 'list') {
    if (!Array.isArray(v)) fail('not list');
    const out = [];
    for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item, d + 1));
    return { t: 'list', v: out };
  }
  if (t.k === 'map') {
    let ents;
    if (v instanceof Map) ents = [...v];
    else if (isPlain(v)) ents = Object.entries(v);
    else return fail('not map');
    const pairs = ents.map(([k, x]) => [enc(k, t.key, d + 1), enc(x, t.val, d + 1)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  if (t.k === 'record') {
    if (!isPlain(v)) fail('not record');
    return {
      t: 'record',
      v: t.fields.map(([n, ft]) => [n, enc(Object.hasOwn(v, n) ? v[n] : undefined, ft, d + 1)]),
    };
  }
  return fail('bad type');
}

function enc(v, t, d) {
  if (d > MAX_VALUE_DEPTH) fail('too deep');
  const msg = throwMarker(v);
  if (msg !== undefined) return { t: 'throw', msg };
  v = resolveTag(v);
  if (t.k === 'union') {
    for (const a of t.alts) {
      try {
        return body(v, a, d);
      } catch (e) { /* try next */ }
    }
    return fail('no alternative');
  }
  return body(v, t, d);
}

export default function encode_value(value, type) {
  if (typeof type !== 'string') fail('type must be text');
  const t = parseType(type);
  return enc(value, t, 0);
}
