type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
type Val = null | boolean | number | string | Val[];
interface Tok { k: string; s: string; n: number; bad: boolean }
interface Res { v: Val; i: number }

const HEX = /^[0-9a-fA-F]$/;
const NUM_RE = new RegExp(
  "^(0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|[0-9][0-9_]*(?:\\.[0-9][0-9_]*)?(?:[eE][+-]?[0-9][0-9_]*)?)" +
    "(?:_?(u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64))?",
);
const RAW_RE = /^b?r#*"/;

function fail(m: string): never {
  throw new Error(m);
}

function unescape(b: string): string {
  let out = "";
  let i = 0;
  while (i < b.length) {
    const c = b[i] as string;
    if (c !== "\\") {
      out += c;
      i++;
      continue;
    }
    const e = b[i + 1];
    if (e === undefined) return fail("escape");
    if (e === "n") { out += "\n"; i += 2; }
    else if (e === "r") { out += "\r"; i += 2; }
    else if (e === "t") { out += "\t"; i += 2; }
    else if (e === "0") { out += "\u0000"; i += 2; }
    else if (e === "\\" || e === "'" || e === '"') { out += e; i += 2; }
    else if (e === "x") {
      const h = b.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) return fail("bad \\x");
      out += String.fromCharCode(parseInt(h, 16));
      i += 4;
    } else if (e === "u") {
      if (b[i + 2] !== "{") return fail("bad \\u");
      const close = b.indexOf("}", i + 3);
      if (close < 0) return fail("bad \\u");
      const hex = b.slice(i + 3, close).replace(/_/g, "");
      if (hex.length === 0 || !HEX.test(hex[0] as string)) return fail("bad \\u hex");
      const cp = parseInt(hex, 16);
      if (!(cp <= 0x10ffff)) return fail("bad \\u range");
      out += String.fromCodePoint(cp);
      i = close + 1;
    } else if (e === "\n" || e === "\r") {
      i += 2;
      while (i < b.length && (b[i] === " " || b[i] === "\t" || b[i] === "\r" || b[i] === "\n")) i++;
    } else return fail("unknown escape");
  }
  return out;
}

function charAt(s: string, i: number): { body: string; end: number } | null {
  const n = s.length;
  if (i + 1 >= n) return null;
  const c = s[i + 1] as string;
  if (c === "\\") {
    const e = s[i + 2];
    if (e === undefined) return null;
    if ("nrt0\\'\"".includes(e)) {
      return s[i + 3] === "'" ? { body: s.slice(i + 1, i + 3), end: i + 4 } : null;
    }
    if (e === "x") {
      const h = s.slice(i + 3, i + 5);
      return /^[0-9a-fA-F]{2}$/.test(h) && s[i + 5] === "'" ? { body: s.slice(i + 1, i + 5), end: i + 6 } : null;
    }
    if (e === "u") {
      const m = /^\\u\{[0-9a-fA-F_]{1,8}\}'/.exec(s.slice(i + 1, i + 15));
      return m ? { body: m[0].slice(0, -1), end: i + 1 + m[0].length } : null;
    }
    return null;
  }
  if (c === "'") return null;
  const cp = s.codePointAt(i + 1) as number;
  const L = cp > 0xffff ? 2 : 1;
  return s[i + 1 + L] === "'" ? { body: s.slice(i + 1, i + 1 + L), end: i + 2 + L } : null;
}

function lex(s: string): Tok[] {
  const toks: Tok[] = [];
  const n = s.length;
  let i = 0;
  const push = (k: string, str: string, num = 0, bad = false): void => {
    toks.push({ k, s: str, n: num, bad });
  };
  while (i < n) {
    const c = s[i] as string;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if (c === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      let d = 1;
      i += 2;
      while (i < n && d > 0) {
        if (s[i] === "/" && s[i + 1] === "*") { d++; i += 2; }
        else if (s[i] === "*" && s[i + 1] === "/") { d--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === "b" || c === "r") {
      const m = RAW_RE.exec(s.slice(i, i + 32));
      if (m) {
        const hashes = m[0].replace(/^b?r/, "").length - 1;
        const start = i + m[0].length;
        const close = '"' + "#".repeat(hashes);
        const e = s.indexOf(close, start);
        if (e < 0) return fail("unterminated raw string");
        push("STR", s.slice(start, e));
        i = e + close.length;
        continue;
      }
    }
    if (c === '"' || (c === "b" && s[i + 1] === '"')) {
      const start = i + (c === "b" ? 2 : 1);
      let j = start;
      while (j < n && s[j] !== '"') j += s[j] === "\\" ? 2 : 1;
      if (j >= n) return fail("unterminated string");
      push("STR", unescape(s.slice(start, j)));
      i = j + 1;
      continue;
    }
    if (c === "'") {
      const r = charAt(s, i);
      if (r) { push("CHR", unescape(r.body)); i = r.end; }
      else { push("P", "'"); i++; }
      continue;
    }
    if (c >= "0" && c <= "9") {
      const m = NUM_RE.exec(s.slice(i, i + 64)) as RegExpExecArray;
      const body = (m[1] as string).replace(/_/g, "");
      const suf = m[2];
      let v: number;
      let inexact = false;
      if (/^0[xob]/.test(body)) {
        if (body.length === 2) { v = NaN; inexact = true; }
        else {
          v = Number(body);
          inexact = !(Number.isFinite(v) && BigInt(body) === BigInt(v));
        }
      } else {
        v = Number(body);
        if (!Number.isFinite(v)) inexact = true;
        else if (!/[.eE]/.test(body)) inexact = BigInt(body) !== BigInt(v);
        if (!inexact && suf === "f32" && Math.fround(v) !== v) inexact = true;
      }
      if (!inexact && suf === "f32" && /^0[ob]/.test(body) && Math.fround(v) !== v) inexact = true;
      push("NUM", body, v, inexact);
      i += m[0].length;
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(s[j] as string)) j++;
      const w = s.slice(i, j);
      push(w === "true" || w === "false" ? "BOOL" : "IDENT", w);
      i = j;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === "=>" || two === "->" || two === "::" || two === "..") { push("P", two); i += 2; continue; }
    const cp = s.codePointAt(i) as number;
    const L = cp > 0xffff ? 2 : 1;
    push("P", s.slice(i, i + L));
    i += L;
  }
  return toks;
}

const INT_RANGE: Record<string, [number, number]> = {
  u8: [0, 255], u16: [0, 65535], u32: [0, 4294967295],
  i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647],
  u64: [0, 2 ** 53], usize: [0, 2 ** 53], u128: [0, 2 ** 53],
  i64: [-(2 ** 53), 2 ** 53], isize: [-(2 ** 53), 2 ** 53], i128: [-(2 ** 53), 2 ** 53],
};

function withCast(toks: Tok[], x: number, at: number): Res {
  const a = toks[at];
  if (!a || a.k !== "IDENT" || a.s !== "as") return { v: x, i: at };
  const t = toks[at + 1];
  if (!t || t.k !== "IDENT") return fail("bad cast");
  const ty = t.s;
  if (ty === "f64") return { v: x, i: at + 2 };
  if (ty === "f32") {
    if (Math.fround(x) !== x) return fail("f32 cast");
    return { v: x, i: at + 2 };
  }
  const r = Object.prototype.hasOwnProperty.call(INT_RANGE, ty) ? INT_RANGE[ty] : undefined;
  if (!r) return fail("unknown cast");
  if (!Number.isInteger(x) || x < r[0] || x > r[1]) return fail("cast range");
  return { v: x === 0 ? 0 : x, i: at + 2 };
}

function readValue(toks: Tok[], i: number): Res | null {
  const t = toks[i];
  if (!t) return null;
  if (t.k === "P" && t.s === "&") {
    let j = i;
    while (toks[j] && (toks[j] as Tok).k === "P" && (toks[j] as Tok).s === "&") j++;
    return readValue(toks, j);
  }
  if (t.k === "STR" || t.k === "CHR") return { v: t.s, i: i + 1 };
  if (t.k === "BOOL") return { v: t.s === "true", i: i + 1 };
  if (t.k === "NUM") {
    if (t.bad) return fail("inexact");
    return withCast(toks, t.n, i + 1);
  }
  if (t.k === "P" && t.s === "-") {
    const u = toks[i + 1];
    if (u && u.k === "NUM") {
      if (u.bad) return fail("inexact");
      return withCast(toks, -u.n, i + 2);
    }
    return null;
  }
  if (t.k === "IDENT" && t.s === "None") return { v: null, i: i + 1 };
  if (t.k === "IDENT" && t.s === "Some") {
    const p = toks[i + 1];
    if (!p || p.k !== "P" || p.s !== "(") return null;
    const q = toks[i + 2];
    if (q && q.k === "IDENT" && (q.s === "None" || q.s === "Some")) return fail("nested option");
    const r = readValue(toks, i + 2);
    if (!r) return null;
    const c = toks[r.i];
    if (!c || c.k !== "P" || c.s !== ")") return null;
    return { v: r.v, i: r.i + 1 };
  }
  if (t.k === "P" && (t.s === "[" || t.s === "(")) {
    const closer = t.s === "[" ? "]" : ")";
    const isCloser = (x: Tok | undefined): boolean => x !== undefined && x.k === "P" && x.s === closer;
    let j = i + 1;
    if (isCloser(toks[j])) return { v: [], i: j + 1 };
    const items: Val[] = [];
    let comma = false;
    for (;;) {
      const r = readValue(toks, j);
      if (!r) return null;
      items.push(r.v);
      j = r.i;
      const x = toks[j];
      if (!x || x.k !== "P") return null;
      if (x.s === closer) { j++; break; }
      if (x.s !== ",") return null;
      comma = true;
      j++;
      if (isCloser(toks[j])) { j++; break; }
    }
    if (t.s === "(" && items.length === 1 && !comma) return { v: items[0] as Val, i: j };
    return { v: items, i: j };
  }
  return null;
}

function scan(toks: Tok[]): { k: string; v: Val }[] {
  const tuples: { k: string; v: Val }[] = [];
  const arms: { k: string; v: Val }[] = [];
  const isP = (x: Tok | undefined, s: string): boolean => x !== undefined && x.k === "P" && x.s === s;
  let i = 0;
  while (i < toks.length) {
    const t = toks[i] as Tok;
    const a = toks[i + 1];
    if (isP(t, "(") && a && a.k === "STR" && isP(toks[i + 2], ",")) {
      const r = readValue(toks, i + 3);
      if (!r) return fail("tuple value");
      if (isP(toks[r.i], ")")) {
        tuples.push({ k: a.s, v: r.v });
        i = r.i + 1;
        continue;
      }
      i++;
      continue;
    }
    if (t.k === "STR") {
      const b = toks[i + 2];
      if (isP(a, "|") && b && b.k === "STR") return fail("or-pattern");
      if (isP(a, "=>")) {
        const r = readValue(toks, i + 2);
        if (!r || !(isP(toks[r.i], ",") || isP(toks[r.i], "}"))) return fail("arm value");
        arms.push({ k: t.s, v: r.v });
        i = r.i;
        continue;
      }
    }
    i++;
  }
  return tuples.length > 0 ? tuples : arms;
}

type T =
  | { kind: "text" | "bytes" | "bool" | "none" | "i64" | "u64" | "f64" | "json" }
  | { kind: "list"; item: T }
  | { kind: "tuple"; items: T[] }
  | { kind: "map"; key: T; val: T }
  | { kind: "record"; fields: { name: string; type: T }[] }
  | { kind: "union"; alts: T[] };

function same(a: T, b: T): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "list" && b.kind === "list") return same(a.item, b.item);
  if (a.kind === "tuple" && b.kind === "tuple") {
    return a.items.length === b.items.length && a.items.every((x, k) => same(x, b.items[k] as T));
  }
  if (a.kind === "map" && b.kind === "map") return same(a.key, b.key) && same(a.val, b.val);
  if (a.kind === "record" && b.kind === "record") {
    return a.fields.length === b.fields.length &&
      a.fields.every((f) => b.fields.some((g) => g.name === f.name && same(f.type, g.type)));
  }
  if (a.kind === "union" && b.kind === "union") {
    return a.alts.every((x) => b.alts.some((y) => same(x, y))) && b.alts.every((y) => a.alts.some((x) => same(x, y)));
  }
  return true;
}

function inJson(b: T): boolean {
  switch (b.kind) {
    case "none": case "bool": case "f64": case "text": case "json": return true;
    case "list": return inJson(b.item);
    case "tuple": return b.items.every(inJson);
    case "map": return b.key.kind === "text" && inJson(b.val);
    case "record": return b.fields.every((f) => inJson(f.type));
    case "union": return b.alts.every(inJson);
    default: return false;
  }
}

function covers(a: T, b: T): boolean {
  if (same(a, b)) return true;
  if (a.kind === "json" && inJson(b)) return true;
  if (a.kind === "list" && b.kind === "list" && covers(a.item, b.item)) return true;
  if (a.kind === "tuple" && b.kind === "tuple" && a.items.length === b.items.length &&
      a.items.every((x, k) => covers(x, b.items[k] as T))) return true;
  if (a.kind === "map" && b.kind === "map" && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.kind === "record" && b.kind === "record" &&
      a.fields.every((f) => b.fields.some((g) => g.name === f.name && covers(f.type, g.type)))) return true;
  if (a.kind === "union" && a.alts.some((x) => covers(x, b))) return true;
  if (b.kind === "union" && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function normShape(x: string): string {
  const t = x.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "");
  const m = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s.exec(t);
  if (!m) return t;
  return "map[" + normShape(m[1] as string) + ", " + normShape(m[2] as string) + "]";
}

function parseShape(text: string): T {
  const semi = text.indexOf(";");
  let s = normShape(semi >= 0 ? text.slice(0, semi) : text);
  s = s.replace(/(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g, (_m, p: string, l: string) => p + l + "64");
  const toks: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === " " || c === "\t" || c === "\r" || c === "\n") { i++; continue; }
    if ("[],|:".includes(c)) { toks.push(c); i++; continue; }
    if (/[A-Za-z0-9_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-z0-9_]/.test(s[j] as string)) j++;
      toks.push(s.slice(i, j));
      i = j;
      continue;
    }
    return fail("bad shape char");
  }
  let p = 0;
  const expect = (x: string): void => {
    if (toks[p] !== x) fail("shape: expected " + x);
    p++;
  };
  const simple = ["text", "bytes", "bool", "none", "i64", "u64", "f64", "json"];
  const parseType = (depth: number): T => {
    const alts: T[] = [parseAlt(depth)];
    while (toks[p] === "|") {
      p++;
      alts.push(parseAlt(depth));
    }
    if (alts.length === 1) return alts[0] as T;
    for (let j = 1; j < alts.length; j++) {
      for (let k = 0; k < j; k++) if (covers(alts[k] as T, alts[j] as T)) fail("covered alternative");
    }
    return { kind: "union", alts };
  };
  const parseAlt = (depth: number): T => {
    const w = toks[p];
    if (w === undefined) return fail("shape: end");
    p++;
    if (simple.includes(w)) return { kind: w } as T;
    if (w !== "tuple" && w !== "list" && w !== "map" && w !== "record") return fail("shape: unknown word");
    if (depth + 1 > 16) return fail("shape: too deep");
    const d = depth + 1;
    expect("[");
    let r: T;
    if (w === "list") {
      r = { kind: "list", item: parseType(d) };
    } else if (w === "map") {
      const key = parseType(d);
      expect(",");
      r = { kind: "map", key, val: parseType(d) };
    } else if (w === "tuple") {
      const items: T[] = [parseType(d)];
      while (toks[p] === ",") { p++; items.push(parseType(d)); }
      r = { kind: "tuple", items };
    } else {
      const fields: { name: string; type: T }[] = [];
      for (;;) {
        const nm = toks[p];
        if (nm === undefined || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) return fail("shape: field name");
        if (fields.some((f) => f.name === nm)) return fail("shape: dup field");
        p++;
        expect(":");
        fields.push({ name: nm, type: parseType(d) });
        if (toks[p] === ",") { p++; continue; }
        break;
      }
      r = { kind: "record", fields };
    }
    expect("]");
    return r;
  };
  const t = parseType(0);
  if (p !== toks.length) fail("shape: trailing");
  return t;
}

function fit(v: Val, t: T): boolean {
  switch (t.kind) {
    case "text": return typeof v === "string";
    case "bool": return typeof v === "boolean";
    case "none": return v === null;
    case "f64": return typeof v === "number";
    case "i64": return typeof v === "number" && Number.isInteger(v) && v >= -(2 ** 63) && v < 2 ** 63;
    case "u64": return typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 2 ** 64;
    case "json": return true;
    case "list": return Array.isArray(v) && v.every((x) => fit(x, t.item));
    case "tuple": return Array.isArray(v) && v.length === t.items.length && v.every((x, k) => fit(x, t.items[k] as T));
    case "union": return t.alts.some((a) => fit(v, a));
    default: return false;
  }
}

function sameVal(a: Val, b: Val): boolean {
  if (Array.isArray(a)) return Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b);
  return Object.is(a, b);
}

export default function rust_carried_table(src: string, shape: string | null): Record<string, Json> {
  const entries = scan(lex(src));
  if (entries.length === 0) fail("no carried entries");
  if (shape !== null && shape !== "") {
    const t = parseShape(shape);
    if (t.kind !== "map") fail("shape is not a map");
    else {
      for (const e of entries) {
        if (!fit(e.k, t.key) || !fit(e.v, t.val)) fail("shape misfit");
      }
    }
  }
  const out: Record<string, Json> = {};
  const seen = new Map<string, Val>();
  for (const e of entries) {
    if (seen.has(e.k)) {
      if (!sameVal(seen.get(e.k) as Val, e.v)) fail("duplicate key");
    }
    seen.set(e.k, e.v);
    Object.defineProperty(out, e.k, { value: e.v, enumerable: true, writable: true, configurable: true });
  }
  return out;
}
