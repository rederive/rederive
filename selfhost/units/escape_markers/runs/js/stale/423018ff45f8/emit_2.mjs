const MAX = 100;
const MARKERS = ['__t', '__throw', '__threw'];

function walk(v, depth) {
  if (depth > MAX) throw new Error('a value nests deeper than 100');
  if (Array.isArray(v)) {
    const out = new Array(v.length);
    for (let i = 0; i < v.length; i++) {
      if (Object.hasOwn(v, i)) out[i] = walk(v[i], depth + 1);
    }
    return out;
  }
  if (v instanceof Map) {
    const out = new Map();
    for (const [k, val] of v) {
      const nk = walk(k, depth + 1);
      const nv = walk(val, depth + 1);
      out.set(nk, nv);
    }
    return out;
  }
  if (v instanceof Set) {
    const out = new Set();
    for (const m of v) out.add(walk(m, depth + 1));
    return out;
  }
  if (v !== null && typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null) {
      const out = {};
      for (const k of Object.keys(v)) {
        Object.defineProperty(out, k, {
          value: walk(v[k], depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      for (const m of MARKERS) {
        if (Object.hasOwn(v, m)) return { __t: 'obj', v: out };
      }
      return out;
    }
  }
  return v;
}

export default function escape_markers(value) {
  return walk(value, 0);
}
