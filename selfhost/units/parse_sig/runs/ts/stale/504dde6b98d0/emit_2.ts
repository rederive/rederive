type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

function isScalar(w: string): w is Scalar {
  return w === 'text' || w === 'bytes' || w === 'bool' || w === 'none' || w === 'i64' || w === 'u64' || w === 'f64' || w === 'json';
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
  const ident = (): string => {
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (m === null) return fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };
  const lit = (t: string): void => {
    if (!s.startsWith(t, i)) fail("expected '" + t + "'");
    i += t.length;
  };
  const type = (): TypeTree => {
    const alts: TypeTree[] = [alt()];
    for (;;) {
      ws();
      if (s.startsWith('|', i)) {
        i++;
        alts.push(alt());
      } else break;
    }
    const first = alts[0];
    if (alts.length === 1 && first !== undefined) return first;
    return { k: 'union', alts };
  };
  const alt = (): TypeTree => {
    ws();
    const w = ident();
    if (isScalar(w)) return { k: w };
    if (w === 'tuple') {
      lit('[');
      const items: TypeTree[] = [];
      for (;;) {
        ws();
        items.push(type());
        ws();
        if (s.startsWith(',', i)) i++;
        else break;
      }
      lit(']');
      return { k: 'tuple', items };
    }
    if (w === 'list') {
      lit('[');
      const item = type();
      ws();
      lit(']');
      return { k: 'list', item };
    }
    if (w === 'map') {
      lit('[');
      const key = type();
      ws();
      lit(',');
      const val = type();
      ws();
      lit(']');
      return { k: 'map', key, val };
    }
    if (w === 'record') {
      lit('[');
      const fields: [string, TypeTree][] = [];
      const seen = new Set<string>();
      for (;;) {
        ws();
        const n = ident();
        if (seen.has(n)) fail('duplicate field');
        seen.add(n);
        ws();
        lit(':');
        const t = type();
        fields.push([n, t]);
        ws();
        if (s.startsWith(',', i)) i++;
        else break;
      }
      lit(']');
      return { k: 'record', fields };
    }
    i -= w.length;
    return fail('unknown type');
  };

  ws();
  for (const p of ['pub fn', 'export default function']) {
    if (s.startsWith(p, i)) {
      const c = s[i + p.length];
      if (c === ' ' || c === '\t') {
        i += p.length + 1;
        break;
      }
    }
  }
  ws();
  const name = ident();
  ws();
  lit('(');
  ws();
  const args: Arg[] = [];
  const names = new Set<string>();
  let sawRest = false;
  if (s.startsWith(')', i)) {
    i++;
  } else {
    for (;;) {
      ws();
      if (sawRest) fail('rest parameter must be last');
      let rest = false;
      if (s.startsWith('...', i)) {
        i += 3;
        rest = true;
        sawRest = true;
        ws();
      }
      const n = ident();
      if (names.has(n)) fail('duplicate parameter');
      names.add(n);
      ws();
      lit(':');
      const t = type();
      args.push(rest ? { name: n, type: t, rest: true } : { name: n, type: t });
      ws();
      if (s.startsWith(',', i)) {
        i++;
        continue;
      }
      lit(')');
      break;
    }
  }
  ws();
  if (s.startsWith('->', i)) i += 2;
  else if (s.startsWith(':', i)) i++;
  else fail("expected '->'");
  const result = type();
  ws();
  if (i !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
