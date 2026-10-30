type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: V };
type V = null | boolean | number | string | bigint | undefined | V[] | Obj;
type T =
  | { k: "s"; n: string }
  | { k: "tuple"; items: T[] }
  | { k: "list"; item: T }
  | { k: "map"; key: T; val: T }
  | { k: "record"; fields: { name: string; t: T }[] }
  | { k: "union"; alts: T[] };

const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const SCALARS = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const escaped = new WeakSet<object>();

function typeKey(t: T): string {
  switch (t.k) {
    case "s":
      return t.n;
    case "list":
      return "list[" + typeKey(t.item) + "]";
    case "tuple":
      return "tuple[" + t.items.map(typeKey).join(",") + "]";
    case "map":
      return "map[" + typeKey(t.key) + "," + typeKey(t.val) + "]";
    case "record":
      return "record[" + t.fields.map((f) => JSON.stringify(f.name) + ":" + typeKey(f.t)).sort().join(",") + "]";
    case "union":
      return "(" + Array.from(new Set(t.alts.map(typeKey))).sort().join("|") + ")";
  }
}

function jsonReached(t: T): boolean {
  switch (t.k) {
    case "s":
      return t.n === "none" || t.n === "bool" || t.n === "f64" || t.n === "text" || t.n === "json";
    case "list":
      return jsonReached(t.item);
    case "tuple":
      return t.items.every(jsonReached);
    case "map":
      return t.key.k === "s" && t.key.n === "text" && jsonReached(t.val);
    case "record":
      return t.fields.every((f) => jsonReached(f.t));
    case "union":
      return t.alts.every(jsonReached);
  }
}

function covers(a: T, b: T): boolean {
  if (typeKey(a) === typeKey(b)) return true;
  if (a.k === "s" && a.n === "json" && jsonReached(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length) {
    const bi = b.items;
    if (a.items.every((x, i) => covers(x, bi[i] as T))) return true;
  }
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.fields;
    if (
      a.fields.every((f) => {
        const o = bf.find((g) => g.name === f.name);
        return o !== undefined && covers(f.t, o.t);
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
    if (text.charAt(pos) !== c) throw new Error("expected " + c);
    pos++;
  };
  const readName = (): string => {
    ws();
    const m = NAME.exec(text.slice(pos));
    if (m === null) throw new Error("name expected");
    pos += m[0].length;
    return m[0];
  };
  const parseAlt = (depth: number): T => {
    const w = readName();
    if (SCALARS.includes(w)) return { k: "s", n: w };
    if (w !== "tuple" && w !== "list" && w !== "map" && w !== "record") throw new Error("unknown type " + w);
    ws();
    if (text.charAt(pos) !== "[") throw new Error("[ expected");
    if (depth >= MAX_DEPTH) throw new Error("type too deep");
    pos++;
    if (w === "list") {
      const item = parseUnion(depth + 1);
      expect("]");
      return { k: "list", item };
    }
    if (w === "map") {
      const key = parseUnion(depth + 1);
      expect(",");
      const val = parseUnion(depth + 1);
      expect("]");
      return { k: "map", key, val };
    }
    if (w === "tuple") {
      const items = [parseUnion(depth + 1)];
      for (;;) {
        ws();
        if (text.charAt(pos) === ",") {
          pos++;
          items.push(parseUnion(depth + 1));
        } else break;
      }
      expect("]");
      return { k: "tuple", items };
    }
    const fields: { name: string; t: T }[] = [];
    for (;;) {
      const name = readName();
      if (fields.some((f) => f.name === name)) throw new Error("duplicate field");
      expect(":");
      fields.push({ name, t: parseUnion(depth + 1) });
      ws();
      if (text.charAt(pos) === ",") pos++;
      else break;
    }
    expect("]");
    return { k: "record", fields };
  };
  const parseUnion = (depth: number): T => {
    const alts = [parseAlt(depth)];
    for (;;) {
      ws();
      if (text.charAt(pos) === "|") {
        pos++;
        alts.push(parseAlt(depth));
      } else break;
    }
    if (alts.length === 1) return alts[0] as T;
    for (let j = 1; j < alts.length; j++)
      for (let i = 0; i < j; i++) if (covers(alts[i] as T, alts[j] as T)) throw new Error("unreachable alternative");
    return { k: "union", alts };
  };
  const r = parseUnion(0);
  ws();
  if (pos !== text.length) throw new Error("trailing text");
  return r;
}

function isPlain(v: V): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v) as object | null;
  return p === Object.prototype || p === null;
}

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = s.charCodeAt(i + 1);
      if (n >= 0xdc00 && n <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function own(o: Obj, k: string): V {
  return Object.hasOwn(o, k) ? o[k] : undefined;
}

function throwMsg(v: V): string | undefined {
  if (!isPlain(v) || escaped.has(v)) return undefined;
  const keys = Object.keys(v);
  if (keys.length !== 1) return undefined;
  for (const k of ["__throw", "__threw"]) {
    if (Object.hasOwn(v, k)) {
      const m = v[k];
      if (typeof m === "string") return m;
    }
  }
  return undefined;
}

function resolve(v: V): V {
  if (!isPlain(v) || escaped.has(v)) return v;
  const tag = own(v, "__t");
  if (typeof tag !== "string") return v;
  const pv = own(v, "v");
  if (tag === "num") {
    if (typeof pv !== "string") throw new Error("bad num");
    if (pv === "NaN") return NaN;
    if (pv === "Infinity") return Infinity;
    if (pv === "-Infinity") return -Infinity;
    if (pv === "-0") return -0;
    if (!NUM_LITERAL.test(pv)) throw new Error("bad num literal");
    const n = Number(pv);
    if (!Number.isFinite(n)) throw new Error("overflow");
    if (n === 0) {
      const mant = pv.split(/[eE]/)[0] as string;
      if (/[1-9]/.test(mant)) throw new Error("underflow");
      if (Object.is(n, -0)) throw new Error("negative zero");
    }
    return n;
  }
  if (tag === "bigint") {
    if (typeof pv !== "string" || !BIGINT_LITERAL.test(pv)) throw new Error("bad bigint");
    return BigInt(pv);
  }
  if (tag === "undef") return undefined;
  if (tag === "obj") {
    if (!isPlain(pv)) throw new Error("bad obj");
    const r: Obj = {};
    for (const k of Object.keys(pv))
      Object.defineProperty(r, k, { value: pv[k], enumerable: true, writable: true, configurable: true });
    escaped.add(r);
    return r;
  }
  throw new Error("unknown tag");
}

function bitsOf(x: number): string {
  if (Number.isNaN(x)) return "7ff8000000000000";
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, "0");
}

function f64Node(x: number): Json {
  return { t: "f64", v: Object.is(x, -0) ? "-0" : String(x), bits: bitsOf(x) };
}

function esc(s: string): string {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s.charAt(i);
    if (ch === '"') o += '\\"';
    else if (ch === "\\") o += "\\\\";
    else if (c === 8) o += "\\b";
    else if (c === 9) o += "\\t";
    else if (c === 10) o += "\\n";
    else if (c === 12) o += "\\f";
    else if (c === 13) o += "\\r";
    else if (c < 32) o += "\\u00" + c.toString(16).padStart(2, "0");
    else o += ch;
  }
  return o + '"';
}

function canon(n: Json): string {
  if (n === null) return "null";
  if (typeof n === "string") return esc(n);
  if (typeof n === "boolean") return n ? "true" : "false";
  if (typeof n === "number") return String(n);
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  if (n["t"] === "f64") return '{"bits":' + canon(n["bits"] as Json) + ',"t":"f64"}';
  if (n["t"] === "throw") return '{"t":"throw"}';
  const keys = Object.keys(n).sort();
  return "{" + keys.map((k) => esc(k) + ":" + canon(n[k] as Json)).join(",") + "}";
}

function sortPairs(ps: { k: string; p: Json }[]): Json {
  const s = ps.slice().sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return s.map((x) => x.p);
}

function textNode(s: string): Json {
  if (!wellFormed(s)) throw new Error("ill-formed text");
  return { t: "text", v: s, cu: "utf8" };
}

function encJson(v0: V, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const v = resolve(v0);
  if (v === null) return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return f64Node(v);
  if (typeof v === "string") return textNode(v);
  if (Array.isArray(v)) {
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error("hole");
      out.push(encJson(v[i], d + 1));
    }
    return { t: "list", v: out };
  }
  if (isPlain(v)) {
    const ps: { k: string; p: Json }[] = [];
    for (const [k, x] of Object.entries(v)) ps.push({ k, p: [textNode(k), encJson(x, d + 1)] });
    return { t: "map", v: sortPairs(ps) };
  }
  throw new Error("not json");
}

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const U64_MAX = 2n ** 64n - 1n;

function intNode(v: V, name: string, lo: bigint, hi: bigint): Json {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isInteger(v)) b = BigInt(v);
  else throw new Error("not integral");
  if (b < lo || b > hi) throw new Error("out of range");
  return { t: name, v: b.toString() };
}

function enc(v: V, t: T, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const m = throwMsg(v);
  if (m !== undefined) return { t: "throw", msg: m };
  return encR(resolve(v), t, d);
}

function encR(v: V, t: T, d: number): Json {
  switch (t.k) {
    case "union":
      for (const alt of t.alts) {
        try {
          return encR(v, alt, d);
        } catch {
          continue;
        }
      }
      throw new Error("no alternative");
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
          return intNode(v, "i64", I64_MIN, I64_MAX);
        case "u64":
          return intNode(v, "u64", 0n, U64_MAX);
        case "json":
          return encJson(v, d);
        default:
          throw new Error("unsupported scalar");
      }
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
      const ps: { k: string; p: Json }[] = [];
      for (const [k, x] of Object.entries(v)) {
        const kn = enc(k, t.key, d + 1);
        const vn = enc(x, t.val, d + 1);
        const sk = typeof kn === "object" && kn !== null && !Array.isArray(kn) && kn["t"] === "text" ? (kn["v"] as string) : canon(kn);
        ps.push({ k: sk, p: [kn, vn] });
      }
      return { t: "map", v: sortPairs(ps) };
    }
    case "record": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, enc(own(v, f.name), f.t, d + 1)]);
      return { t: "record", v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t, 0);
}
