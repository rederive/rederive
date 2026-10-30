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
  let i = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + i + ' in ' + JSON.stringify(s));
  };
  const ws = (): void => {
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 9 || c === 10 || c === 13 || c === 32) i++;
      else break;
    }
  };
  const name = (): string => {
    const m = IDENT.exec(s.slice(i));
    if (m === null) return fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    if (s[i] !== ch) fail("expected '" + ch + "'");
    i++;
  };
  const parts = (): TypeNode[] => {
    const out: TypeNode[] = [];
    for (;;) {
      out.push(type());
      ws();
      if (s[i] === ',') {
        i++;
        continue;
      }
      expect(']');
      return out;
    }
  };
  const alt = (): TypeNode => {
    ws();
    const n = name();
    const sc = scalarOf(n);
    if (sc !== null) return { k: sc };
    if (n !== 'tuple' && n !== 'list' && n !== 'map' && n !== 'record') {
      return fail("unknown abstract type '" + n + "'");
    }
    expect('[');
    if (n === 'record') {
      const fields: [string, TypeNode][] = [];
      const seen: string[] = [];
      for (;;) {
        ws();
        const f = name();
        if (seen.indexOf(f) >= 0) fail('duplicate field');
        seen.push(f);
        ws();
        expect(':');
        fields.push([f, type()]);
        ws();
        if (s[i] === ',') {
          i++;
          continue;
        }
        expect(']');
        return { k: 'record', fields };
      }
    }
    const ps = parts();
    if (n === 'tuple') return { k: 'tuple', items: ps };
    if (n === 'list') {
      if (ps.length !== 1) return fail('list takes exactly one type');
      return { k: 'list', item: ps[0] as TypeNode };
    }
    if (ps.length !== 2) return fail('map takes exactly two types');
    return { k: 'map', key: ps[0] as TypeNode, val: ps[1] as TypeNode };
  };
  const type = (): TypeNode => {
    const first = alt();
    ws();
    if (s[i] !== '|') return first;
    const alts: TypeNode[] = [first];
    while (s[i] === '|') {
      i++;
      alts.push(alt());
      ws();
    }
    return { k: 'union', alts };
  };
  const r = type();
  ws();
  if (i < s.length) fail('unexpected text');
  return r;
}
