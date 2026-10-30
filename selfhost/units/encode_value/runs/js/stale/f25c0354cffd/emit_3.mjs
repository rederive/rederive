// encode_value: sir-canonical-v1 encoder (clean-room emission)
const ESCAPED = new WeakSet();
const NUM_RE = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIG_RE = /^-?(?:0|[1-9][0-9]*)$/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const WS = ' \t\r\n';

function parseType(s) {
  let i = 0;
  const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
  const skip = () => { while (i < s.length && WS.includes(s[i])) i++; };
  const name = () => {
    NAME.lastIndex = i;
    const m = NAME.exec(s);
    if (!m) throw new Error('bad name at ' + i);
    i += m[0].length;
    return m[0];
  };
  const expect = (c) => {
    skip();
    if (s[i] !== c) throw new Error('expected ' + c + ' at ' + i);
    i++;
  };
  const union = () => {
    const alts = [alt()];
    for (;;) {
      skip();
      if (s[i] === '|') { i++; alts.push(alt()); } else break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const alt = () => {
    skip();
    const n = name();
    if (SCALARS.has(n)) return { k: n };
    if (n !== 'tuple' && n !== 'list' && n !== 'map' && n !== 'record') throw new Error('unknown abstract type ' + n);
    if (s[i] !== '[') throw new Error('expected [ at ' + i);
    i++;
    if (n === 'list') { const t = union(); expect(']'); return { k: 'list', t }; }
    if (n === 'map') { const K = union(); expect(','); const V = union(); expect(']'); return { k: 'map', K, V }; }
    if (n === 'tuple') {
      const items = [union()];
      for (;;) {
        skip();
        if (s[i] === ',') { i++; items.push(union()); }
        else if (s[i] === ']') { i++; break; }
        else throw new Error('bad tuple');
      }
      return { k: 'tuple', items };
    }
    const fields = [];
    const seen = new Set();
    for (;;) {
      skip();
      const f = name();
      if (seen.has(f)) throw new Error('duplicate field');
      seen.add(f);
      expect(':');
      fields.push([f, union()]);
      skip();
      if (s[i] === ',') i++;
      else if (s[i] === ']') { i++; break; }
      else throw new Error('bad record');
    }
    return { k: 'record', fields };
  };
  skip();
  const t = union();
  skip();
  if (i !== s.length) throw new Error('trailing text');
  return t;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isPlain = (v) => {
  if (!isObj(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
};
const wellFormed = (s) => typeof s === 'string' && s.isWellFormed();

function f64bits(x) {
  if (x !== x) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x, false);
  return dv.getBigUint64(0, false).toString(16).padStart(16, '0');
}
const f64str = (x) => (Object.is(x, -0) ? '-0' : String(x));

function canon(n) {
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  if (n !== null && typeof n === 'object') {
    if (n.t === 'f64') n = { bits: n.bits, t: n.t };
    else if (n.t === 'throw') n = { t: n.t };
    return '{' + Object.keys(n).sort().map((k) => JSON.stringify(k) + ':' + canon(n[k])).join(',') + '}';
  }
  return JSON.stringify(n);
}

const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
function sortPairs(pairs) {
  const keyed = pairs.map((p) => ({ p, k: p[0].t === 'text' ? p[0].v : canon(p[0]) }));
  keyed.sort((a, b) => cmp(a.k, b.k));
  return keyed.map((e) => e.p);
}

function resolveTag(v) {
  if (!isObj(v) || ESCAPED.has(v) || typeof v.__t !== 'string') return v;
  const tag = v.__t;
  if (tag === 'num') {
    const x = v.v;
    if (typeof x !== 'string') throw new Error('bad num');
    if (x === 'NaN') return NaN;
    if (x === 'Infinity') return Infinity;
    if (x === '-Infinity') return -Infinity;
    if (x === '-0') return -0;
    if (!NUM_RE.test(x)) throw new Error('bad num');
    return Number(x);
  }
  if (tag === 'bigint') {
    const x = v.v;
    if (typeof x !== 'string' || !BIG_RE.test(x)) throw new Error('bad bigint');
    return BigInt(x);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    const src = v.v;
    if (src === null || src === undefined) throw new Error('bad obj');
    const o = {};
    for (const k of Object.keys(src)) {
      Object.defineProperty(o, k, { value: src[k], enumerable: true, writable: true, configurable: true });
    }
    ESCAPED.add(o);
    return o;
  }
  throw new Error('unknown tag');
}

function throwObs(v) {
  if (!isObj(v) || ESCAPED.has(v)) return null;
  if (typeof v.__throw === 'string') return { t: 'throw', msg: v.__throw };
  if (typeof v.__threw === 'string') return { t: 'throw', msg: v.__threw };
  return null;
}

function encodeJson(v) {
  v = resolveTag(v);
  if (v === null) return { t: 'none' };
  if (v === undefined) throw new Error('absent in json');
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return { t: 'f64', v: f64str(v), bits: f64bits(v) };
  if (typeof v === 'string') {
    if (!wellFormed(v)) throw new Error('ill-formed text');
    return { t: 'text', v, cu: 'utf8' };
  }
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encodeJson(v[i]));
    }
    return { t: 'list', v: out };
  }
  if (isObj(v) && Object.getPrototypeOf(v) === Object.prototype) {
    const pairs = [];
    for (const [k, x] of Object.entries(v)) {
      if (!wellFormed(k)) throw new Error('ill-formed key');
      pairs.push([{ t: 'text', v: k, cu: 'utf8' }, encodeJson(x)]);
    }
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function enc(v, T) {
  const th = throwObs(v);
  if (th) return th;
  return encT(resolveTag(v), T);
}

function encT(v, T) {
  switch (T.k) {
    case 'union': {
      let err;
      for (const a of T.alts) {
        try { return encT(v, a); } catch (e) { err = e; }
      }
      throw err || new Error('union');
    }
    case 'none':
      if (v === null || v === undefined) return { t: 'none' };
      throw new Error('not none');
    case 'bool':
      if (typeof v === 'boolean') return { t: 'bool', v };
      throw new Error('not bool');
    case 'text':
      if (wellFormed(v)) return { t: 'text', v, cu: 'utf8' };
      throw new Error('not text');
    case 'f64':
      if (typeof v === 'number') return { t: 'f64', v: f64str(v), bits: f64bits(v) };
      throw new Error('not f64');
    case 'i64':
    case 'u64': {
      if (!(typeof v === 'bigint' || Number.isInteger(v))) throw new Error('not integral');
      const b = BigInt(v);
      const lo = T.k === 'i64' ? -(2n ** 63n) : 0n;
      const hi = T.k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      if (b < lo || b > hi) throw new Error('range');
      return { t: T.k, v: b.toString() };
    }
    case 'bytes':
      if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
      throw new Error('not bytes');
    case 'json':
      return encodeJson(v);
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== T.items.length) throw new Error('not tuple');
      return { t: 'tuple', v: T.items.map((it, i) => enc(v[i], it)) };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('not list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], T.t));
      return { t: 'list', v: out };
    }
    case 'map': {
      let ents;
      if (v instanceof Map) ents = [...v];
      else if (isPlain(v)) ents = Object.entries(v);
      else throw new Error('not map');
      const pairs = ents.map(([k, x]) => [enc(k, T.K), enc(x, T.V)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) throw new Error('not record');
      return {
        t: 'record',
        v: T.fields.map(([name, ft]) => [name, enc(Object.hasOwn(v, name) ? v[name] : undefined, ft)]),
      };
    }
  }
  throw new Error('bad type');
}

export default function encode_value(value, type) {
  const T = parseType(type);
  return enc(value, T);
}
