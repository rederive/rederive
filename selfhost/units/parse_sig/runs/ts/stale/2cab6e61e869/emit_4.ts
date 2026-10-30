type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const MAX_DEPTH = 256;

function scalarOf(w: string): TypeTree | null {
  switch (w) {
    case 'text': return { k: 'text' };
    case 'bytes': return { k: 'bytes' };
    case 'bool': return { k: 'bool' };
    case 'none': return { k: 'none' };
    case 'i64': return { k: 'i64' };
    case 'u64': return { k: 'u64' };
    case 'f64': return { k: 'f64' };
    case 'json': return { k: 'json' };
    default: return null;
  }
}

export default function parse_sig(s: string): Sig {
  let i = 0;
  let depth = 0;
  const fail = (m: string): never => { throw new Error('bad SIG: ' + m + ' at ' + String(i)); };
  const ws = (): void => {
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') i++;
      else break;
    }
  };
  const peekIdent = (): string | null => {
    const m = IDENT.exec(s.slice(i));
    return m === null ? null : m[0];
  };
  const ident = (): string => {
    ws();
    const w = peekIdent();
    if (w === null) return fail('expected an identifier');
    i += w.length;
    return w;
  };
  const lit = (t: string): boolean => {
    ws();
    if (s.startsWith(t, i)) { i += t.length; return true; }
    return false;
  };
  const expect = (t: string): void => {
    if (!lit(t)) fail("expected '" + t + "'");
  };

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

  const enter = (): void => {
    depth++;
    if (depth > MAX_DEPTH) fail('nesting too deep');
  };

  const parseAlt = (): TypeTree => {
    const w = ident();
    if (w === 'tuple') {
      expect('[');
      enter();
      const items: TypeTree[] = [parseType()];
      while (lit(',')) items.push(parseType());
      expect(']');
      depth--;
      return { k: 'tuple', items };
    }
    if (w === 'list') {
      expect('[');
      enter();
      const item = parseType();
      expect(']');
      depth--;
      return { k: 'list', item };
    }
    if (w === 'map') {
      expect('[');
      enter();
      const key = parseType();
      expect(',');
      const val = parseType();
      expect(']');
      depth--;
      return { k: 'map', key, val };
    }
    if (w === 'record') {
      expect('[');
      enter();
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
      expect(']');
      depth--;
      return { k: 'record', fields };
    }
    const sc = scalarOf(w);
    if (sc === null) return fail('unknown type');
    return sc;
  };

  ws();
  const save = i;
  let hasPrefix = false;
  const tryPrefix = (words: string[]): boolean => {
    i = save;
    for (let n = 0; n < words.length; n++) {
      ws();
      const w = peekIdent();
      if (w === null || w !== words[n]) return false;
      i += w.length;
    }
    ws();
    return peekIdent() !== null;
  };
  if (tryPrefix(['pub', 'fn']) || tryPrefix(['export', 'default', 'function'])) hasPrefix = true;
  else i = save;
  void hasPrefix;

  const name = ident();
  expect('(');
  const args: Arg[] = [];
  const pnames = new Set<string>();
  ws();
  if (!lit(')')) {
    for (;;) {
      const rest = lit('...');
      const an = ident();
      if (pnames.has(an)) fail('duplicate parameter name');
      pnames.add(an);
      expect(':');
      depth = 0;
      const type = parseType();
      if (rest) args.push({ name: an, type, rest: true });
      else args.push({ name: an, type });
      if (lit(',')) {
        if (rest) fail('a rest parameter must be last');
        continue;
      }
      expect(')');
      break;
    }
  }
  if (!lit('->') && !lit(':')) fail("expected '->' or ':' before the result type");
  depth = 0;
  const result = parseType();
  ws();
  if (i !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
