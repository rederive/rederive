// legacy_grade: per-vector verdict and tally for a legacy-codec oracle.
const IDX = /^(0|[1-9][0-9]*)$/;
const isIdx = (k) => IDX.test(k) && Number(k) < 4294967295;

// Build a fresh map from keys, keeping own "__proto__" as a key.
function put(o, k, value) {
  Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
}

function canon(v) {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (typeof v === 'number') {
    if (Object.is(v, -0)) return { __t: 'num', v: '-0' };
    if (!Number.isFinite(v)) return { __t: 'num', v: String(v) };
    return v;
  }
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) {
    return { __t: 'boxed', k: v.constructor.name, v: canon(v.valueOf()) };
  }
  if (v instanceof Set) return { __t: 'set', values: [...v].map((x) => canon(x)) };
  if (v instanceof Map) {
    return { __t: 'map', entries: [...v].map(([k, x]) => [canon(k), canon(x)]) };
  }
  if (v instanceof Uint8Array) {
    return { __t: 'u8', bytes: Array.from(v), buf: Buffer.isBuffer(v) };
  }
  if (Array.isArray(v)) {
    const idx = Object.keys(v).filter(isIdx);
    if (idx.length < v.length) {
      return { __t: 'sparse', length: v.length, entries: idx.map((i) => [Number(i), canon(v[i])]) };
    }
    const out = [];
    for (let i = 0; i < v.length; i++) out.push(canon(v[i]));
    return out;
  }
  if (v !== null && typeof v === 'object') {
    const m = {};
    for (const k of Object.keys(v)) {
      const x = v[k];
      if (typeof x === 'function') continue;
      put(m, k, canon(x));
    }
    if (Object.hasOwn(v, '__t') || Object.hasOwn(v, '__throw') || Object.hasOwn(v, '__threw')) {
      return { __t: 'obj', v: m };
    }
    return m;
  }
  return v;
}

function copyRevive(src) {
  const o = {};
  for (const k of Object.keys(src)) put(o, k, revive(src[k]));
  return o;
}

function revive(v) {
  if (Array.isArray(v)) return v.map((x) => revive(x));
  if (v === null || typeof v !== 'object') return v;
  const t = v;
  switch (t.__t) {
    case 'undef':
      return undefined;
    case 'regex':
      return new RegExp(t.source, t.flags);
    case 'bigint':
      return BigInt(t.v);
    case 'num': {
      if (t.v === 'NaN' || t.v === 'Infinity' || t.v === '-Infinity' || t.v === '-0') return Number(t.v);
      throw new Error('legacy num tag');
    }
    case 'boxed': {
      const x = revive(t.v);
      if (t.k === 'Number') return new Number(x);
      if (t.k === 'String') return new String(x);
      return new Boolean(x);
    }
    case 'set':
      return new Set((t.values || []).map((x) => revive(x)));
    case 'map':
      return new Map((t.entries || []).map(([k, x]) => [revive(k), revive(x)]));
    case 'u8':
      return t.buf ? Buffer.from(t.bytes) : Uint8Array.from(t.bytes);
    case 'sparse': {
      const a = new Array(t.length);
      for (const [i, x] of (t.entries || [])) a[i] = revive(x);
      return a;
    }
    case 'obj': {
      const w = t.v;
      if (w === null || typeof w !== 'object' || Array.isArray(w)) {
        throw new Error('legacy obj tag: v must be a plain map');
      }
      return copyRevive(w);
    }
    default:
      return copyRevive(v);
  }
}

function thrown(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) && Object.hasOwn(x, '__throw');
}

function pass(g, e) {
  if (thrown(g) && thrown(e)) return true;
  return JSON.stringify(canon(g)) === JSON.stringify(canon(revive(e)));
}

export default function legacy_grade(gots, vectors) {
  const total = vectors.length;
  let ok = 0;
  const miss = [];
  for (let i = 0; i < total; i++) {
    const vec = vectors[i];
    const e = vec.expected;
    const g = gots[i];
    if (pass(g, e)) ok++;
    else miss.push(vec.name);
  }
  return { pass: ok, total, full: ok === total, miss: miss.slice(0, 8) };
}
