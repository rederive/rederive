type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Val = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type T =
  | { k: 'scalar'; n: string }
  | { k: 'tuple'; items: T[] }
  | { k: 'list'; item: T }
  | { k: 'map'; key: T; val: T }
  | { k: 'record'; fields: { name: string; t: T }[] }
  | { k: 'union'; alts: T[] };

const escaped = new WeakSet<object>();
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^-?(?:0|[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];

function hasOwn(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function isMapObj(v: Val): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isPlainMap(v: Val): v is Obj {
  if (!isMapObj(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
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

function parseType(src: string): T {
  let pos = 0;
  const ws = (): void => {
    while (pos < src.length && ' \t\r\n'.indexOf(src.charAt(pos)) >= 0) pos++;
  };
  const expect = (ch: string): void => {
    ws();
    if (src.charAt(pos) !== ch || pos >= src.length) throw new Error('expected ' + ch);
    pos++;
  };
  const word = (): string => {
    const m = NAME.exec(src.slice(pos));
    if (!m) throw new Error('name expected');
    pos += m[0].length;
    return m[0];
  };
  const type = (): T => {
    const alts: T[] = [alt()];
    ws();
    while (pos < src.length && src.charAt(pos) === '|') {
      pos++;
      alts.push(alt());
      ws();
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const open = (): void => {
    if (src.charAt(pos) !== '[' || pos >= src.length) throw new Error('[ expected');
    pos++;
  };
  const alt = (): T => {
    ws();
    const w = word();
    if (SCALARS.indexOf(w) >= 0) return { k: 'scalar', n: w };
    if (w === 'tuple') {
      open();
      const items: T[] = [type()];
      ws();
      while (src.charAt(pos) === ',' && pos < src.length) {
        pos++;
        items.push(type());
        ws();
      }
      expect(']');
      return { k: 'tuple', items };
    }
    if (w === 'list') {
      open();
      const item = type();
      expect(']');
      return { k: 'list', item };
    }
    if (w === 'map') {
      open();
      const key = type();
      expect(',');
      const val = type();
      expect(']');
      return { k: 'map', key, val };
    }
    if (w === 'record') {
      open();
      const fields: { name: string; t: T }[] = [];
      for (;;) {
        ws();
        const name = word();
        if (fields.some((f) => f.name === name)) throw new Error('dup field');
        expect(':');
        const t = type();
        fields.push({ name, t });
        ws();
        if (src.charAt(pos) === ',' && pos < src.length) {
          pos++;
          continue;
        }
        break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    throw new Error('unknown abstract type');
  };
  const r = type();
  ws();
  if (pos !== src.length) throw new Error('trailing input');
  return r;
}

function setOwn(o: Obj, k: string, val: Json): void {
  Object.defineProperty(o, k, { value: val, enumerable: true, writable: true, configurable: true });
}

function resolve(v: Val): Val {
  if (!isMapObj(v) || escaped.has(v) || !hasOwn(v, '__t')) return v;
  const tag = v['__t'];
  if (typeof tag !== 'string') return v;
  const inner: Val = hasOwn(v, 'v') ? v['v'] : undefined;
  if (tag === 'num') {
    if (typeof inner !== 'string') throw new Error('bad num');
    if (inner === 'NaN') return NaN;
    if (inner === 'Infinity') return Infinity;
    if (inner === '-Infinity') return -Infinity;
    if (inner === '-0') return -0;
    if (!NUM_LITERAL.test(inner)) throw new Error('bad num');
    return Number(inner);
  }
  if (tag === 'bigint') {
    if (typeof inner !== 'string' || !BIGINT_LITERAL.test(inner)) throw new Error('bad bigint');
    return BigInt(inner);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (inner === null || inner === undefined) throw new Error('bad obj');
    const out: Obj = {};
    if (Array.isArray(inner)) {
      for (let i = 0; i < inner.length; i++) setOwn(out, String(i), inner[i]);
    } else if (typeof inner === 'string') {
      for (let i = 0; i < inner.length; i++) setOwn(out, String(i), inner.charAt(i));
    } else if (isMapObj(inner)) {
      for (const k of Object.keys(inner)) setOwn(out, k, inner[k]);
    }
    escaped.add(out);
    return out;
  }
  throw new Error('unknown tag');
}

function render(x: number): string {
  return Object.is(x, -0) ? '-0' : String(x);
}

function bits(x: number): string {
  if (x !== x) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

function esc(s: string): string {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s.charAt(i);
    if (ch === '"') r += '\\"';
    else if (ch === '\\') r += '\\\\';
    else if (c === 8) r += '\\b';
    else if (c === 9) r += '\\t';
    else if (c === 10) r += '\\n';
    else if (c === 12) r += '\\f';
    else if (c === 13) r += '\\r';
    else if (c < 32) r += '\\u00' + c.toString(16).padStart(2, '0');
    else r += ch;
  }
  return r + '"';
}

function canon(n: Json): string {
  if (n === null) return 'null';
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (typeof n === 'number') return String(n);
  if (typeof n === 'string') return esc(n);
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  let o: Obj = n;
  if (o['t'] === 'f64') o = { bits: o['bits'], t: 'f64' };
  else if (o['t'] === 'throw') o = { t: 'throw' };
  const keys = Object.keys(o).sort();
  return '{' + keys.map((k) => esc(k) + ':' + canon(o[k])).join(',') + '}';
}

function sortKey(node: Json): string {
  if (isMapObj(node) && node['t'] === 'text' && typeof node['v'] === 'string') return node['v'];
  return canon(node);
}

function sortPairs(es: { sk: string; pair: Json }[]): Json {
  const idx = es.map((e, i) => ({ e, i }));
  idx.sort((a, b) => (a.e.sk < b.e.sk ? -1 : a.e.sk > b.e.sk ? 1 : a.i - b.i));
  return idx.map((x) => x.e.pair);
}

function textNode(s: string): Json {
  if (!wellFormed(s)) throw new Error('not well-formed');
  return { cu: 'utf8', t: 'text', v: s };
}

function encJ(v0: Val): Json {
  const v = resolve(v0);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return { bits: bits(v), t: 'f64', v: render(v) };
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) return { t: 'list', v: v.map((x) => encJ(x)) };
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const es = Object.entries(v).map(([k, x]) => ({ sk: k, pair: [textNode(k), encJ(x)] as Json }));
    return { t: 'map', v: sortPairs(es) };
  }
  throw new Error('not json');
}

function intRange(v: Val, lo: bigint, hi: bigint): string {
  let b: bigint;
  if (typeof v === 'bigint') b = v;
  else if (typeof v === 'number' && Number.isInteger(v)) b = BigInt(v);
  else throw new Error('not integral');
  if (b < lo || b > hi) throw new Error('out of range');
  return b.toString();
}

function encR(v: Val, t: T): Json {
  switch (t.k) {
    case 'union': {
      for (const a of t.alts) {
        try {
          return encR(v, a);
        } catch (e) {
          continue;
        }
      }
      throw new Error('no alternative');
    }
    case 'scalar':
      switch (t.n) {
        case 'none':
          if (v === null || v === undefined) return { t: 'none' };
          throw new Error('not none');
        case 'bool':
          if (typeof v === 'boolean') return { t: 'bool', v };
          throw new Error('not bool');
        case 'text':
          if (typeof v === 'string') return textNode(v);
          throw new Error('not text');
        case 'f64':
          if (typeof v === 'number') return { bits: bits(v), t: 'f64', v: render(v) };
          throw new Error('not f64');
        case 'i64':
          return { t: 'i64', v: intRange(v, -(2n ** 63n), 2n ** 63n - 1n) };
        case 'u64':
          return { t: 'u64', v: intRange(v, 0n, 2n ** 64n - 1n) };
        case 'json':
          return encJ(v);
        default:
          throw new Error('not bytes');
      }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error('not tuple');
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(enc(v[i], t.items[i]));
      return { t: 'tuple', v: out };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('not list');
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item));
      return { t: 'list', v: out };
    }
    case 'map': {
      if (!isPlainMap(v)) throw new Error('not map');
      const es: { sk: string; pair: Json }[] = [];
      for (const [k, x] of Object.entries(v)) {
        const kn = enc(k, t.key);
        const vn = enc(x, t.val);
        es.push({ sk: sortKey(kn), pair: [kn, vn] });
      }
      return { t: 'map', v: sortPairs(es) };
    }
    case 'record': {
      if (!isPlainMap(v)) throw new Error('not record');
      const out: Json[] = [];
      for (const f of t.fields) {
        const fv: Val = hasOwn(v, f.name) ? v[f.name] : undefined;
        out.push([f.name, enc(fv, f.t)]);
      }
      return { t: 'record', v: out };
    }
  }
}

function enc(v: Val, t: T): Json {
  if (isMapObj(v) && !escaped.has(v)) {
    const a = hasOwn(v, '__throw') ? v['__throw'] : undefined;
    if (typeof a === 'string') return { msg: a, t: 'throw' };
    const b = hasOwn(v, '__threw') ? v['__threw'] : undefined;
    if (typeof b === 'string') return { msg: b, t: 'throw' };
  }
  return encR(resolve(v), t);
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t);
}
