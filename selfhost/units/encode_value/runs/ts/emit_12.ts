type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type V = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type SName = "none" | "bool" | "text" | "bytes" | "i64" | "u64" | "f64" | "json";
type T =
  | { k: "s"; n: SName }
  | { k: "tuple"; items: T[] }
  | { k: "list"; item: T }
  | { k: "map"; key: T; val: T }
  | { k: "record"; fields: { name: string; type: T }[] }
  | { k: "union"; alts: T[] };

const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const SCALARS: string[] = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const escaped = new WeakSet<object>();

function keyOf(t: T): string {
  switch (t.k) {
    case "s":
      return t.n;
    case "list":
      return "list[" + keyOf(t.item) + "]";
    case "tuple":
      return "tuple[" + t.items.map(keyOf).join(",") + "]";
    case "map":
      return "map[" + keyOf(t.key) + "," + keyOf(t.val) + "]";
    case "record":
      return "record[" + t.fields.map((f) => f.name + ":" + keyOf(f.type)).sort().join(",") + "]";
    case "union":
      return "union(" + Array.from(new Set(t.alts.map(keyOf))).sort().join("|") + ")";
  }
}

function reached(t: T): boolean {
  switch (t.k) {
    case "s":
      return t.n === "none" || t.n === "bool" || t.n === "f64" || t.n === "text" || t.n === "json";
    case "list":
      return reached(t.item);
    case "tuple":
      return t.items.every(reached);
    case "map":
      return t.key.k === "s" && t.key.n === "text" && reached(t.val);
    case "record":
      return t.fields.every((f) => reached(f.type));
    case "union":
      return t.alts.every(reached);
  }
}

function covers(a: T, b: T): boolean {
  if (keyOf(a) === keyOf(b)) return true;
  if (a.k === "s" && a.n === "json" && reached(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length) {
    if (a.items.every((x, i) => covers(x, b.items[i] as T))) return true;
  }
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.fields;
    if (
      a.fields.every((f) => {
        const g = bf.find((h) => h.name === f.name);
        return g !== undefined && covers(f.type, g.type);
      })
    )
      return true;
  }
  if (b.k === "union" && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === "union" && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(text: string): T {
  let pos = 0;
  const ws = (): void => {
    while (pos < text.length && " \t\r\n".includes(text.charAt(pos))) pos++;
  };
  const expect = (c: string): void => {
    ws();
    if (text.charAt(pos) !== c || pos >= text.length) throw new Error("expected " + c);
    pos++;
  };
  const peek = (c: string): boolean => {
    ws();
    return pos < text.length && text.charAt(pos) === c;
  };
  const parseAlt = (depth: number): T => {
    ws();
    const m = NAME.exec(text.slice(pos));
    if (m === null) throw new Error("bad type");
    const w = m[0];
    pos += w.length;
    if (SCALARS.includes(w)) return { k: "s", n: w as SName };
    if (w !== "tuple" && w !== "list" && w !== "map" && w !== "record") throw new Error("unknown name");
    const d = depth + 1;
    if (d > MAX_DEPTH) throw new Error("too deep");
    expect("[");
    if (w === "list") {
      const item = parseUnion(d);
      expect("]");
      return { k: "list", item };
    }
    if (w === "map") {
      const key = parseUnion(d);
      expect(",");
      const val = parseUnion(d);
      expect("]");
      return { k: "map", key, val };
    }
    if (w === "tuple") {
      const items: T[] = [parseUnion(d)];
      while (peek(",")) {
        pos++;
        items.push(parseUnion(d));
      }
      expect("]");
      return { k: "tuple", items };
    }
    const fields: { name: string; type: T }[] = [];
    for (;;) {
      ws();
      const nm = NAME.exec(text.slice(pos));
      if (nm === null) throw new Error("bad field");
      pos += nm[0].length;
      if (fields.some((f) => f.name === nm[0])) throw new Error("dup field");
      expect(":");
      fields.push({ name: nm[0], type: parseUnion(d) });
      if (peek(",")) {
        pos++;
        continue;
      }
      break;
    }
    expect("]");
    return { k: "record", fields };
  };
  const parseUnion = (depth: number): T => {
    const alts: T[] = [parseAlt(depth)];
    while (peek("|")) {
      pos++;
      alts.push(parseAlt(depth));
    }
    if (alts.length === 1) return alts[0] as T;
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i] as T, alts[j] as T)) throw new Error("unreachable alternative");
      }
    }
    return { k: "union", alts };
  };
  const t = parseUnion(0);
  ws();
  if (pos < text.length) throw new Error("trailing text");
  return t;
}

function isPlain(v: V): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: object | null = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function throwMsg(v: V): string | null {
  if (!isPlain(v) || escaped.has(v)) return null;
  const ks = Object.keys(v);
  if (ks.length !== 1) return null;
  const k = ks[0] as string;
  if (k !== "__throw" && k !== "__threw") return null;
  const m = v[k];
  return typeof m === "string" ? m : null;
}

function resolve(v: V): V {
  if (!isPlain(v) || escaped.has(v) || !Object.hasOwn(v, "__t")) return v;
  const tag = v["__t"];
  if (typeof tag !== "string") return v;
  const payload: Json | undefined = Object.hasOwn(v, "v") ? v["v"] : undefined;
  if (tag === "num") {
    if (typeof payload !== "string") throw new Error("bad num");
    if (payload === "NaN") return NaN;
    if (payload === "Infinity") return Infinity;
    if (payload === "-Infinity") return -Infinity;
    if (payload === "-0") return -0;
    if (!NUM_LITERAL.test(payload)) throw new Error("bad num");
    const n = Number(payload);
    if (!Number.isFinite(n)) throw new Error("overflow");
    if (n === 0) {
      const mant = (payload.split(/[eE]/)[0] as string);
      if (/[1-9]/.test(mant)) throw new Error("underflow");
      if (Object.is(n, -0)) throw new Error("neg zero");
    }
    return n;
  }
  if (tag === "bigint") {
    if (typeof payload !== "string" || !BIGINT_LITERAL.test(payload)) throw new Error("bad bigint");
    return BigInt(payload);
  }
  if (tag === "undef") return undefined;
  if (tag === "obj") {
    if (payload === undefined || !isPlain(payload)) throw new Error("bad obj");
    const out: Obj = {};
    for (const k of Object.keys(payload)) {
      Object.defineProperty(out, k, {
        value: payload[k],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    escaped.add(out);
    return out;
  }
  throw new Error("unknown tag");
}

function bitsOf(x: number): string {
  if (Number.isNaN(x)) return "7ff8000000000000";
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, "0");
}

function textNode(s: string): Json {
  if (!s.isWellFormed()) throw new Error("ill-formed text");
  return { cu: "utf8", t: "text", v: s };
}

function canon(n: Json): string {
  if (typeof n === "string") return JSON.stringify(n);
  if (typeof n === "boolean") return n ? "true" : "false";
  if (n === null) return "null";
  if (typeof n === "number") return String(n);
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  let o: Obj = n;
  if (n["t"] === "f64") o = { bits: n["bits"] as Json, t: "f64" };
  else if (n["t"] === "throw") o = { t: "throw" };
  const ks = Object.keys(o).sort();
  return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(o[k] as Json)).join(",") + "}";
}

function sortPairs(pairs: { sk: string; pair: Json }[]): Json {
  const s = pairs.slice().sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
  return s.map((p) => p.pair);
}

function encJson(v0: V, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const v = resolve(v0);
  if (v === undefined || typeof v === "bigint") throw new Error("not json");
  if (v === null) return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return f64Node(v);
  if (typeof v === "string") return textNode(v);
  if (Array.isArray(v)) {
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error("hole");
      out.push(encJson(v[i] as Json, d + 1));
    }
    return { t: "list", v: out };
  }
  if (isPlain(v)) {
    const pairs: { sk: string; pair: Json }[] = [];
    for (const [k, x] of Object.entries(v)) {
      pairs.push({ sk: k, pair: [textNode(k), encJson(x, d + 1)] });
    }
    return { t: "map", v: sortPairs(pairs) };
  }
  throw new Error("not json");
}

function f64Node(x: number): Json {
  return { bits: bitsOf(x), t: "f64", v: Object.is(x, -0) ? "-0" : String(x) };
}

function intNode(t: "i64" | "u64", v: V): Json {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isInteger(v)) b = BigInt(v);
  else throw new Error("not integral");
  const lo = t === "i64" ? -(2n ** 63n) : 0n;
  const hi = t === "i64" ? 2n ** 63n - 1n : 2n ** 64n - 1n;
  if (b < lo || b > hi) throw new Error("out of range");
  return { t, v: b.toString() };
}

function enc(v0: V, t: T, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const tm = throwMsg(v0);
  if (tm !== null) return { msg: tm, t: "throw" };
  const v = resolve(v0);
  switch (t.k) {
    case "s":
      switch (t.n) {
        case "none":
          if (v === null || v === undefined) return { t: "none" };
          throw new Error("not none");
        case "bool":
          if (typeof v === "boolean") return { t: "bool", v };
          throw new Error("not bool");
        case "text":
          if (typeof v === "string") return textNode(v);
          throw new Error("not text");
        case "f64":
          if (typeof v === "number") return f64Node(v);
          throw new Error("not number");
        case "i64":
        case "u64":
          return intNode(t.n, v);
        case "bytes":
          throw new Error("not bytes");
        case "json":
          return encJson(v, d);
      }
      throw new Error("unreachable");
    case "tuple": {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error("not tuple");
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(enc(v[i], t.items[i] as T, d + 1));
      return { t: "tuple", v: out };
    }
    case "list": {
      if (!Array.isArray(v)) throw new Error("not list");
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item, d + 1));
      return { t: "list", v: out };
    }
    case "map": {
      if (!isPlain(v)) throw new Error("not map");
      const pairs: { sk: string; pair: Json }[] = [];
      for (const [k, x] of Object.entries(v)) {
        const kn = enc(k, t.key, d + 1);
        const vn = enc(x, t.val, d + 1);
        const isText = typeof kn === "object" && kn !== null && !Array.isArray(kn) && kn["t"] === "text";
        const sk = isText ? String((kn as Obj)["v"]) : canon(kn);
        pairs.push({ sk, pair: [kn, vn] });
      }
      return { t: "map", v: sortPairs(pairs) };
    }
    case "record": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) {
        const x: Json | undefined = Object.hasOwn(v, f.name) ? v[f.name] : undefined;
        out.push([f.name, enc(x, f.type, d + 1)]);
      }
      return { t: "record", v: out };
    }
    case "union": {
      for (const alt of t.alts) {
        try {
          return enc(v, alt, d);
        } catch {
          continue;
        }
      }
      throw new Error("no alternative accepts");
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t, 0);
}
