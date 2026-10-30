export type TypeNode =
  | { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('expected text');
  let pos = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + pos + ' in ' + JSON.stringify(s));
  };
  const skip = (): void => {
    while (pos < s.length) {
      const c = s[pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') pos++;
      else break;
    }
  };
  const name = (): string => {
    const m = IDENT.exec(s.slice(pos));
    if (m === null) return fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    skip();
    if (s[pos] !== ch) fail("expected '" + ch + "'");
    pos++;
  };
  const alt = (): TypeNode => {
    skip();
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
    if (s[pos] !== '[') fail("expected '['");
    pos++;
    if (n === 'record') {
      const fields: [string, TypeNode][] = [];
      const seen = new Set<string>();
      for (;;) {
        skip();
        const f = name();
        if (seen.has(f)) fail('duplicate field');
        seen.add(f);
        expect(':');
        fields.push([f, type()]);
        skip();
        if (s[pos] === ',') {
          pos++;
          continue;
        }
        break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    const parts: TypeNode[] = [];
    for (;;) {
      parts.push(type());
      skip();
      if (s[pos] === ',') {
        pos++;
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
  const type = (): TypeNode => {
    const alts: TypeNode[] = [alt()];
    for (;;) {
      skip();
      if (s[pos] === '|') {
        pos++;
        alts.push(alt());
      } else break;
    }
    return alts.length === 1 ? (alts[0] as TypeNode) : { k: 'union', alts };
  };
  const r = type();
  skip();
  if (pos < s.length) fail('unexpected text');
  return r;
}

export default parse_type;
