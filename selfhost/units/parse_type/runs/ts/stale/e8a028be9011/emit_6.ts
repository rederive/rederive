export type TypeNode =
  | { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

const MAX_DEPTH = 256;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export default function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('non-text argument');
  let pos = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + pos);
  };
  const ws = (): void => {
    while (pos < s.length) {
      const c = s.charCodeAt(pos);
      if (c === 9 || c === 10 || c === 13 || c === 32) pos++;
      else break;
    }
  };
  const ident = (): string => {
    const m = IDENT.exec(s.slice(pos));
    if (!m) return fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    ws();
    if (s[pos] !== ch) fail("expected '" + ch + "'");
    pos++;
  };

  const parseType = (depth: number): TypeNode => {
    const alts: TypeNode[] = [];
    const seen = new Set<string>();
    const add = (n: TypeNode): void => {
      const key = JSON.stringify(n);
      if (seen.has(key)) fail('a union names the same alternative twice');
      seen.add(key);
      alts.push(n);
    };
    ws();
    add(parseAlt(depth));
    for (;;) {
      ws();
      if (s[pos] !== '|') break;
      pos++;
      ws();
      add(parseAlt(depth));
    }
    if (alts.length === 1) return alts[0] as TypeNode;
    return { k: 'union', alts };
  };

  const parts = (depth: number): TypeNode[] => {
    const out: TypeNode[] = [parseType(depth)];
    for (;;) {
      ws();
      if (s[pos] === ',') {
        pos++;
        out.push(parseType(depth));
      } else break;
    }
    expect(']');
    return out;
  };

  const parseAlt = (depth: number): TypeNode => {
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
        return fail('unknown abstract type');
    }
    expect('[');
    const d = depth + 1;
    if (d > MAX_DEPTH) fail('types nest deeper than 256');
    if (name === 'record') {
      const fields: [string, TypeNode][] = [];
      const names = new Set<string>();
      for (;;) {
        ws();
        const fname = ident();
        if (names.has(fname)) fail('duplicate field');
        names.add(fname);
        expect(':');
        fields.push([fname, parseType(d)]);
        ws();
        if (s[pos] === ',') pos++;
        else break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    const ps = parts(d);
    if (name === 'tuple') return { k: 'tuple', items: ps };
    if (name === 'list') {
      if (ps.length !== 1) fail('list takes exactly one type');
      return { k: 'list', item: ps[0] as TypeNode };
    }
    if (ps.length !== 2) fail('map takes exactly two types');
    return { k: 'map', key: ps[0] as TypeNode, val: ps[1] as TypeNode };
  };

  const node = parseType(0);
  ws();
  if (pos < s.length) fail('unexpected text');
  return node;
}
