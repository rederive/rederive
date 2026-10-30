type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type V = null | boolean | number | string | bigint | undefined | V[] | { [key: string]: V };
type T =
  | { k: 'scalar'; n: string }
  | { k: 'tuple'; items: T[] }
  | { k: 'list'; item: T }
  | { k: 'map'; key: T; val: T }
  | { k: 'record'; fields: { name: string; type: T }[] }
  | { k: 'union'; alts: T[] };
type Obj = { [key: string]: V };

const ESCAPED = new WeakSet<object>();
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^-?(?:0|[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const KEYWORDS = new Set(['tuple', 'list', 'map', 'record']);

function fail(msg: string): never {
  throw new Error(msg);
}

function isMap(v: V): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasOwn(o: Obj, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

function own(o: Obj, k: string): V {
  return hasOwn(o, k) ? o[k] : undefined;
}

function parseType(text: string): T {
  let i = 0;
  const ws = (): void => {
    while (i < text.length && ' \t\r\n'.includes(text[i] as string)) i++;
  };
  const expect = (c: string): void => {
    ws();
    if (text[i] !== c) fail('expected ' + c);
    i++;
  };
  const union = (): T => {
    const alts: T[] = [alt()];
    for (;;) {
      ws();
      if (text[i] === '|') {
        i++;
        alts.push(alt());
      } else break;
    }
    const first = alts[0];
    if (alts.length === 1 && first !== undefined) return first;
    return { k: 'union', alts };
  };
  const alt = (): T => {
    ws();
    const m = NAME.exec(text.slice(i));
    if (m === null) return fail('bad type');
    const name = m[0];
    i += name.length;
    if (SCALARS.has(name)) return { k: 'scalar', n: name };
    if (!KEYWORDS.has(name)) return fail('unknown type');
    if (text[i] !== '[') return fail('expected [');
    i++;
    if (name === 'list') {
      const item = union();
      expect(']');
      return { k: 'list', item };
    }
    if (name === 'map') {
      const key = union();
      expect(',');
      const val = union();
      expect(']');
      return { k: 'map', key, val };
    }
    if (name === 'tuple') {
      const items: T[] = [union()];
      for (;;) {
        ws();
        if (text[i] === ',') {
          i++;
          items.push(union());
        } else break;
      }
      expect(']');
      return { k: 'tuple', items };
    }
    const fields: { name: string; type: T }[] = [];
    const seen = new Set<string>();
    for (;;) {
      ws();
      const fm = NAME.exec(text.slice(i));
      if (fm === null) return fail('bad field');
      const fname = fm[0];
      i += fname.length;
      if (seen.has(fname)) return fail('dup field');
      seen.add(fname);
      expect(':');
      fields.push({ name: fname, type: union() });
      ws();
      if (text[i] === ',') {
        i++;
      } else break;
    }
    expect(']');
    return { k: 'record', fields };
  };
  const t = union();
  ws();
  if (i !== text.length) fail('trailing');
  return t;
}

function textNode(s: string): Json {
  if (!s.isWellFormed()) fail('ill-formed text');
  return { t: 'text', v: s, cu: 'utf8' };
}

function render(x: number): string {
  return Object.is(x, -0) ? '-0' : String(x);
}

function bits(x: number): string {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

function f64Node(x: number): Json {
  return { t: 'f64', v: render(x), bits: bits(x) };
}

function esc(s: string): string {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i] as string;
    if (ch === '"') o += '\\"';
    else if (ch === '\\') o += '\\\\';
    else if (c === 8) o += '\\b';
    else if (c === 9) o += '\\t';
    else if (c === 10) o += '\\n';
    else if (c === 12) o += '\\f';
    else if (c === 13) o += '\\r';
    else if (c < 32) o += '\\u00' + c.toString(16).padStart(2, '0');
    else o += ch;
  }
  return o + '"';
}

function canon(n: Json): string {
  if (n === null) return 'null';
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (typeof n === 'number') return String(n);
  if (typeof n === 'string') return esc(n);
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  let o: { [key: string]: Json } = n;
  if (o['t'] === 'f64') o = { bits: o['bits'] ?? null, t: 'f64' };
  else if (o['t'] === 'throw') o = { t: 'throw' };
  const keys = Object.keys(o).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return '{' + keys.map((k) => esc(k) + ':' + canon(o[k] ?? null)).join(',') + '}';
}

function sortPairs(ents: { sk: string; pair: Json }[]): Json {
  const s = ents.slice().sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
  return { t: 'map', v: s.map((e) => e.pair) };
}

function resolveTag(v: V): V {
  if (!isMap(v) || ESCAPED.has(v)) return v;
  const tag = own(v, '__t');
  if (typeof tag !== 'string') return v;
  const payload = own(v, 'v');
  if (tag === 'num') {
    if (typeof payload !== 'string') return fail('num v');
    if (payload === 'NaN') return NaN;
    if (payload === 'Infinity') return Infinity;
    if (payload === '-Infinity') return -Infinity;
    if (payload === '-0') return -0;
    if (!NUM_LITERAL.test(payload)) return fail('num literal');
    return Number(payload);
  }
  if (tag === 'bigint') {
    if (typeof payload !== 'string' || !BIGINT_LITERAL.test(payload)) return fail('bigint');
    return BigInt(payload);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (payload === null || payload === undefined) return fail('obj v');
    const out: Obj = {};
    const put = (k: string, val: V): void => {
      Object.defineProperty(out, k, { value: val, enumerable: true, writable: true, configurable: true });
    };
    if (typeof payload === 'string') {
      for (let i = 0; i < payload.length; i++) put(String(i), payload[i]);
    } else if (Array.isArray(payload)) {
      for (let i = 0; i < payload.length; i++) put(String(i), payload[i]);
    } else if (isMap(payload)) {
      for (const k of Object.keys(payload)) put(k, payload[k]);
    }
    ESCAPED.add(out);
    return out;
  }
  return fail('unknown tag');
}

function throwObs(v: V): Json | undefined {
  if (!isMap(v) || ESCAPED.has(v)) return undefined;
  const a = own(v, '__throw');
  if (typeof a === 'string') return { t: 'throw', msg: a };
  const b = own(v, '__threw');
  if (typeof b === 'string') return { t: 'throw', msg: b };
  return undefined;
}

function plainProto(o: Obj): boolean {
  const p: unknown = Object.getPrototypeOf(o);
  return p === Object.prototype || p === null;
}

function encJson(raw: V): Json {
  const v = resolveTag(raw);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64Node(v);
  if (typeof v === 'string') return textNode(v);
  if (v === undefined || typeof v === 'bigint') return fail('not json');
  if (Array.isArray(v)) {
    const items: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) return fail('hole');
      items.push(encJson(v[i]));
    }
    return { t: 'list', v: items };
  }
  if (Object.getPrototypeOf(v) !== Object.prototype) return fail('not plain');
  const ents = Object.entries(v).map(([k, x]) => ({ sk: k, pair: [textNode(k), encJson(x)] as Json }));
  return sortPairs(ents);
}

function toBig(v: V): bigint | undefined {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  return undefined;
}

function enc(raw: V, t: T): Json {
  const obs = throwObs(raw);
  if (obs !== undefined) return obs;
  return encT(resolveTag(raw), t);
}

function encT(v: V, t: T): Json {
  switch (t.k) {
    case 'union': {
      for (const a of t.alts) {
        try {
          return encT(v, a);
        } catch {
          continue;
        }
      }
      return fail('no alternative');
    }
    case 'scalar': {
      switch (t.n) {
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
        case 'u64': {
          const b = toBig(v);
          if (b === undefined) return fail('not integral');
          const lo = t.n === 'i64' ? -(2n ** 63n) : 0n;
          const hi = t.n === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
          if (b < lo || b > hi) return fail('range');
          return { t: t.n, v: b.toString() };
        }
        case 'json':
          return encJson(v);
        default:
          return fail('not ' + t.n);
      }
    }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) return fail('not tuple');
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) {
        const ty = t.items[i];
        if (ty === undefined) return fail('tuple');
        out.push(enc(v[i], ty));
      }
      return { t: 'tuple', v: out };
    }
    case 'list': {
      if (!Array.isArray(v)) return fail('not list');
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item));
      return { t: 'list', v: out };
    }
    case 'map': {
      if (!isMap(v) || !plainProto(v)) return fail('not map');
      const ents = Object.entries(v).map(([k, x]) => {
        const kn = enc(k, t.key);
        const vn = enc(x, t.val);
        const sk = typeof kn === 'object' && kn !== null && !Array.isArray(kn) && kn['t'] === 'text' && typeof kn['v'] === 'string' ? kn['v'] : canon(kn);
        return { sk, pair: [kn, vn] as Json };
      });
      return sortPairs(ents);
    }
    case 'record': {
      if (!isMap(v) || !plainProto(v)) return fail('not record');
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, enc(own(v, f.name), f.type)]);
      return { t: 'record', v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t);
}
