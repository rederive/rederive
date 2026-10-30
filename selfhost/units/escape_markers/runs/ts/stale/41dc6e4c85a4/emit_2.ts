const MAX_VALUE_DEPTH = 100;
const MARKERS: readonly string[] = ["__t", "__throw", "__threw"];

function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function walk(value: unknown, depth: number): unknown {
  if (depth > MAX_VALUE_DEPTH) throw new Error("a value nests deeper than 100");
  if (Array.isArray(value)) {
    const src: unknown[] = value;
    const out: unknown[] = new Array<unknown>(src.length);
    for (let i = 0; i < src.length; i++) {
      if (hasOwn(src, String(i))) out[i] = walk(src[i], depth + 1);
    }
    return out;
  }
  if (value instanceof Map) {
    const out = new Map<unknown, unknown>();
    value.forEach((v: unknown, k: unknown) => {
      const nk = walk(k, depth + 1);
      const nv = walk(v, depth + 1);
      out.set(nk, nv);
    });
    return out;
  }
  if (value instanceof Set) {
    const out = new Set<unknown>();
    value.forEach((m: unknown) => {
      out.add(walk(m, depth + 1));
    });
    return out;
  }
  if (typeof value === "object" && value !== null) {
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src)) {
        Object.defineProperty(out, k, {
          value: walk(src[k], depth + 1),
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
      for (const m of MARKERS) {
        if (hasOwn(src, m)) return { __t: "obj", v: out };
      }
      return out;
    }
  }
  return value;
}

export default function escape_markers(value: unknown): unknown {
  return walk(value, 0);
}
