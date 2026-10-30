const def = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });

const thrown = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.hasOwn(x, '__throw');

function canon(v) {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (Object.is(v, -0)) return { __t: 'num', v: '-0' };
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) {
    return { __t: 'boxed', k: v.constructor.name, v: canon(v.valueOf()) };
  }
  if (v instanceof Set) return { __t: 'set', values: [...v].map((x) => canon(x)) };
  if (v instanceof Map) return { __t: 'map', entries: [...v].map(([k, x]) => [canon(k), canon(x)]) };
  if (v instanceof Uint8Array) return { __t: 'u8', bytes: Array.from(v), buf: Buffer.isBuffer(v) };
  if (Array.isArray(v)) {
    let hole = false;
    for (let i = 0; i < v.length; i++) if (!(i in v)) { hole = true; break; }
    if (hole) {
      const entries = [];
      for (let i = 0; i < v.length; i++) if (i in v) entries.push([i, canon(v[i])]);
      return { __t: 'sparse', length: v.length, entries };
    }
    return v.map((x) => canon(x));
  }
  if (v !== null && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'function') continue;
      def(o, k, canon(v[k]));
    }
    if (Object.hasOwn(v, '__t') || Object.hasOwn(v, '__throw') || Object.hasOwn(v, '__threw')) {
      return { __t: 'obj', v: o };
    }
    return o;
  }
  return v;
}

function copyMap(src) {
  const o = {};
  for (const k of Object.keys(src)) def(o, k, revive(src[k]));
  return o;
}

function revive(e) {
  if (Array.isArray(e)) {
    const r = new Array(e.length);
    for (let i = 0; i < e.length; i++) if (i in e) r[i] = revive(e[i]);
    return r;
  }
  if (e !== null && typeof e === 'object') {
    const t = e;
    const tag = t.__t;
    if (typeof tag === 'string') {
      switch (tag) {
        case 'undef': return undefined;
        case 'regex': return new RegExp(t.source, t.flags);
        case 'bigint': return BigInt(t.v);
        case 'num': {
          const s = t.v;
          if (s === 'NaN' || s === 'Infinity' || s === '-Infinity' || s === '-0') return Number(s);
          throw new Error('legacy num tag: ' + JSON.stringify(s) + ' — the codec writes only NaN, Infinity, -Infinity, -0 (rederive selfhost #55)');
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
          const m = t.v;
          if (m === null || typeof m !== 'object' || Array.isArray(m)) {
            throw new Error('legacy obj tag: v must be a plain map (rederive selfhost #55)');
          }
          return copyMap(m);
        }
        default: break;
      }
    }
    return copyMap(e);
  }
  return e;
}

function pass(g, e) {
  if (thrown(g) && thrown(e)) return true;
  return JSON.stringify(canon(g)) === JSON.stringify(canon(revive(e)));
}

export default function legacy_grade(gots, vectors) {
  const total = vectors.length;
  let n = 0;
  const miss = [];
  for (let i = 0; i < total; i++) {
    const v = vectors[i];
    const ok = pass(gots[i], v.expected);
    if (ok) n++;
    else if (miss.length < 8) miss.push(v.name);
  }
  return { pass: n, total, full: n === total, miss };
}
