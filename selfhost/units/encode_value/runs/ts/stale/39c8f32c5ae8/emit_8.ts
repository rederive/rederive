type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };
type V = Json | undefined | bigint;
type T =
  | { k: "s"; n: string }
  | { k: "tuple"; items: T[] }
  | { k: "list"; item: T }
  | { k: "map"; key: T; val: T }
  | { k: "record"; fields: { name: string; t: T }[] }
  | { k: "union"; alts: T[] };

const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
const escaped = new WeakSet<object>();

function has(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function isPlain(v: V): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: object | null = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function wellFormed(s: string): boolean {
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

function parseType(text: string): T {
  let pos = 0;
  const ws = (): void => {
    while (pos < text.length && " \t\r\n".indexOf(text[pos]) >= 0) pos++;
  };
  const expect = (ch: string): void => {
    ws();
    if (text[pos] !== ch) throw new Error("type: expected " + ch);
    pos++;
  };
  const word = (): string => {
    ws();
    const m = NAME.exec(text.slice(pos));
    if (!m) throw new Error("type: name expected");
    pos += m[0].length;
    return m[0];
  };
  const alt = (depth: number): T => {
    const w = word();
    if (w === "tuple" || w === "list" || w === "map" || w === "record") {
      const nd = depth + 1;
      if (nd > MAX_DEPTH) throw new Error("type too deep");
      expect("[");
      if (w === "list") {
        const item = union(nd);
        expect("]");
        return { k: "list", item };
      }
      if (w === "map") {
        const key = union(nd);
        expect(",");
        const val = union(nd);
        expect("]");
        return { k: "map", key, val };
      }
      if (w === "tuple") {
        const items: T[] = [union(nd)];
        for (;;) {
          ws();
          if (text[pos] === ",") {
            pos++;
            items.push(union(nd));
          } else break;
        }
        expect("]");
        return { k: "tuple", items };
      }
      const fields: { name: string; t: T }[] = [];
      for (;;) {
        const name = word();
        if (fields.some((f) => f.name === name)) throw new Error("dup field");
        expect(":");
        fields.push({ name, t: union(nd) });
        ws();
        if (text[pos] === ",") pos++;
        else break;
      }
      expect("]");
      return { k: "record", fields };
    }
    if (SCALARS.indexOf(w) < 0) throw new Error("unknown type name");
    return { k: "s", n: w };
  };
  const union = (depth: number): T => {
    const alts: T[] = [alt(depth)];
    for (;;) {
      ws();
      if (text[pos] === "|") {
        pos++;
        alts.push(alt(depth));
      } else break;
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++)
      for (let i = 0; i < j; i++)
        if (covers(alts[i], alts[j])) throw new Error("unreachable alternative");
    return { k: "union", alts };
  };
  const r = union(0);
  ws();
  if (pos !== text.length) throw new Error("trailing input");
  return r;
}

function key(t: T): string {
  switch (t.k) {
    case "s":
      return "s:" + t.n;
    case "tuple":
      return "tuple[" + t.items.map(key).join(",") + "]";
    case "list":
      return "list[" + key(t.item) + "]";
    case "map":
      return "map[" + key(t.key) + "," + key(t.val) + "]";
    case "record":
      return "record[" + t.fields.map((f) => f.name + ":" + key(f.t)).sort().join(",") + "]";
    case "union":
      return "union[" + t.alts.map(key).sort().join("|") + "]";
  }
}

function reached(t: T): boolean {
  switch (t.k) {
    case "s":
      return ["none", "bool", "f64", "text", "json"].indexOf(t.n) >= 0;
    case "list":
      return reached(t.item);
    case "tuple":
      return t.items.every(reached);
    case "map":
      return t.key.k === "s" && t.key.n === "text" && reached(t.val);
    case "record":
      return t.fields.every((f) => reached(f.t));
    case "union":
      return t.alts.every(reached);
  }
}

function covers(a: T, b: T): boolean {
  if (key(a) === key(b)) return true;
  if (a.k === "s" && a.n === "json" && reached(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length) {
    const bi = b.items;
    if (a.items.every((x, i) => covers(x, bi[i]))) return true;
  }
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.fields;
    if (
      a.fields.every((f) => {
        const g = bf.find((x) => x.name === f.name);
        return g !== undefined && covers(f.t, g.t);
      })
    )
      return true;
  }
  if (b.k === "union" && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === "union" && a.alts.some((x) => covers(x, b))) return true;
  return false;
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

function textNode(s: string): Json {
  if (!wellFormed(s)) throw new Error("ill-formed text");
  return { t: "text", v: s, cu: "utf8" };
}

function canon(n: Json): string {
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  if (typeof n === "object" && n !== null) {
    if (n["t"] === "f64") return '{"bits":' + JSON.stringify(n["bits"]) + ',"t":"f64"}';
    if (n["t"] === "throw") return '{"t":"throw"}';
    const ks = Object.keys(n).sort();
    return "{" + ks.map((k) => JSON.stringify(k) + ":" + canon(n[k])).join(",") + "}";
  }
  return JSON.stringify(n);
}

function sortPairs(pairs: Json[][]): Json[] {
  const keyed = pairs.map((p) => {
    const kn = p[0];
    const sk =
      typeof kn === "object" && kn !== null && !Array.isArray(kn) && kn["t"] === "text" && typeof kn["v"] === "string"
        ? kn["v"]
        : canon(kn);
    return { sk, p };
  });
  keyed.sort((x, y) => (x.sk < y.sk ? -1 : x.sk > y.sk ? 1 : 0));
  return keyed.map((e) => e.p);
}

function throwMsg(v: V): string | undefined {
  if (!isPlain(v) || escaped.has(v)) return undefined;
  const ks = Object.keys(v);
  if (ks.length !== 1 || (ks[0] !== "__throw" && ks[0] !== "__threw")) return undefined;
  const m = v[ks[0]];
  return typeof m === "string" ? m : undefined;
}

function resolveTag(v: V): V {
  if (!isPlain(v) || escaped.has(v) || !has(v, "__t")) return v;
  const tag = v["__t"];
  if (typeof tag !== "string") return v;
  const pv: Json | undefined = has(v, "v") ? v["v"] : undefined;
  switch (tag) {
    case "num": {
      if (typeof pv !== "string") throw new Error("num: v not text");
      if (pv === "NaN") return NaN;
      if (pv === "Infinity") return Infinity;
      if (pv === "-Infinity") return -Infinity;
      if (pv === "-0") return -0;
      if (!NUM_LITERAL.test(pv)) throw new Error("num: bad literal");
      const n = Number(pv);
      const mant = pv.split(/[eE]/)[0];
      if (n === 0 && /[1-9]/.test(mant)) throw new Error("num: underflow");
      if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error("num: bad value");
      return n;
    }
    case "bigint":
      if (typeof pv !== "string" || !BIGINT_LITERAL.test(pv)) throw new Error("bigint: bad");
      return BigInt(pv);
    case "undef":
      return undefined;
    case "obj": {
      if (!isPlain(pv)) throw new Error("obj: v must be a map");
      const o: Obj = {};
      for (const k of Object.keys(pv))
        Object.defineProperty(o, k, { value: pv[k], enumerable: true, writable: true, configurable: true });
      escaped.add(o);
      return o;
    }
    default:
      throw new Error("unknown tag");
  }
}

function encJson(v0: V, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const v = resolveTag(v0);
  if (v === undefined || typeof v === "bigint") throw new Error("not json");
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
    const pairs: Json[][] = [];
    for (const [k, x] of Object.entries(v)) pairs.push([textNode(k), encJson(x, d + 1)]);
    return { t: "map", v: sortPairs(pairs) };
  }
  throw new Error("not json");
}

function intNode(v: V, name: string, lo: bigint, hi: bigint): Json {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isInteger(v)) b = BigInt(v);
  else throw new Error("not integral");
  if (b < lo || b > hi) throw new Error("out of range");
  return { t: name, v: b.toString() };
}

function enc(v0: V, t: T, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error("too deep");
  const m = throwMsg(v0);
  if (m !== undefined) return { t: "throw", msg: m };
  const v = resolveTag(v0);
  switch (t.k) {
    case "union": {
      for (const a of t.alts) {
        try {
          return enc(v, a, d);
        } catch (e) {
          continue;
        }
      }
      throw new Error("no alternative");
    }
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
          return intNode(v, "i64", -(2n ** 63n), 2n ** 63n - 1n);
        case "u64":
          return intNode(v, "u64", 0n, 2n ** 64n - 1n);
        case "json":
          return encJson(v, d);
        default:
          throw new Error("unacceptable");
      }
    case "tuple": {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error("not tuple");
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(enc(v[i], t.items[i], d + 1));
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
      const pairs: Json[][] = [];
      for (const [k, x] of Object.entries(v)) pairs.push([enc(k, t.key, d + 1), enc(x, t.val, d + 1)]);
      return { t: "map", v: sortPairs(pairs) };
    }
    case "record": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, enc(has(v, f.name) ? v[f.name] : undefined, f.t, d + 1)]);
      return { t: "record", v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t, 0);
}
