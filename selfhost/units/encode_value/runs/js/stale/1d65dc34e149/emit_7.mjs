const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const WS = ' \t\r\n';
const escaped = new WeakSet();

function tkey(t) {
  if (t.key !== undefined) return t.key;
  let k;
  switch (t.k) {
    case 'scalar': k = t.name; break;
    case 'union': k = JSON.stringify(['u', ...t.alts.map(tkey).sort()]); break;
    case 'record': k = JSON.stringify(['r', ...t.fields.map(([n, x]) => n + ':' + tkey(x)).sort()]); break;
    case 'list': k = JSON.stringify(['l', tkey(t.item)]); break;
    case 'tuple': k = JSON.stringify(['t', ...t.items.map(tkey)]); break;
    default: k = JSON.stringify(['m', tkey(t.key_), tkey(t.val)]);
  }
  t.key = k;
  return k;
}

function jr(t) {
  switch (t.k) {
    case 'scalar': return ['none', 'bool', 'f64', 'text', 'json'].includes(t.name);
    case 'list': return jr(t.item);
    case 'tuple': return t.items.every(jr);
    case 'map': return t.key_.k === 'scalar' && t.key_.name === 'text' && jr(t.val);
    case 'record': return t.fields.every(([, x]) => jr(x));
    case 'union': return t.alts.every(jr);
  }
  return false;
}

function covers(a, b) {
  if (tkey(a) === tkey(b)) return true;
  if (a.k === 'scalar' && a.name === 'json' && jr(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
    a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key_, b.key_) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
    a.fields.every(([n, x]) => b.fields.some(([m, y]) => m === n && covers(x, y)))) return true;
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(s) {
  let p = 0;
  let depth = 0;
  const ws = () => { while (p < s.length && WS.includes(s[p])) p++; };
  const name = () => {
    const m = NAME.exec(s.slice(p));
    if (!m) throw new Error('bad type');
    p += m[0].length;
    return m[0];
  };
  const expect = (c) => { ws(); if (s[p] !== c) throw new Error('bad type'); p++; };
  const alt = () => {
    ws();
    const n = name();
    if (SCALARS.has(n)) return { k: 'scalar', name: n };
    if (n !== 'tuple' && n !== 'list' && n !== 'map' && n !== 'record') throw new Error('unknown type');
    depth++;
    if (depth > MAX_DEPTH) throw new Error('too deep');
    expect('[');
    let r;
    if (n === 'list') {
      r = { k: 'list', item: type() };
    } else if (n === 'map') {
      const key_ = type();
      expect(',');
      r = { k: 'map', key_, val: type() };
    } else if (n === 'tuple') {
      const items = [type()];
      ws();
      while (s[p] === ',') { p++; items.push(type()); ws(); }
      r = { k: 'tuple', items };
    } else {
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
        if (s[p] === ',') { p++; continue; }
        break;
      }
      r = { k: 'record', fields };
    }
    expect(']');
    depth--;
    return r;
  };
  const type = () => {
    const alts = [alt()];
    ws();
    while (s[p] === '|') { p++; alts.push(alt()); ws(); }
    if (alts.length === 1) return alts[0];
    for (let i = 1; i < alts.length; i++) {
      for (let j = 0; j < i; j++) if (covers(alts[j], alts[i])) throw new Error('unreachable alternative');
    }
    return { k: 'union', alts };
  };
  const t = type();
  ws();
  if (p !== s.length) throw new Error('trailing');
  return t;
}

const isPlain = (x) => {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false;
  const pr = Object.getPrototypeOf(x);
  return pr === Object.prototype || pr === null;
};
const wf = (s) => s.isWellFormed();

function marker(v, key) {
  return isPlain(v) && !escaped.has(v) && Object.hasOwn(v, key) && typeof v[key] === 'string';
}
function throwNode(v) {
  if (!isPlain(v) || escaped.has(v) || Object.keys(v).length !== 1) return null;
  for (const k of ['__throw', '__threw']) if (marker(v, k)) return { t: 'throw', msg: v[k] };
  return null;
}

function tag(v) {
  if (!marker(v, '__t')) return v;
  const name = v.__t;
  const own = (k) => (Object.hasOwn(v, k) ? v[k] : undefined);
  if (name === 'num') {
    const s = own('v');
    if (typeof s !== 'string') throw new Error('bad num');
    if (s === 'NaN') return NaN;
    if (s === 'Infinity') return Infinity;
    if (s === '-Infinity') return -Infinity;
    if (s === '-0') return -0;
    if (!NUM_LITERAL.test(s)) throw new Error('bad num');
    const n = Number(s);
    if (n === 0 && /[1-9]/.test(s.replace(/[eE].*$/, ''))) throw new Error('underflow');
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('bad num');
    return n;
  }
  if (name === 'bigint') {
    const s = own('v');
    if (typeof s !== 'string' || !BIGINT_LITERAL.test(s)) throw new Error('bad bigint');
    return BigInt(s);
  }
  if (name === 'undef') return undefined;
  if (name === 'obj') {
    const m = own('v');
    if (!isPlain(m)) throw new Error('bad obj');
    const o = {};
    for (const k of Object.keys(m)) {
      Object.defineProperty(o, k, { value: m[k], enumerable: true, writable: true, configurable: true });
    }
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
  if (!wf(s)) throw new Error('ill-formed text');
  return { t: 'text', v: s, cu: 'utf8' };
};

function canon(n) {
  if (n === null || typeof n !== 'object') return JSON.stringify(n);
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  if (n.t === 'f64') n = { bits: n.bits, t: 'f64' };
  else if (n.t === 'throw') n = { t: 'throw' };
  return '{' + Object.keys(n).sort().map((k) => JSON.stringify(k) + ':' + canon(n[k])).join(',') + '}';
}

function sortPairs(pairs) {
  const sk = (k) => (k.t === 'text' ? k.v : canon(k));
  const dec = pairs.map((p) => [sk(p[0]), p]);
  dec.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return dec.map((d) => d[1]);
}

function encJson(v, d) {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const out = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encJson(tag(v[i]), d + 1));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const pairs = [];
    for (const k of Object.keys(v)) pairs.push([textNode(k), encJson(tag(v[k]), d + 1)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function intNode(t, v) {
  if (!(Number.isInteger(v) || typeof v === 'bigint')) throw new Error('not integer');
  const b = BigInt(v);
  if (t === 'i64') {
    if (b < -(1n << 63n) || b > (1n << 63n) - 1n) throw new Error('range');
  } else if (b < 0n || b > (1n << 64n) - 1n) throw new Error('range');
  return { t, v: b.toString() };
}

function enc(v, t, d) {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  const tn = throwNode(v);
  if (tn) return tn;
  return encR(tag(v), t, d);
}

function encR(v, t, d) {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  switch (t.k) {
    case 'scalar':
      switch (t.name) {
        case 'none':
          if (v === null || v === undefined) return { t: 'none' };
          break;
        case 'bool':
          if (typeof v === 'boolean') return { t: 'bool', v };
          break;
        case 'text':
          if (typeof v === 'string') return textNode(v);
          break;
        case 'f64':
          if (typeof v === 'number') return f64node(v);
          break;
        case 'i64':
        case 'u64':
          return intNode(t.name, v);
        case 'bytes':
          if (v instanceof Uint8Array) return { t: 'bytes', v: 'base64:' + Buffer.from(v).toString('base64') };
          break;
        case 'json':
          return encJson(v, d);
      }
      throw new Error('type mismatch');
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error('type mismatch');
      return { t: 'tuple', v: t.items.map((it, i) => enc(v[i], it, d + 1)) };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('type mismatch');
      const out = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item, d + 1));
      return { t: 'list', v: out };
    }
    case 'map': {
      let ents;
      if (v instanceof Map) ents = [...v];
      else if (isPlain(v)) ents = Object.entries(v);
      else throw new Error('type mismatch');
      const pairs = ents.map(([k, x]) => [enc(k, t.key_, d + 1), enc(x, t.val, d + 1)]);
      return { t: 'map', v: sortPairs(pairs) };
    }
    case 'record': {
      if (!isPlain(v)) throw new Error('type mismatch');
      return {
        t: 'record',
        v: t.fields.map(([n, ft]) => [n, enc(Object.hasOwn(v, n) ? v[n] : undefined, ft, d + 1)]),
      };
    }
    default: {
      for (const a of t.alts) {
        try { return encR(v, a, d); } catch (e) { /* next */ }
      }
      throw new Error('no alternative');
    }
  }
}

export default function encode_value(value, type) {
  const t = parseType(type);
  return enc(value, t, 0);
}
