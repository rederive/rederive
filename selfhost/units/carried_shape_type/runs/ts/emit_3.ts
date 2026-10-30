type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

type W = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';
type N =
  | { k: W }
  | { k: 'list'; item: N }
  | { k: 'map'; key: N; val: N }
  | { k: 'tuple'; items: N[] }
  | { k: 'record'; fields: [string, N][] }
  | { k: 'union'; alts: N[] };

const WORDS: readonly string[] = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const TRIM = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDEN = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function isW(s: string): s is W {
  return WORDS.includes(s);
}

function normalize(s: string): string {
  const t = s.replace(TRIM, '');
  const m = ARROW.exec(t);
  if (m !== null) {
    const kk = m[1];
    const vv = m[2];
    if (kk !== undefined && vv !== undefined) {
      return 'map[' + normalize(kk) + ', ' + normalize(vv) + ']';
    }
  }
  return t;
}

function same(a: N, b: N): boolean {
  if (a.k === 'union' && b.k === 'union') {
    return (
      a.alts.every((x) => b.alts.some((y) => same(x, y))) &&
      b.alts.every((y) => a.alts.some((x) => same(x, y)))
    );
  }
  if (a.k === 'list' && b.k === 'list') return same(a.item, b.item);
  if (a.k === 'map' && b.k === 'map') return same(a.key, b.key) && same(a.val, b.val);
  if (a.k === 'tuple' && b.k === 'tuple') {
    return a.items.length === b.items.length && a.items.every((x, i) => {
      const y = b.items[i];
      return y !== undefined && same(x, y);
    });
  }
  if (a.k === 'record' && b.k === 'record') {
    const bf = b.fields;
    return (
      a.fields.length === bf.length &&
      a.fields.every(([n, t]) => bf.some(([n2, t2]) => n === n2 && same(t, t2)))
    );
  }
  if (a.k === 'union' || b.k === 'union') return false;
  if (a.k === 'list' || a.k === 'map' || a.k === 'tuple' || a.k === 'record') return false;
  if (b.k === 'list' || b.k === 'map' || b.k === 'tuple' || b.k === 'record') return false;
  return a.k === b.k;
}

function jsonable(t: N): boolean {
  switch (t.k) {
    case 'none':
    case 'bool':
    case 'f64':
    case 'text':
    case 'json':
      return true;
    case 'bytes':
    case 'i64':
    case 'u64':
      return false;
    case 'list':
      return jsonable(t.item);
    case 'tuple':
      return t.items.every(jsonable);
    case 'map':
      return t.key.k === 'text' && jsonable(t.val);
    case 'record':
      return t.fields.every(([, x]) => jsonable(x));
    case 'union':
      return t.alts.every(jsonable);
  }
}

function covers(a: N, b: N): boolean {
  if (same(a, b)) return true;
  if (a.k === 'json' && jsonable(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length) {
    const bi = b.items;
    if (a.items.every((x, i) => {
      const y = bi[i];
      return y !== undefined && covers(x, y);
    })) return true;
  }
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record') {
    const bf = b.fields;
    if (a.fields.every(([n, f]) => bf.some(([n2, g]) => n === n2 && covers(f, g)))) return true;
  }
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function parse(src: string): N {
  let pos = 0;
  let depth = 0;
  const isWs = (c: string | undefined): boolean => c === ' ' || c === '\t' || c === '\r' || c === '\n';
  const skip = (): void => {
    while (pos < src.length && isWs(src[pos])) pos++;
  };
  const expect = (c: string): void => {
    skip();
    if (src[pos] !== c) throw new Error('expected ' + c + ' at ' + pos);
    pos++;
  };
  const ident = (): string => {
    skip();
    const m = IDENT.exec(src.slice(pos));
    if (m === null) throw new Error('expected an identifier at ' + pos);
    pos += m[0].length;
    return m[0];
  };
  const open = (): void => {
    expect('[');
    depth++;
    if (depth > 16) throw new Error('types nest deeper than 16');
  };
  const alt = (): N => {
    const w = ident();
    if (isW(w)) return { k: w };
    if (w === 'list') {
      open();
      const item = type();
      expect(']');
      depth--;
      return { k: 'list', item };
    }
    if (w === 'map') {
      open();
      const key = type();
      expect(',');
      const val = type();
      expect(']');
      depth--;
      return { k: 'map', key, val };
    }
    if (w === 'tuple') {
      open();
      const items: N[] = [type()];
      for (;;) {
        skip();
        if (src[pos] === ',') {
          pos++;
          items.push(type());
        } else break;
      }
      expect(']');
      depth--;
      return { k: 'tuple', items };
    }
    if (w === 'record') {
      open();
      const fields: [string, N][] = [];
      for (;;) {
        const name = ident();
        if (fields.some(([n]) => n === name)) throw new Error('duplicate field ' + name);
        expect(':');
        fields.push([name, type()]);
        skip();
        if (src[pos] === ',') pos++;
        else break;
      }
      expect(']');
      depth--;
      return { k: 'record', fields };
    }
    throw new Error('unknown type ' + w);
  };
  const type = (): N => {
    const alts: N[] = [alt()];
    for (;;) {
      skip();
      if (src[pos] === '|') {
        pos++;
        alts.push(alt());
      } else break;
    }
    if (alts.length === 1) {
      const only = alts[0];
      if (only === undefined) throw new Error('empty');
      return only;
    }
    for (let i = 0; i < alts.length; i++) {
      for (let j = i + 1; j < alts.length; j++) {
        const x = alts[i];
        const y = alts[j];
        if (x !== undefined && y !== undefined && covers(x, y)) {
          throw new Error('a union alternative is unreachable');
        }
      }
    }
    return { k: 'union', alts };
  };
  const r = type();
  skip();
  if (pos !== src.length) throw new Error('trailing text at ' + pos);
  return r;
}

export default function carried_shape_type(shape: string): Json {
  const seg = shape.split(';')[0] ?? '';
  const norm = normalize(seg);
  const widened = norm.replace(WIDEN, (_m: string, p1: string, p2: string) => p1 + p2 + '64');
  const res: Json = parse(widened);
  return res;
}
