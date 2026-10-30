type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';
type TypeTree = { k: Scalar } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

const SCALARS: Scalar[] = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function isScalar(w: string): w is Scalar {
  return (SCALARS as string[]).indexOf(w) >= 0;
}

export default function parse_sig(s: string): Sig {
  let i = 0;
  const fail = (m: string): never => {
    throw new Error('bad SIG: ' + m + ' at ' + i);
  };
  const ws = (): void => {
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
      else break;
    }
  };
  const lit = (t: string): boolean => {
    if (s.startsWith(t, i)) {
      i += t.length;
      return true;
    }
    return false;
  };
  const expect = (t: string): void => {
    ws();
    if (!lit(t)) fail("expected '" + t + "'");
  };
  const ident = (): string => {
    ws();
    const m = IDENT.exec(s.slice(i));
    if (m === null) return fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };

  const type = (): TypeTree => {
    const alts: TypeTree[] = [alt()];
    for (;;) {
      ws();
      if (s[i] === '|') {
        i++;
        alts.push(alt());
      } else break;
    }
    if (alts.length >= 2) return { k: 'union', alts };
    const first = alts[0];
    if (first === undefined) return fail('type');
    return first;
  };

  const alt = (): TypeTree => {
    const w = ident();
    if (w === 'tuple' || w === 'list' || w === 'map' || w === 'record') {
      if (s[i] !== '[') return fail("expected '['");
      i++;
      if (w === 'tuple') {
        const items: TypeTree[] = [type()];
        for (;;) {
          ws();
          if (s[i] === ',') {
            i++;
            items.push(type());
          } else break;
        }
        expect(']');
        return { k: 'tuple', items };
      }
      if (w === 'list') {
        const item = type();
        expect(']');
        return { k: 'list', item };
      }
      if (w === 'map') {
        const key = type();
        expect(',');
        const val = type();
        expect(']');
        return { k: 'map', key, val };
      }
      const fields: [string, TypeTree][] = [];
      const seen = new Set<string>();
      for (;;) {
        const n = ident();
        if (seen.has(n)) fail('duplicate field');
        seen.add(n);
        expect(':');
        fields.push([n, type()]);
        ws();
        if (s[i] === ',') i++;
        else break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    if (isScalar(w)) return { k: w };
    return fail('unknown type');
  };

  ws();
  if (s.startsWith('pub fn', i) && (s[i + 6] === ' ' || s[i + 6] === '\t')) i += 7;
  else if (s.startsWith('export default function', i) && (s[i + 23] === ' ' || s[i + 23] === '\t')) i += 24;
  const name = ident();
  expect('(');
  const args: Arg[] = [];
  const names = new Set<string>();
  let sawRest = false;
  ws();
  if (s[i] === ')') {
    i++;
  } else {
    for (;;) {
      if (sawRest) fail('rest parameter must be last');
      ws();
      const rest = lit('...');
      const n = ident();
      if (names.has(n)) fail('duplicate parameter');
      names.add(n);
      expect(':');
      const t = type();
      if (rest) {
        sawRest = true;
        args.push({ name: n, type: t, rest: true });
      } else args.push({ name: n, type: t });
      ws();
      if (s[i] === ',') {
        i++;
        continue;
      }
      if (s[i] === ')') {
        i++;
        break;
      }
      fail("expected ','");
    }
  }
  ws();
  if (!lit('->') && !lit(':')) fail("expected '->'");
  const result = type();
  ws();
  if (i !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
