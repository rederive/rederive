const MAX_VALUE_DEPTH = 100;
const MARKERS: readonly string[] = ["__t", "__throw", "__threw"];

function isPlain(v: object): boolean {
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_VALUE_DEPTH) throw new Error("a value nests deeper than 100");
  if (Array.isArray(value)) {
    const src: unknown[] = value;
    const out: unknown[] = new Array<unknown>(src.length);
    for (let i = 0; i < src.length; i++) {
      if (Object.prototype.hasOwnProperty.call(src, i)) out[i] = walk(src[i], depth + 1);
    }
    return out;
  }
  if (typeof value !== "object" || value === null) return value;
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>();
    for (const [k, v] of value) {
      const nk = walk(k, depth + 1);
      const nv = walk(v, depth + 1);
      out.set(nk, nv);
    }
    return out;
  }
  if (value instanceof Set) {
    const out = new Set<unknown>();
    for (const m of value) out.add(walk(m, depth + 1));
    return out;
  }
  if (!isPlain(value)) return value;
  const src = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    Object.defineProperty(result, key, {
      value: walk(src[key], depth + 1),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  for (const m of MARKERS) {
    if (Object.prototype.hasOwnProperty.call(src, m)) return { __t: "obj", v: result };
  }
  return result;
}

export default function escape_markers(value: unknown): unknown {
  return walk(value, 0);
}
