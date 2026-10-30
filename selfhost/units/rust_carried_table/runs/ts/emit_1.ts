type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type Val = null | boolean | number | string | Val[];
type Tok = { t: "STR" | "CHR" | "NUM" | "IDENT" | "BOOL" | "P"; s: string; n: number; bad: boolean };
type Ty =
  | { k: "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" }
  | { k: "list"; e: Ty }
  | { k: "tuple"; e: Ty[] }
  | { k: "map"; key: Ty; val: Ty }
  | { k: "record"; f: { name: string; t: Ty }[] }
  | { k: "union"; a: Ty[] };

const HEXD = /^[0-9a-fA-F]+/;
const TRIM_CODES = new Set<number>([9, 10, 11, 12, 13, 32, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff]);
for (let c = 0x2000; c <= 0x200a; c++) TRIM_CODES.add(c);

function fail(m: string): never {
  throw new Error("rust carried table: " + m);
}

function isHex(c: string): boolean {
  return /^[0-9a-fA-F]$/.test(c);
}

function unescape(body: string): string {
  let out = "";
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    const d = body[i + 1];
    if (d === undefined) return fail("bad escape");
    if (d === "n") { out += "\n"; i += 2; }
    else if (d === "r") { out += "\r"; i += 2; }
    else if (d === "t") { out += "\t"; i += 2; }
    else if (d === "0") { out += "\u0000"; i += 2; }
    else if (d === "\\" || d === "'" || d === '"') { out += d; i += 2; }
    else if (d === "x") {
      const h = body.slice(i + 2, i + 4);
      if (h.length !== 2 || !isHex(h[0] ?? "") || !isHex(h[1] ?? "")) return fail("bad \\x escape");
      out += String.fromCharCode(parseInt(h, 16));
      i += 4;
    } else if (d === "u") {
      if (body[i + 2] !== "{") return fail("bad \\u escape");
      const end = body.indexOf("}", i + 3);
      if (end < 0) return fail("bad \\u escape");
      const hex = body.slice(i + 3, end).replace(/_/g, "");
      const m = HEXD.exec(hex);
      if (!m) return fail("bad \\u escape");
      const cp = parseInt(m[0], 16);
      if (!(cp <= 0x10ffff)) return fail("bad code point");
      out += String.fromCodePoint(cp);
      i = end + 1;
    } else if (d === "\n" || d === "\r") {
      i += 2;
      while (i < body.length && (body[i] === " " || body[i] === "\t" || body[i] === "\r" || body[i] === "\n")) i++;
    } else return fail("unknown escape");
  }
  return out;
}

const RAW = /^b?r(#*)"/;
const SUFFIX = /^(?:_?)(u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64)/;
const DEC = /^[0-9][0-9_]*(?:\.[0-9][0-9_]*)?(?:[eE][+-]?[0-9][0-9_]*)?/;

function lexNumber(w: string): { len: number; tok: Tok } {
  let body = "";
  let radix = false;
  const r = /^0x[0-9a-fA-F_]+/.exec(w) ?? /^0o[0-7_]+/.exec(w) ?? /^0b[01_]+/.exec(w);
  if (r) { body = r[0]; radix = true; }
  else { const d = DEC.exec(w); body = d ? d[0] : w.slice(0, 1); }
  let len = body.length;
  const sm = SUFFIX.exec(w.slice(len));
  let suffix = "";
  if (sm) { suffix = sm[1] ?? ""; len += sm[0].length; }
  const clean = body.replace(/_/g, "");
  let n = 0;
  let bad = false;
  if (radix) {
    if (clean.length <= 2) bad = true;
    else {
      n = Number(clean);
      if (!Number.isFinite(n)) bad = true;
      else bad = BigInt(clean) !== BigInt(n);
    }
  } else if (!/[.eE]/.test(clean)) {
    n = Number(clean);
    if (!Number.isFinite(n)) bad = true;
    else bad = BigInt(clean) !== BigInt(n);
  } else {
    n = Number(clean);
    if (!Number.isFinite(n)) bad = true;
  }
  if (!bad && suffix === "f32" && Math.fround(n) !== n) bad = true;
  return { len, tok: { t: "NUM", s: "", n: bad ? 0 : n, bad } };
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  const L = src.length;
  let i = 0;
  const push = (t: Tok["t"], s: string): void => { toks.push({ t, s, n: 0, bad: false }); };
  const scanStr = (start: number): number => {
    let j = start;
    while (j < L) {
      const ch = src[j];
      if (ch === "\\") j += 2;
      else if (ch === '"') break;
      else j++;
    }
    if (j >= L) fail("unterminated string");
    push("STR", unescape(src.slice(start, j)));
    return j + 1;
  };
  while (i < L) {
    const c = src[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      const e = src.indexOf("\n", i);
      i = e < 0 ? L : e;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < L && depth > 0) {
        if (src[i] === "/" && src[i + 1] === "*") { depth++; i += 2; }
        else if (src[i] === "*" && src[i + 1] === "/") { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === "b" || c === "r") {
      const rm = RAW.exec(src.slice(i, i + 32));
      if (rm) {
        const hashes = rm[1] ?? "";
        const start = i + rm[0].length;
        const close = '"' + hashes;
        const e = src.indexOf(close, start);
        if (e < 0) fail("unterminated raw string");
        push("STR", src.slice(start, e));
        i = e + close.length;
        continue;
      }
    }
    if (c === '"') { i = scanStr(i + 1); continue; }
    if (c === "b" && src[i + 1] === '"') { i = scanStr(i + 2); continue; }
    if (c === "'") {
      const c1 = src[i + 1];
      let done = false;
      if (c1 !== undefined && c1 !== "'" && c1 !== "\\") {
        const cp = src.codePointAt(i + 1) ?? 0;
        const l = cp > 0xffff ? 2 : 1;
        if (src[i + 1 + l] === "'") {
          push("CHR", String.fromCodePoint(cp));
          i += l + 2;
          done = true;
        }
      } else if (c1 === "\\") {
        const d = src[i + 2];
        if (d !== undefined && "nrt0\\'\"".includes(d)) {
          if (src[i + 3] === "'") { push("CHR", unescape(src.slice(i + 1, i + 3))); i += 4; done = true; }
        } else if (d === "x") {
          if (/^[0-9a-fA-F]{2}'$/.test(src.slice(i + 3, i + 6))) { push("CHR", unescape(src.slice(i + 1, i + 5))); i += 6; done = true; }
        } else if (d === "u") {
          const m = /^\{[0-9a-fA-F_]{1,8}\}'/.exec(src.slice(i + 3, i + 16));
          if (m) { push("CHR", unescape(src.slice(i + 1, i + 3 + m[0].length - 1))); i += 3 + m[0].length; done = true; }
        }
      }
      if (!done) { push("P", "'"); i++; }
      continue;
    }
    if (c >= "0" && c <= "9") {
      const { len, tok } = lexNumber(src.slice(i, i + 64));
      toks.push(tok);
      i += len;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < L && /[A-Za-z0-9_]/.test(src[j] ?? "")) j++;
      const w = src.slice(i, j);
      push(w === "true" || w === "false" ? "BOOL" : "IDENT", w);
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "=>" || two === "->" || two === "::" || two === "..") { push("P", two); i += 2; continue; }
    const cp = src.codePointAt(i) ?? 0;
    const s = String.fromCodePoint(cp);
    push("P", s);
    i += s.length;
  }
  return toks;
}

const RANGES: Record<string, [number, number]> = {
  u8: [0, 255], u16: [0, 65535], u32: [0, 4294967295],
  i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647],
  u64: [0, 2 ** 53], usize: [0, 2 ** 53], u128: [0, 2 ** 53],
  i64: [-(2 ** 53), 2 ** 53], isize: [-(2 ** 53), 2 ** 53], i128: [-(2 ** 53), 2 ** 53],
};

type Read = { v: Val; next: number } | null;

function cast(toks: Tok[], p: number, x: number): Read {
  const a = toks[p];
  if (!a || a.t !== "IDENT" || a.s !== "as") return { v: x, next: p };
  const ty = toks[p + 1];
  if (!ty || ty.t !== "IDENT") return fail("bad cast");
  if (ty.s === "f64") return { v: x, next: p + 2 };
  if (ty.s === "f32") {
    if (Math.fround(x) !== x) return fail("bad f32 cast");
    return { v: x, next: p + 2 };
  }
  const rg = Object.prototype.hasOwnProperty.call(RANGES, ty.s) ? RANGES[ty.s] : undefined;
  if (!rg) return fail("bad cast type");
  if (!Number.isInteger(x) || x < rg[0] || x > rg[1]) return fail("cast out of range");
  return { v: Object.is(x, -0) ? 0 : x, next: p + 2 };
}

function readValue(toks: Tok[], p: number): Read {
  const t = toks[p];
  if (!t) return null;
  if (t.t === "P" && t.s === "&") {
    let q = p;
    while (toks[q] && toks[q]?.t === "P" && toks[q]?.s === "&") q++;
    return readValue(toks, q);
  }
  if (t.t === "STR" || t.t === "CHR") return { v: t.s, next: p + 1 };
  if (t.t === "BOOL") return { v: t.s === "true", next: p + 1 };
  if (t.t === "NUM") {
    if (t.bad) return fail("inexact number");
    return cast(toks, p + 1, t.n);
  }
  if (t.t === "P" && t.s === "-") {
    const nt = toks[p + 1];
    if (nt && nt.t === "NUM") {
      if (nt.bad) return fail("inexact number");
      return cast(toks, p + 2, -nt.n);
    }
    return null;
  }
  if (t.t === "IDENT" && t.s === "None") return { v: null, next: p + 1 };
  if (t.t === "IDENT" && t.s === "Some") {
    const o = toks[p + 1];
    if (!o || o.t !== "P" || o.s !== "(") return null;
    const n2 = toks[p + 2];
    if (n2 && n2.t === "IDENT" && (n2.s === "Some" || n2.s === "None")) return fail("nested option");
    const r = readValue(toks, p + 2);
    if (!r) return null;
    const cl = toks[r.next];
    if (!cl || cl.t !== "P" || cl.s !== ")") return null;
    return { v: r.v, next: r.next + 1 };
  }
  if (t.t === "P" && (t.s === "[" || t.s === "(")) {
    const closer = t.s === "[" ? "]" : ")";
    const items: Val[] = [];
    let q = p + 1;
    let comma = false;
    for (;;) {
      const c = toks[q];
      if (!c) return null;
      if (c.t === "P" && c.s === closer) { q++; break; }
      const r = readValue(toks, q);
      if (!r) return null;
      items.push(r.v);
      const a = toks[r.next];
      if (!a || a.t !== "P") return null;
      if (a.s === ",") { comma = true; q = r.next + 1; continue; }
      if (a.s === closer) { q = r.next + 1; break; }
      return null;
    }
    if (t.s === "(" && items.length === 1 && !comma) return { v: items[0] ?? null, next: q };
    return { v: items, next: q };
  }
  return null;
}

function isP(t: Tok | undefined, s: string): boolean {
  return !!t && t.t === "P" && t.s === s;
}

function entries(toks: Tok[]): [string, Val][] {
  const tuples: [string, Val][] = [];
  const arms: [string, Val][] = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!t) break;
    if (isP(t, "(")) {
      const k = toks[i + 1];
      if (k && k.t === "STR" && isP(toks[i + 2], ",")) {
        const r = readValue(toks, i + 3);
        if (!r) return fail("tuple value not read");
        if (isP(toks[r.next], ")")) {
          tuples.push([k.s, r.v]);
          i = r.next + 1;
          continue;
        }
        i++;
        continue;
      }
    }
    if (t.t === "STR") {
      const n1 = toks[i + 1];
      const n2 = toks[i + 2];
      if (isP(n1, "|") && n2 && n2.t === "STR") return fail("or-pattern");
      if (isP(n1, "=>")) {
        const r = readValue(toks, i + 2);
        if (!r) return fail("arm value not read");
        const a = toks[r.next];
        if (isP(a, ",") || isP(a, "}")) {
          arms.push([t.s, r.v]);
          i = r.next;
          continue;
        }
        return fail("arm not terminated");
      }
    }
    i++;
  }
  return tuples.length > 0 ? tuples : arms;
}

const TRIMST = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = new RegExp("^map[ \\t\\r\\n]+(.+?)[ \\t\\r\\n]*->[ \\t\\r\\n]*(.+)$", "s");
const WIDTH = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;

function norm(s: string): string {
  const t = s.replace(TRIMST, "");
  const m = ARROW.exec(t);
  if (m) return "map[" + norm(m[1] ?? "") + ", " + norm(m[2] ?? "") + "]";
  return t;
}

const BASE = new Set(["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"]);

function ck(t: Ty): string {
  switch (t.k) {
    case "list": return "list[" + ck(t.e) + "]";
    case "tuple": return "tuple[" + t.e.map(ck).join(",") + "]";
    case "map": return "map[" + ck(t.key) + "," + ck(t.val) + "]";
    case "record": return "record[" + t.f.map((f) => f.name + ":" + ck(f.t)).sort().join(",") + "]";
    case "union": return "union{" + Array.from(new Set(t.a.map(ck))).sort().join("|") + "}";
    default: return t.k;
  }
}

function accepted(t: Ty): boolean {
  switch (t.k) {
    case "none": case "bool": case "f64": case "text": case "json": return true;
    case "list": return accepted(t.e);
    case "tuple": return t.e.every(accepted);
    case "map": return t.key.k === "text" && accepted(t.val);
    case "record": return t.f.every((f) => accepted(f.t));
    case "union": return t.a.every(accepted);
    default: return false;
  }
}

function covers(a: Ty, b: Ty): boolean {
  if (ck(a) === ck(b)) return true;
  if (a.k === "json" && accepted(b)) return true;
  if (a.k === "list" && b.k === "list" && covers(a.e, b.e)) return true;
  if (a.k === "tuple" && b.k === "tuple" && a.e.length === b.e.length && a.e.every((x, i) => { const y = b.e[i]; return y !== undefined && covers(x, y); })) return true;
  if (a.k === "map" && b.k === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === "record" && b.k === "record") {
    const bf = b.f;
    if (a.f.every((f) => bf.some((g) => g.name === f.name && covers(f.t, g.t)))) return true;
  }
  if (a.k === "union" && a.a.some((x) => covers(x, b))) return true;
  if (b.k === "union" && b.a.every((y) => covers(a, y))) return true;
  return false;
}

function parseShape(text: string): Ty {
  const toks: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? "";
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if ("[],|:".includes(c)) { toks.push(c); i++; continue; }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j] ?? "")) j++;
      toks.push(text.slice(i, j));
      i = j;
      continue;
    }
    return fail("bad shape character");
  }
  let p = 0;
  const expect = (s: string): void => {
    if (toks[p] !== s) fail("bad shape");
    p++;
  };
  const alt = (depth: number): Ty => {
    const w = toks[p++];
    if (w === undefined) return fail("bad shape");
    if (BASE.has(w)) {
      return { k: w as "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" };
    }
    if (w !== "tuple" && w !== "list" && w !== "map" && w !== "record") return fail("bad shape word");
    const d = depth + 1;
    if (d > 16) fail("shape too deep");
    expect("[");
    let r: Ty;
    if (w === "list") {
      r = { k: "list", e: type(d) };
    } else if (w === "tuple") {
      const e = [type(d)];
      while (toks[p] === ",") { p++; e.push(type(d)); }
      r = { k: "tuple", e };
    } else if (w === "map") {
      const key = type(d);
      expect(",");
      r = { k: "map", key, val: type(d) };
    } else {
      const f: { name: string; t: Ty }[] = [];
      for (;;) {
        const name = toks[p++];
        if (name === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return fail("bad field");
        if (f.some((x) => x.name === name)) return fail("dup field");
        expect(":");
        f.push({ name, t: type(d) });
        if (toks[p] === ",") { p++; continue; }
        break;
      }
      r = { k: "record", f };
    }
    expect("]");
    return r;
  };
  const type = (depth: number): Ty => {
    const alts = [alt(depth)];
    while (toks[p] === "|") { p++; alts.push(alt(depth)); }
    for (let j = 1; j < alts.length; j++) {
      for (let q = 0; q < j; q++) {
        const x = alts[q];
        const y = alts[j];
        if (x && y && covers(x, y)) fail("covered alternative");
      }
    }
    const first = alts[0];
    if (alts.length === 1 && first) return first;
    return { k: "union", a: alts };
  };
  const t = type(0);
  if (p !== toks.length) fail("trailing shape");
  return t;
}

function fits(v: Val, t: Ty): boolean {
  switch (t.k) {
    case "text": return typeof v === "string";
    case "bool": return typeof v === "boolean";
    case "none": return v === null;
    case "f64": return typeof v === "number";
    case "i64": return typeof v === "number" && Number.isInteger(v) && v >= -(2 ** 63) && v < 2 ** 63;
    case "u64": return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 2 ** 64;
    case "json": return true;
    case "list": return Array.isArray(v) && v.every((x) => fits(x, t.e));
    case "tuple": return Array.isArray(v) && v.length === t.e.length && t.e.every((e, i) => fits(v[i] ?? null, e));
    case "union": return t.a.some((a) => fits(v, a));
    default: return false;
  }
}

function same(a: Val, b: Val): boolean {
  if (!Array.isArray(a)) return Object.is(a, b);
  return Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b);
}

export default function rust_carried_table(src: string, shape: string | null): Record<string, Json> {
  const toks = lex(src);
  const ents = entries(toks);
  if (ents.length === 0) fail("no carried entries");
  if (shape !== null && shape !== "") {
    const cut = shape.indexOf(";");
    const t0 = cut >= 0 ? shape.slice(0, cut) : shape;
    const t1 = norm(t0).replace(WIDTH, (_m: string, p: string, s: string) => p + s + "64");
    const ty = parseShape(t1);
    if (ty.k !== "map") fail("shape is not a map");
    for (const [k, v] of ents) {
      if (!fits(k, ty.key) || !fits(v, ty.val)) fail("misfit");
    }
  }
  const out: Record<string, Json> = {};
  const has = (k: string): boolean => Object.prototype.hasOwnProperty.call(out, k);
  for (const [k, v] of ents) {
    if (has(k)) {
      const prev = Object.getOwnPropertyDescriptor(out, k)?.value as Val;
      if (!same(prev, v)) fail("duplicate key with different value");
    }
    Object.defineProperty(out, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return out;
}
