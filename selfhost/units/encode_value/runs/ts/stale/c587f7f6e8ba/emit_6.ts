type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type V = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type T =
  | { k: 's'; n: string }
  | { k: 'tuple'; items: T[] }
  | { k: 'list'; item: T }
  | { k: 'map'; key: T; val: T }
  | { k: 'record'; fields: { name: string; t: T }[] }
  | { k: 'union'; alts: T[] };

const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const NUM_LITERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const BIGINT_LITERAL = /^(?:0|-?[1-9][0-9]*)$/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const esc = new WeakSet<object>();

function parseType(s: string): T {
  let pos = 0;
  let depth = 0;
  const skip = (): void => {
    while (pos < s.length && ' \t\r\n'.includes(s[pos] as string)) pos++;
  };
  const expect = (c: string): void => {
    skip();
    if (s[pos] !== c) throw new Error('bad type: expected ' + c);
    pos++;
  };
  const name = (): string => {
    skip();
    const m = NAME.exec(s.slice(pos));
    if (!m) throw new Error('bad type: name');
    pos += m[0].length;
    return m[0];
  };
  const alt = (): T => {
    const n = name();
    if (SCALARS.includes(n)) return { k: 's', n };
    if (n !== 'tuple' && n !== 'list' && n !== 'map' && n !== 'record') throw new Error('unknown type name');
    depth++;
    if (depth > 256) throw new Error('too deep');
    expect('[');
    let r: T;
    if (n === 'tuple') {
      const items = [union()];
      skip();
      while (s[pos] === ',') {
        pos++;
        items.push(union());
        skip();
      }
      r = { k: 'tuple', items };
    } else if (n === 'list') {
      r = { k: 'list', item: union() };
    } else if (n === 'map') {
      const key = union();
      expect(',');
      r = { k: 'map', key, val: union() };
    } else {
      const fields: { name: string; t: T }[] = [];
      for (;;) {
        const fname = name();
        if (fields.some((f) => f.name === fname)) throw new Error('duplicate field');
        expect(':');
        fields.push({ name: fname, t: union() });
        skip();
        if (s[pos] === ',') {
          pos++;
          continue;
        }
        break;
      }
      r = { k: 'record', fields };
    }
    expect(']');
    depth--;
    return r;
  };
  const union = (): T => {
    const alts = [alt()];
    const seen = new Set<string>([JSON.stringify(alts[0])]);
    skip();
    while (s[pos] === '|') {
      pos++;
      const a = alt();
      const key = JSON.stringify(a);
      if (seen.has(key)) throw new Error('duplicate union alternative');
      seen.add(key);
      alts.push(a);
      skip();
    }
    const first = alts[0] as T;
    return alts.length === 1 ? first : { k: 'union', alts };
  };
  const t = union();
  skip();
  if (pos !== s.length) throw new Error('trailing text in type');
  return t;
}

function isPlain(v: V): v is Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v) as unknown;
  return p === Object.prototype || p === null;
}

function marker(v: V, name: string): string | undefined {
  if (isPlain(v) && !esc.has(v) && Object.hasOwn(v, name)) {
    const m = v[name];
    if (typeof m === 'string') return m;
  }
  return undefined;
}

function resolve(v: V): V {
  const tag = marker(v, '__t');
  if (tag === undefined || !isPlain(v)) return v;
  const p: V = Object.hasOwn(v, 'v') ? v['v'] : undefined;
  if (tag === 'num') {
    if (typeof p !== 'string') throw new Error('num: v must be text');
    if (p === 'NaN') return NaN;
    if (p === 'Infinity') return Infinity;
    if (p === '-Infinity') return -Infinity;
    if (p === '-0') return -0;
    if (!NUM_LITERAL.test(p)) throw new Error('num: bad literal');
    const n = Number(p);
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('num: not representable');
    return n;
  }
  if (tag === 'bigint') {
    if (typeof p !== 'string' || !BIGINT_LITERAL.test(p)) throw new Error('bigint: bad v');
    return BigInt(p);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (!isPlain(p)) throw new Error('obj: v must be a plain map');
    const out: Obj = {};
    for (const k of Object.keys(p)) {
      Object.defineProperty(out, k, { value: p[k], enumerable: true, writable: true, configurable: true });
    }
    esc.add(out);
    return out;
  }
  throw new Error('unknown tag');
}

function canon(n: Json): string {
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  if (typeof n === 'object' && n !== null) {
    let o: Obj = n;
    if (n['t'] === 'f64') o = { bits: n['bits'] ?? null, t: 'f64' };
    else if (n['t'] === 'throw') o = { t: 'throw' };
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canon(o[k] ?? null)).join(',') + '}';
  }
  return JSON.stringify(n);
}

function sortKey(n: Json): string {
  if (typeof n === 'object' && n !== null && !Array.isArray(n) && n['t'] === 'text' && typeof n['v'] === 'string') return n['v'];
  return canon(n);
}

function sortPairs(pairs: Json[][]): Json[] {
  const keyed = pairs.map((p) => ({ p, k: sortKey(p[0] ?? null) }));
  keyed.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return keyed.map((x) => x.p);
}

function textNode(s: string): Json {
  if (!s.isWellFormed()) throw new Error('text not well-formed');
  return { cu: 'utf8', t: 'text', v: s };
}

function f64Node(x: number): Json {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const bits = Number.isNaN(x) ? '7ff8000000000000' : dv.getBigUint64(0).toString(16).padStart(16, '0');
  return { bits, t: 'f64', v: Object.is(x, -0) ? '-0' : String(x) };
}

function intNode(v: V, kind: 'i64' | 'u64'): Json {
  let b: bigint;
  if (typeof v === 'bigint') b = v;
  else if (typeof v === 'number' && Number.isInteger(v)) b = BigInt(v);
  else throw new Error('not an integer');
  const lo = kind === 'i64' ? -(2n ** 63n) : 0n;
  const hi = kind === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
  if (b < lo || b > hi) throw new Error('integer out of range');
  return { t: kind, v: b.toString() };
}

function jsonEnc(x: V): Json {
  const v = resolve(x);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64Node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const items: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      items.push(jsonEnc(v[i]));
    }
    return { t: 'list', v: items };
  }
  if (isPlain(v)) {
    const pairs: Json[][] = Object.entries(v).map(([k, val]) => [textNode(k), jsonEnc(val)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  throw new Error('not json');
}

function enc(x: V, t: T): Json {
  const thr = marker(x, '__throw') ?? marker(x, '__threw');
  if (thr !== undefined) return { msg: thr, t: 'throw' };
  const v = resolve(x);
  if (t.k === 'union') {
    for (const a of t.alts) {
      try {
        return enc(v, a);
      } catch {
        continue;
      }
    }
    throw new Error('no union alternative matched');
  }
  if (t.k === 's') {
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
        if (typeof v === 'number') return f64Node(v);
        throw new Error('not number');
      case 'i64':
        return intNode(v, 'i64');
      case 'u64':
        return intNode(v, 'u64');
      case 'json':
        return jsonEnc(v);
      default:
        throw new Error('bytes unsupported');
    }
  }
  if (t.k === 'tuple') {
    if (!Array.isArray(v) || v.length !== t.items.length) throw new Error('tuple arity');
    const out: Json[] = [];
    for (let i = 0; i < t.items.length; i++) out.push(enc(v[i], t.items[i] as T));
    return { t: 'tuple', v: out };
  }
  if (t.k === 'list') {
    if (!Array.isArray(v)) throw new Error('not list');
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item));
    return { t: 'list', v: out };
  }
  if (t.k === 'map') {
    if (!isPlain(v)) throw new Error('not map');
    const pairs: Json[][] = [];
    for (const [k, val] of Object.entries(v)) pairs.push([enc(k, t.key), enc(val, t.val)]);
    return { t: 'map', v: sortPairs(pairs) };
  }
  if (!isPlain(v)) throw new Error('not record');
  const out: Json[] = [];
  for (const f of t.fields) {
    out.push([f.name, enc(Object.hasOwn(v, f.name) ? v[f.name] : undefined, f.t)]);
  }
  return { t: 'record', v: out };
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t);
}
