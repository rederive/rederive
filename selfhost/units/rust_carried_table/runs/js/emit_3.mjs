const HEXD = /^[0-9a-fA-F]/;
const CHAR_RE = /'(?:[^'\\]|\\[nrt0\\'"]|\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F_]{1,8}\})'/uy;
const RAW_RE = /^b?r#*"/;
const NUM_RE = /(?:0x([0-9a-fA-F_]+)|0o([0-7_]+)|0b([01_]+)|(\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?))(?:_?(u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64))?/y;
const TRIM_ST = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDTH = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;

function fail(m) { throw new Error(m); }

function unesc(s) {
  let o = '';
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c !== '\\') { o += c; i++; continue; }
    const d = s[i + 1];
    if (d === 'n') { o += '\n'; i += 2; }
    else if (d === 'r') { o += '\r'; i += 2; }
    else if (d === 't') { o += '\t'; i += 2; }
    else if (d === '0') { o += '\0'; i += 2; }
    else if (d === '\\' || d === "'" || d === '"') { o += d; i += 2; }
    else if (d === 'x') {
      const h = s.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('bad \\x');
      o += String.fromCharCode(parseInt(h, 16)); i += 4;
    } else if (d === 'u') {
      if (s[i + 2] !== '{') fail('bad \\u');
      const j = s.indexOf('}', i + 3);
      if (j < 0) fail('bad \\u');
      const hex = s.slice(i + 3, j).replace(/_/g, '');
      if (hex === '' || !HEXD.test(hex)) fail('bad \\u');
      o += String.fromCodePoint(parseInt(hex, 16));
      i = j + 1;
    } else if (d === '\n' || d === '\r') {
      i += 2;
      while (i < s.length && ' \t\r\n'.includes(s[i])) i++;
    } else fail('unknown escape');
  }
  return o;
}

function numTok(m) {
  const suf = m[5];
  let body, radix = false, hex = false, intShaped;
  if (m[1] !== undefined) { body = '0x' + m[1]; radix = true; hex = true; }
  else if (m[2] !== undefined) { body = '0o' + m[2]; radix = true; }
  else if (m[3] !== undefined) { body = '0b' + m[3]; radix = true; }
  else body = m[4];
  body = body.replace(/_/g, '');
  let inexact = false, n;
  if (radix) {
    if (body.length <= 2) { inexact = true; n = 0; }
    else n = Number(body);
    intShaped = true;
  } else {
    n = Number(body);
    intShaped = !/[.eE]/.test(body);
  }
  if (!inexact) {
    if (!Number.isFinite(n)) inexact = true;
    else if (intShaped && BigInt(body) !== BigInt(n)) inexact = true;
  }
  if (!inexact && suf === 'f32' && !hex && Math.fround(n) !== n) inexact = true;
  return { k: 'NUM', v: n, inexact };
}

function lex(src) {
  const toks = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1; i += 2;
      while (i < n && d > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { d++; i += 2; }
        else if (src[i] === '*' && src[i + 1] === '/') { d--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === 'b' || c === 'r') {
      const m = RAW_RE.exec(src.slice(i, i + 32));
      if (m) {
        const hashes = m[0].replace(/[^#]/g, '').length;
        const close = '"' + '#'.repeat(hashes);
        const st = i + m[0].length;
        const e = src.indexOf(close, st);
        if (e < 0) fail('unterminated raw string');
        toks.push({ k: 'STR', v: src.slice(st, e) });
        i = e + close.length;
        continue;
      }
    }
    if (c === '"' || (c === 'b' && src[i + 1] === '"')) {
      let j = i + (c === '"' ? 1 : 2);
      const st = j;
      for (;;) {
        if (j >= n) fail('unterminated string');
        if (src[j] === '\\') j += 2;
        else if (src[j] === '"') break;
        else j++;
      }
      if (j >= n) fail('unterminated string');
      toks.push({ k: 'STR', v: unesc(src.slice(st, j)) });
      i = j + 1;
      continue;
    }
    if (c === "'") {
      CHAR_RE.lastIndex = i;
      const m = CHAR_RE.exec(src);
      if (m) {
        toks.push({ k: 'CHR', v: unesc(m[0].slice(1, -1)) });
        i += m[0].length;
      } else { toks.push({ k: 'P', v: "'" }); i++; }
      continue;
    }
    if (c >= '0' && c <= '9') {
      const sl = src.slice(i, i + 64);
      NUM_RE.lastIndex = 0;
      const m = NUM_RE.exec(sl);
      toks.push(numTok(m));
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      if (w === 'true' || w === 'false') toks.push({ k: 'BOOL', v: w === 'true' });
      else toks.push({ k: 'IDENT', v: w });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '=>' || two === '->' || two === '::' || two === '..') {
      toks.push({ k: 'P', v: two }); i += 2; continue;
    }
    toks.push({ k: 'P', v: c });
    i++;
  }
  return toks;
}

const isP = (t, v) => t && t.k === 'P' && t.v === v;
const isI = (t, v) => t && t.k === 'IDENT' && t.v === v;

function cast(toks, x, p) {
  if (!isI(toks[p], 'as')) return { v: x, next: p };
  const t = toks[p + 1];
  if (!t || t.k !== 'IDENT') fail('bad cast');
  const intIn = (lo, hi) => {
    if (!Number.isInteger(x) || x < lo || x > hi) fail('cast out of range');
    return { v: x === 0 ? 0 : x, next: p + 2 };
  };
  switch (t.v) {
    case 'f64': return { v: x, next: p + 2 };
    case 'f32': if (Math.fround(x) !== x) fail('f32'); return { v: x, next: p + 2 };
    case 'u8': return intIn(0, 255);
    case 'u16': return intIn(0, 65535);
    case 'u32': return intIn(0, 4294967295);
    case 'i8': return intIn(-128, 127);
    case 'i16': return intIn(-32768, 32767);
    case 'i32': return intIn(-2147483648, 2147483647);
    case 'u64': case 'usize': case 'u128': return intIn(0, 2 ** 53);
    case 'i64': case 'isize': case 'i128': return intIn(-(2 ** 53), 2 ** 53);
    default: fail('bad cast type');
  }
}

function readValue(toks, p) {
  while (isP(toks[p], '&')) p++;
  const t = toks[p];
  if (!t) return null;
  if (t.k === 'STR' || t.k === 'CHR' || t.k === 'BOOL') return { v: t.v, next: p + 1 };
  if (t.k === 'NUM') {
    if (t.inexact) fail('inexact');
    return cast(toks, t.v, p + 1);
  }
  if (isP(t, '-') && toks[p + 1] && toks[p + 1].k === 'NUM') {
    const u = toks[p + 1];
    if (u.inexact) fail('inexact');
    return cast(toks, -u.v, p + 2);
  }
  if (t.k === 'IDENT') {
    if (t.v === 'None') return { v: null, next: p + 1 };
    if (t.v === 'Some' && isP(toks[p + 1], '(')) {
      const a = toks[p + 2];
      if (a && a.k === 'IDENT' && (a.v === 'Some' || a.v === 'None')) fail('nested option');
      const r = readValue(toks, p + 2);
      if (!r || !isP(toks[r.next], ')')) return null;
      return { v: r.v, next: r.next + 1 };
    }
    return null;
  }
  if (isP(t, '[') || isP(t, '(')) {
    const closer = t.v === '[' ? ']' : ')';
    const items = [];
    let q = p + 1, comma = false;
    if (isP(toks[q], closer)) return { v: [], next: q + 1 };
    for (;;) {
      const r = readValue(toks, q);
      if (!r) return null;
      items.push(r.v);
      q = r.next;
      if (isP(toks[q], ',')) {
        comma = true; q++;
        if (isP(toks[q], closer)) { q++; break; }
      } else if (isP(toks[q], closer)) { q++; break; }
      else return null;
    }
    if (t.v === '(' && items.length === 1 && !comma) return { v: items[0], next: q };
    return { v: items, next: q };
  }
  return null;
}

function entries(toks) {
  const tuples = [], arms = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (isP(t, '(') && toks[i + 1] && toks[i + 1].k === 'STR' && isP(toks[i + 2], ',')) {
      const r = readValue(toks, i + 3);
      if (!r) fail('no value');
      if (isP(toks[r.next], ')')) { tuples.push([toks[i + 1].v, r.v]); i = r.next + 1; continue; }
      i++; continue;
    }
    if (t.k === 'STR') {
      if (isP(toks[i + 1], '|') && toks[i + 2] && toks[i + 2].k === 'STR') fail('or-pattern');
      if (isP(toks[i + 1], '=>')) {
        const r = readValue(toks, i + 2);
        if (r && (isP(toks[r.next], ',') || isP(toks[r.next], '}'))) {
          arms.push([t.v, r.v]); i = r.next; continue;
        }
        fail('bad arm');
      }
    }
    i++;
  }
  return tuples.length ? tuples : arms;
}

const SIMPLE = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);

function eq(a, b) {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'list': return eq(a.t, b.t);
    case 'tuple': return a.ts.length === b.ts.length && a.ts.every((x, i) => eq(x, b.ts[i]));
    case 'map': return eq(a.kt, b.kt) && eq(a.vt, b.vt);
    case 'record':
      return a.fs.length === b.fs.length && a.fs.every(([n, t]) => { const f = b.fs.find((g) => g[0] === n); return f && eq(t, f[1]); });
    case 'union':
      return a.alts.every((x) => b.alts.some((y) => eq(x, y))) && b.alts.every((y) => a.alts.some((x) => eq(x, y)));
    default: return true;
  }
}

function jin(t) {
  switch (t.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'list': return jin(t.t);
    case 'tuple': return t.ts.every(jin);
    case 'map': return t.kt.k === 'text' && jin(t.vt);
    case 'record': return t.fs.every((f) => jin(f[1]));
    case 'union': return t.alts.every(jin);
    default: return false;
  }
}

function covers(a, b) {
  if (eq(a, b)) return true;
  if (a.k === 'json' && jin(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.t, b.t)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.ts.length === b.ts.length && a.ts.every((x, i) => covers(x, b.ts[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.kt, b.kt) && covers(a.vt, b.vt)) return true;
  if (a.k === 'record' && b.k === 'record' &&
    a.fs.every(([n, t]) => { const f = b.fs.find((g) => g[0] === n); return f && covers(t, f[1]); })) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function parseType(text) {
  let p = 0;
  const ws = () => { while (p < text.length && ' \t\r\n'.includes(text[p])) p++; };
  const ident = () => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(p));
    if (!m) fail('bad type');
    p += m[0].length;
    return m[0];
  };
  const expect = (ch) => { ws(); if (text[p] !== ch) fail('bad type'); p++; };
  const union = (d) => {
    const alts = [alt(d)];
    ws();
    while (text[p] === '|') { p++; alts.push(alt(d)); ws(); }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++)
      for (let i = 0; i < j; i++) if (covers(alts[i], alts[j])) fail('covered');
    return { k: 'union', alts };
  };
  const alt = (d) => {
    ws();
    const w = ident();
    if (SIMPLE.has(w)) return { k: w };
    if (w !== 'tuple' && w !== 'list' && w !== 'map' && w !== 'record') fail('bad type');
    if (d + 1 > 16) fail('too deep');
    expect('[');
    let r;
    if (w === 'tuple') {
      const ts = [union(d + 1)];
      ws();
      while (text[p] === ',') { p++; ts.push(union(d + 1)); ws(); }
      r = { k: 'tuple', ts };
    } else if (w === 'list') r = { k: 'list', t: union(d + 1) };
    else if (w === 'map') {
      const kt = union(d + 1);
      expect(',');
      r = { k: 'map', kt, vt: union(d + 1) };
    } else {
      const fs = [];
      for (;;) {
        ws();
        const name = ident();
        if (fs.some((f) => f[0] === name)) fail('dup field');
        expect(':');
        fs.push([name, union(d + 1)]);
        ws();
        if (text[p] === ',') { p++; continue; }
        break;
      }
      r = { k: 'record', fs };
    }
    expect(']');
    return r;
  };
  const t = union(0);
  ws();
  if (p !== text.length) fail('trailing');
  return t;
}

function norm(s) {
  s = s.replace(TRIM_ST, '');
  const m = ARROW.exec(s);
  if (m) return 'map[' + norm(m[1]) + ', ' + norm(m[2]) + ']';
  return s;
}

function shapeType(shape) {
  let s = shape;
  const sc = s.indexOf(';');
  if (sc >= 0) s = s.slice(0, sc);
  s = norm(s);
  s = s.replace(WIDTH, (_, a, b) => a + b + '64');
  return parseType(s);
}

function fits(v, t) {
  switch (t.k) {
    case 'text': return typeof v === 'string';
    case 'bool': return typeof v === 'boolean';
    case 'none': return v === null;
    case 'f64': return typeof v === 'number';
    case 'i64': return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 63) && v < 2 ** 63;
    case 'u64': return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 2 ** 64;
    case 'json': return true;
    case 'list': return Array.isArray(v) && v.every((x) => fits(x, t.t));
    case 'tuple': return Array.isArray(v) && v.length === t.ts.length && v.every((x, i) => fits(x, t.ts[i]));
    case 'union': return t.alts.some((a) => fits(v, a));
    default: return false;
  }
}

export default function rust_carried_table(src, shape) {
  const toks = lex(src);
  const ents = entries(toks);
  if (ents.length === 0) fail('no entries');
  if (shape !== null && shape !== undefined && shape !== '') {
    const ty = shapeType(shape);
    if (ty.k !== 'map') fail('shape not a map');
    for (const [k, v] of ents) {
      if (!fits(k, ty.kt) || !fits(v, ty.vt)) fail('shape misfit');
    }
  }
  const res = {};
  for (const [k, v] of ents) {
    if (Object.hasOwn(res, k)) {
      const prev = res[k];
      const same = Array.isArray(prev)
        ? Array.isArray(v) && JSON.stringify(prev) === JSON.stringify(v)
        : !Array.isArray(v) && Object.is(prev, v);
      if (!same) fail('duplicate key');
    }
    Object.defineProperty(res, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return res;
}
