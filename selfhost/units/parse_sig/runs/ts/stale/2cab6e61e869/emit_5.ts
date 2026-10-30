type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

function asScalar(n: string): Scalar | null {
  switch (n) {
    case 'text': case 'bytes': case 'bool': case 'none': case 'i64': case 'u64': case 'f64': case 'json':
      return n;
    default:
      return null;
  }
}

const MAX_DEPTH = 256;

export default function parse_sig(s: string): Sig {
  let pos = 0;
  let depth = 0;
  const fail = (m: string): never => {
    throw new Error('bad SIG: ' + m + ' at ' + pos);
  };
  const ws = (): void => {
    for (;;) {
      const c = s.charAt(pos);
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') pos++;
      else break;
    }
  };
  const peekIdent = (): string | null => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(pos));
    return m ? m[0] : null;
  };
  const ident = (): string => {
    ws();
    const id = peekIdent();
    if (id === null) return fail('expected an identifier');
    pos += id.length;
    return id;
  };
  const lit = (t: string): boolean => {
    ws();
    if (s.startsWith(t, pos)) {
      pos += t.length;
      return true;
    }
    return false;
  };
  const need = (t: string): void => {
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
    if (alts.length === 1) {
      const only = alts[0];
      if (only === undefined) return fail('internal');
      return only;
    }
    return { k: 'union', alts };
  };

  const enter = (): void => {
    depth++;
    if (depth > MAX_DEPTH) fail('nesting too deep');
  };

  const parseAlt = (): TypeTree => {
    const name = ident();
    const sc = asScalar(name);
    if (sc !== null) return { k: sc };
    if (name === 'list') {
      need('[');
      enter();
      const item = parseType();
      need(']');
      depth--;
      return { k: 'list', item };
    }
    if (name === 'map') {
      need('[');
      enter();
      const key = parseType();
      need(',');
      const val = parseType();
      need(']');
      depth--;
      return { k: 'map', key, val };
    }
    if (name === 'tuple') {
      need('[');
      enter();
      const items: TypeTree[] = [parseType()];
      while (lit(',')) items.push(parseType());
      need(']');
      depth--;
      return { k: 'tuple', items };
    }
    if (name === 'record') {
      need('[');
      enter();
      const fields: [string, TypeTree][] = [];
      const names = new Set<string>();
      for (;;) {
        const fn = ident();
        if (names.has(fn)) fail('duplicate field name');
        names.add(fn);
        need(':');
        fields.push([fn, parseType()]);
        if (!lit(',')) break;
      }
      need(']');
      depth--;
      return { k: 'record', fields };
    }
    return fail('unknown type ' + name);
  };

  const tryPrefix = (words: string[]): boolean => {
    const save = pos;
    for (const w of words) {
      ws();
      const id = peekIdent();
      if (id !== w) {
        pos = save;
        return false;
      }
      pos += id.length;
    }
    ws();
    if (peekIdent() === null) {
      pos = save;
      return false;
    }
    return true;
  };

  if (!tryPrefix(['pub', 'fn'])) tryPrefix(['export', 'default', 'function']);
  const name = ident();
  need('(');
  const args: Arg[] = [];
  const pnames = new Set<string>();
  let restSeen = false;
  ws();
  if (!lit(')')) {
    for (;;) {
      if (restSeen) fail('a rest parameter must be last');
      const rest = lit('...');
      const an = ident();
      if (pnames.has(an)) fail('duplicate parameter name');
      pnames.add(an);
      need(':');
      depth = 0;
      const type = parseType();
      if (rest) {
        restSeen = true;
        args.push({ name: an, type, rest: true });
      } else {
        args.push({ name: an, type });
      }
      if (lit(',')) continue;
      need(')');
      break;
    }
  }
  if (!lit('->') && !lit(':')) fail("expected '->' or ':' before the result type");
  depth = 0;
  const result = parseType();
  ws();
  if (pos !== s.length) fail('unexpected trailing input');
  return { name, args, result };
}
