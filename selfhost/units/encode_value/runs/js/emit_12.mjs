const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const KEYWORDS = new Set(['tuple', 'list', 'map', 'record']);
const escaped = new WeakSet();

function parseType(s) {
  let pos = 0;
  const ws = () => { while (pos < s.length && ' \t\r\n'.includes(s[pos])) pos++; };
  const expect = (c) => { ws(); if (s[pos] !== c) throw new Error('expected ' + c); pos++; };
  const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
  const readName = () => {
    ws();
    NAME.lastIndex = pos;
    const m = NAME.exec(s);
    if (!m) throw new Error('name expected');
    pos += m[0].length;
    return m[0];
  };
  function parseUnion(d) {
    const alts = [parseAlt(d)];
    for (;;) {
      ws();
      if (s[pos] === '|') { pos++; alts.push(parseAlt(d)); } else break;
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++)
      for (let i = 0; i < j; i++)
        if (covers(alts[i], alts[j])) throw new Error('unreachable alternative');
    return { k: 'union', alts };
  }
  function parseAlt(d) {
    const w = readName();
    if (SCALARS.has(w)) return { k: 'scalar', n: w };
    if (!KEYWORDS.has(w)) throw new Error('unknown type ' + w);
    if (d + 1 > MAX_DEPTH) throw new Error('too deep');
    const nd = d + 1;
    expect('[');
    let r;
    if (w === 'list') {
      r = { k: 'list', item: parseUnion(nd) };
    } else if (w === 'tuple') {
      const items = [parseUnion(nd)];
      for (;;) { ws(); if (s[pos] === ',') { pos++; items.push(parseUnion(nd)); } else break; }
      r = { k: 'tuple', items };
    } else if (w === 'map') {
      const key = parseUnion(nd);
      expect(',');
      const val = parseUnion(nd);
      r = { k: 'map', key, val };
    } else {
      const fields = [];
      const seen = new Set();
      for (;;) {
        const name = readName();
        if (seen.has(name)) throw new Error('duplicate field');
        seen.add(name);
        expect(':');
        fields.push([name, parseUnion(nd)]);
        ws();
        if (s[pos] === ',') pos++; else break;
      }
      r = { k: 'record', fields };
    }
    expect(']');
    return r;
  }
  const t = parseUnion(0);
  ws();
  if (pos !== s.length) throw new Error('trailing input');
  return t;
}

function typeKey(t) {
  switch (t.k) {
    case 'scalar': return t.n;
    case 'list': return 'list[' + typeKey(t.item) + ']';
    case 'tuple': return 'tuple[' + t.items.map(typeKey).join(',') + ']';
    case 'map': return 'map[' + typeKey(t.key) + ',' + typeKey(t.val) + ']';
    case 'record': return 'record[' + t.fields.map(([n, f]) => n + ':' + typeKey(f)).sort().join(',') + ']';
    default: return 'union[' + [...new Set(t.alts.map(typeKey))].sort().join('|') + ']';
  }
}

function jsonReached(t) {
  switch (t.k) {
    case 'scalar': return ['none', 'bool', 'f64', 'text', 'json'].includes(t.n);
    case 'list': return jsonReached(t.item);
    case 'tuple': return t.items.every(jsonReached);
    case 'map': return t.key.k === 'scalar' && t.key.n === 'text' && jsonReached(t.val);
    case 'record': return t.fields.every(([, f]) => jsonReached(f));
    default: return t.alts.every(jsonReached);
  }
}

function covers(a, b) {
  if (typeKey(a) === typeKey(b)) return true;
  if (a.k === 'scalar' && a.n === 'json' && jsonReached(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every(([n, f]) => { const g = b.fields.find((x) => x[0] === n); return g && covers(f, g[1]); })) return true;
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

const isPlain = (x) => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const p = Object.getPrototypeOf(x);
  return p === Object.prototype || p === null;
};
const hasStr = (v, key) => Object.hasOwn(v, key) && typeof v[key] === 'string';
const own = (v, k) => (Object.hasOwn(v, k) ? v[k] : undefined);

function throwMarker(v) {
  if (!isPlain(v) || escaped.has(v)) return null;
  if (Object.keys(v).length !== 1) return null;
  if (hasStr(v, '__throw')) return v.__throw;
  if (hasStr(v, '__threw')) return v.__threw;
  return null;
}

function resolve(v) {
  if (!isPlain(v) || escaped.has(v) || !hasStr(v, '__t')) return v;
  const tag = v.__t;
  const p = own(v, 'v');
  if (tag === 'num') {
    if (typeof p !== 'string') throw new Error('num v');
    if (p === 'NaN') return NaN;
    if (p === 'Infinity') return Infinity;
    if (p === '-Infinity') return -Infinity;
    if (p === '-0') return -0;
    if (!NUM_LITERAL.test(p)) throw new Error('bad num');
    const n = Number(p);
    if (n === 0) {
      if (/[1-9]/.test(p.replace(/[eE].*$/, ''))) throw new Error('underflow');
    }
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('bad num');
    return n;
  }
  if (tag === 'bigint') {
    if (typeof p !== 'string' || !BIGINT_LITERAL.test(p)) throw new Error('bad bigint');
    return BigInt(p);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (!isPlain(p)) throw new Error('obj v');
    const o = {};
    for (const k of Object.keys(p))
      Object.defineProperty(o, k, { value: p[k], enumerable: true, writable: true, configurable: true });
    escaped.add(o);
    return o;
  }
  throw new Error('unknown tag');
}

function bits(x) {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}
const f64node = (x) => ({ t: 'f64', v: Object.is(x, -0) ? '-0' : String(x), bits: bits(x) });
const textNode = (s) => {
  if (!s.isWellFormed()) throw new Error('ill-formed text');
  return { t: 'text', v: s, cu: 'utf8' };
};

function canon(o) {
  if (typeof o === 'string') return JSON.stringify(o);
  if (typeof o === 'boolean') return o ? 'true' : 'false';
  if (Array.isArray(o)) return '[' + o.map(canon).join(',') + ']';
  if (o.t === 'f64') o = { bits: o.bits, t: 'f64' };
  else if (o.t === 'throw') o = { t: 'throw' };
  return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k])).join(',') + '}';
}
const sortPairs = (pairs) => {
  const sk = (p) => (p[0].t === 'text' ? p[0].v : canon(p[0]));
  return pairs.map((p) => [sk(p), p]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map((x) => x[1]);
};

function intNode(v, name, lo, hi) {
  if (!((typeof v === 'number' && Number.isInteger(v)) || typeof v === 'bigint')) throw new Error('not integral');
  const b = BigInt(v);
  if (b < lo || b > hi) throw new Error('range');
  return { t: name, v: b.toString() };
}

function encJson(v, depth) {
  if (depth > MAX_VALUE_DEPTH) throw new Error('too deep');
  v = resolve(v);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encJson(v[i], depth + 1));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = Object.entries(v).map(([k, x]) => [textNode(k), encJson(x, depth + 1)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function encTyped(v, t, depth) {
  if (depth > MAX_VALUE_DEPTH) throw new Error('too deep');
  const m = throwMarker(v);
  if (m !== null) return { t: 'throw', msg: m };
  v = resolve(v);
  return encResolved(v, t, depth);
}

function encResolved(v, t, depth) {
  switch (t.k) {
    case 'union': {
      for (const alt of t.alts) {
        try { return encTyped(v, alt, depth); } catch (e) { /* next */ }
      }
      throw new Error('no alternative');
    }
    case 'scalar':
      switch (t.n) {
        case 'none':
          if (v === null || v === undefined) return { t: 'none' };
          throw new Error('not none');
        case 'bool':
          if (typeof v === 'boolean') return { t: 'bool', v };
          throw new Error('not bool');
        case 'text':
          if (typeof v === 'string') return textNode(v);
          throw new Error('not text');
        case 'f64':
          if (typeof v === 'number') return f64node(v);
          throw new Error('not number');
        case 'i64': return intNode(v, 'i64', -(2n ** 63n), 2n ** 63n - 1n);
        case 'u64': return intNode(v, 'u64', 0n, 2n ** 64n - 1n);
        case 'bytes':
          if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
          throw new Error('not bytes');
        default:
          return encJson(v, depth);
      }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error('tuple');
      return { t: 'tuple', v: t.items.map((it, i) => encTyped(v[i], it, depth + 1)) };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('list');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(encTyped(v[i], t.item, depth + 1));
      return { t: 'list', v: out };
    }
    case 'map': {
      let entries;
      if (v instanceof Map) entries = [...v];
      else if (isPlain(v)) entries = Object.entries(v);
      else throw new Error('map');
      const pairs = entries.map(([k, x]) => [encTyped(k, t.key, depth + 1), encTyped(x, t.val, depth + 1)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    default: {
      if (!isPlain(v)) throw new Error('record');
      return {
        t: 'record',
        v: t.fields.map(([n, ft]) => [n, encTyped(own(v, n), ft, depth + 1)]).map(([n, node]) => [{ t: 'text', v: n, cu: 'utf8' }.v, node]),
      };
    }
  }
}

export default function encode_value(value, type) {
  const t = parseType(type);
  return encTyped(value, t, 0);
}
