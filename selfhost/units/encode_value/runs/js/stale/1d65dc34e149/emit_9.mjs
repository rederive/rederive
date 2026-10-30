const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIG_RE = /^(?:0|-?[1-9][0-9]*)$/;
const NAME_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const ESCAPED = new WeakSet();

// type key for SAME
function key(n) {
  switch (n.k) {
    case 'list': return JSON.stringify(['list', key(n.item)]);
    case 'tuple': return JSON.stringify(['tuple', n.items.map(key)]);
    case 'map': return JSON.stringify(['map', key(n.key), key(n.val)]);
    case 'record': return JSON.stringify(['record', n.fields.map((f) => JSON.stringify([f.name, key(f.type)])).sort()]);
    case 'union': return JSON.stringify(['union', [...new Set(n.alts.map(key))].sort()]);
    default: return n.k;
  }
}

function reached(n) {
  switch (n.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'list': return reached(n.item);
    case 'tuple': return n.items.every(reached);
    case 'map': return n.key.k === 'text' && reached(n.val);
    case 'record': return n.fields.every((f) => reached(f.type));
    case 'union': return n.alts.every(reached);
    default: return false;
  }
}

function covers(a, b) {
  if (key(a) === key(b)) return true;
  if (a.k === 'json' && reached(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every((f) => b.fields.some((g) => g.name === f.name && covers(f.type, g.type)))) return true;
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(s) {
  let i = 0;
  let depth = 0;
  const ws = () => { while (i < s.length && ' \t\r\n'.includes(s[i])) i++; };
  const name = () => {
    ws();
    NAME_RE.lastIndex = i;
    const m = NAME_RE.exec(s);
    if (!m) throw new Error('bad type: name expected');
    i += m[0].length;
    return m[0];
  };
  const expect = (c) => {
    ws();
    if (s[i] !== c) throw new Error('bad type: expected ' + c);
    i++;
  };
  const union = () => {
    const alts = [alt()];
    ws();
    while (s[i] === '|') {
      i++;
      const a = alt();
      for (const e of alts) if (covers(e, a)) throw new Error('unreachable union alternative');
      alts.push(a);
      ws();
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const alt = () => {
    const nm = name();
    if (SCALARS.has(nm)) return { k: nm };
    if (nm !== 'tuple' && nm !== 'list' && nm !== 'map' && nm !== 'record') throw new Error('unknown type name');
    depth++;
    if (depth > MAX_DEPTH) throw new Error('type too deep');
    expect('[');
    let node;
    if (nm === 'list') {
      node = { k: 'list', item: union() };
    } else if (nm === 'tuple') {
      const items = [union()];
      ws();
      while (s[i] === ',') { i++; items.push(union()); ws(); }
      node = { k: 'tuple', items };
    } else if (nm === 'map') {
      const key_ = union();
      expect(',');
      const val = union();
      node = { k: 'map', key: key_, val };
    } else {
      const fields = [];
      const seen = new Set();
      for (;;) {
        const fn = name();
        if (seen.has(fn)) throw new Error('duplicate field');
        seen.add(fn);
        expect(':');
        fields.push({ name: fn, type: union() });
        ws();
        if (s[i] === ',') { i++; continue; }
        break;
      }
      node = { k: 'record', fields };
    }
    expect(']');
    depth--;
    return node;
  };
  const t = union();
  ws();
  if (i < s.length) throw new Error('bad type: trailing text');
  return t;
}

const isPlain = (x) => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null;
};

function throwMark(v) {
  if (!isPlain(v) || ESCAPED.has(v)) return null;
  const ks = Object.keys(v);
  if (ks.length !== 1) return null;
  const k = ks[0];
  if ((k === '__throw' || k === '__threw') && typeof v[k] === 'string') return v[k];
  return null;
}

function resolveTag(v) {
  if (!isPlain(v) || ESCAPED.has(v)) return v;
  if (!(Object.hasOwn(v, '__t') && typeof v.__t === 'string')) return v;
  switch (v.__t) {
    case 'num': {
      const s = v.v;
      if (typeof s !== 'string') throw new Error('num tag: v must be text');
      if (s === 'NaN') return NaN;
      if (s === 'Infinity') return Infinity;
      if (s === '-Infinity') return -Infinity;
      if (s === '-0') return -0;
      if (!NUM_RE.test(s)) throw new Error('num tag: bad literal');
      const n = Number(s);
      if (n === 0 && /[1-9]/.test(s.replace(/[eE].*$/, ''))) throw new Error('num tag: underflow');
      if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('num tag: bad value');
      return n;
    }
    case 'bigint': {
      const s = v.v;
      if (typeof s !== 'string' || !BIG_RE.test(s)) throw new Error('bigint tag: bad literal');
      return BigInt(s);
    }
    case 'undef': return undefined;
    case 'obj': {
      const m = v.v;
      if (!isPlain(m)) throw new Error('obj tag: v must be a map');
      const o = {};
      for (const k of Object.keys(m)) {
        Object.defineProperty(o, k, { value: m[k], enumerable: true, writable: true, configurable: true });
      }
      ESCAPED.add(o);
      return o;
    }
    default: throw new Error('unknown tag');
  }
}

const f64str = (x) => (Object.is(x, -0) ? '-0' : String(x));
function f64bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}
const f64node = (x) => ({ t: 'f64', v: f64str(x), bits: f64bits(x) });
const wf = (s) => typeof s === 'string' && s.isWellFormed();
const textNode = (s) => {
  if (!wf(s)) throw new Error('not well-formed text');
  return { t: 'text', v: s, cu: 'utf8' };
};

function canon(n) {
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  if (n !== null && typeof n === 'object') {
    let o = n;
    if (n.t === 'f64') o = { bits: n.bits, t: 'f64' };
    else if (n.t === 'throw') o = { t: 'throw' };
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
  }
  if (typeof n === 'string') return JSON.stringify(n);
  return String(n);
}

function sortPairs(pairs) {
  const sk = (p) => (p[0].t === 'text' ? p[0].v : canon(p[0]));
  const dec = pairs.map((p) => [sk(p), p]);
  dec.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return dec.map((d) => d[1]);
}

function encJson(v0, d) {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  const v = resolveTag(v0);
  if (v === undefined) throw new Error('absent value in json');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') return textNode(v);
  if (typeof v === 'bigint') throw new Error('integer in json');
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encJson(v[i], d + 1));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = Object.entries(v).map(([k, x]) => [textNode(k), encJson(x, d + 1)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function enc(v0, t, d) {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  const msg = throwMark(v0);
  if (msg !== null) return { t: 'throw', msg };
  const v = resolveTag(v0);
  return encR(v, t, d);
}

function encR(v, t, d) {
  switch (t.k) {
    case 'union': {
      for (const a of t.alts) {
        try { return enc(v, a, d); } catch (e) { /* next */ }
      }
      throw new Error('no union alternative accepts value');
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
      throw new Error('not number');
    case 'i64': case 'u64': {
      if (!(typeof v === 'bigint' || (typeof v === 'number' && Number.isInteger(v)))) throw new Error('not integral');
      const b = BigInt(v);
      const lo = t.k === 'i64' ? -(2n ** 63n) : 0n;
      const hi = t.k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (b < lo || b > hi) throw new Error('out of range');
      return { t: t.k, v: b.toString() };
    }
    case 'bytes':
      if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
      throw new Error('not bytes');
    case 'json': return encJson(v, d);
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error('bad tuple');
      return { t: 'tuple', v: t.items.map((ty, i) => enc(v[i], ty, d + 1)) };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item, d + 1));
      return { t: 'list', v: out };
    }
    case 'map': {
      let ents;
      if (v instanceof Map) ents = [...v];
      else if (isPlain(v)) ents = Object.entries(v);
      else throw new Error('not map');
      const pairs = ents.map(([k, x]) => [enc(k, t.key, d + 1), enc(x, t.val, d + 1)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) throw new Error('not record');
      return {
        t: 'record',
        v: t.fields.map((f) => [f.name, enc(Object.hasOwn(v, f.name) ? v[f.name] : undefined, f.type, d + 1)]),
      };
    }
    default: throw new Error('bad type');
  }
}

export default function encode_value(value, type) {
  const t = parseType(type);
  return enc(value, t, 0);
}
