export type TypeNode =
  | { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function scalarOf(n: string): Scalar | null {
  switch (n) {
    case 'text': case 'bytes': case 'bool': case 'none':
    case 'i64': case 'u64': case 'f64': case 'json':
      return n;
    default:
      return null;
  }
}

export default function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('non-text argument');
  let p = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + p);
  };
  const ws = (): void => {
    while (p < s.length) {
      const c = s[p];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') p++;
      else break;
    }
  };
  const ident = (): string => {
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
  const parseAlt = (): TypeNode => {
    ws();
    const name = ident();
    const sc = scalarOf(name);
    if (sc !== null) return { k: sc };
    if (name !== 'tuple' && name !== 'list' && name !== 'map' && name !== 'record') {
      return fail("unknown abstract type '" + name + "'");
    }
    if (s[p] !== '[') fail("expected '['");
    p++;
    if (name === 'record') {
      const fields: [string, TypeNode][] = [];
      const seen = new Set<string>();
      for (;;) {
        ws();
        const fname = ident();
        if (seen.has(fname)) fail('duplicate field');
        seen.add(fname);
        expect(':');
        const t = parseType();
        fields.push([fname, t]);
        ws();
        if (s[p] === ',') { p++; continue; }
        break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    const parts: TypeNode[] = [];
    for (;;) {
      parts.push(parseType());
      ws();
      if (s[p] === ',') { p++; continue; }
      break;
    }
    expect(']');
    if (name === 'tuple') return { k: 'tuple', items: parts };
    if (name === 'list') {
      if (parts.length !== 1) fail('list takes exactly one type');
      return { k: 'list', item: parts[0] };
    }
    if (parts.length !== 2) fail('map takes exactly two types');
    return { k: 'map', key: parts[0], val: parts[1] };
  };
  const parseType = (): TypeNode => {
    const alts: TypeNode[] = [parseAlt()];
    for (;;) {
      ws();
      if (s[p] === '|') {
        p++;
        alts.push(parseAlt());
      } else break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const result = parseType();
  ws();
  if (p < s.length) fail('unexpected text');
  return result;
}
