const fail = (m) => { throw new Error('rust carried table: ' + m); };
const isHex = (c) => /^[0-9a-fA-F]$/.test(c);

function unescape(body) {
  let out = '';
  let i = 0;
  const n = body.length;
  while (i < n) {
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
      let v = /^[0-9a-fA-F]{2}$/.test(h) ? parseInt(h, 16) : parseInt(h, 16);
      if (Number.isNaN(v)) v = 0;
      out += String.fromCharCode(v);
      i += 4;
    } else if (d === 'u') {
      if (body[i + 2] !== '{') fail('bad unicode escape');
      const e = body.indexOf('}', i + 3);
      if (e < 0) fail('unterminated unicode escape');
      const hex = body.slice(i + 3, e).replace(/_/g, '');
      if (hex === '') fail('empty unicode escape');
      const f = hex[0];
      if (!(isHex(f) || /\s/.test(f) || f === '+' || f === '-')) fail('bad unicode escape');
      let cp;
      if (/^[0-9a-fA-F]+$/.test(hex)) cp = parseInt(hex, 16);
      else {
        const m = /^\s*([+-]?)(?:0x)?([0-9a-fA-F]*)/.exec(hex);
        cp = m[2] === '' ? 0 : parseInt(m[2], 16);
        if (m[1] === '-' && cp !== 0) fail('negative escape');
      }
      out += String.fromCodePoint(cp);
      i = e + 1;
    } else if (d === '\n' || d === '\r') {
      i += 2;
      while (i < n && (body[i] === ' ' || body[i] === '\t' || body[i] === '\r' || body[i] === '\n')) i++;
    } else fail('unknown escape');
  }
  return out;
}

const NUMRE = /^(?:(0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+)|([0-9][0-9_]*)(\.[0-9][0-9_]*)?([eE][+-]?[0-9][0-9_]*)?)(_?(?:u8|u16|u32|u64|u128|usize|i8|i16|i32|i64|i128|isize|f32|f64))?/;

function lexNumber(src, i) {
  const m = NUMRE.exec(src.slice(i, i + 64));
  const suffix = m[5] ? m[5].replace(/^_/, '') : '';
  let v;
  let bad = false;
  let hex = false;
  if (m[1] !== undefined) {
    const body = m[1].replace(/_/g, '');
    hex = body.startsWith('0x');
    if (body.slice(2) === '') { bad = true; v = NaN; }
    else {
      v = Number(body);
      bad = !(Number.isFinite(v) && BigInt(body) === BigInt(v));
    }
  } else {
    const body = (m[2] + (m[3] || '') + (m[4] || '')).replace(/_/g, '');
    v = Number(body);
    if (!m[3] && !m[4]) bad = !(Number.isFinite(v) && BigInt(body) === BigInt(v));
    else bad = !Number.isFinite(v);
  }
  if (!bad && suffix === 'f32' && !hex && Math.fround(v) !== v) bad = true;
  return { len: m[0].length, v, bad };
}

function lex(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const j = src.indexOf('\n', i); i = j < 0 ? n : j; continue; }
    if (c === '/' && src[i + 1] === '*') {
      let d = 1;
      i += 2;
      while (i < n && d > 0) {
        if (src[i] === '/' && src[i + 1] === '*') { d++; i += 2; }
        else if (src[i] === '*' && src[i + 1] === '/') { d--; i += 2; }
        else i++;
      }
      continue;
    }
    if (c === 'b' || c === 'r') {
      const rm = /^b?r(#*)"/.exec(src.slice(i, i + 32));
      if (rm) {
        const start = i + rm[0].length;
        const closing = '"' + rm[1];
        const e = src.indexOf(closing, start);
        if (e < 0) fail('unterminated raw string');
        out.push({ k: 'STR', v: src.slice(start, e) });
        i = e + closing.length;
        continue;
      }
    }
    if (c === '"' || (c === 'b' && src[i + 1] === '"')) {
      const start = i + (c === 'b' ? 2 : 1);
      let j = start;
      while (j < n && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      if (j >= n) fail('unterminated string');
      out.push({ k: 'STR', v: unescape(src.slice(start, j)) });
      i = j + 1;
      continue;
    }
    if (c === "'") {
      const w = src.slice(i, i + 14);
      let m;
      if ((m = /^'\\[nrt0\\'"]'/.exec(w)) || (m = /^'\\x[0-9a-fA-F]{2}'/.exec(w)) || (m = /^'\\u\{[0-9a-fA-F_]{1,8}\}'/.exec(w))) {
        out.push({ k: 'CHR', v: unescape(m[0].slice(1, -1)) });
        i += m[0].length;
        continue;
      }
      const cp = src.codePointAt(i + 1);
      if (cp !== undefined && cp !== 39 && cp !== 92) {
        const ch = String.fromCodePoint(cp);
        if (src[i + 1 + ch.length] === "'") {
          out.push({ k: 'CHR', v: ch });
          i += ch.length + 2;
          continue;
        }
      }
      out.push({ k: 'P', v: "'" });
      i++;
      continue;
    }
    if (c >= '0' && c <= '9') {
      const r = lexNumber(src, i);
      out.push({ k: 'NUM', v: r.v, bad: r.bad });
      i += r.len;
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_') {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      if (w === 'true' || w === 'false') out.push({ k: 'BOOL', v: w === 'true' });
      else out.push({ k: 'IDENT', v: w });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '=>' || two === '->' || two === '::' || two === '..') { out.push({ k: 'P', v: two }); i += 2; continue; }
    out.push({ k: 'P', v: c });
    i++;
  }
  return out;
}

const isP = (t, s) => t !== undefined && t.k === 'P' && t.v === s;
const isI = (t, s) => t !== undefined && t.k === 'IDENT' && t.v === s;
const P53 = 9007199254740992;
const INT_RANGE = {
  u8: [0, 255], u16: [0, 65535], u32: [0, 4294967295],
  i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647],
  u64: [0, P53], usize: [0, P53], u128: [0, P53],
  i64: [-P53, P53], isize: [-P53, P53], i128: [-P53, P53],
};

function cast(T, q, x) {
  if (!isI(T[q], 'as')) return { v: x, next: q };
  const t = T[q + 1];
  if (t === undefined || t.k !== 'IDENT') fail('bad cast');
  const name = t.v;
  if (name === 'f64') return { v: x, next: q + 2 };
  if (name === 'f32') {
    if (Math.fround(x) !== x) fail('inexact f32 cast');
    return { v: x, next: q + 2 };
  }
  const r = INT_RANGE[name];
  if (!r) fail('unknown cast');
  if (!Number.isInteger(x) || x < r[0] || x > r[1]) fail('cast out of range');
  return { v: Object.is(x, -0) ? 0 : x, next: q + 2 };
}

function readValue(T, p) {
  let t = T[p];
  if (t === undefined) return null;
  while (isP(t, '&')) { p++; t = T[p]; if (t === undefined) return null; }
  if (t.k === 'STR' || t.k === 'CHR' || t.k === 'BOOL') return { v: t.v, next: p + 1 };
  if (t.k === 'NUM') {
    if (t.bad) fail('inexact number');
    return cast(T, p + 1, t.v);
  }
  if (isP(t, '-') && T[p + 1] !== undefined && T[p + 1].k === 'NUM') {
    const u = T[p + 1];
    if (u.bad) fail('inexact number');
    return cast(T, p + 2, -u.v);
  }
  if (isI(t, 'None')) return { v: null, next: p + 1 };
  if (isI(t, 'Some') && isP(T[p + 1], '(')) {
    const a = T[p + 2];
    if (isI(a, 'Some') || isI(a, 'None')) fail('nested option');
    const r = readValue(T, p + 2);
    if (!r || !isP(T[r.next], ')')) return null;
    return { v: r.v, next: r.next + 1 };
  }
  if (isP(t, '[') || isP(t, '(')) {
    const open = t.v;
    const close = open === '[' ? ']' : ')';
    const items = [];
    let q = p + 1;
    let comma = false;
    if (isP(T[q], close)) return { v: [], next: q + 1 };
    for (;;) {
      const r = readValue(T, q);
      if (!r) return null;
      items.push(r.v);
      q = r.next;
      if (isP(T[q], ',')) {
        comma = true;
        q++;
        if (isP(T[q], close)) { q++; break; }
      } else if (isP(T[q], close)) { q++; break; }
      else return null;
    }
    if (open === '(' && items.length === 1 && !comma) return { v: items[0], next: q };
    return { v: items, next: q };
  }
  return null;
}

function entries(T) {
  const tuples = [];
  const arms = [];
  let i = 0;
  while (i < T.length) {
    const t = T[i];
    if (isP(t, '(') && T[i + 1] && T[i + 1].k === 'STR' && isP(T[i + 2], ',')) {
      const r = readValue(T, i + 3);
      if (!r) fail('tuple without value');
      if (isP(T[r.next], ')')) { tuples.push([T[i + 1].v, r.v]); i = r.next + 1; continue; }
      i++;
      continue;
    }
    if (t.k === 'STR') {
      if (isP(T[i + 1], '|') && T[i + 2] && T[i + 2].k === 'STR') fail('or-pattern');
      if (isP(T[i + 1], '=>')) {
        const r = readValue(T, i + 2);
        if (r && (isP(T[r.next], ',') || isP(T[r.next], '}'))) { arms.push([t.v, r.v]); i = r.next; continue; }
        fail('arm without readable value');
      }
    }
    i++;
  }
  return tuples.length ? tuples : arms;
}

const WS = '[ \\t\\r\\n]';
const TRIMST = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDTH = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;

function norm(s) {
  s = s.replace(TRIMST, '');
  const m = ARROW.exec(s);
  if (m) return 'map[' + norm(m[1]) + ', ' + norm(m[2]) + ']';
  return s;
}

const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];

function same(a, b) {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'list': return same(a.t, b.t);
    case 'tuple': return a.items.length === b.items.length && a.items.every((x, i) => same(x, b.items[i]));
    case 'map': return same(a.key, b.key) && same(a.val, b.val);
    case 'record': return a.fields.length === b.fields.length && a.fields.every((f) => b.fields.some((g) => g.n === f.n && same(f.t, g.t)));
    case 'union': return a.alts.every((x) => b.alts.some((y) => same(x, y))) && b.alts.every((x) => a.alts.some((y) => same(x, y)));
    default: return true;
  }
}

function jsonOK(b) {
  switch (b.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'list': return jsonOK(b.t);
    case 'tuple': return b.items.every(jsonOK);
    case 'map': return b.key.k === 'text' && jsonOK(b.val);
    case 'record': return b.fields.every((f) => jsonOK(f.t));
    case 'union': return b.alts.every(jsonOK);
    default: return false;
  }
}

function covers(a, b) {
  if (same(a, b)) return true;
  if (a.k === 'json' && jsonOK(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.t, b.t)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length && a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' && a.fields.every((f) => b.fields.some((g) => g.n === f.n && covers(f.t, g.t)))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  return false;
}

function parseType(text) {
  const ts = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (/[A-Za-z0-9_]/.test(c)) {
      let j = i + 1;
      while (j < text.length && /[A-Za-z0-9_]/.test(text[j])) j++;
      ts.push({ w: text.slice(i, j) });
      i = j;
      continue;
    }
    if ('[],|:'.includes(c)) { ts.push({ p: c }); i++; continue; }
    fail('bad shape character');
  }
  let pos = 0;
  const punct = (c) => {
    if (!ts[pos] || ts[pos].p !== c) fail('shape syntax');
    pos++;
  };
  const word = () => {
    if (!ts[pos] || ts[pos].w === undefined) fail('shape syntax');
    return ts[pos++].w;
  };
  const alt = (depth) => {
    const w = word();
    if (SCALARS.includes(w)) return { k: w };
    if (w !== 'tuple' && w !== 'list' && w !== 'map' && w !== 'record') fail('unknown type');
    const d = depth + 1;
    if (d > 16) fail('too deep');
    punct('[');
    let r;
    if (w === 'list') r = { k: 'list', t: union(d) };
    else if (w === 'map') { const key = union(d); punct(','); r = { k: 'map', key, val: union(d) }; }
    else if (w === 'tuple') {
      const items = [union(d)];
      while (ts[pos] && ts[pos].p === ',') { pos++; items.push(union(d)); }
      r = { k: 'tuple', items };
    } else {
      const fields = [];
      for (;;) {
        const n = word();
        if (!/^[A-Za-z_]/.test(n)) fail('bad field name');
        if (fields.some((f) => f.n === n)) fail('duplicate field');
        punct(':');
        fields.push({ n, t: union(d) });
        if (ts[pos] && ts[pos].p === ',') pos++;
        else break;
      }
      r = { k: 'record', fields };
    }
    punct(']');
    return r;
  };
  const union = (depth) => {
    const alts = [alt(depth)];
    while (ts[pos] && ts[pos].p === '|') { pos++; alts.push(alt(depth)); }
    if (alts.length === 1) return alts[0];
    for (let b = 1; b < alts.length; b++) for (let a = 0; a < b; a++) if (covers(alts[a], alts[b])) fail('covered alternative');
    return { k: 'union', alts };
  };
  const t = union(0);
  if (pos !== ts.length) fail('trailing shape text');
  return t;
}

function shapeType(shape) {
  let s = shape.split(';')[0];
  s = norm(s);
  s = s.replace(WIDTH, (_, p, l) => p + l + '64');
  return parseType(s);
}

function fit(v, T) {
  switch (T.k) {
    case 'text': return typeof v === 'string';
    case 'bool': return typeof v === 'boolean';
    case 'none': return v === null;
    case 'f64': return typeof v === 'number';
    case 'i64': return typeof v === 'number' && Number.isInteger(v) && v >= -(2 ** 63) && v < 2 ** 63;
    case 'u64': return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 2 ** 64;
    case 'json': return true;
    case 'list': return Array.isArray(v) && v.every((x) => fit(x, T.t));
    case 'tuple': return Array.isArray(v) && v.length === T.items.length && v.every((x, i) => fit(x, T.items[i]));
    case 'union': return T.alts.some((a) => fit(v, a));
    default: return false;
  }
}

export default function rust_carried_table(src, shape) {
  const ents = entries(lex(src));
  if (ents.length === 0) fail('no carried entries found');
  if (shape !== null && shape !== undefined && shape !== '') {
    const T = shapeType(shape);
    if (T.k !== 'map') fail('shape is not a map type');
    for (const [k, v] of ents) {
      if (!fit(k, T.key)) fail('key misfit');
      if (!fit(v, T.val)) fail('value misfit');
    }
  }
  const res = {};
  for (const [k, v] of ents) {
    if (Object.hasOwn(res, k)) {
      const old = res[k];
      const ok = Array.isArray(old) ? Array.isArray(v) && JSON.stringify(old) === JSON.stringify(v) : Object.is(old, v);
      if (!ok) fail('duplicate key with different value');
    }
    Object.defineProperty(res, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return res;
}
