type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

function scalarOf(w: string): Scalar | null {
  switch (w) {
    case 'text': case 'bytes': case 'bool': case 'none': case 'i64': case 'u64': case 'f64': case 'json':
      return w;
    default:
      return null;
  }
}

const MAX_DEPTH = 256;

export default function parse_sig(s: string): Sig {
  let p = 0;
  const fail = (m: string): never => {
    throw new Error('bad SIG: ' + m + ' at ' + p);
  };
  const ws = (): void => {
    while (p < s.length) {
      const c = s[p];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') p++;
      else break;
    }
  };
  const peekIdent = (): string | null => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(p));
    return m ? m[0] : null;
  };
  const ident = (): string => {
    ws();
    const w = peekIdent();
    if (w === null) return fail('expected an identifier');
    p += w.length;
    return w;
  };
  const lit = (t: string): boolean => {
    ws();
    if (s.startsWith(t, p)) {
      p += t.length;
      return true;
    }
    return false;
  };
  const expect = (t: string): void => {
    if (!lit(t)) fail("expected '" + t + "'");
  };

  const tryPrefix = (words: string[]): boolean => {
    const save = p;
    for (const w of words) {
      ws();
      const id = peekIdent();
      if (id !== w) {
        p = save;
        return false;
      }
      p += id.length;
    }
    ws();
    if (peekIdent() === null) {
      p = save;
      return false;
    }
    return true;
  };

  let depth = 0;

  const parseType = (): TypeTree => {
    const alts: TypeTree[] = [];
    const seen = new Set<string>();
    for (;;) {
      const a = parseAlt();
      const key = JSON.stringify(a);
      if (seen.has(key)) fail('duplicate alternative');
      seen.add(key);
      alts.push(a);
      if (!lit('|')) break;
    }
    const first = alts[0];
    if (alts.length === 1 && first !== undefined) return first;
    return { k: 'union', alts };
  };

  const parseAlt = (): TypeTree => {
    const w = ident();
    const sc = scalarOf(w);
    if (sc !== null) return { k: sc };
    if (w !== 'tuple' && w !== 'list' && w !== 'map' && w !== 'record') return fail('unknown type');
    expect('[');
    depth++;
    if (depth > MAX_DEPTH) fail('nesting too deep');
    let r: TypeTree;
    if (w === 'list') {
      r = { k: 'list', item: parseType() };
    } else if (w === 'map') {
      const key = parseType();
      expect(',');
      const val = parseType();
      r = { k: 'map', key, val };
    } else if (w === 'tuple') {
      const items: TypeTree[] = [parseType()];
      while (lit(',')) items.push(parseType());
      r = { k: 'tuple', items };
    } else {
      const fields: [string, TypeTree][] = [];
      const names = new Set<string>();
      for (;;) {
        const n = ident();
        if (names.has(n)) fail('duplicate field name');
        names.add(n);
        expect(':');
        fields.push([n, parseType()]);
        if (!lit(',')) break;
      }
      r = { k: 'record', fields };
    }
    expect(']');
    depth--;
    return r;
  };

  if (!tryPrefix(['pub', 'fn'])) tryPrefix(['export', 'default', 'function']);
  const name = ident();
  expect('(');
  const args: Arg[] = [];
  const names = new Set<string>();
  let sawRest = false;
  ws();
  if (!s.startsWith(')', p)) {
    for (;;) {
      if (sawRest) fail('a rest parameter must be last');
      const rest = lit('...');
      const an = ident();
      if (names.has(an)) fail('duplicate parameter name');
      names.add(an);
      expect(':');
      depth = 0;
      const type = parseType();
      if (rest) {
        sawRest = true;
        args.push({ name: an, type, rest: true });
      } else {
        args.push({ name: an, type });
      }
      if (!lit(',')) break;
    }
  }
  expect(')');
  if (!lit('->') && !lit(':')) fail("expected '->' or ':' before the result type");
  depth = 0;
  const result = parseType();
  ws();
  if (p !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
