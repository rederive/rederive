type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };
type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function asScalar(w: string): Scalar | null {
  switch (w) {
    case 'text': case 'bytes': case 'bool': case 'none': case 'i64': case 'u64': case 'f64': case 'json':
      return w;
    default:
      return null;
  }
}

export default function parse_sig(s: string): Sig {
  let p = 0;
  const fail = (m: string): never => {
    throw new Error('bad SIG: ' + m + ' at ' + p);
  };
  const ws = (): void => {
    for (;;) {
      const c = s.charAt(p);
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') p++;
      else return;
    }
  };
  const eat = (t: string): boolean => {
    ws();
    if (s.startsWith(t, p)) {
      p += t.length;
      return true;
    }
    return false;
  };
  const need = (t: string): void => {
    if (!eat(t)) fail("expected '" + t + "'");
  };
  const ident = (): string => {
    ws();
    const m = IDENT.exec(s.slice(p));
    if (m === null) return fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };

  let type: () => TypeTree = () => ({ k: 'none' });

  const alt = (): TypeTree => {
    const w = ident();
    const sc = asScalar(w);
    if (sc !== null) return { k: sc };
    if (w === 'tuple') {
      need('[');
      const items: TypeTree[] = [type()];
      while (eat(',')) items.push(type());
      need(']');
      return { k: 'tuple', items };
    }
    if (w === 'list') {
      need('[');
      const item = type();
      need(']');
      return { k: 'list', item };
    }
    if (w === 'map') {
      need('[');
      const key = type();
      need(',');
      const val = type();
      need(']');
      return { k: 'map', key, val };
    }
    if (w === 'record') {
      need('[');
      const fields: [string, TypeTree][] = [];
      const seen = new Set<string>();
      for (;;) {
        const n = ident();
        if (seen.has(n)) fail('duplicate field');
        seen.add(n);
        need(':');
        fields.push([n, type()]);
        if (!eat(',')) break;
      }
      need(']');
      return { k: 'record', fields };
    }
    return fail('unknown type');
  };

  const bracketAlt = (): TypeTree => {
    ws();
    const save = p;
    const m = IDENT.exec(s.slice(p));
    if (m !== null && (m[0] === 'tuple' || m[0] === 'list' || m[0] === 'map' || m[0] === 'record')) {
      const after = p + m[0].length;
      if (s.charAt(after) !== '[') {
        p = after;
        return fail("expected '['");
      }
    }
    p = save;
    return alt();
  };

  type = (): TypeTree => {
    const first = bracketAlt();
    const alts: TypeTree[] = [first];
    while (eat('|')) alts.push(bracketAlt());
    if (alts.length === 1) return first;
    return { k: 'union', alts };
  };

  ws();
  if (s.startsWith('pub fn', p) && /^[ \t]/.test(s.slice(p + 6, p + 7))) p += 6;
  else if (s.startsWith('export default function', p) && /^[ \t]/.test(s.slice(p + 23, p + 24))) p += 23;

  const name = ident();
  need('(');
  const args: Arg[] = [];
  const names = new Set<string>();
  let sawRest = false;
  if (!eat(')')) {
    for (;;) {
      if (sawRest) fail('rest parameter must be last');
      const rest = eat('...');
      const n = ident();
      if (names.has(n)) fail('duplicate parameter');
      names.add(n);
      need(':');
      const t = type();
      if (rest) {
        sawRest = true;
        args.push({ name: n, type: t, rest: true });
      } else {
        args.push({ name: n, type: t });
      }
      if (eat(',')) continue;
      need(')');
      break;
    }
  }
  if (!eat('->') && !eat(':')) fail("expected '->' or ':'");
  const result = type();
  ws();
  if (p !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
