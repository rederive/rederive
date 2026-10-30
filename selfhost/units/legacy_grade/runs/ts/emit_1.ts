type Rec = Record<string, unknown>;

// build a plain map from keys with defineProperty (keeps an own "__proto__" key)
function mk(keys: readonly string[], f: (k: string) => unknown): Rec {
  const out: Rec = {};
  for (const k of keys) {
    Object.defineProperty(out, k, { value: f(k), enumerable: true, writable: true, configurable: true });
  }
  return out;
}

function isObj(x: unknown): x is Rec {
  return typeof x === "object" && x !== null;
}

function thrown(x: unknown): boolean {
  return isObj(x) && !Array.isArray(x) && Object.hasOwn(x, "__throw");
}

const IDX = /^(0|[1-9][0-9]*)$/;

function arrayIndexKeys(v: readonly unknown[]): string[] {
  return Object.keys(v).filter((k) => IDX.test(k) && Number(k) < 4294967295);
}

function canon(v: unknown): unknown {
  if (v === undefined) return { __t: "undef" };
  if (typeof v === "bigint") return { __t: "bigint", v: v.toString() };
  if (Object.is(v, -0)) return { __t: "num", v: "-0" };
  if (typeof v === "number" && !Number.isFinite(v)) return { __t: "num", v: String(v) };
  if (v instanceof RegExp) return { __t: "regex", source: v.source, flags: v.flags };
  if (v instanceof Number) return { __t: "boxed", k: "Number", v: canon(v.valueOf()) };
  if (v instanceof String) return { __t: "boxed", k: "String", v: canon(v.valueOf()) };
  if (v instanceof Boolean) return { __t: "boxed", k: "Boolean", v: canon(v.valueOf()) };
  if (v instanceof Set) {
    const vals: unknown[] = [];
    for (const m of v) vals.push(canon(m));
    return { __t: "set", values: vals };
  }
  if (v instanceof Map) {
    const ents: unknown[] = [];
    for (const [k, x] of v) ents.push([canon(k), canon(x)]);
    return { __t: "map", entries: ents };
  }
  if (v instanceof Uint8Array) return { __t: "u8", bytes: Array.from(v), buf: Buffer.isBuffer(v) };
  if (Array.isArray(v)) {
    const idxs = arrayIndexKeys(v);
    if (idxs.length < v.length) {
      const entries: unknown[] = [];
      for (const k of idxs) entries.push([Number(k), canon(v[Number(k)])]);
      return { __t: "sparse", length: v.length, entries };
    }
    const out: unknown[] = [];
    for (let i = 0; i < v.length; i++) out.push(canon(v[i]));
    return out;
  }
  if (isObj(v)) {
    const keys = Object.keys(v).filter((k) => typeof v[k] !== "function");
    const m = mk(keys, (k) => canon(v[k]));
    if (Object.hasOwn(v, "__t") || Object.hasOwn(v, "__throw") || Object.hasOwn(v, "__threw")) {
      return { __t: "obj", v: m };
    }
    return m;
  }
  return v;
}

function pair(el: unknown): [unknown, unknown] {
  if (Array.isArray(el)) return [el[0], el[1]];
  if (typeof el === "string") {
    const c = Array.from(el);
    return [c[0], c[1]];
  }
  throw new TypeError("entry is not a pair");
}

function toBig(x: unknown): bigint {
  if (typeof x === "string" || typeof x === "number" || typeof x === "bigint" || typeof x === "boolean") {
    return BigInt(x);
  }
  if (isObj(x)) return BigInt(String(x));
  throw new TypeError("cannot convert to BigInt");
}

function toByte(el: unknown): number {
  const n = Number(el);
  if (!Number.isFinite(n)) return 0;
  const t = Math.trunc(n);
  return ((t % 256) + 256) % 256;
}

function reviveBytes(b: unknown, buf: boolean): Uint8Array {
  if (Array.isArray(b)) {
    const bytes: number[] = [];
    for (let i = 0; i < b.length; i++) bytes.push(toByte(b[i]));
    return buf ? Buffer.from(bytes) : Uint8Array.from(bytes);
  }
  if (typeof b === "string") {
    if (buf) return Buffer.from(b, "utf8");
    return Uint8Array.from(Array.from(b).map((c) => toByte(c)));
  }
  if (b === undefined || b === null) throw new TypeError("bytes missing");
  if (buf) throw new TypeError("bad buffer source");
  return Uint8Array.from([]);
}

function reviveSparse(t: Rec): unknown[] {
  const L = t["length"];
  let arr: unknown[];
  if (typeof L === "number") {
    if (!Number.isInteger(L) || L < 0 || L > 4294967295) throw new RangeError("Invalid array length");
    arr = new Array<unknown>(L);
  } else if (L === undefined) {
    arr = [undefined];
  } else {
    arr = [L];
  }
  const ent = t["entries"];
  let list: unknown[];
  if (!ent) list = [];
  else if (typeof ent === "string") list = Array.from(ent);
  else if (Array.isArray(ent)) list = ent;
  else throw new TypeError("entries not a list");
  for (const el of list) {
    const [i, x] = pair(el);
    const key = String(i);
    const rx = revive(x);
    if (IDX.test(key) && Number(key) <= 4294967294) arr[Number(key)] = rx;
  }
  return arr;
}

function revive(e: unknown): unknown {
  if (Array.isArray(e)) return e.map((x) => revive(x));
  if (!isObj(e)) return e;
  const tag = e["__t"];
  if (typeof tag === "string") {
    switch (tag) {
      case "undef":
        return undefined;
      case "regex":
        return Reflect.construct(RegExp, [e["source"], e["flags"]]);
      case "bigint":
        return toBig(e["v"]);
      case "num": {
        const v = e["v"];
        if (v === "NaN" || v === "Infinity" || v === "-Infinity" || v === "-0") return Number(v);
        throw new Error("legacy num tag");
      }
      case "boxed": {
        const x = revive(e["v"]);
        const k = e["k"];
        if (k === "Number") return new Number(x);
        if (k === "String") return new String(x);
        return new Boolean(x);
      }
      case "set": {
        const vs = e["values"];
        if (!vs) return new Set<unknown>();
        if (!Array.isArray(vs)) throw new TypeError("values not a list");
        return new Set<unknown>(vs.map((x) => revive(x)));
      }
      case "map": {
        const es = e["entries"];
        const m = new Map<unknown, unknown>();
        if (!es) return m;
        if (!Array.isArray(es)) throw new TypeError("entries not a list");
        const prs: [unknown, unknown][] = [];
        for (const el of es) prs.push(pair(el));
        for (const [k, x] of prs) m.set(revive(k), revive(x));
        return m;
      }
      case "u8":
        return reviveBytes(e["bytes"], Boolean(e["buf"]));
      case "sparse":
        return reviveSparse(e);
      case "obj": {
        const v = e["v"];
        if (!isObj(v) || Array.isArray(v)) throw new Error("legacy obj tag");
        return mk(Object.keys(v), (k) => revive(v[k]));
      }
      default:
        break;
    }
  }
  return mk(Object.keys(e), (k) => revive(e[k]));
}

function pass(g: unknown, e: unknown): boolean {
  if (thrown(g) && thrown(e)) return true;
  return JSON.stringify(canon(g)) === JSON.stringify(canon(revive(e)));
}

export default function legacy_grade(
  gots: readonly unknown[],
  vectors: readonly { readonly name: string; readonly expected?: unknown }[],
): { pass: number; total: number; full: boolean; miss: string[] } {
  const total = vectors.length;
  let ok = 0;
  const miss: string[] = [];
  for (let i = 0; i < total; i++) {
    const v = vectors[i];
    const g = gots[i];
    const name = v.name;
    if (pass(g, v.expected)) ok++;
    else if (miss.length < 8) miss.push(name);
  }
  return { pass: ok, total, full: ok === total, miss };
}
