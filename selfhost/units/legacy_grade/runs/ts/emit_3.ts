type Rec = Record<string, unknown>;

function isObj(x: unknown): x is object {
  return typeof x === "object" && x !== null;
}

function isIdx(k: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(k) && Number(k) <= 4294967294;
}

function get(o: object, k: string): unknown {
  return Reflect.get(o, k);
}

function mkRec(): Rec {
  return {};
}

function put(r: Rec, k: string, v: unknown): void {
  Object.defineProperty(r, k, { value: v, enumerable: true, writable: true, configurable: true });
}

function thrown(x: unknown): boolean {
  return isObj(x) && !Array.isArray(x) && Object.hasOwn(x, "__throw");
}

function canon(v: unknown): unknown {
  if (v === undefined) return { __t: "undef" };
  if (typeof v === "bigint") return { __t: "bigint", v: v.toString() };
  if (Object.is(v, -0)) return { __t: "num", v: "-0" };
  if (typeof v === "number" && !Number.isFinite(v)) {
    return { __t: "num", v: Number.isNaN(v) ? "NaN" : v > 0 ? "Infinity" : "-Infinity" };
  }
  if (v instanceof RegExp) return { __t: "regex", source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) {
    return { __t: "boxed", k: v.constructor.name, v: canon(v.valueOf()) };
  }
  if (v instanceof Set) {
    const values: unknown[] = [];
    for (const m of v) values.push(canon(m));
    return { __t: "set", values };
  }
  if (v instanceof Map) {
    const entries: unknown[] = [];
    for (const [k, x] of v) entries.push([canon(k), canon(x)]);
    return { __t: "map", entries };
  }
  if (v instanceof Uint8Array) {
    return { __t: "u8", bytes: Array.from(v), buf: Buffer.isBuffer(v) };
  }
  if (Array.isArray(v)) {
    const idx = Object.keys(v).filter(isIdx);
    if (idx.length < v.length) {
      const entries: unknown[] = [];
      for (const k of idx) entries.push([Number(k), canon(v[Number(k)])]);
      return { __t: "sparse", length: v.length, entries };
    }
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) out.push(canon(v[i]));
    return out;
  }
  if (isObj(v)) {
    const out = mkRec();
    for (const k of Object.keys(v)) {
      const x = get(v, k);
      if (typeof x === "function") continue;
      put(out, k, canon(x));
    }
    if (Object.hasOwn(v, "__t") || Object.hasOwn(v, "__throw") || Object.hasOwn(v, "__threw")) {
      return { __t: "obj", v: out };
    }
    return out;
  }
  return v;
}

function reviveList(a: readonly unknown[]): unknown[] {
  const out = new Array<unknown>(a.length);
  for (const k of Object.keys(a)) {
    if (isIdx(k)) out[Number(k)] = revive(a[Number(k)]);
  }
  return out;
}

function pairOf(el: unknown): [unknown, unknown] {
  if (Array.isArray(el)) return [el[0], el[1]];
  if (typeof el === "string") {
    const c = Array.from(el);
    return [c[0], c[1]];
  }
  throw new TypeError("entry is not a pair");
}

function toByte(x: unknown): number {
  if (typeof x === "bigint") throw new TypeError("Cannot convert a BigInt value to a number");
  return Number(x);
}

function plain(src: object): Rec {
  const out = mkRec();
  for (const k of Object.keys(src)) put(out, k, revive(get(src, k)));
  return out;
}

function revive(e: unknown): unknown {
  if (Array.isArray(e)) return reviveList(e);
  if (!isObj(e)) return e;
  const tag = get(e, "__t");
  switch (tag) {
    case "undef":
      return undefined;
    case "regex": {
      const r: unknown = Reflect.construct(RegExp, [get(e, "source"), get(e, "flags")]);
      return r;
    }
    case "bigint": {
      const r: unknown = Reflect.apply(BigInt, undefined, [get(e, "v")]);
      return r;
    }
    case "num": {
      const v = get(e, "v");
      if (v === "NaN") return NaN;
      if (v === "Infinity") return Infinity;
      if (v === "-Infinity") return -Infinity;
      if (v === "-0") return -0;
      throw new Error("legacy num tag");
    }
    case "boxed": {
      const x = revive(get(e, "v"));
      const k = get(e, "k");
      if (k === "Number") return new Number(x);
      if (k === "String") return new String(x);
      return new Boolean(x);
    }
    case "set": {
      const vals = get(e, "values");
      if (!vals) return new Set<unknown>([]);
      if (!Array.isArray(vals)) throw new TypeError("values is not a list");
      return new Set<unknown>(reviveList(vals));
    }
    case "map": {
      const ents = get(e, "entries");
      const m = new Map<unknown, unknown>();
      if (!ents) return m;
      if (!Array.isArray(ents)) throw new TypeError("entries is not a list");
      for (let i = 0; i < ents.length; i++) {
        const p = pairOf(ents[i]);
        m.set(revive(p[0]), revive(p[1]));
      }
      return m;
    }
    case "u8": {
      const bytes = get(e, "bytes");
      const buf = Boolean(get(e, "buf"));
      if (Array.isArray(bytes)) {
        const nums = Array.from(bytes, toByte);
        return buf ? Buffer.from(nums) : Uint8Array.from(nums);
      }
      if (typeof bytes === "string") {
        if (buf) return Buffer.from(bytes);
        return Uint8Array.from(Array.from(bytes, toByte));
      }
      if (typeof bytes === "number" && !buf) return new Uint8Array(0);
      throw new TypeError("bad bytes");
    }
    case "sparse": {
      const lr = get(e, "length");
      let arr: unknown[];
      if (typeof lr === "number") {
        if (!Number.isInteger(lr) || lr < 0 || lr > 4294967295) throw new RangeError("Invalid array length");
        arr = new Array<unknown>(lr);
      } else if (lr === undefined) {
        arr = [undefined];
      } else {
        arr = [lr];
      }
      const er = get(e, "entries");
      let list: readonly unknown[];
      if (!er) list = [];
      else if (typeof er === "string") list = Array.from(er);
      else if (Array.isArray(er)) list = er;
      else throw new TypeError("entries is not a list");
      for (let n = 0; n < list.length; n++) {
        const p = pairOf(list[n]);
        const key = String(p[0]);
        if (isIdx(key)) arr[Number(key)] = revive(p[1]);
      }
      return arr;
    }
    case "obj": {
      const v = get(e, "v");
      if (!isObj(v) || Array.isArray(v)) throw new TypeError("legacy obj tag: v must be a plain map");
      return plain(v);
    }
    default:
      return plain(e);
  }
}

function same(g: unknown, e: unknown): boolean {
  return JSON.stringify(canon(g)) === JSON.stringify(canon(revive(e)));
}

export default function legacy_grade(
  gots: readonly unknown[],
  vectors: readonly { readonly name: string; readonly expected?: unknown }[],
): { pass: number; total: number; full: boolean; miss: string[] } {
  if (vectors === null || vectors === undefined) throw new TypeError("vectors is none");
  const total = vectors.length;
  let pass = 0;
  const miss: string[] = [];
  for (let i = 0; i < total; i++) {
    const v = vectors[i];
    if (v === null || v === undefined) throw new TypeError("vector is none");
    const g = gots[i];
    const e = v.expected;
    const ok = (thrown(g) && thrown(e)) || same(g, e);
    if (ok) pass++;
    else if (miss.length < 8) miss.push(v.name);
  }
  return { pass, total, full: pass === total, miss };
}
