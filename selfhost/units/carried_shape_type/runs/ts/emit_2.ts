type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type Word = { readonly k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' };
type ListN = { readonly k: 'list'; readonly item: Node };
type MapN = { readonly k: 'map'; readonly key: Node; readonly val: Node };
type TupleN = { readonly k: 'tuple'; readonly items: readonly Node[] };
type RecordN = { readonly k: 'record'; readonly fields: readonly (readonly [string, Node])[] };
type UnionN = { readonly k: 'union'; readonly alts: readonly Node[] };
type Node = Word | ListN | MapN | TupleN | RecordN | UnionN;

const TRIM = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDEN = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const WORDS: readonly string[] = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];

function normalize(s: string): string {
  const t = s.replace(TRIM, '');
  const m = ARROW.exec(t);
  if (m !== null) {
    const k = m[1];
    const v = m[2];
    if (typeof k === 'string' && typeof v === 'string') {
      return 'map[' + normalize(k) + ', ' + normalize(v) + ']';
    }
  }
  return t;
}

function jsonable(t: Node): boolean {
  switch (t.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'bytes': case 'i64': case 'u64': return false;
    case 'list': return jsonable(t.item);
    case 'tuple': return t.items.every(jsonable);
    case 'map': return t.key.k === 'text' && jsonable(t.val);
    case 'record': return t.fields.every((f) => jsonable(f[1]));
    case 'union': return t.alts.every(jsonable);
  }
}

function same(a: Node, b: Node): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'list': return b.k === 'list' && same(a.item, b.item);
    case 'map': return b.k === 'map' && same(a.key, b.key) && same(a.val, b.val);
    case 'tuple':
      return b.k === 'tuple' && a.items.length === b.items.length &&
        a.items.every((x, i) => { const y = b.items[i]; return y !== undefined && same(x, y); });
    case 'record': {
      if (b.k !== 'record') return false;
      const bf = b.fields;
      const af = a.fields;
      const has = (xs: readonly (readonly [string, Node])[], f: readonly [string, Node]): boolean =>
        xs.some((g) => g[0] === f[0] && same(g[1], f[1]));
      return af.every((f) => has(bf, f)) && bf.every((f) => has(af, f));
    }
    case 'union': {
      if (b.k !== 'union') return false;
      const bs = b.alts;
      const as = a.alts;
      return as.every((x) => bs.some((y) => same(x, y))) && bs.every((y) => as.some((x) => same(x, y)));
    }
    default: return true;
  }
}

function covers(a: Node, b: Node): boolean {
  if (same(a, b)) return true;
  if (a.k === 'json' && jsonable(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
    a.items.every((x, i) => { const y = b.items[i]; return y !== undefined && covers(x, y); })) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record') {
    const bf = b.fields;
    if (a.fields.every((f) => bf.some((g) => g[0] === f[0] && covers(f[1], g[1])))) return true;
  }
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function parse(text: string): Node {
  let pos = 0;
  let depth = 0;
  const fail = (m: string): never => { throw new Error(m + ' at ' + pos); };
  const ws = (): void => {
    while (pos < text.length) {
      const c = text.charAt(pos);
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') pos++; else break;
    }
  };
  const ident = (): string => {
    ws();
    const m = IDENT.exec(text.slice(pos));
    if (m === null) return fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    ws();
    if (text.charAt(pos) !== ch) fail("expected '" + ch + "'");
    pos++;
  };
  const open = (): void => {
    expect('[');
    depth++;
    if (depth > 16) fail('types nest deeper than 16');
  };
  const close = (): void => { expect(']'); depth--; };
  const alt = (): Node => {
    const w = ident();
    if (w === 'list') {
      open();
      const item = type();
      close();
      return { k: 'list', item };
    }
    if (w === 'map') {
      open();
      const key = type();
      expect(',');
      const val = type();
      close();
      return { k: 'map', key, val };
    }
    if (w === 'tuple') {
      open();
      const items: Node[] = [type()];
      for (;;) {
        ws();
        if (text.charAt(pos) === ',') { pos++; items.push(type()); } else break;
      }
      close();
      return { k: 'tuple', items };
    }
    if (w === 'record') {
      open();
      const fields: (readonly [string, Node])[] = [];
      for (;;) {
        const n = ident();
        if (fields.some((f) => f[0] === n)) fail('duplicate field');
        expect(':');
        fields.push([n, type()]);
        ws();
        if (text.charAt(pos) === ',') pos++; else break;
      }
      close();
      return { k: 'record', fields };
    }
    switch (w) {
      case 'text': case 'bytes': case 'bool': case 'none':
      case 'i64': case 'u64': case 'f64': case 'json':
        return { k: w };
      default:
        return fail('unknown type ' + (WORDS.includes(w) ? '' : w));
    }
  };
  const type = (): Node => {
    const alts: Node[] = [alt()];
    for (;;) {
      ws();
      if (text.charAt(pos) === '|') { pos++; alts.push(alt()); } else break;
    }
    if (alts.length === 1) {
      const only = alts[0];
      if (only === undefined) return fail('empty');
      return only;
    }
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        const x = alts[i];
        const y = alts[j];
        if (x !== undefined && y !== undefined && covers(x, y)) fail('a union alternative is unreachable');
      }
    }
    return { k: 'union', alts };
  };
  const r = type();
  ws();
  if (pos < text.length) fail('trailing text');
  return r;
}

export default function carried_shape_type(shape: string): Json {
  const seg = shape.split(';')[0] ?? '';
  const norm = normalize(seg);
  const widened = norm.replace(WIDEN, (_m: string, p1: string, p2: string) => p1 + p2 + '64');
  return parse(widened);
}
