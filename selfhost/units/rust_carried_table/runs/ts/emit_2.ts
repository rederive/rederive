type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type Tok =
  | { k: "S"; v: string }
  | { k: "C"; v: string }
  | { k: "N"; v: number; bad: boolean }
  | { k: "B"; v: boolean }
  | { k: "I"; v: string }
  | { k: "P"; v: string };

type Ty =
  | { k: "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" }
  | { k: "list"; item: Ty }
  | { k: "tuple"; items: Ty[] }
  | { k: "map"; key: Ty; val: Ty }
  | { k: "record"; fields: { name: string; t: Ty }[] }
  | { k: "union"; alts: Ty[] };

const fail = (m: string): never => {
  throw new Error(m);
};

const isHex = (c: string): boolean => /^[0-9a-fA-F]$/.test(c);

function unescape(body: string): string {
  let out = "";
  let k = 0;
  while (k < body.length) {
    const ch = body[k];
    if (ch !== "\\") {
      out += ch;
      k++;
      continue;
    }
    const c = body[k + 1];
    if (c === undefined) return fail("escape");
    if (c === "n") { out += "\n"; k += 2; }
    else if (c === "r") { out += "\r"; k += 2; }
    else if (c === "t") { out += "\t"; k += 2; }
    else if (c === "0") { out += "\u0000"; k += 2; }
    else if (c === "\\" || c === "'" || c === '"') { out += c; k += 2; }
    else if (c === "x") {
      const a = body[k + 2];
      const b = body[k + 3];
      if (a === undefined || b === undefined || !isHex(a) || !isHex(b)) return fail("bad \\x");
      out += String.fromCharCode(parseInt(a + b, 16));
      k += 4;
    } else if (c === "u") {
      if (body[k + 2] !== "{") return fail("bad \\u");
      const e = body.indexOf("}", k + 3);
      if (e < 0) return fail("bad \\u");
      const hex = body.slice(k + 3, e).replace(/_/g, "");
      if (hex.length === 0 || !isHex(hex[0] ?? "")) return fail("bad \\u");
      const cp = parseInt(hex, 16);
      if (!(cp <= 0x10ffff)) return fail("bad \\u");
      out += String.fromCodePoint(cp);
      k = e + 1;
    } else if (c === "\n" || c === "\r") {
      k += 2;
      while (k < body.length && " \t\r\n".includes(body[k] ?? "x")) k++;
    } else return fail("unknown escape");
  }
  return out;
}

const NUM_RE =
  /^(?:(0x[0-9a-fA-F_]+)|(0o[0-7_]+)|(0b[01_]+)|(\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?))(_?(?:u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64))?/;

function lexNum(w: string): { tok: Tok; len: number } {
  const m = NUM_RE.exec(w);
  if (!m) return fail("num");
  const body = m[1] ?? m[2] ?? m[3] ?? m[4] ?? "";
  const suffix = (m[5] ?? "").replace(/^_/, "");
  const clean = body.replace(/_/g, "");
  let n = NaN;
  let bad = false;
  if (m[4] === undefined) {
    if (clean.length === 2) bad = true;
    else {
      n = Number(clean);
      bad = !(Number.isFinite(n) && BigInt(n) === BigInt(clean));
    }
  } else if (/^\d+$/.test(clean)) {
    n = Number(clean);
    bad = !(Number.isFinite(n) && BigInt(n) === BigInt(clean));
  } else {
    n = Number(clean);
    bad = !Number.isFinite(n);
  }
  if (!bad && suffix === "f32" && m[1] === undefined && Math.fround(n) !== n) bad = true;
  return { tok: { k: "N", v: bad ? NaN : n, bad }, len: m[0].length };
}

function tryChar(src: string, i: number): { v: string; end: number } | null {
  const j = i + 1;
  const c = src[j];
  if (c === undefined) return null;
  if (c === "\\") {
    const rest = src.slice(j, j + 14);
    let m = /^\\[nrt0\\'"]'/.exec(rest);
    if (m) return { v: unescape(rest.slice(0, 2)), end: j + 3 };
    m = /^\\x[0-9a-fA-F]{2}'/.exec(rest);
    if (m) return { v: unescape(rest.slice(0, 4)), end: j + 5 };
    m = /^\\u\{[0-9a-fA-F_]{1,8}\}'/.exec(rest);
    if (m) return { v: unescape(m[0].slice(0, -1)), end: j + m[0].length };
    return null;
  }
  if (c === "'") return null;
  const cp = src.codePointAt(j) ?? 0;
  const len = cp > 0xffff ? 2 : 1;
  if (src[j + len] === "'") return { v: src.slice(j, j + len), end: j + len + 1 };
  return null;
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      const e = src.indexOf("\n", i);
      i = e < 0 ? n : e;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "*") { depth++; i += 2; }
        else if (src[i] === "*" && src[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === "b" || c === "r") {
      const m = /^b?r(#*)"/.exec(src.slice(i, i + 32));
      if (m) {
        const start = i + m[0].length;
        const term = '"' + (m[1] ?? "");
        const idx = src.indexOf(term, start);
        if (idx < 0) return fail("unterminated raw string");
        toks.push({ k: "S", v: src.slice(start, idx) });
        i = idx + term.length;
        continue;
      }
    }
    if (c === '"' || (c === "b" && src[i + 1] === '"')) {
      const start = i + (c === "b" ? 2 : 1);
      let k = start;
      while (k < n && src[k] !== '"') k += src[k] === "\\" ? 2 : 1;
      if (k >= n) return fail("unterminated string");
      toks.push({ k: "S", v: unescape(src.slice(start, k)) });
      i = k + 1;
      continue;
    }
    if (c === "'") {
      const r = tryChar(src, i);
      if (r) {
        toks.push({ k: "C", v: r.v });
        i = r.end;
      } else {
        toks.push({ k: "P", v: "'" });
        i++;
      }
      continue;
    }
    if (c >= "0" && c <= "9") {
      const r = lexNum(src.slice(i, i + 64));
      toks.push(r.tok);
      i += r.len;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let k = i + 1;
      while (k < n && /[A-Za-z0-9_]/.test(src[k] ?? "")) k++;
      const w = src.slice(i, k);
      if (w === "true") toks.push({ k: "B", v: true });
      else if (w === "false") toks.push({ k: "B", v: false });
      else toks.push({ k: "I", v: w });
      i = k;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "=>" || two === "->" || two === "::" || two === "..") {
      toks.push({ k: "P", v: two });
      i += 2;
      continue;
    }
    const cp = src.codePointAt(i) ?? 0;
    const len = cp > 0xffff ? 2 : 1;
    toks.push({ k: "P", v: src.slice(i, i + len) });
    i += len;
  }
  return toks;
}

type R = { v: Json; next: number } | undefined;

const isP = (t: Tok | undefined, s: string): boolean => t !== undefined && t.k === "P" && t.v === s;

const INT_RANGES: Record<string, [number, number]> = {
  u8: [0, 255],
  u16: [0, 65535],
  u32: [0, 4294967295],
  i8: [-128, 127],
  i16: [-32768, 32767],
  i32: [-2147483648, 2147483647],
  u64: [0, 2 ** 53],
  usize: [0, 2 ** 53],
  u128: [0, 2 ** 53],
  i64: [-(2 ** 53), 2 ** 53],
  isize: [-(2 ** 53), 2 ** 53],
  i128: [-(2 ** 53), 2 ** 53],
};

function cast(toks: Tok[], x: number, q: number): R {
  const a = toks[q];
  if (!a || a.k !== "I" || a.v !== "as") return { v: x, next: q };
  const t = toks[q + 1];
  if (!t || t.k !== "I") return fail("bad cast");
  if (t.v === "f64") return { v: x, next: q + 2 };
  if (t.v === "f32") {
    if (Math.fround(x) !== x) return fail("f32 cast");
    return { v: x, next: q + 2 };
  }
  const r = INT_RANGES[t.v];
  if (!r) return fail("bad cast type");
  if (!Number.isInteger(x) || x < r[0] || x > r[1]) return fail("cast range");
  return { v: x === 0 ? 0 : x, next: q + 2 };
}

function readValue(toks: Tok[], p: number): R {
  const t = toks[p];
  if (!t) return undefined;
  if (t.k === "P") {
    if (t.v === "&") return readValue(toks, p + 1);
    if (t.v === "-") {
      const nt = toks[p + 1];
      if (nt && nt.k === "N") {
        if (nt.bad) return fail("inexact");
        return cast(toks, -nt.v, p + 2);
      }
      return undefined;
    }
    if (t.v === "[" || t.v === "(") {
      const closer = t.v === "[" ? "]" : ")";
      const items: Json[] = [];
      let q = p + 1;
      let comma = false;
      if (isP(toks[q], closer)) return { v: items, next: q + 1 };
      for (;;) {
        const r = readValue(toks, q);
        if (!r) return undefined;
        items.push(r.v);
        q = r.next;
        if (isP(toks[q], ",")) {
          comma = true;
          q++;
          if (isP(toks[q], closer)) break;
        } else if (isP(toks[q], closer)) break;
        else return undefined;
      }
      if (t.v === "(" && items.length === 1 && !comma) return { v: items[0] ?? null, next: q + 1 };
      return { v: items, next: q + 1 };
    }
    return undefined;
  }
  if (t.k === "S" || t.k === "C" || t.k === "B") return { v: t.v, next: p + 1 };
  if (t.k === "N") {
    if (t.bad) return fail("inexact");
    return cast(toks, t.v, p + 1);
  }
  if (t.v === "None") return { v: null, next: p + 1 };
  if (t.v === "Some" && isP(toks[p + 1], "(")) {
    const nx = toks[p + 2];
    if (nx && nx.k === "I" && (nx.v === "Some" || nx.v === "None")) return fail("nested option");
    const r = readValue(toks, p + 2);
    if (!r) return undefined;
    if (isP(toks[r.next], ")")) return { v: r.v, next: r.next + 1 };
    return undefined;
  }
  return undefined;
}

type Entry = { key: string; val: Json };

function scan(toks: Tok[]): Entry[] {
  const tuples: Entry[] = [];
  const arms: Entry[] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const t1 = toks[i + 1];
    const t2 = toks[i + 2];
    if (isP(t, "(") && t1 && t1.k === "S" && isP(t2, ",")) {
      const r = readValue(toks, i + 3);
      if (!r) return fail("no tuple value");
      if (isP(toks[r.next], ")")) {
        tuples.push({ key: t1.v, val: r.v });
        i = r.next + 1;
        continue;
      }
      i++;
      continue;
    }
    if (t && t.k === "S") {
      if (isP(t1, "|") && t2 && t2.k === "S") return fail("or-pattern");
      if (isP(t1, "=>")) {
        const r = readValue(toks, i + 2);
        if (r && (isP(toks[r.next], ",") || isP(toks[r.next], "}"))) {
          arms.push({ key: t.v, val: r.v });
          i = r.next;
          continue;
        }
        return fail("bad arm");
      }
    }
    i++;
  }
  return tuples.length > 0 ? tuples : arms;
}

const WS = " \t\r\n";
const TRIM_ST = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDTH = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;

function norm(s: string): string {
  const t = s.replace(TRIM_ST, "");
  const m = ARROW.exec(t);
  if (m) return "map[" + norm(m[1] ?? "") + ", " + norm(m[2] ?? "") + "]";
  return t;
}

function same(a: Ty, b: Ty): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case "list":
      return b.k === "list" && same(a.item, b.item);
    case "tuple":
      return b.k === "tuple" && a.items.length === b.items.length && a.items.every((x, i) => same(x, b.items[i] ?? x) && b.items[i] !== undefined);
    case "map":
      return b.k === "map" && same(a.key, b.key) && same(a.val, b.val);
    case "record": {
      if (b.k !== "record" || a.fields.length !== b.fields.length) return false;
      return a.fields.every((f) => b.fields.some((g) => g.name === f.name && same(f.t, g.t)));
    }
    case "union": {
      if (b.k !== "union" || a.alts.length !== b.alts.length) return false;
      return a.alts.every((x) => b.alts.some((y) => same(x, y))) && b.alts.every((y) => a.alts.some((x) => same(x, y)));
    }
    default:
      return true;
  }
}

function jsonOk(b: Ty): boolean {
  switch (b.k) {
    case "none": case "bool": case "f64": case "text": case "json":
      return true;
    case "list":
      return jsonOk(b.item);
    case "tuple":
      return b.items.every(jsonOk);
    case "map":
      return b.key.k === "text" && jsonOk(b.val);
    case "record":
      return b.fields.every((f) => jsonOk(f.t));
    case "union":
      return b.alts.every(jsonOk);
    default:
      return false;
  }
}

function covers(a: Ty, b: Ty): boolean {
  if (same(a, b)) return true;
  if (a.k === "json" && jsonOk(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.item, b.item)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.items.length === b.items.length) {
    if (a.items.every((x, i) => { const y = b.items[i]; return y !== undefined && covers(x, y); })) return true;
  }
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    if (a.fields.every((f) => b.fields.some((g) => g.name === f.name && covers(f.t, g.t)))) return true;
  }
  if (a.k === "union" && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === "union" && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function parseType(t: string): Ty {
  let p = 0;
  const ws = (): void => {
    while (p < t.length && WS.includes(t[p] ?? "x")) p++;
  };
  const word = (): string => {
    const m = /^[A-Za-z0-9_]+/.exec(t.slice(p));
    if (!m) return fail("type word");
    p += m[0].length;
    return m[0];
  };
  const expect = (c: string): void => {
    ws();
    if (t[p] !== c) fail("expected " + c);
    p++;
  };
  const union = (depth: number): Ty => {
    const alts: Ty[] = [alt(depth)];
    ws();
    while (t[p] === "|") {
      p++;
      alts.push(alt(depth));
      ws();
    }
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        const x = alts[i];
        const y = alts[j];
        if (x && y && covers(x, y)) fail("covered alternative");
      }
    }
    const first = alts[0];
    if (alts.length === 1 && first) return first;
    return { k: "union", alts };
  };
  const alt = (depth: number): Ty => {
    ws();
    const w = word();
    switch (w) {
      case "text": case "bytes": case "bool": case "none": case "i64": case "u64": case "f64": case "json":
        return { k: w };
      case "list": {
        if (depth + 1 > 16) fail("too deep");
        expect("[");
        const item = union(depth + 1);
        expect("]");
        return { k: "list", item };
      }
      case "tuple": {
        if (depth + 1 > 16) fail("too deep");
        expect("[");
        const items = [union(depth + 1)];
        ws();
        while (t[p] === ",") {
          p++;
          items.push(union(depth + 1));
          ws();
        }
        expect("]");
        return { k: "tuple", items };
      }
      case "map": {
        if (depth + 1 > 16) fail("too deep");
        expect("[");
        const key = union(depth + 1);
        expect(",");
        const val = union(depth + 1);
        expect("]");
        return { k: "map", key, val };
      }
      case "record": {
        if (depth + 1 > 16) fail("too deep");
        expect("[");
        const fields: { name: string; t: Ty }[] = [];
        for (;;) {
          ws();
          const name = word();
          if (!/^[A-Za-z_]/.test(name)) fail("bad field name");
          if (fields.some((f) => f.name === name)) fail("dup field");
          expect(":");
          fields.push({ name, t: union(depth + 1) });
          ws();
          if (t[p] === ",") { p++; continue; }
          break;
        }
        expect("]");
        return { k: "record", fields };
      }
      default:
        return fail("unknown type word");
    }
  };
  const ty = union(0);
  ws();
  if (p !== t.length) fail("trailing text");
  return ty;
}

function readShape(shape: string): Ty {
  const cut = shape.split(";")[0] ?? "";
  let t = norm(cut);
  t = t.replace(WIDTH, (_m: string, pre: string, s: string) => pre + s + "64");
  const ty = parseType(t);
  if (ty.k !== "map") return fail("shape is not a map");
  return ty;
}

function fits(v: Json, t: Ty): boolean {
  switch (t.k) {
    case "text": return typeof v === "string";
    case "bool": return typeof v === "boolean";
    case "none": return v === null;
    case "f64": return typeof v === "number";
    case "i64": return typeof v === "number" && Number.isInteger(v) && v >= -(2 ** 63) && v < 2 ** 63;
    case "u64": return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 2 ** 64;
    case "json": return true;
    case "list": return Array.isArray(v) && (v as readonly Json[]).every((x) => fits(x, t.item));
    case "tuple": {
      if (!Array.isArray(v)) return false;
      const arr = v as readonly Json[];
      return arr.length === t.items.length && t.items.every((ty, i) => { const x = arr[i]; return x !== undefined && fits(x, ty); });
    }
    case "union": return t.alts.some((a) => fits(v, a));
    default: return false;
  }
}

export default function rust_carried_table(src: string, shape: string | null): Record<string, Json> {
  const toks = lex(src);
  const entries = scan(toks);
  if (entries.length === 0) fail("no carried entries");
  if (shape !== null && shape !== "") {
    const ty = readShape(shape);
    if (ty.k === "map") {
      for (const e of entries) {
        if (!fits(e.key, ty.key) || !fits(e.val, ty.val)) fail("shape misfit");
      }
    }
  }
  const out: Record<string, Json> = {};
  for (const e of entries) {
    if (Object.hasOwn(out, e.key)) {
      const old = out[e.key] as Json;
      let ok: boolean;
      if (Array.isArray(old)) ok = Array.isArray(e.val) && JSON.stringify(old) === JSON.stringify(e.val);
      else ok = Object.is(old, e.val);
      if (!ok) fail("duplicate key with different value");
    }
    Object.defineProperty(out, e.key, { value: e.val, enumerable: true, writable: true, configurable: true });
  }
  return out;
}
