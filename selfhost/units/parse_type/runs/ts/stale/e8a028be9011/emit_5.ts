export type TypeNode =
  | { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

const MAX_DEPTH = 256;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('not text');
  let p = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + p);
  };
  const ws = (): void => {
    while (p < s.length) {
      const c = s.charCodeAt(p);
      if (c === 9 || c === 10 || c === 13 || c === 32) p++;
      else break;
    }
  };
  const name = (): string => {
    const m = IDENT.exec(s.slice(p));
    if (m === null) return fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    ws();
    if (s[p] !== ch) fail("expected '" + ch + "'");
    p++;
  };
  const parseType = (depth: number): TypeNode => {
    const alts: TypeNode[] = [];
    const seen = new Set<string>();
    for (;;) {
      ws();
      const a = parseAlt(depth);
      const key = JSON.stringify(a);
      if (seen.has(key)) fail('a union names the same alternative twice');
      seen.add(key);
      alts.push(a);
      ws();
      if (s[p] === '|') {
        p++;
        continue;
      }
      break;
    }
    if (alts.length === 1) return alts[0] as TypeNode;
    return { k: 'union', alts };
  };
  const parseAlt = (depth: number): TypeNode => {
    const n = name();
    switch (n) {
      case 'text':
      case 'bytes':
      case 'bool':
      case 'none':
      case 'i64':
      case 'u64':
      case 'f64':
      case 'json':
        return { k: n };
      case 'tuple':
      case 'list':
      case 'map':
      case 'record':
        break;
      default:
        return fail("unknown abstract type '" + n + "'");
    }
    ws();
    if (s[p] !== '[') fail("expected '['");
    if (depth + 1 > MAX_DEPTH) fail('types nest deeper than 256');
    p++;
    const d = depth + 1;
    if (n === 'record') {
      const fields: [string, TypeNode][] = [];
      const names = new Set<string>();
      for (;;) {
        ws();
        const f = name();
        if (names.has(f)) fail('duplicate field');
        names.add(f);
        expect(':');
        const t = parseType(d);
        fields.push([f, t]);
        ws();
        if (s[p] === ',') {
          p++;
          continue;
        }
        break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    const parts: TypeNode[] = [];
    for (;;) {
      parts.push(parseType(d));
      ws();
      if (s[p] === ',') {
        p++;
        continue;
      }
      break;
    }
    expect(']');
    if (n === 'tuple') return { k: 'tuple', items: parts };
    if (n === 'list') {
      if (parts.length !== 1) fail('list takes exactly one type');
      return { k: 'list', item: parts[0] as TypeNode };
    }
    if (parts.length !== 2) fail('map takes exactly two types');
    return { k: 'map', key: parts[0] as TypeNode, val: parts[1] as TypeNode };
  };
  const r = parseType(0);
  ws();
  if (p < s.length) fail('unexpected text');
  return r;
}

export default parse_type;
