const HEX = /^[0-9a-fA-F]/;
const CHAR = /^'((?:[^'\\]|\\[nrt0\\'"]|\\x[0-9a-fA-F]{2}|\\u\{[0-9a-fA-F_]{1,8}\}))'/su;
const NUMRE = /^(?:(0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+)|([0-9][0-9_]*)(\.[0-9][0-9_]*)?([eE][+-]?[0-9][0-9_]*)?)(?:_?(u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64))?/;
const TWO = new Set(['=>', '->', '::', '..']);
const WSP = ' \t\r\n';
const isAl = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
const isDg = (c) => c >= '0' && c <= '9';

function decode(body) {
  let out = '';
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c !== '\\') { out += c; i++; continue; }
    const d = body[i + 1];
    if (d === 'n') { out += '\n'; i += 2; }
    else if (d === 'r') { out += '\r'; i += 2; }
    else if (d === 't') { out += '\t'; i += 2; }
    else if (d === '0') { out += '\0'; i += 2; }
    else if (d === '\\' || d === "'" || d === '"') { out += d; i += 2; }
    else if (d === 'x') {
      const h = body.slice(i + 2, i + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) throw new Error('bad \\x escape');
      out += String.fromCharCode(parseInt(h, 16));
      i += 4;
    } else if (d === 'u') {
      if (body[i + 2] !== '{') throw new Error('bad \\u escape');
      const e = body.indexOf('}', i + 3);
      if (e < 0) throw new Error('bad \\u escape');
      const hex = body.slice(i + 3, e).replace(/_/g, '');
      if (hex === '' || !HEX.test(hex)) throw new Error('bad \\u escape');
      const cp = parseInt(hex, 16);
      out += String.fromCodePoint(cp);
      i = e + 1;
    } else if (d === '\n' || d === '\r') {
      i += 2;
      while (i < body.length && WSP.includes(body[i])) i++;
    } else throw new Error('unknown escape');
  }
  return out;
}

function tokenize(src) {
  const n = src.length;
  const toks = [];
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (WSP.includes(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      let depth = 1;
      i += 2;
      while (depth > 0 && i < n) {
        if (src[i] === '/' && src[i + 1] === '*') { depth++; i += 2; }
        else if (src[i] === '*' && src[i + 1] === '/') { depth--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === 'b' || c === 'r') {
      const m = /^b?r(#*)"/.exec(src.slice(i, i + 32));
      if (m) {
        const start = i + m[0].length;
        const close = '"' + m[1];
        const e = src.indexOf(close, start);
        if (e < 0) throw new Error('unterminated raw string');
        toks.push({ t: 'STR', v: src.slice(start, e) });
        i = e + close.length;
        continue;
      }
    }
    if (c === '"' || (c === 'b' && src[i + 1] === '"')) {
      const start = i + (c === 'b' ? 2 : 1);
      let j = start;
      for (;;) {
        if (j >= n) throw new Error('unterminated string');
        const ch = src[j];
        if (ch === '\\') j += 2;
        else if (ch === '"') break;
        else j++;
      }
      toks.push({ t: 'STR', v: decode(src.slice(start, j)) });
      i = j + 1;
      continue;
    }
    if (c === "'") {
      const m = CHAR.exec(src.slice(i, i + 16));
      if (m) {
        toks.push({ t: 'CHR', v: decode(m[1]) });
        i += m[0].length;
      } else {
        toks.push({ t: 'P', v: "'" });
        i++;
      }
      continue;
    }
    if (isDg(c)) {
      const m = NUMRE.exec(src.slice(i, i + 64));
      const radix = m[1];
      const suf = m[5];
      const body = (radix || m[2] + (m[3] || '') + (m[4] || '')).replace(/_/g, '');
      let v;
      let bad = false;
      if (radix && body.length === 2) { bad = true; v = NaN; }
      else {
        v = Number(body);
        const intShaped = radix || (!m[3] && !m[4]);
        if (!isFinite(v)) bad = true;
        else if (intShaped && BigInt(body) !== BigInt(v)) bad = true;
        if (!bad && suf === 'f32' && !body.startsWith('0x') && Math.fround(v) !== v) bad = true;
      }
      toks.push({ t: 'NUM', v, bad });
      i += m[0].length;
      continue;
    }
    if (isAl(c)) {
      let j = i + 1;
      while (j < n && (isAl(src[j]) || isDg(src[j]))) j++;
      const w = src.slice(i, j);
      if (w === 'true' || w === 'false') toks.push({ t: 'BOOL', v: w === 'true' });
      else toks.push({ t: 'IDENT', v: w });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO.has(two)) { toks.push({ t: 'P', v: two }); i += 2; continue; }
    toks.push({ t: 'P', v: c });
    i++;
  }
  return toks;
}

const isP = (t, v) => t !== undefined && t.t === 'P' && t.v === v;
const isI = (t, v) => t !== undefined && t.t === 'IDENT' && t.v === v;

const INTR = {
  u8: [0, 255], u16: [0, 65535], u32: [0, 4294967295],
  i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647],
  u64: [0, 2 ** 53], usize: [0, 2 ** 53], u128: [0, 2 ** 53],
  i64: [-(2 ** 53), 2 ** 53], isize: [-(2 ** 53), 2 ** 53], i128: [-(2 ** 53), 2 ** 53],
};

function cast(toks, j, x) {
  if (!isI(toks[j], 'as')) return { v: x, next: j };
  const ty = toks[j + 1];
  if (ty === undefined || ty.t !== 'IDENT') throw new Error('bad cast');
  const name = ty.v;
  if (name === 'f64') return { v: x, next: j + 2 };
  if (name === 'f32') {
    if (Math.fround(x) !== x) throw new Error('bad f32 cast');
    return { v: x, next: j + 2 };
  }
  const r = INTR[name];
  if (!r) throw new Error('bad cast');
  if (!Number.isInteger(x) || x < r[0] || x > r[1]) throw new Error('cast out of range');
  return { v: x === 0 ? 0 : x, next: j + 2 };
}

function readValue(toks, i) {
  let t = toks[i];
  if (t === undefined) return null;
  if (isP(t, '&')) {
    while (isP(toks[i], '&')) i++;
    return readValue(toks, i);
  }
  if (t.t === 'STR' || t.t === 'CHR' || t.t === 'BOOL') return { v: t.v, next: i + 1 };
  if (t.t === 'NUM') {
    if (t.bad) throw new Error('inexact literal');
    return cast(toks, i + 1, t.v);
  }
  if (isP(t, '-') && toks[i + 1] !== undefined && toks[i + 1].t === 'NUM') {
    const u = toks[i + 1];
    if (u.bad) throw new Error('inexact literal');
    return cast(toks, i + 2, -u.v);
  }
  if (isI(t, 'None')) return { v: null, next: i + 1 };
  if (isI(t, 'Some')) {
    if (!isP(toks[i + 1], '(')) return null;
    const a = toks[i + 2];
    if (a !== undefined && a.t === 'IDENT' && (a.v === 'Some' || a.v === 'None')) throw new Error('nested Option');
    const r = readValue(toks, i + 2);
    if (!r || !isP(toks[r.next], ')')) return null;
    return { v: r.v, next: r.next + 1 };
  }
  if (isP(t, '[') || isP(t, '(')) {
    const closer = t.v === '[' ? ']' : ')';
    const items = [];
    let comma = false;
    let j = i + 1;
    for (;;) {
      if (isP(toks[j], closer)) { j++; break; }
      const r = readValue(toks, j);
      if (!r) return null;
      items.push(r.v);
      j = r.next;
      if (isP(toks[j], ',')) { comma = true; j++; continue; }
      if (isP(toks[j], closer)) { j++; break; }
      return null;
    }
    if (t.v === '(' && items.length === 1 && !comma) return { v: items[0], next: j };
    return { v: items, next: j };
  }
  return null;
}

function entries(toks) {
  const tuples = [];
  const arms = [];
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (isP(t, '(') && toks[i + 1] && toks[i + 1].t === 'STR' && isP(toks[i + 2], ',')) {
      const r = readValue(toks, i + 3);
      if (!r) throw new Error('tuple without value');
      if (isP(toks[r.next], ')')) {
        tuples.push([toks[i + 1].v, r.v]);
        i = r.next + 1;
        continue;
      }
      i++;
      continue;
    }
    if (t.t === 'STR') {
      if (isP(toks[i + 1], '|') && toks[i + 2] && toks[i + 2].t === 'STR') throw new Error('or-pattern');
      if (isP(toks[i + 1], '=>')) {
        const r = readValue(toks, i + 2);
        if (r && (isP(toks[r.next], ',') || isP(toks[r.next], '}'))) {
          arms.push([t.v, r.v]);
          i = r.next;
          continue;
        }
        throw new Error('bad arm');
      }
    }
    i++;
  }
  return tuples.length ? tuples : arms;
}

const trimSt = (s) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
function norm(s) {
  s = trimSt(s);
  const m = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s.exec(s);
  if (m) return 'map[' + norm(m[1]) + ', ' + norm(m[2]) + ']';
  return s;
}

const PRIM = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);

function same(a, b) {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'tuple':
      return a.items.length === b.items.length && a.items.every((x, i) => same(x, b.items[i]));
    case 'list': return same(a.item, b.item);
    case 'map': return same(a.key, b.key) && same(a.val, b.val);
    case 'record':
      return a.fields.length === b.fields.length &&
        a.fields.every(([n, t]) => b.fields.some(([m, u]) => m === n && same(t, u)));
    case 'union':
      return a.alts.every((x) => b.alts.some((y) => same(x, y))) &&
        b.alts.every((y) => a.alts.some((x) => same(x, y)));
    default: return true;
  }
}

function jsonAcc(b) {
  switch (b.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'list': return jsonAcc(b.item);
    case 'tuple': return b.items.every(jsonAcc);
    case 'map': return b.key.k === 'text' && jsonAcc(b.val);
    case 'record': return b.fields.every(([, t]) => jsonAcc(t));
    case 'union': return b.alts.every(jsonAcc);
    default: return false;
  }
}

function covers(a, b) {
  if (same(a, b)) return true;
  if (a.k === 'json' && jsonAcc(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
    a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
    a.fields.every(([n, t]) => b.fields.some(([m, u]) => m === n && covers(t, u)))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function parseShape(text) {
  const toks = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (WSP.includes(c)) { i++; continue; }
    if (isAl(c)) {
      let j = i + 1;
      while (j < text.length && (isAl(text[j]) || isDg(text[j]))) j++;
      toks.push(text.slice(i, j));
      i = j;
    } else if ('[],|:'.includes(c)) { toks.push(c); i++; }
    else throw new Error('bad shape char');
  }
  let p = 0;
  const expect = (s) => { if (toks[p] !== s) throw new Error('bad shape'); p++; };
  function type(d) {
    const alts = [alt(d)];
    while (toks[p] === '|') { p++; alts.push(alt(d)); }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let k = 0; k < j; k++) if (covers(alts[k], alts[j])) throw new Error('covered alternative');
    }
    return { k: 'union', alts };
  }
  function alt(d) {
    const w = toks[p++];
    if (w === undefined) throw new Error('bad shape');
    if (PRIM.has(w)) return { k: w };
    if (w === 'tuple' || w === 'list' || w === 'map' || w === 'record') {
      if (d + 1 > 16) throw new Error('too deep');
      expect('[');
      let r;
      if (w === 'tuple') {
        const items = [type(d + 1)];
        while (toks[p] === ',') { p++; items.push(type(d + 1)); }
        r = { k: 'tuple', items };
      } else if (w === 'list') r = { k: 'list', item: type(d + 1) };
      else if (w === 'map') {
        const key = type(d + 1);
        expect(',');
        r = { k: 'map', key, val: type(d + 1) };
      } else {
        const fields = [];
        const names = new Set();
        for (;;) {
          const nm = toks[p++];
          if (nm === undefined || !isAl(nm[0])) throw new Error('bad field');
          if (names.has(nm)) throw new Error('dup field');
          names.add(nm);
          expect(':');
          fields.push([nm, type(d + 1)]);
          if (toks[p] === ',') { p++; continue; }
          break;
        }
        r = { k: 'record', fields };
      }
      expect(']');
      return r;
    }
    throw new Error('bad shape word');
  }
  const t = type(0);
  if (p !== toks.length) throw new Error('trailing shape');
  return t;
}

function fits(v, T) {
  switch (T.k) {
    case 'text': return typeof v === 'string';
    case 'bool': return typeof v === 'boolean';
    case 'none': return v === null;
    case 'f64': return typeof v === 'number';
    case 'i64': return typeof v === 'number' && Number.isInteger(v) && v >= -9223372036854775808 && v < 9223372036854775808;
    case 'u64': return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 18446744073709551616;
    case 'json': return true;
    case 'list': return Array.isArray(v) && v.every((x) => fits(x, T.item));
    case 'tuple': return Array.isArray(v) && v.length === T.items.length && v.every((x, i) => fits(x, T.items[i]));
    case 'union': return T.alts.some((a) => fits(v, a));
    default: return false;
  }
}

export default function rust_carried_table(src, shape) {
  const ents = entries(tokenize(src));
  if (ents.length === 0) throw new Error('no carried entries found');
  if (shape !== null && shape !== undefined && shape !== '') {
    let s = shape;
    const sc = s.indexOf(';');
    if (sc >= 0) s = s.slice(0, sc);
    s = norm(s);
    s = s.replace(/(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g, '$1$264');
    const T = parseShape(s);
    if (T.k !== 'map') throw new Error('shape is not a map type');
    for (const [k, v] of ents) {
      if (!fits(k, T.key) || !fits(v, T.val)) throw new Error('shape misfit');
    }
  }
  const out = {};
  for (const [k, v] of ents) {
    if (Object.hasOwn(out, k)) {
      const e = out[k];
      const ok = Array.isArray(e)
        ? Array.isArray(v) && JSON.stringify(e) === JSON.stringify(v)
        : Object.is(e, v);
      if (!ok) throw new Error('duplicate key with different value');
    }
    Object.defineProperty(out, k, { value: v, writable: true, enumerable: true, configurable: true });
  }
  return out;
}
