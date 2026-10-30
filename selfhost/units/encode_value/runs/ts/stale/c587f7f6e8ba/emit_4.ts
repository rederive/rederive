type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Val = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type T =
  | { k: "s"; n: string }
  | { k: "tuple"; items: T[] }
  | { k: "list"; item: T }
  | { k: "map"; key: T; val: T }
  | { k: "record"; fields: { name: string; t: T }[] }
  | { k: "union"; alts: T[] };

const SCALARS = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /[A-Za-z_][A-Za-z0-9_]*/y;
const escaped = new WeakSet<object>();

function parseTypeText(s: string): T {
  let pos = 0;
  const ws = (): void => {
    while (pos < s.length && " \t\r\n".includes(s.charAt(pos))) pos++;
  };
  const expect = (c: string): void => {
    ws();
    if (s.charAt(pos) !== c || pos >= s.length) throw new Error("expected " + c);
    pos++;
  };
  const name = (): string => {
    ws();
    NAME.lastIndex = pos;
    const m = NAME.exec(s);
    if (m === null) throw new Error("expected name");
    pos += m[0].length;
    return m[0];
  };
  const peek = (c: string): boolean => {
    ws();
    return pos < s.length && s.charAt(pos) === c;
  };
  const parseType = (d: number): T => {
    const alts: T[] = [parseAlt(d)];
    while (peek("|")) {
      pos++;
      alts.push(parseAlt(d));
    }
    if (alts.length === 1) return alts[0] as T;
    const seen = new Set<string>();
    for (const a of alts) {
      const key = JSON.stringify(a);
      if (seen.has(key)) throw new Error("duplicate alternative");
      seen.add(key);
    }
    return { k: "union", alts };
  };
  const parseAlt = (d: number): T => {
    const w = name();
    if (SCALARS.includes(w)) return { k: "s", n: w };
    if (w !== "tuple" && w !== "list" && w !== "map" && w !== "record") throw new Error("unknown name " + w);
    if (d + 1 > 256) throw new Error("too deep");
    expect("[");
    if (w === "list") {
      const item = parseType(d + 1);
      expect("]");
      return { k: "list", item };
    }
    if (w === "map") {
      const key = parseType(d + 1);
      expect(",");
      const val = parseType(d + 1);
      expect("]");
      return { k: "map", key, val };
    }
    if (w === "tuple") {
      const items: T[] = [parseType(d + 1)];
      while (peek(",")) {
        pos++;
        items.push(parseType(d + 1));
      }
      expect("]");
      return { k: "tuple", items };
    }
    const fields: { name: string; t: T }[] = [];
    const names = new Set<string>();
    for (;;) {
      const n = name();
      if (names.has(n)) throw new Error("duplicate field");
      names.add(n);
      expect(":");
      fields.push({ name: n, t: parseType(d + 1) });
      if (peek(",")) {
        pos++;
        continue;
      }
      break;
    }
    expect("]");
    return { k: "record", fields };
  };
  const t = parseType(0);
  ws();
  if (pos !== s.length) throw new Error("trailing text");
  return t;
}

function isPlain(v: Val): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function own(o: Obj, k: string): Val {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function marker(v: Val, k: string): string | undefined {
  if (!isPlain(v) || escaped.has(v)) return undefined;
  const m = own(v, k);
  return typeof m === "string" ? m : undefined;
}

function resolve(v: Val): Val {
  const tag = marker(v, "__t");
  if (tag === undefined || !isPlain(v)) return v;
  const p = own(v, "v");
  if (tag === "num") {
    if (typeof p !== "string") throw new Error("num v");
    if (p === "NaN") return NaN;
    if (p === "Infinity") return Infinity;
    if (p === "-Infinity") return -Infinity;
    if (p === "-0") return -0;
    if (!NUM_LITERAL.test(p)) throw new Error("bad num");
    const x = Number(p);
    if (!Number.isFinite(x) || Object.is(x, -0)) throw new Error("bad num");
    return x;
  }
  if (tag === "bigint") {
    if (typeof p !== "string" || !BIGINT_LITERAL.test(p)) throw new Error("bad bigint");
    return BigInt(p);
  }
  if (tag === "undef") return undefined;
  if (tag === "obj") {
    if (!isPlain(p)) throw new Error("obj v");
    const r: Obj = {};
    for (const k of Object.keys(p)) {
      Object.defineProperty(r, k, { value: p[k], enumerable: true, writable: true, configurable: true });
    }
    escaped.add(r);
    return r;
  }
  throw new Error("unknown tag");
}

function esc(s: string): string {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s.charAt(i);
    if (ch === '"') r += '\\"';
    else if (ch === "\\") r += "\\\\";
    else if (c === 8) r += "\\b";
    else if (c === 9) r += "\\t";
    else if (c === 10) r += "\\n";
    else if (c === 12) r += "\\f";
    else if (c === 13) r += "\\r";
    else if (c < 32) r += "\\u00" + c.toString(16).padStart(2, "0");
    else r += ch;
  }
  return r + '"';
}

function canon(n: Json): string {
  if (n === null) return "null";
  if (typeof n === "boolean") return n ? "true" : "false";
  if (typeof n === "number") return String(n);
  if (typeof n === "string") return esc(n);
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  let o: Obj = n;
  if (o["t"] === "f64") o = { bits: o["bits"] ?? null, t: "f64" };
  else if (o["t"] === "throw") o = { t: "throw" };
  const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + keys.map((k) => esc(k) + ":" + canon(o[k] ?? null)).join(",") + "}";
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

function f64Node(x: number): Json {
  return { bits: bitsOf(x), t: "f64", v: Object.is(x, -0) ? "-0" : String(x) };
}

function sortPairs(pairs: { sk: string; pair: Json }[]): Json {
  const sorted = pairs
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.sk < b.p.sk ? -1 : a.p.sk > b.p.sk ? 1 : a.i - b.i))
    .map((x) => x.p.pair);
  return { t: "map", v: sorted };
}

function encodeJson(v: Val): Json {
  if (v === null) return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return f64Node(v);
  if (typeof v === "string") return textNode(v);
  if (Array.isArray(v)) return { t: "list", v: v.map((x) => encodeJson(resolve(x))) };
  if (isPlain(v)) {
    const pairs: { sk: string; pair: Json }[] = [];
    for (const [k, x] of Object.entries(v)) {
      pairs.push({ sk: k, pair: [textNode(k), encodeJson(resolve(x))] });
    }
    return sortPairs(pairs);
  }
  throw new Error("not json");
}

function intNode(v: Val, kind: "i64" | "u64"): Json {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isInteger(v)) b = BigInt(v);
  else throw new Error("not integral");
  const lo = kind === "i64" ? -(2n ** 63n) : 0n;
  const hi = kind === "i64" ? 2n ** 63n - 1n : 2n ** 64n - 1n;
  if (b < lo || b > hi) throw new Error("out of range");
  return { t: kind, v: b.toString() };
}

function encodeTyped(v0: Val, t: T): Json {
  const th = marker(v0, "__throw");
  if (th !== undefined) return { msg: th, t: "throw" };
  const tw = marker(v0, "__threw");
  if (tw !== undefined) return { msg: tw, t: "throw" };
  return encodeResolved(resolve(v0), t);
}

function encodeResolved(v: Val, t: T): Json {
  switch (t.k) {
    case "union": {
      for (const a of t.alts) {
        try {
          return encodeResolved(v, a);
        } catch {
          continue;
        }
      }
      throw new Error("no alternative");
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
          return intNode(v, "i64");
        case "u64":
          return intNode(v, "u64");
        case "json":
          return encodeJson(v);
        default:
          throw new Error("not bytes");
      }
    }
    case "tuple": {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error("not tuple");
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(encodeTyped(v[i], t.items[i] as T));
      return { t: "tuple", v: out };
    }
    case "list": {
      if (!Array.isArray(v)) throw new Error("not list");
      return { t: "list", v: v.map((x) => encodeTyped(x, t.item)) };
    }
    case "map": {
      if (!isPlain(v)) throw new Error("not map");
      const pairs: { sk: string; pair: Json }[] = [];
      for (const [k, x] of Object.entries(v)) {
        const kn = encodeTyped(k, t.key);
        const vn = encodeTyped(x, t.val);
        let sk: string;
        if (typeof kn === "object" && kn !== null && !Array.isArray(kn) && kn["t"] === "text" && typeof kn["v"] === "string") sk = kn["v"];
        else sk = canon(kn);
        pairs.push({ sk, pair: [kn, vn] });
      }
      return sortPairs(pairs);
    }
    case "record": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, encodeTyped(own(v, f.name), f.t)]);
      return { t: "record", v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseTypeText(type);
  return encodeTyped(value, t);
}
