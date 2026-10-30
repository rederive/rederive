type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Val = Json | undefined | bigint;
type Obj = { [key: string]: Json };
type Ty =
  | { k: 'scalar'; name: string }
  | { k: 'tuple'; items: Ty[] }
  | { k: 'list'; item: Ty }
  | { k: 'map'; key: Ty; val: Ty }
  | { k: 'record'; fields: { name: string; type: Ty }[] }
  | { k: 'union'; alts: Ty[] };

const MAX_VALUE_DEPTH = 100;
const MAX_DEPTH = 16;
const SCALARS = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const esc = new WeakSet<object>();

function typeKey(t: Ty): string {
  switch (t.k) {
    case 'scalar': return t.name;
    case 'list': return 'list[' + typeKey(t.item) + ']';
    case 'tuple': return 'tuple[' + t.items.map(typeKey).join(',') + ']';
    case 'map': return 'map[' + typeKey(t.key) + ',' + typeKey(t.val) + ']';
    case 'record': return 'record[' + t.fields.map((f) => f.name + ':' + typeKey(f.type)).sort().join(',') + ']';
    case 'union': return 'union[' + Array.from(new Set(t.alts.map(typeKey))).sort().join('|') + ']';
  }
}

function reached(t: Ty): boolean {
  switch (t.k) {
    case 'scalar': return ['none', 'bool', 'f64', 'text', 'json'].includes(t.name);
    case 'list': return reached(t.item);
    case 'tuple': return t.items.every(reached);
    case 'map': return t.key.k === 'scalar' && t.key.name === 'text' && reached(t.val);
    case 'record': return t.fields.every((f) => reached(f.type));
    case 'union': return t.alts.every(reached);
  }
}

function covers(a: Ty, b: Ty): boolean {
  if (typeKey(a) === typeKey(b)) return true;
  if (a.k === 'scalar' && a.name === 'json' && reached(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
    a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record') {
    const bf = b.fields;
    if (a.fields.every((f) => bf.some((g) => g.name === f.name && covers(f.type, g.type)))) return true;
  }
  if (b.k === 'union' && b.alts.every((x) => covers(a, x))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  return false;
}

function parseType(text: string): Ty {
  let pos = 0;
  const ws = (): void => {
    while (pos < text.length && ' \t\r\n'.includes(text[pos])) pos++;
  };
  const name = (): string => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(pos));
    if (m === null) throw new Error('bad type');
    pos += m[0].length;
    return m[0];
  };
  const expect = (c: string): void => {
    ws();
    if (text[pos] !== c) throw new Error('bad type');
    pos++;
  };
  const union = (cd: number): Ty => {
    const alts: Ty[] = [alt(cd)];
    ws();
    while (text[pos] === '|') {
      pos++;
      alts.push(alt(cd));
      ws();
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i], alts[j])) throw new Error('unreachable alternative');
      }
    }
    return { k: 'union', alts };
  };
  const alt = (cd: number): Ty => {
    ws();
    const w = name();
    if (SCALARS.includes(w)) return { k: 'scalar', name: w };
    if (w !== 'tuple' && w !== 'list' && w !== 'map' && w !== 'record') throw new Error('unknown type');
    if (cd >= MAX_DEPTH) throw new Error('too deep');
    expect('[');
    if (w === 'list') {
      const item = union(cd + 1);
      expect(']');
      return { k: 'list', item };
    }
    if (w === 'map') {
      const key = union(cd + 1);
      expect(',');
      const val = union(cd + 1);
      expect(']');
      return { k: 'map', key, val };
    }
    if (w === 'tuple') {
      const items: Ty[] = [union(cd + 1)];
      ws();
      while (text[pos] === ',') {
        pos++;
        items.push(union(cd + 1));
        ws();
      }
      expect(']');
      return { k: 'tuple', items };
    }
    const fields: { name: string; type: Ty }[] = [];
    for (;;) {
      ws();
      const n = name();
      if (fields.some((f) => f.name === n)) throw new Error('dup field');
      expect(':');
      fields.push({ name: n, type: union(cd + 1) });
      ws();
      if (text[pos] === ',') { pos++; continue; }
      break;
    }
    expect(']');
    return { k: 'record', fields };
  };
  const t = union(0);
  ws();
  if (pos !== text.length) throw new Error('trailing');
  return t;
}

function isPlain(v: Val): v is Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const p: object | null = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function own(o: Obj, k: string): Val {
  return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;
}

function throwMarker(v: Val): string | null {
  if (!isPlain(v) || esc.has(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== 1) return null;
  if (keys[0] !== '__throw' && keys[0] !== '__threw') return null;
  const m = own(v, keys[0]);
  return typeof m === 'string' ? m : null;
}

function resolve(v: Val): Val {
  if (!isPlain(v) || esc.has(v)) return v;
  const tag = own(v, '__t');
  if (typeof tag !== 'string') return v;
  const p = own(v, 'v');
  if (tag === 'num') {
    if (typeof p !== 'string') throw new Error('bad num');
    if (p === 'NaN') return NaN;
    if (p === 'Infinity') return Infinity;
    if (p === '-Infinity') return -Infinity;
    if (p === '-0') return -0;
    if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(p)) throw new Error('bad num');
    const n = Number(p);
    if (n === 0 && /[1-9]/.test(p.split(/[eE]/)[0])) throw new Error('underflow');
    if (!Number.isFinite(n) || Object.is(n, -0)) throw new Error('bad num');
    return n;
  }
  if (tag === 'bigint') {
    if (typeof p !== 'string' || !/^(?:0|-?[1-9][0-9]*)$/.test(p)) throw new Error('bad bigint');
    return BigInt(p);
  }
  if (tag === 'undef') return undefined;
  if (tag === 'obj') {
    if (!isPlain(p)) throw new Error('bad obj');
    const out: Obj = {};
    for (const k of Object.keys(p)) {
      Object.defineProperty(out, k, { value: p[k], enumerable: true, writable: true, configurable: true });
    }
    esc.add(out);
    return out;
  }
  throw new Error('unknown tag');
}

function bits(x: number): string {
  if (Number.isNaN(x)) return '7ff8000000000000';
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  return dv.getBigUint64(0).toString(16).padStart(16, '0');
}

function wf(s: string): boolean {
  return s.isWellFormed();
}

function q(s: string): string {
  let o = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34) o += '\\"';
    else if (c === 92) o += '\\\\';
    else if (c === 8) o += '\\b';
    else if (c === 9) o += '\\t';
    else if (c === 10) o += '\\n';
    else if (c === 12) o += '\\f';
    else if (c === 13) o += '\\r';
    else if (c < 32) o += '\\u00' + c.toString(16).padStart(2, '0');
    else o += s[i];
  }
  return o + '"';
}

function canon(n: Json): string {
  if (typeof n === 'string') return q(n);
  if (typeof n === 'boolean') return n ? 'true' : 'false';
  if (n === null) return 'null';
  if (typeof n === 'number') return String(n);
  if (Array.isArray(n)) return '[' + n.map(canon).join(',') + ']';
  let keys = Object.keys(n).sort();
  if (n.t === 'f64') keys = ['bits', 't'];
  else if (n.t === 'throw') keys = ['t'];
  return '{' + keys.map((k) => q(k) + ':' + canon(n[k])).join(',') + '}';
}

function textNode(s: string): Json {
  if (!wf(s)) throw new Error('ill-formed text');
  return { cu: 'utf8', t: 'text', v: s };
}

function f64Node(x: number): Json {
  return { bits: bits(x), t: 'f64', v: Object.is(x, -0) ? '-0' : String(x) };
}

function sortPairs(pairs: { sk: string; pair: Json }[]): Json {
  const s = pairs.slice().sort((a, b) => (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
  return s.map((p) => p.pair);
}

function encJson(v0: Val, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  const v = resolve(v0);
  if (v === null) return { t: 'none' };
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return f64Node(v);
  if (typeof v === 'string') return textNode(v);
  if (Array.isArray(v)) {
    const out: Json[] = [];
    for (let i = 0; i < v.length; i++) {
      if (!(i in v)) throw new Error('hole');
      out.push(encJson(v[i], d + 1));
    }
    return { t: 'list', v: out };
  }
  if (isPlain(v)) {
    const ps: { sk: string; pair: Json }[] = [];
    for (const k of Object.keys(v)) {
      ps.push({ sk: k, pair: [textNode(k), encJson(own(v, k), d + 1)] });
    }
    return { t: 'map', v: sortPairs(ps) };
  }
  throw new Error('not json');
}

function intNode(v: Val, name: string): Json {
  let b: bigint;
  if (typeof v === 'bigint') b = v;
  else if (typeof v === 'number' && Number.isInteger(v)) b = BigInt(v);
  else throw new Error('not integral');
  const lo = name === 'i64' ? -(1n << 63n) : 0n;
  const hi = name === 'i64' ? (1n << 63n) - 1n : (1n << 64n) - 1n;
  if (b < lo || b > hi) throw new Error('out of range');
  return { t: name, v: b.toString() };
}

function enc(v0: Val, t: Ty, d: number): Json {
  if (d > MAX_VALUE_DEPTH) throw new Error('too deep');
  const m = throwMarker(v0);
  if (m !== null) return { t: 'throw', msg: m };
  const v = resolve(v0);
  switch (t.k) {
    case 'union': {
      for (const a of t.alts) {
        try {
          return enc(v, a, d);
        } catch {
          continue;
        }
      }
      throw new Error('no alternative');
    }
    case 'scalar': {
      switch (t.name) {
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
        case 'u64':
          return intNode(v, t.name);
        case 'json':
          return encJson(v, d);
        default:
          throw new Error('unsupported');
      }
    }
    case 'tuple': {
      if (!Array.isArray(v) || v.length !== t.items.length) throw new Error('not tuple');
      const out: Json[] = [];
      for (let i = 0; i < t.items.length; i++) out.push(enc(v[i], t.items[i], d + 1));
      return { t: 'tuple', v: out };
    }
    case 'list': {
      if (!Array.isArray(v)) throw new Error('not list');
      const out: Json[] = [];
      for (let i = 0; i < v.length; i++) out.push(enc(v[i], t.item, d + 1));
      return { t: 'list', v: out };
    }
    case 'map': {
      if (!isPlain(v)) throw new Error('not map');
      const ps: { sk: string; pair: Json }[] = [];
      for (const k of Object.keys(v)) {
        const kn = enc(k, t.key, d + 1);
        const vn = enc(own(v, k), t.val, d + 1);
        const isText = typeof kn === 'object' && kn !== null && !Array.isArray(kn) && kn.t === 'text';
        ps.push({ sk: isText ? k : canon(kn), pair: [kn, vn] });
      }
      return { t: 'map', v: sortPairs(ps) };
    }
    case 'record': {
      if (!isPlain(v)) throw new Error('not record');
      const out: Json[] = [];
      for (const f of t.fields) out.push([f.name, enc(own(v, f.name), f.type, d + 1)]);
      return { t: 'record', v: out };
    }
  }
}

export default function encode_value(value: Json, type: string): Json {
  const t = parseType(type);
  return enc(value, t, 0);
}
