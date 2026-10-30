type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Val = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type T =
  | { k: "s"; n: string }
  | { k: "tuple"; items: T[] }
  | { k: "list"; item: T }
  | { k: "map"; key: T; val: T }
  | { k: "rec"; fields: { name: string; t: T }[] }
  | { k: "union"; alts: T[] };

const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const escaped = new WeakSet<object>();

function parseType(s: string): T {
  let pos = 0;
  const ws = (): void => {
    while (pos < s.length && " \t\r\n".includes(s.charAt(pos))) pos++;
  };
  const expect = (c: string): void => {
    ws();
    if (s.charAt(pos) !== c || pos >= s.length) throw new Error("type: expected " + c);
    pos++;
  };
  const name = (): string => {
    ws();
    const m = NAME.exec(s.slice(pos));
    if (m === null) throw new Error("type: name expected");
    pos += m[0].length;
    return m[0];
  };
  const parseAlt = (depth: number): T => {
    const n = name();
    if (SCALARS.includes(n)) return { k: "s", n };
    if (n !== "tuple" && n !== "list" && n !== "map" && n !== "record") throw new Error("type: unknown " + n);
    const d = depth + 1;
    if (d > 256) throw new Error("type: too deep");
    expect("[");
    let r: T;
    if (n === "list") {
      r = { k: "list", item: parseUnion(d) };
    } else if (n === "map") {
      const key = parseUnion(d);
      expect(",");
      r = { k: "map", key, val: parseUnion(d) };
    } else if (n === "tuple") {
      const items: T[] = [parseUnion(d)];
      for (;;) {
        ws();
        if (s.charAt(pos) !== "," || pos >= s.length) break;
        pos++;
        items.push(parseUnion(d));
      }
      r = { k: "tuple", items };
    } else {
      const fields: { name: string; t: T }[] = [];
      const seen = new Set<string>();
      for (;;) {
        const fname = name();
        if (seen.has(fname)) throw new Error("type: dup field");
        seen.add(fname);
        expect(":");
        fields.push({ name: fname, t: parseUnion(d) });
        ws();
        if (s.charAt(pos) !== "," || pos >= s.length) break;
        pos++;
      }
      r = { k: "rec", fields };
    }
    expect("]");
    return r;
  };
  const parseUnion = (depth: number): T => {
    const alts: T[] = [parseAlt(depth)];
    const seen = new Set<string>([JSON.stringify(alts[0])]);
    for (;;) {
      ws();
      if (pos >= s.length || s.charAt(pos) !== "|") break;
      pos++;
      const a = parseAlt(depth);
      const key = JSON.stringify(a);
      if (seen.has(key)) throw new Error("type: duplicate alternative");
      seen.add(key);
      alts.push(a);
    }
    if (alts.length === 1) return alts[0] as T;
    return { k: "union", alts };
  };
  const t = parseUnion(0);
  ws();
  if (pos < s.length) throw new Error("type: trailing text");
  return t;
}

function isPlain(v: Val): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function own(o: Obj, k: string): Json | undefined {
  return Object.hasOwn(o, k) ? o[k] : undefined;
}

function marker(v: Val, k: string): string | undefined {
  if (!isPlain(v) || escaped.has(v)) return undefined;
  const m = own(v, k);
  return typeof m === "string" ? m : undefined;
}

function resolve(v: Val): Val {
  const tag = marker(v, "__t");
  if (tag === undefined || !isPlain(v)) return v;
  if (tag === "num") {
    const s = own(v, "v");
    if (typeof s !== "string") throw new Error("num: v must be text");
    if (s === "NaN") return NaN;
    if (s === "Infinity") return Infinity;
    if (s === "-Infinity") return -Infinity;
    if (s === "-0") return -0;
    if (!NUM_LITERAL.test(s)) throw new Error("num: bad literal");
    const n = Number(s);
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error("num: not representable");
    return n;
  }
  if (tag === "bigint") {
    const s = own(v, "v");
    if (typeof s !== "string" || !BIGINT_LITERAL.test(s)) throw new Error("bigint: bad v");
    return BigInt(s);
  }
  if (tag === "undef") return undefined;
  if (tag === "obj") {
    const inner = own(v, "v");
    if (inner === undefined || !isPlain(inner)) throw new Error("obj: v must be a map");
    const out: Obj = {};
    for (const k of Object.keys(inner)) {
      Object.defineProperty(out, k, { value: inner[k], enumerable: true, writable: true, configurable: true });
    }
    escaped.add(out);
    return out;
  }
  throw new Error("unknown tag");
}

function bits(x: number): string {
  if (Number.isNaN(x)) return "7ff8000000000000";
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, "0");
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
  if (typeof n === "boolean") return n ? "true" : "false";
  if (typeof n === "number") return String(n);
  if (typeof n === "string") return esc(n);
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  let src: Obj = n;
  if (n["t"] === "f64") src = { bits: n["bits"] ?? null, t: "f64" };
  else if (n["t"] === "throw") src = { t: "throw" };
  const keys = Object.keys(src).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + keys.map((k) => esc(k) + ":" + canon(src[k] as Json)).join(",") + "}";
}

function sortPairs(items: { key: string; pair: Json }[]): Json[] {
  return items
    .map((x, i) => ({ x, i }))
    .sort((a, b) => (a.x.key < b.x.key ? -1 : a.x.key > b.x.key ? 1 : a.i - b.i))
    .map((e) => e.x.pair);
}

function textNode(s: string): Json {
  if (!s.isWellFormed()) throw new Error("text not well-formed");
  return { t: "text", v: s, cu: "utf8" };
}

function f64Node(x: number): Json {
  return { t: "f64", v: Object.is(x, -0) ? "-0" : String(x), bits: bits(x) };
}

function encJson(v0: Val): Json {
  const v = resolve(v0);
  if (v === null) return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return f64Node(v);
  if (typeof v === "string") return textNode(v);
  if (Array.isArray(v)) {
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error("hole");
      out.push(encJson(v[i] as Json));
    }
    return { t: "list", v: out };
  }
  if (isPlain(v)) {
    const items: { key: string; pair: Json }[] = [];
    for (const [k, x] of Object.entries(v)) {
      items.push({ key: k, pair: [textNode(k), encJson(x)] });
    }
    return { t: "map", v: sortPairs(items) };
  }
  throw new Error("not json");
}

function intNode(v: Val, tn: string): Json {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isInteger(v)) b = BigInt(v);
  else throw new Error("not integral");
  const lo = tn === "i64" ? -(2n ** 63n) : 0n;
  const hi = tn === "i64" ? 2n ** 63n - 1n : 2n ** 64n - 1n;
  if (b < lo || b > hi) throw new Error("out of range");
  return { t: tn, v: b.toString() };
}

function typed(v0: Val, t: T): Json {
  const m1 = marker(v0, "__throw");
  if (m1 !== undefined) return { t: "throw", msg: m1 };
  const m2 = marker(v0, "__threw");
  if (m2 !== undefined) return { t: "throw", msg: m2 };
  const v = resolve(v0);
  switch (t.k) {
    case "union": {
      for (const a of t.alts) {
        try {
          return typed(v, a);
        } catch {
          // try next
        }
      }
      throw new Error("no union alternative");
    }
    case "s": {
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
          return intNode(v, t.n);
        case "json":
          return encJson(v);
        default:
          throw new Error("not bytes");
      }
    }
    case "tuple": {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error("not tuple");
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(typed(v[i], t.items[i] as T));
      return { t: "tuple", v: out };
    }
    case "list": {
      if (!Array.isArray(v)) throw new Error("not list");
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) out.push(typed(v[i], t.item));
      return { t: "list", v: out };
    }
    case "map": {
      if (!isPlain(v)) throw new Error("not map");
      const items: { key: string; pair: Json }[] = [];
      for (const [k, x] of Object.entries(v)) {
        const kn = typed(k, t.key);
        const vn = typed(x, t.val);
        const sk = !Array.isArray(kn) && kn !== null && typeof kn === "object" && kn["t"] === "text" && typeof kn["v"] === "string" ? kn["v"] : canon(kn);
        items.push({ key: sk, pair: [kn, vn] });
      }
      return { t: "map", v: sortPairs(items) };
    }
    case "rec": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, typed(own(v, f.name), f.t)]);
      return { t: "record", v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return typed(value, t);
}
