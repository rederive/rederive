const put = (o, k, value) => Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
const isIdx = (k) => /^(0|[1-9][0-9]*)$/.test(k) && Number(k) <= 4294967294;

function canon(v) {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (Object.is(v, -0)) return { __t: 'num', v: '-0' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) {
    const k = v instanceof Number ? 'Number' : v instanceof String ? 'String' : 'Boolean';
    return { __t: 'boxed', k, v: canon(v.valueOf()) };
  }
  if (v instanceof Set) return { __t: 'set', values: [...v].map((x) => canon(x)) };
  if (v instanceof Map) return { __t: 'map', entries: [...v].map(([a, b]) => [canon(a), canon(b)]) };
  if (v instanceof Uint8Array) return { __t: 'u8', bytes: Array.from(v), buf: Buffer.isBuffer(v) };
  if (Array.isArray(v)) {
    let hole = false;
    for (let i = 0; i < v.length; i++) if (!(i in v)) { hole = true; break; }
    if (hole) {
      const entries = Object.keys(v).filter(isIdx).map((k) => [Number(k), canon(v[k])]);
      return { __t: 'sparse', length: v.length, entries };
    }
    const out = [];
    for (let i = 0; i < v.length; i++) out.push(canon(v[i]));
    return out;
  }
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'function') continue;
      put(o, k, canon(v[k]));
    }
    if (Object.hasOwn(v, '__t') || Object.hasOwn(v, '__throw') || Object.hasOwn(v, '__threw')) {
      return { __t: 'obj', v: o };
    }
    return o;
  }
  return v;
}

function revive(e) {
  if (Array.isArray(e)) return e.map((x) => revive(x));
  if (e !== null && typeof e === 'object') {
    const t = e;
    switch (t.__t) {
      case 'undef': return undefined;
      case 'regex': return new RegExp(t.source, t.flags);
      case 'bigint': return BigInt(t.v);
      case 'num': {
        if (t.v !== 'NaN' && t.v !== 'Infinity' && t.v !== '-Infinity' && t.v !== '-0') {
          throw new Error('legacy num tag');
        }
        return Number(t.v);
      }
      case 'boxed': {
        const x = revive(t.v);
        if (t.k === 'Number') return new Number(x);
        if (t.k === 'String') return new String(x);
        return new Boolean(x);
      }
      case 'set': return new Set((t.values || []).map((x) => revive(x)));
      case 'map': return new Map((t.entries || []).map(([k, x]) => [revive(k), revive(x)]));
      case 'u8': return t.buf ? Buffer.from(t.bytes) : Uint8Array.from(t.bytes);
      case 'sparse': {
        const a = new Array(t.length);
        for (const [i, x] of (t.entries || [])) a[i] = revive(x);
        return a;
      }
      case 'obj': {
        const s = t.v;
        if (s === null || typeof s !== 'object' || Array.isArray(s)) throw new Error('legacy obj tag');
        const o = {};
        for (const k of Object.keys(s)) put(o, k, revive(s[k]));
        return o;
      }
      default: {
        const o = {};
        for (const k of Object.keys(e)) put(o, k, revive(e[k]));
        return o;
      }
    }
  }
  return e;
}

const thrown = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.hasOwn(x, '__throw');

function pass(g, e) {
  if (thrown(g) && thrown(e)) return true;
  return JSON.stringify(canon(g)) === JSON.stringify(canon(revive(e)));
}

export default function legacy_grade(gots, vectors) {
  let ok = 0;
  const miss = [];
  const total = vectors.length;
  for (let i = 0; i < total; i++) {
    const v = vectors[i];
    const e = v.expected;
    if (pass(gots[i], e)) ok++;
    else if (miss.length < 8) miss.push(v.name);
  }
  return { pass: ok, total, full: ok === total, miss };
}
