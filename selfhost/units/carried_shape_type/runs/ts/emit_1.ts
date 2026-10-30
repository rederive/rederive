type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type Node =
  | { readonly k: "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" }
  | { readonly k: "list"; readonly item: Node }
  | { readonly k: "map"; readonly key: Node; readonly val: Node }
  | { readonly k: "tuple"; readonly items: readonly Node[] }
  | { readonly k: "record"; readonly fields: readonly (readonly [string, Node])[] }
  | { readonly k: "union"; readonly alts: readonly Node[] };

const TRIM = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDEN = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function normalize(s: string): string {
  const t = s.replace(TRIM, "");
  const m = ARROW.exec(t);
  if (m !== null) {
    const k = m[1];
    const v = m[2];
    if (k !== undefined && v !== undefined) {
      return "map[" + normalize(k) + ", " + normalize(v) + "]";
    }
  }
  return t;
}

function same(a: Node, b: Node): boolean {
  if (a.k === "union") {
    if (b.k !== "union") return false;
    const bs = b.alts;
    const as = a.alts;
    return as.every((x) => bs.some((y) => same(x, y))) && bs.every((y) => as.some((x) => same(x, y)));
  }
  if (a.k === "list") return b.k === "list" && same(a.item, b.item);
  if (a.k === "map") return b.k === "map" && same(a.key, b.key) && same(a.val, b.val);
  if (a.k === "tuple") {
    if (b.k !== "tuple" || a.items.length !== b.items.length) return false;
    return a.items.every((x, i) => {
      const y = b.items[i];
      return y !== undefined && same(x, y);
    });
  }
  if (a.k === "record") {
    if (b.k !== "record" || a.fields.length !== b.fields.length) return false;
    const bf = b.fields;
    return a.fields.every((f) => bf.some((g) => g[0] === f[0] && same(f[1], g[1])));
  }
  return a.k === b.k;
}

function jsonable(t: Node): boolean {
  switch (t.k) {
    case "none":
    case "bool":
    case "f64":
    case "text":
    case "json":
      return true;
    case "list":
      return jsonable(t.item);
    case "tuple":
      return t.items.every(jsonable);
    case "map":
      return t.key.k === "text" && jsonable(t.val);
    case "record":
      return t.fields.every((f) => jsonable(f[1]));
    case "union":
      return t.alts.every(jsonable);
    default:
      return false;
  }
}

function covers(a: Node, b: Node): boolean {
  if (same(a, b)) return true;
  if (a.k === "json" && jsonable(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length) {
    const bi = b.items;
    if (a.items.every((x, i) => {
      const y = bi[i];
      return y !== undefined && covers(x, y);
    })) return true;
  }
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.fields;
    if (a.fields.every((f) => bf.some((g) => g[0] === f[0] && covers(f[1], g[1])))) return true;
  }
  if (a.k === "union" && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === "union" && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

const WORDS = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"] as const;

function read(src: string): Node {
  let pos = 0;
  const fail = (msg: string): never => {
    throw new Error(msg + " at " + pos);
  };
  const ws = (): void => {
    while (pos < src.length) {
      const c = src.charAt(pos);
      if (c === " " || c === "\t" || c === "\r" || c === "\n") pos++;
      else break;
    }
  };
  const ident = (): string => {
    ws();
    const m = IDENT.exec(src.slice(pos));
    if (m === null) return fail("expected an identifier");
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    ws();
    if (src.charAt(pos) !== ch || pos >= src.length) fail("expected '" + ch + "'");
    pos++;
  };
  const peek = (ch: string): boolean => {
    ws();
    return pos < src.length && src.charAt(pos) === ch;
  };
  const open = (depth: number): void => {
    if (depth + 1 > 16) fail("types nest deeper than 16");
    expect("[");
  };
  const alt = (depth: number): Node => {
    const w = ident();
    for (const x of WORDS) {
      if (w === x) return { k: x };
    }
    if (w === "list") {
      open(depth);
      const item = type(depth + 1);
      expect("]");
      return { k: "list", item };
    }
    if (w === "map") {
      open(depth);
      const key = type(depth + 1);
      expect(",");
      const val = type(depth + 1);
      expect("]");
      return { k: "map", key, val };
    }
    if (w === "tuple") {
      open(depth);
      const items: Node[] = [type(depth + 1)];
      while (peek(",")) {
        pos++;
        items.push(type(depth + 1));
      }
      expect("]");
      return { k: "tuple", items };
    }
    if (w === "record") {
      open(depth);
      const fields: (readonly [string, Node])[] = [];
      const names = new Set<string>();
      for (;;) {
        const n = ident();
        if (names.has(n)) fail("duplicate field");
        names.add(n);
        expect(":");
        fields.push([n, type(depth + 1)]);
        if (peek(",")) pos++;
        else break;
      }
      expect("]");
      return { k: "record", fields };
    }
    return fail("unknown type word " + w);
  };
  const type = (depth: number): Node => {
    const alts: Node[] = [alt(depth)];
    while (peek("|")) {
      pos++;
      alts.push(alt(depth));
    }
    if (alts.length === 1) {
      const only = alts[0];
      if (only !== undefined) return only;
    }
    for (let i = 0; i < alts.length; i++) {
      for (let j = i + 1; j < alts.length; j++) {
        const a = alts[i];
        const b = alts[j];
        if (a !== undefined && b !== undefined && covers(a, b)) {
          fail("a union alternative is unreachable");
        }
      }
    }
    return { k: "union", alts };
  };
  const r = type(0);
  ws();
  if (pos < src.length) fail("unexpected trailing text");
  return r;
}

export default function carried_shape_type(shape: string): Json {
  const seg = shape.split(";")[0] ?? "";
  const norm = normalize(seg);
  const widened = norm.replace(WIDEN, (_m: string, p1: string, p2: string) => p1 + p2 + "64");
  return read(widened);
}
