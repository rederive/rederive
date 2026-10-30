type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type V = Json | undefined | bigint;
type JMap = { [key: string]: Json };
type Ty =
  | { k: 'scalar'; name: string }
  | { k: 'tuple'; items: Ty[] }
  | { k: 'list'; item: Ty }
  | { k: 'map'; key: Ty; val: Ty }
  | { k: 'record'; fields: { name: string; ty: Ty }[] }
  | { k: 'union'; alts: Ty[] };

const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^-?(?:0|[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const KEYWORDS = ['tuple', 'list', 'map', 'record'];
const ESCAPED = new WeakSet<object>();

function fail(msg: string): never {
  throw new Error(msg);
}

function parseType(s: string): Ty {
  let pos = 0;
  const ws = (): void => {
    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t' || s[pos] === '\r' || s[pos] === '\n')) pos++;
  };
  const readName = (): string => {
    const m = NAME.exec(s.slice(pos));
    if (m === null) return fail('bad name');
    pos += m[0].length;
    return m[0];
  };
  const expect = (c: string): void => {
    ws();
    if (s[pos] !== c) fail('expected ' + c);
    pos++;
  };
  const parseUnion = (): Ty => {
    const alts: Ty[] = [parseAlt()];
    ws();
    while (s[pos] === '|') {
      pos++;
      alts.push(parseAlt());
      ws();
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const parseAlt = (): Ty => {
    ws();
    const name = readName();
    if (SCALARS.indexOf(name) >= 0) return { k: 'scalar', name };
    if (KEYWORDS.indexOf(name) < 0) return fail('unknown type');
    if (s[pos] !== '[') return fail('expected [');
    pos++;
    if (name === 'tuple') {
      const items: Ty[] = [];
      for (;;) {
        items.push(parseUnion());
        ws();
        if (s[pos] === ',') {
          pos++;
          continue;
        }
        expect(']');
        break;
      }
      return { k: 'tuple', items };
    }
    if (name === 'list') {
      const item = parseUnion();
      expect(']');
      return { k: 'list', item };
    }
    if (name === 'map') {
      const key = parseUnion();
      expect(',');
      const val = parseUnion();
      expect(']');
      return { k: 'map', key, val };
    }
    const fields: { name: string; ty: Ty }[] = [];
    for (;;) {
      ws();
      const fname = readName();
      for (const f of fields) if (f.name === fname) fail('dup field');
      expect(':');
      const ty = parseUnion();
      fields.push({ name: fname, ty });
      ws();
      if (s[pos] === ',') {
        pos++;
        continue;
      }
      expect(']');
      break;
    }
    return { k: 'record', fields };
  };
  const t = parseUnion();
  ws();
  if (pos !== s.length) fail('trailing');
  return t;
}

function isObj(v: V): v is JMap {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPlainMap(v: V): v is JMap {
  if (!isObj(v)) return false;
  const p: unknown = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function getOwn(o: JMap, k: string): Json | undefined {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function define(o: JMap, k: string, value: Json): void {
  Object.defineProperty(o, k, { value, enumerable: true, writable: true, configurable: true });
}

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function resolveTag(v: V): V {
  if (!isObj(v) || ESCAPED.has(v)) return v;
  const tag = getOwn(v, '__t');
  if (typeof tag !== 'string') return v;
  const x = getOwn(v, 'v');
  if (tag === 'num') {
    if (typeof x !== 'string') return fail('num v');
    if (x === 'NaN') return NaN;
    if (x === 'Infinity') return Infinity;
    if (x === '-Infinity') return -Infinity;
    if (x === '-0') return -0;
    if (!NUM_LITERAL.test(x)) return fail('num literal');
    return Number(x);
  }
  if (tag === 'bigint') {
    if (typeof x !== 'string' || !BIGINT_LITERAL.test(x)) return fail('bigint');
    return BigInt(x);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (x === undefined || x === null) return fail('obj v');
    const out: JMap = {};
    if (typeof x === 'string') {
      for (let i = 0; i < x.length; i++) define(out, String(i), x[i]);
    } else if (Array.isArray(x)) {
      for (const k of Object.keys(x)) define(out, k, x[Number(k)]);
    } else if (typeof x === 'object') {
      for (const k of Object.keys(x)) define(out, k, x[k]);
    }
    ESCAPED.add(out);
    return out;
  }
  return fail('unknown tag');
}

function render(x: number): string {
  return Object.is(x, -0) ? '-0' : String(x);
}

function bits(x: number): string {
  if (x !== x) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0).toString(16).padStart(8, '0');
  const lo = dv.getUint32(4).toString(16).padStart(8, '0');
  return hi + lo;
}

function esc(s: string): string {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) r += '\\"';
    else if (c === 92) r += '\\\\';
    else if (c === 8) r += '\\b';
    else if (c === 9) r += '\\t';
    else if (c === 10) r += '\\n';
    else if (c === 12) r += '\\f';
    else if (c === 13) r += '\\r';
    else if (c < 32) r += '\\u00' + c.toString(16).padStart(2, '0');
    else r += s[i];
  }
  return r + '"';
}

function canon(n: Json): string {
  if (n === null) return 'null';
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (typeof n === 'number') return String(n);
  if (typeof n === 'string') return esc(n);
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  let o: JMap = n;
  if (o.t === 'f64') o = { bits: o.bits, t: 'f64' };
  else if (o.t === 'throw') o = { t: 'throw' };
  const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + keys.map((k) => esc(k) + ':' + canon(o[k])).join(',') + '}';
}

function sortKey(n: Json): string {
  if (isObj(n) && n.t === 'text' && typeof n.v === 'string') return n.v;
  return canon(n);
}

function sortPairs(pairs: { sk: string; pair: Json }[]): Json[] {
  const idx = pairs.map((p, i) => ({ p, i }));
  idx.sort((a, b) => (a.p.sk < b.p.sk ? -1 : a.p.sk > b.p.sk ? 1 : a.i - b.i));
  return idx.map((e) => e.p.pair);
}

function textNode(s: string): Json {
  if (!wellFormed(s)) return fail('ill-formed text');
  return { t: 'text', v: s, cu: 'utf8' };
}

function f64Node(x: number): Json {
  return { t: 'f64', v: render(x), bits: bits(x) };
}

function encodeJson(v0: V): Json {
  const v = resolveTag(v0);
  if (v === undefined || typeof v === 'bigint') return fail('json: bad kind');
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64Node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const items: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) fail('hole');
      items.push(encodeJson(v[i]));
    }
    return { t: 'list', v: items };
  }
  if (Object.getPrototypeOf(v) !== Object.prototype) return fail('json: non-plain');
  const ps: { sk: string; pair: Json }[] = [];
  for (const [k, val] of Object.entries(v)) {
    ps.push({ sk: k, pair: [textNode(k), encodeJson(val)] });
  }
  return { t: 'map', v: sortPairs(ps) };
}

const I64_LO = BigInt('-9223372036854775808');
const I64_HI = BigInt('9223372036854775807');
const U64_HI = BigInt('18446744073709551615');

function encodeInt(v: V, signed: boolean): Json {
  let b: bigint;
  if (typeof v === 'bigint') b = v;
  else if (typeof v === 'number' && Number.isInteger(v)) b = BigInt(v);
  else return fail('not integral');
  const lo = signed ? I64_LO : BigInt(0);
  const hi = signed ? I64_HI : U64_HI;
  if (b < lo || b > hi) return fail('out of range');
  return { t: signed ? 'i64' : 'u64', v: b.toString() };
}

function encodeTyped(v0: V, t: Ty): Json {
  if (isObj(v0) && !ESCAPED.has(v0)) {
    const a = getOwn(v0, '__throw');
    if (typeof a === 'string') return { t: 'throw', msg: a };
    const b = getOwn(v0, '__threw');
    if (typeof b === 'string') return { t: 'throw', msg: b };
  }
  return encodeBody(resolveTag(v0), t);
}

function encodeBody(v: V, t: Ty): Json {
  switch (t.k) {
    case 'union': {
      for (const alt of t.alts) {
        try {
          return encodeBody(v, alt);
        } catch (e) {
          continue;
        }
      }
      return fail('no alternative');
    }
    case 'scalar':
      switch (t.name) {
        case 'none':
          if (v === null || v === undefined) return { t: 'none' };
          return fail('not none');
        case 'bool':
          if (typeof v === 'boolean') return { t: 'bool', v };
          return fail('not bool');
        case 'text':
          if (typeof v === 'string') return textNode(v);
          return fail('not text');
        case 'f64':
          if (typeof v === 'number') return f64Node(v);
          return fail('not f64');
        case 'i64':
          return encodeInt(v, true);
        case 'u64':
          return encodeInt(v, false);
        case 'json':
          return encodeJson(v);
        default:
          return fail('not bytes');
      }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) return fail('not tuple');
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(encodeTyped(v[i], t.items[i]));
      return { t: 'tuple', v: out };
    }
    case 'list': {
      if (!Array.isArray(v)) return fail('not list');
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) out.push(encodeTyped(v[i], t.item));
      return { t: 'list', v: out };
    }
    case 'map': {
      if (!isPlainMap(v)) return fail('not map');
      const ps: { sk: string; pair: Json }[] = [];
      for (const [k, val] of Object.entries(v)) {
        const kn = encodeTyped(k, t.key);
        const vn = encodeTyped(val, t.val);
        ps.push({ sk: sortKey(kn), pair: [kn, vn] });
      }
      return { t: 'map', v: sortPairs(ps) };
    }
    case 'record': {
      if (!isPlainMap(v)) return fail('not record');
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, encodeTyped(getOwn(v, f.name), f.ty)]);
      return { t: 'record', v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const ty = parseType(type);
  return encodeTyped(value, ty);
}
