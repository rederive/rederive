export type TypeNode =
  | { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

const MAX_DEPTH = 16;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

// canonical identity string (order-insensitive for unions and records)
function keyOf(n: TypeNode): string {
  switch (n.k) {
    case 'union':
      return 'U(' + Array.from(new Set(n.alts.map(keyOf))).sort().join(',') + ')';
    case 'tuple':
      return 'T(' + n.items.map(keyOf).join(',') + ')';
    case 'list':
      return 'L(' + keyOf(n.item) + ')';
    case 'map':
      return 'M(' + keyOf(n.key) + ',' + keyOf(n.val) + ')';
    case 'record':
      return 'R(' + n.fields.map((f) => f[0] + ':' + keyOf(f[1])).sort().join(',') + ')';
    default:
      return n.k;
  }
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
  if (keyOf(e) === keyOf(l)) return true;
  if (e.k === 'json' && jsonShaped(l)) return true;
  if (e.k === 'list' && l.k === 'list' && covers(e.item, l.item)) return true;
  if (e.k === 'tuple' && l.k === 'tuple' && e.items.length === l.items.length) {
    const li = l.items;
    if (e.items.every((x, i) => covers(x, li[i] as TypeNode))) return true;
  }
  if (e.k === 'map' && l.k === 'map' && covers(e.key, l.key) && covers(e.val, l.val)) return true;
  if (e.k === 'record' && l.k === 'record') {
    const lf = l.fields;
    const ok = e.fields.every((ef) => {
      const m = lf.find((x) => x[0] === ef[0]);
      return m !== undefined && covers(ef[1], m[1]);
    });
    if (ok) return true;
  }
  if (e.k === 'union' && e.alts.some((a) => covers(a, l))) return true;
  if (l.k === 'union' && l.alts.every((a) => covers(e, a))) return true;
  return false;
}

export function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('non-text argument');
  let pos = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + pos + ' in ' + JSON.stringify(s));
  };
  const skip = (): void => {
    while (pos < s.length) {
      const c = s.charCodeAt(pos);
      if (c === 9 || c === 10 || c === 13 || c === 32) pos++;
      else break;
    }
  };
  const ident = (): string => {
    const m = IDENT.exec(s.slice(pos));
    if (m === null) return fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    skip();
    if (s[pos] !== ch) fail('expected ' + ch);
    pos++;
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
    if (alts.length === 1) return alts[0] as TypeNode;
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i] as TypeNode, alts[j] as TypeNode)) fail('a union alternative is unreachable');
      }
    }
    return { k: 'union', alts };
  };

  const parseParts = (depth: number): TypeNode[] => {
    const parts: TypeNode[] = [];
    for (;;) {
      parts.push(parseUnion(depth));
      skip();
      if (s[pos] === ',') {
        pos++;
        continue;
      }
      if (s[pos] === ']') {
        pos++;
        return parts;
      }
      return fail('expected , or ]');
    }
  };

  const parseAlt = (depth: number): TypeNode => {
    skip();
    const name = ident();
    switch (name) {
      case 'text':
      case 'bytes':
      case 'bool':
      case 'none':
      case 'i64':
      case 'u64':
      case 'f64':
      case 'json':
        return { k: name };
      case 'tuple':
      case 'list':
      case 'map':
      case 'record':
        break;
      default:
        return fail("unknown abstract type '" + name + "'");
    }
    if (depth + 1 > MAX_DEPTH) fail('types nest deeper than ' + MAX_DEPTH);
    expect('[');
    const d = depth + 1;
    if (name === 'record') {
      const fields: [string, TypeNode][] = [];
      for (;;) {
        skip();
        const fname = ident();
        if (fields.some((f) => f[0] === fname)) fail('duplicate field ' + fname);
        expect(':');
        fields.push([fname, parseUnion(d)]);
        skip();
        if (s[pos] === ',') {
          pos++;
          continue;
        }
        if (s[pos] === ']') {
          pos++;
          break;
        }
        fail('expected , or ]');
      }
      return { k: 'record', fields };
    }
    const parts = parseParts(d);
    if (name === 'tuple') return { k: 'tuple', items: parts };
    if (name === 'list') {
      if (parts.length !== 1) return fail('list takes one type');
      return { k: 'list', item: parts[0] as TypeNode };
    }
    if (parts.length !== 2) return fail('map takes two types');
    return { k: 'map', key: parts[0] as TypeNode, val: parts[1] as TypeNode };
  };

  const root = parseUnion(0);
  skip();
  if (pos !== s.length) fail('unexpected text');
  return root;
}
