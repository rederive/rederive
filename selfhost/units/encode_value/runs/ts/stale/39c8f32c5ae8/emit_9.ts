type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Val = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type Ty =
  | { k: "s"; n: string }
  | { k: "tuple"; items: Ty[] }
  | { k: "list"; item: Ty }
  | { k: "map"; key: Ty; val: Ty }
  | { k: "record"; fields: { name: string; ty: Ty }[] }
  | { k: "union"; alts: Ty[] };

const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const COMPOSITES = ["tuple", "list", "map", "record"];
const escaped = new WeakSet<object>();

function key(t: Ty): string {
  switch (t.k) {
    case "s":
      return t.n;
    case "union":
      return "U(" + Array.from(new Set(t.alts.map(key))).sort().join(",") + ")";
    case "tuple":
      return "T(" + t.items.map(key).join(",") + ")";
    case "list":
      return "L(" + key(t.item) + ")";
    case "map":
      return "M(" + key(t.key) + "," + key(t.val) + ")";
    case "record":
      return "R(" + t.fields.map((f) => f.name + ":" + key(f.ty)).sort().join(",") + ")";
  }
}

function reached(t: Ty): boolean {
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
      return t.fields.every((f) => reached(f.ty));
    case "union":
      return t.alts.every(reached);
  }
}

function covers(a: Ty, b: Ty): boolean {
  if (key(a) === key(b)) return true;
  if (a.k === "s" && a.n === "json" && reached(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length) {
    const bi = b.items;
    if (a.items.every((x, i) => covers(x, bi[i] as Ty))) return true;
  }
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.fields;
    if (
      a.fields.every((f) => {
        const g = bf.find((x) => x.name === f.name);
        return g !== undefined && covers(f.ty, g.ty);
      })
    )
      return true;
  }
  if (b.k === "union" && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === "union" && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(s: string): Ty {
  let i = 0;
  const skip = (): void => {
    while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\r" || s[i] === "\n")) i++;
  };
  const expect = (c: string): void => {
    skip();
    if (s[i] !== c) throw new Error("type: expected " + c);
    i++;
  };
  const name = (): string => {
    skip();
    const m = s.slice(i).match(NAME);
    if (m === null) throw new Error("type: name expected");
    i += m[0].length;
    return m[0];
  };
  const parseT = (depth: number): Ty => {
    const alts: Ty[] = [parseAlt(depth)];
    for (;;) {
      skip();
      if (s[i] === "|") {
        i++;
        alts.push(parseAlt(depth));
      } else break;
    }
    if (alts.length === 1) return alts[0] as Ty;
    for (let j = 1; j < alts.length; j++)
      for (let k = 0; k < j; k++)
        if (covers(alts[k] as Ty, alts[j] as Ty)) throw new Error("unreachable alternative");
    return { k: "union", alts };
  };
  const parseAlt = (depth: number): Ty => {
    const n = name();
    if (SCALARS.includes(n)) return { k: "s", n };
    if (!COMPOSITES.includes(n)) throw new Error("type: unknown name " + n);
    expect("[");
    const d = depth + 1;
    if (d > MAX_DEPTH) throw new Error("type too deep");
    if (n === "list") {
      const item = parseT(d);
      expect("]");
      return { k: "list", item };
    }
    if (n === "map") {
      const kt = parseT(d);
      expect(",");
      const val = parseT(d);
      expect("]");
      return { k: "map", key: kt, val };
    }
    if (n === "tuple") {
      const items: Ty[] = [parseT(d)];
      for (;;) {
        skip();
        if (s[i] === ",") {
          i++;
          items.push(parseT(d));
        } else break;
      }
      expect("]");
      return { k: "tuple", items };
    }
    const fields: { name: string; ty: Ty }[] = [];
    for (;;) {
      const fn = name();
      if (fields.some((f) => f.name === fn)) throw new Error("duplicate field");
      expect(":");
      fields.push({ name: fn, ty: parseT(d) });
      skip();
      if (s[i] === ",") i++;
      else break;
    }
    expect("]");
    return { k: "record", fields };
  };
  const r = parseT(0);
  skip();
  if (i !== s.length) throw new Error("type: trailing input");
  return r;
}

function isPlain(v: Val): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function own(o: Obj, k: string): Val {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function wf(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (n >= 0xdc00 && n <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function throwMsg(v: Val): string | null {
  if (!isPlain(v) || escaped.has(v)) return null;
  const ks = Object.keys(v);
  if (ks.length !== 1) return null;
  const k = ks[0] as string;
  if (k !== "__throw" && k !== "__threw") return null;
  const x = v[k];
  return typeof x === "string" ? x : null;
}

function resolveTag(v: Val): Val {
  if (!isPlain(v) || escaped.has(v)) return v;
  const tag = own(v, "__t");
  if (typeof tag !== "string") return v;
  const p = own(v, "v");
  if (tag === "num") {
    if (typeof p !== "string") throw new Error("bad num");
    if (p === "NaN") return NaN;
    if (p === "Infinity") return Infinity;
    if (p === "-Infinity") return -Infinity;
    if (p === "-0") return -0;
    if (!NUM_LITERAL.test(p)) throw new Error("bad num");
    const n = Number(p);
    if (n === 0) {
      const mant = p.split(/[eE]/)[0] as string;
      if (/[1-9]/.test(mant)) throw new Error("underflow");
      if (Object.is(n, -0)) throw new Error("negative zero");
      return 0;
    }
    if (!Number.isFinite(n)) throw new Error("overflow");
    return n;
  }
  if (tag === "bigint") {
    if (typeof p !== "string" || !BIGINT_LITERAL.test(p)) throw new Error("bad bigint");
    return BigInt(p);
  }
  if (tag === "undef") return undefined;
  if (tag === "obj") {
    if (!isPlain(p)) throw new Error("bad obj");
    const out: Obj = {};
    for (const k of Object.keys(p))
      Object.defineProperty(out, k, { value: p[k], enumerable: true, writable: true, configurable: true });
    escaped.add(out);
    return out;
  }
  throw new Error("unknown tag");
}

function canon(n: Json): string {
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  if (typeof n === "object" && n !== null) {
    let o: Obj = n;
    if (o["t"] === "f64") o = { bits: o["bits"] as Json, t: "f64" };
    else if (o["t"] === "throw") o = { t: "throw" };
    const ks = Object.keys(o).sort();
    return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(o[k] as Json)).join(",") + "}";
  }
  return JSON.stringify(n);
}

function sortKey(n: Json): string {
  if (typeof n === "object" && n !== null && !Array.isArray(n) && n["t"] === "text" && typeof n["v"] === "string")
    return n["v"];
  return canon(n);
}

type Entry = { k: Json; v: Json; s: string };
function sortEntries(es: Entry[]): Json[] {
  const idx = es.map((e, i) => ({ e, i }));
  idx.sort((a, b) => (a.e.s < b.e.s ? -1 : a.e.s > b.e.s ? 1 : a.i - b.i));
  return idx.map((x) => [x.e.k, x.e.v]);
}

function f64Node(x: number): Json {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const bits = Number.isNaN(x) ? "7ff8000000000000" : dv.getBigUint64(0).toString(16).padStart(16, "0");
  return { t: "f64", v: Object.is(x, -0) ? "-0" : String(x), bits };
}

function textNode(s: string): Json {
  if (!wf(s)) throw new Error("ill-formed text");
  return { t: "text", v: s, cu: "utf8" };
}

function jchild(c: Val, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  return encJson(resolveTag(c), d);
}

function encJson(v: Val, d: number): Json {
  if (v === null) return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return f64Node(v);
  if (typeof v === "string") return textNode(v);
  if (Array.isArray(v)) {
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error("hole");
      out.push(jchild(v[i] as Json, d + 1));
    }
    return { t: "list", v: out };
  }
  if (isPlain(v)) {
    const es: Entry[] = Object.entries(v).map(([k, x]) => ({
      k: textNode(k),
      v: jchild(x, d + 1),
      s: k,
    }));
    return { t: "map", v: sortEntries(es) };
  }
  throw new Error("not json");
}

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;
const U64_MAX = 2n ** 64n - 1n;

function intOf(v: Val): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isInteger(v)) return BigInt(v);
  throw new Error("not integral");
}

function enc(t: Ty, v: Val, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const m = throwMsg(v);
  if (m !== null) return { t: "throw", msg: m };
  return encR(t, resolveTag(v), d);
}

function encR(t: Ty, v: Val, d: number): Json {
  switch (t.k) {
    case "union": {
      for (const a of t.alts) {
        try {
          return encR(a, v, d);
        } catch {
          continue;
        }
      }
      throw new Error("no union alternative accepts the value");
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
          throw new Error("not f64");
        case "i64": {
          const b = intOf(v);
          if (b < I64_MIN || b > I64_MAX) throw new Error("range");
          return { t: "i64", v: b.toString() };
        }
        case "u64": {
          const b = intOf(v);
          if (b < 0n || b > U64_MAX) throw new Error("range");
          return { t: "u64", v: b.toString() };
        }
        case "json":
          return encJson(v, d);
        default:
          throw new Error("unsupported value for bytes");
      }
    }
    case "tuple": {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error("not tuple");
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) {
        if (!(i in v)) throw new Error("hole");
        out.push(enc(t.items[i] as Ty, v[i] as Json, d + 1));
      }
      return { t: "tuple", v: out };
    }
    case "list": {
      if (!Array.isArray(v)) throw new Error("not list");
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) {
        if (!(i in v)) throw new Error("hole");
        out.push(enc(t.item, v[i] as Json, d + 1));
      }
      return { t: "list", v: out };
    }
    case "map": {
      if (!isPlain(v)) throw new Error("not map");
      const es: Entry[] = [];
      for (const [k, x] of Object.entries(v)) {
        const kn = enc(t.key, k, d + 1);
        const vn = enc(t.val, x, d + 1);
        es.push({ k: kn, v: vn, s: sortKey(kn) });
      }
      return { t: "map", v: sortEntries(es) };
    }
    case "record": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, enc(f.ty, own(v, f.name), d + 1)]);
      return { t: "record", v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(t, value, 0);
}
