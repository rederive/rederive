type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type V = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type T =
  | { k: "none" | "bool" | "text" | "bytes" | "i64" | "u64" | "f64" | "json" }
  | { k: "tuple"; items: T[] }
  | { k: "list"; item: T }
  | { k: "map"; key: T; val: T }
  | { k: "record"; fields: { name: string; type: T }[] }
  | { k: "union"; alts: T[] };

const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = ["none", "bool", "text", "bytes", "i64", "u64", "f64", "json"];
const escaped = new WeakSet<object>();

function tkey(t: T): string {
  switch (t.k) {
    case "tuple": return "tuple[" + t.items.map(tkey).join(",") + "]";
    case "list": return "list[" + tkey(t.item) + "]";
    case "map": return "map[" + tkey(t.key) + "," + tkey(t.val) + "]";
    case "record": return "record[" + t.fields.map((f) => f.name + ":" + tkey(f.type)).sort().join(",") + "]";
    case "union": return "(" + Array.from(new Set(t.alts.map(tkey))).sort().join("|") + ")";
    default: return t.k;
  }
}

function reached(t: T): boolean {
  switch (t.k) {
    case "none": case "bool": case "f64": case "text": case "json": return true;
    case "list": return reached(t.item);
    case "tuple": return t.items.every(reached);
    case "map": return t.key.k === "text" && reached(t.val);
    case "record": return t.fields.every((f) => reached(f.type));
    case "union": return t.alts.every(reached);
    default: return false;
  }
}

function covers(a: T, b: T): boolean {
  if (tkey(a) === tkey(b)) return true;
  if (a.k === "json" && reached(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length &&
    a.items.every((x, i) => covers(x, b.items[i] as T))) return true;
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.fields;
    if (a.fields.every((f) => {
      const g = bf.find((x) => x.name === f.name);
      return g !== undefined && covers(f.type, g.type);
    })) return true;
  }
  if (b.k === "union" && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === "union" && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(src: string): T {
  let i = 0;
  const ws = (): void => {
    while (i < src.length && " \t\r\n".includes(src.charAt(i))) i++;
  };
  const expect = (c: string): void => {
    ws();
    if (src.charAt(i) !== c) throw new Error("expected " + c);
    i++;
  };
  const parseUnion = (depth: number): T => {
    const alts: T[] = [parseAlt(depth)];
    ws();
    while (src.charAt(i) === "|") {
      i++;
      alts.push(parseAlt(depth));
      ws();
    }
    if (alts.length === 1) return alts[0] as T;
    for (let j = 1; j < alts.length; j++)
      for (let m = 0; m < j; m++)
        if (covers(alts[m] as T, alts[j] as T)) throw new Error("unreachable alternative");
    return { k: "union", alts };
  };
  const parseAlt = (depth: number): T => {
    ws();
    const m = NAME.exec(src.slice(i));
    if (m === null) throw new Error("bad type");
    const name = m[0];
    i += name.length;
    if (SCALARS.includes(name)) {
      return { k: name as "none" | "bool" | "text" | "bytes" | "i64" | "u64" | "f64" | "json" };
    }
    if (name !== "tuple" && name !== "list" && name !== "map" && name !== "record") throw new Error("unknown name");
    const d = depth + 1;
    if (d > MAX_DEPTH) throw new Error("too deep");
    expect("[");
    if (name === "tuple") {
      const items: T[] = [parseUnion(d)];
      ws();
      while (src.charAt(i) === ",") {
        i++;
        items.push(parseUnion(d));
        ws();
      }
      expect("]");
      return { k: "tuple", items };
    }
    if (name === "list") {
      const item = parseUnion(d);
      expect("]");
      return { k: "list", item };
    }
    if (name === "map") {
      const key = parseUnion(d);
      expect(",");
      const val = parseUnion(d);
      expect("]");
      return { k: "map", key, val };
    }
    const fields: { name: string; type: T }[] = [];
    for (;;) {
      ws();
      const fm = NAME.exec(src.slice(i));
      if (fm === null) throw new Error("bad field");
      const fname = fm[0];
      i += fname.length;
      if (fields.some((f) => f.name === fname)) throw new Error("dup field");
      expect(":");
      fields.push({ name: fname, type: parseUnion(d) });
      ws();
      if (src.charAt(i) === ",") { i++; continue; }
      break;
    }
    expect("]");
    return { k: "record", fields };
  };
  const t = parseUnion(0);
  ws();
  if (i !== src.length) throw new Error("trailing");
  return t;
}

function isPlain(v: V): v is Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function ownStr(o: Obj, k: string): string | undefined {
  if (!Object.hasOwn(o, k)) return undefined;
  const x = o[k];
  return typeof x === "string" ? x : undefined;
}

function throwMsg(v: V): string | undefined {
  if (!isPlain(v) || escaped.has(v)) return undefined;
  const keys = Object.keys(v);
  if (keys.length !== 1) return undefined;
  const k = keys[0] as string;
  if (k !== "__throw" && k !== "__threw") return undefined;
  return ownStr(v, k);
}

function resolveTag(v: V): V {
  if (!isPlain(v) || escaped.has(v)) return v;
  const tag = ownStr(v, "__t");
  if (tag === undefined) return v;
  const pv: Json | undefined = Object.hasOwn(v, "v") ? v["v"] : undefined;
  if (tag === "num") {
    if (typeof pv !== "string") throw new Error("bad num");
    if (pv === "NaN") return NaN;
    if (pv === "Infinity") return Infinity;
    if (pv === "-Infinity") return -Infinity;
    if (pv === "-0") return -0;
    if (!NUM_LITERAL.test(pv)) throw new Error("bad num");
    const n = Number(pv);
    if (!Number.isFinite(n)) throw new Error("overflow");
    if (n === 0) {
      const mant = (pv.split(/[eE]/)[0] as string);
      if (/[1-9]/.test(mant)) throw new Error("underflow");
      if (Object.is(n, -0)) throw new Error("neg zero");
    }
    return n;
  }
  if (tag === "bigint") {
    if (typeof pv !== "string" || !BIGINT_LITERAL.test(pv)) throw new Error("bad bigint");
    return BigInt(pv);
  }
  if (tag === "undef") return undefined;
  if (tag === "obj") {
    if (pv === undefined || !isPlain(pv)) throw new Error("bad obj");
    const out: Obj = {};
    for (const k of Object.keys(pv)) {
      Object.defineProperty(out, k, { value: pv[k], enumerable: true, writable: true, configurable: true });
    }
    escaped.add(out);
    return out;
  }
  throw new Error("unknown tag");
}

function render(x: number): string {
  return Object.is(x, -0) ? "-0" : String(x);
}

function bits(x: number): string {
  if (Number.isNaN(x)) return "7ff8000000000000";
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, "0");
}

function f64node(x: number): Json {
  return { t: "f64", v: render(x), bits: bits(x) };
}

function textNode(s: string): Json {
  if (!s.isWellFormed()) throw new Error("ill-formed text");
  return { t: "text", v: s, cu: "utf8" };
}

function esc(s: string): string {
  let o = "\"";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s.charAt(i);
    if (ch === "\"") o += "\\\"";
    else if (ch === "\\") o += "\\\\";
    else if (c === 8) o += "\\b";
    else if (c === 9) o += "\\t";
    else if (c === 10) o += "\\n";
    else if (c === 12) o += "\\f";
    else if (c === 13) o += "\\r";
    else if (c < 32) o += "\\u00" + c.toString(16).padStart(2, "0");
    else o += ch;
  }
  return o + "\"";
}

function canon(n: Json): string {
  if (n === null) return "null";
  if (typeof n === "boolean") return n ? "true" : "false";
  if (typeof n === "number") return String(n);
  if (typeof n === "string") return esc(n);
  if (Array.isArray(n)) return "[" + n.map(canon).join(",") + "]";
  let o: Obj = n;
  if (n["t"] === "f64") o = { bits: n["bits"] ?? null, t: "f64" };
  else if (n["t"] === "throw") o = { t: "throw" };
  const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return "{" + keys.map((k) => esc(k) + ":" + canon(o[k] as Json)).join(",") + "}";
}

function sortKey(n: Json): string {
  if (isPlain(n) && n["t"] === "text" && typeof n["v"] === "string") return n["v"];
  return canon(n);
}

function sortPairs(pairs: Json[][]): Json[] {
  const withKey = pairs.map((p) => ({ p, s: sortKey(p[0] as Json) }));
  withKey.sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0));
  return withKey.map((x) => x.p);
}

function encodeJson(v0: V, depth: number): Json {
  if (depth > MAX_VALUE_DEPTH) throw new Error("too deep");
  const v = resolveTag(v0);
  if (v === undefined || typeof v === "bigint") throw new Error("not json");
  if (v === null) return { t: "none" };
  if (typeof v === "boolean") return { t: "bool", v };
  if (typeof v === "number") return f64node(v);
  if (typeof v === "string") return textNode(v);
  if (Array.isArray(v)) {
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error("hole");
      out.push(encodeJson(v[i], depth + 1));
    }
    return { t: "list", v: out };
  }
  if (isPlain(v)) {
    const pairs: Json[][] = Object.entries(v).map(([k, x]) => [textNode(k), encodeJson(x, depth + 1)]);
    return { t: "map", v: sortPairs(pairs) };
  }
  throw new Error("not json");
}

function intNode(v: V, kind: "i64" | "u64"): Json {
  let b: bigint;
  if (typeof v === "bigint") b = v;
  else if (typeof v === "number" && Number.isInteger(v)) b = BigInt(v);
  else throw new Error("not integral");
  const lo = kind === "i64" ? -(2n ** 63n) : 0n;
  const hi = kind === "i64" ? 2n ** 63n - 1n : 2n ** 64n - 1n;
  if (b < lo || b > hi) throw new Error("out of range");
  return { t: kind, v: b.toString() };
}

function encodeResolved(v: V, t: T, depth: number): Json {
  switch (t.k) {
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
      if (typeof v === "number") return f64node(v);
      throw new Error("not f64");
    case "i64": return intNode(v, "i64");
    case "u64": return intNode(v, "u64");
    case "bytes": throw new Error("not bytes");
    case "json": return encodeJson(v, depth);
    case "tuple": {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error("not tuple");
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) {
        if (!(i in v)) throw new Error("hole");
        out.push(encodeAt(v[i], t.items[i] as T, depth + 1));
      }
      return { t: "tuple", v: out };
    }
    case "list": {
      if (!Array.isArray(v)) throw new Error("not list");
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) {
        if (!(i in v)) throw new Error("hole");
        out.push(encodeAt(v[i], t.item, depth + 1));
      }
      return { t: "list", v: out };
    }
    case "map": {
      if (!isPlain(v)) throw new Error("not map");
      const pairs: Json[][] = [];
      for (const [k, x] of Object.entries(v)) {
        pairs.push([encodeAt(k, t.key, depth + 1), encodeAt(x, t.val, depth + 1)]);
      }
      return { t: "map", v: sortPairs(pairs) };
    }
    case "record": {
      if (!isPlain(v)) throw new Error("not record");
      const out: Json[] = [];
      for (const f of t.fields) {
        const x: V = Object.hasOwn(v, f.name) ? v[f.name] : undefined;
        out.push([f.name, encodeAt(x, f.type, depth + 1)]);
      }
      return { t: "record", v: out };
    }
    case "union": {
      for (const alt of t.alts) {
        try {
          return encodeResolved(v, alt, depth);
        } catch {
          continue;
        }
      }
      throw new Error("no alternative");
    }
  }
}

function encodeAt(v0: V, t: T, depth: number): Json {
  if (depth > MAX_VALUE_DEPTH) throw new Error("too deep");
  const msg = throwMsg(v0);
  if (msg !== undefined) return { t: "throw", msg };
  return encodeResolved(resolveTag(v0), t, depth);
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return encodeAt(value, t, 0);
}
