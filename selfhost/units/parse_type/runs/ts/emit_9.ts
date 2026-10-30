export type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';
export type TypeNode =
  | { k: Scalar }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

const MAX_DEPTH = 16;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS: string[] = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];

function isScalar(n: TypeNode): n is { k: Scalar } {
  return SCALARS.indexOf(n.k) >= 0;
}

function keyOf(n: TypeNode): string {
  switch (n.k) {
    case 'tuple':
      return 'tuple(' + n.items.map(keyOf).join(',') + ')';
    case 'list':
      return 'list(' + keyOf(n.item) + ')';
    case 'map':
      return 'map(' + keyOf(n.key) + ',' + keyOf(n.val) + ')';
    case 'record':
      return 'record(' + n.fields.map((f) => JSON.stringify(f[0]) + ':' + keyOf(f[1])).sort().join(',') + ')';
    case 'union': {
      const ks = Array.from(new Set(n.alts.map(keyOf))).sort();
      return 'union(' + ks.join(',') + ')';
    }
    default:
      return n.k;
  }
}

function same(a: TypeNode, b: TypeNode): boolean {
  return keyOf(a) === keyOf(b);
}

function jsonShaped(n: TypeNode): boolean {
  switch (n.k) {
    case 'none':
    case 'bool':
    case 'f64':
    case 'text':
    case 'json':
      return true;
    case 'list':
      return jsonShaped(n.item);
    case 'tuple':
      return n.items.every(jsonShaped);
    case 'map':
      return n.key.k === 'text' && jsonShaped(n.val);
    case 'record':
      return n.fields.every((f) => jsonShaped(f[1]));
    case 'union':
      return n.alts.every(jsonShaped);
    default:
      return false;
  }
}

function covers(e: TypeNode, l: TypeNode): boolean {
  if (same(e, l)) return true;
  if (e.k === 'json' && jsonShaped(l)) return true;
  if (e.k === 'list' && l.k === 'list' && covers(e.item, l.item)) return true;
  if (e.k === 'tuple' && l.k === 'tuple' && e.items.length === l.items.length) {
    let ok = true;
    for (let i = 0; i < e.items.length; i++) {
      if (!covers(e.items[i], l.items[i])) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  if (e.k === 'map' && l.k === 'map' && covers(e.key, l.key) && covers(e.val, l.val)) return true;
  if (e.k === 'record' && l.k === 'record') {
    const lf = l.fields;
    const ok = e.fields.every((ef) => lf.some((x) => x[0] === ef[0] && covers(ef[1], x[1])));
    if (ok) return true;
  }
  if (e.k === 'union' && e.alts.some((a) => covers(a, l))) return true;
  if (l.k === 'union' && l.alts.every((a) => covers(e, a))) return true;
  return false;
}

function isWs(c: string): boolean {
  return c === '\t' || c === '\n' || c === '\r' || c === ' ';
}

export function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('non-text argument');
  let pos = 0;
  const skip = (): void => {
    while (pos < s.length && isWs(s[pos])) pos++;
  };
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + pos);
  };
  const name = (): string => {
    const m = IDENT.exec(s.slice(pos));
    if (!m) return fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (c: string): void => {
    skip();
    if (s[pos] !== c) fail('expected ' + c);
    pos++;
  };
  const parts = (depth: number): TypeNode[] => {
    const out: TypeNode[] = [parseUnion(depth)];
    for (;;) {
      skip();
      if (s[pos] === ',') {
        pos++;
        out.push(parseUnion(depth));
      } else if (s[pos] === ']') {
        pos++;
        return out;
      } else {
        return fail('expected , or ]');
      }
    }
  };
  const parseAlt = (depth: number): TypeNode => {
    skip();
    const nm = name();
    if (SCALARS.indexOf(nm) >= 0) return { k: nm as Scalar };
    if (nm !== 'tuple' && nm !== 'list' && nm !== 'map' && nm !== 'record') return fail('unknown abstract type');
    if (depth + 1 > MAX_DEPTH) return fail('types nest deeper than 16');
    expect('[');
    const d = depth + 1;
    if (nm === 'record') {
      const fields: [string, TypeNode][] = [];
      for (;;) {
        skip();
        const fn = name();
        if (fields.some((f) => f[0] === fn)) fail('duplicate field');
        expect(':');
        fields.push([fn, parseUnion(d)]);
        skip();
        if (s[pos] === ',') {
          pos++;
        } else if (s[pos] === ']') {
          pos++;
          break;
        } else {
          fail('expected , or ]');
        }
      }
      return { k: 'record', fields };
    }
    const ps = parts(d);
    if (nm === 'tuple') return { k: 'tuple', items: ps };
    if (nm === 'list') {
      if (ps.length !== 1) return fail('list takes one');
      return { k: 'list', item: ps[0] };
    }
    if (ps.length !== 2) return fail('map takes two');
    return { k: 'map', key: ps[0], val: ps[1] };
  };
  const parseUnion = (depth: number): TypeNode => {
    const alts: TypeNode[] = [parseAlt(depth)];
    for (;;) {
      skip();
      if (s[pos] === '|') {
        pos++;
        alts.push(parseAlt(depth));
      } else break;
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i], alts[j])) fail('a union alternative is unreachable');
      }
    }
    return { k: 'union', alts };
  };
  const r = parseUnion(0);
  skip();
  if (pos < s.length) fail('unexpected text');
  return r;
}
