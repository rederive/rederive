const MAX = 100;

function walk(v, depth) {
  if (depth > MAX) throw new Error("a value nests deeper than 100");
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    const n = v.length;
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
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
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return v;
  const res = {};
  for (const k of Object.keys(v)) {
    Object.defineProperty(res, k, {
      value: walk(v[k], depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  if (Object.hasOwn(v, "__t") || Object.hasOwn(v, "__throw") || Object.hasOwn(v, "__threw")) {
    return { __t: "obj", v: res };
  }
  return res;
}

export default function escape_markers(value) {
  return walk(value, 0);
}
