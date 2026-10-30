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
  let i = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + i);
  };
  const ws = (): void => {
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 9 || c === 10 || c === 13 || c === 32) i++;
      else break;
    }
  };
  const ident = (): string => {
    const m = IDENT.exec(s.slice(i));
    if (!m) return fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };
  const expect = (ch: string): void => {
    ws();
    if (s[i] !== ch) fail("expected '" + ch + "'");
    i++;
  };
  const parts = (depth: number, one: (d: number) => void): void => {
    expect('[');
    ws();
    one(depth);
    ws();
    while (s[i] === ',') {
      i++;
      ws();
      one(depth);
      ws();
    }
    if (s[i] !== ']') fail("expected ']'");
    i++;
  };
  const alt = (depth: number): TypeNode => {
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
      case 'record': {
        ws();
        if (s[i] !== '[') fail("expected '['");
        if (depth + 1 > MAX_DEPTH) fail('types nest deeper than 256');
        const d = depth + 1;
        if (name === 'record') {
          const fields: [string, TypeNode][] = [];
          parts(d, (dd) => {
            const fname = ident();
            for (const f of fields) if (f[0] === fname) fail('duplicate field');
            expect(':');
            ws();
            fields.push([fname, type(dd)]);
          });
          return { k: 'record', fields };
        }
        const ts: TypeNode[] = [];
        parts(d, (dd) => {
          ts.push(type(dd));
        });
        if (name === 'tuple') return { k: 'tuple', items: ts };
        if (name === 'list') {
          if (ts.length !== 1) fail('list takes exactly one type');
          return { k: 'list', item: ts[0] as TypeNode };
        }
        if (ts.length !== 2) fail('map takes exactly two types');
        return { k: 'map', key: ts[0] as TypeNode, val: ts[1] as TypeNode };
      }
      default:
        return fail('unknown abstract type');
    }
  };
  const type = (depth: number): TypeNode => {
    const first = alt(depth);
    ws();
    if (s[i] !== '|') return first;
    const alts: TypeNode[] = [first];
    const seen = new Set<string>([JSON.stringify(first)]);
    while (s[i] === '|') {
      i++;
      ws();
      const a = alt(depth);
      const key = JSON.stringify(a);
      if (seen.has(key)) fail('a union names the same alternative twice');
      seen.add(key);
      alts.push(a);
      ws();
    }
    return { k: 'union', alts };
  };
  ws();
  const r = type(0);
  ws();
  if (i < s.length) fail('unexpected text');
  return r;
}

export default parse_type;
