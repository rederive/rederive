type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

function scalarOf(s: string): Scalar | null {
  switch (s) {
    case 'text': case 'bytes': case 'bool': case 'none': case 'i64': case 'u64': case 'f64': case 'json':
      return s;
    default:
      return null;
  }
}

function key(t: TypeTree): string {
  switch (t.k) {
    case 'union': return 'u[' + t.alts.map(key).sort().join(',') + ']';
    case 'tuple': return 't[' + t.items.map(key).join(',') + ']';
    case 'list': return 'l[' + key(t.item) + ']';
    case 'map': return 'm[' + key(t.key) + ',' + key(t.val) + ']';
    case 'record': return 'r[' + t.fields.map(([n, x]) => n + '=' + key(x)).sort().join(',') + ']';
    default: return t.k;
  }
}

function jsonShaped(t: TypeTree): boolean {
  switch (t.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'i64': case 'u64': case 'bytes': return false;
    case 'list': return jsonShaped(t.item);
    case 'map': return t.key.k === 'text' && jsonShaped(t.val);
    case 'tuple': return t.items.every(jsonShaped);
    case 'record': return t.fields.every(([, x]) => jsonShaped(x));
    case 'union': return t.alts.every(jsonShaped);
  }
}

function covers(a: TypeTree, b: TypeTree): boolean {
  if (key(a) === key(b)) return true;
  if (a.k === 'json' && jsonShaped(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length
    && a.items.every((x, i) => { const y = b.items[i]; return y !== undefined && covers(x, y); })) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record') {
    const bf = b.fields;
    if (a.fields.every(([n, x]) => bf.some(([m, y]) => m === n && covers(x, y)))) return true;
  }
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

export default function parse_sig(s: string): Sig {
  let p = 0;
  const fail = (m: string): never => { throw new Error('bad SIG: ' + m + ' at ' + p); };
  const ws = (): void => {
    while (p < s.length) {
      const c = s.charAt(p);
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') p++; else break;
    }
  };
  const ident = (): string | null => {
    ws();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(p));
    if (m === null) return null;
    p += m[0].length;
    return m[0];
  };
  const lit = (t: string): boolean => {
    ws();
    if (s.startsWith(t, p)) { p += t.length; return true; }
    return false;
  };
  const need = (t: string): void => { if (!lit(t)) fail('expected ' + t); };
  const needIdent = (): string => { const i = ident(); return i === null ? fail('expected identifier') : i; };

  const alt = (depth: number): TypeTree => {
    const id = needIdent();
    const sc = scalarOf(id);
    if (sc !== null) return { k: sc };
    if (id !== 'tuple' && id !== 'list' && id !== 'map' && id !== 'record') return fail('unknown type ' + id);
    if (depth + 1 > 16) fail('types nest deeper than 16');
    need('[');
    let r: TypeTree;
    if (id === 'list') {
      r = { k: 'list', item: type(depth + 1) };
    } else if (id === 'map') {
      const kk = type(depth + 1);
      need(',');
      r = { k: 'map', key: kk, val: type(depth + 1) };
    } else if (id === 'tuple') {
      const items: TypeTree[] = [type(depth + 1)];
      while (lit(',')) items.push(type(depth + 1));
      r = { k: 'tuple', items };
    } else {
      const fields: [string, TypeTree][] = [];
      const seen = new Set<string>();
      do {
        const n = needIdent();
        if (seen.has(n)) fail('duplicate field ' + n);
        seen.add(n);
        need(':');
        fields.push([n, type(depth + 1)]);
      } while (lit(','));
      r = { k: 'record', fields };
    }
    need(']');
    return r;
  };

  const type = (depth: number): TypeTree => {
    const alts: TypeTree[] = [alt(depth)];
    while (lit('|')) alts.push(alt(depth));
    for (let j = 1; j < alts.length; j++) {
      const b = alts[j];
      if (b === undefined) continue;
      for (let i = 0; i < j; i++) {
        const a = alts[i];
        if (a !== undefined && covers(a, b)) fail('a union alternative is unreachable');
      }
    }
    if (alts.length === 1) {
      const only = alts[0];
      if (only === undefined) return fail('empty');
      return only;
    }
    return { k: 'union', alts };
  };

  const save = p;
  const w1 = ident();
  const w2 = w1 === 'pub' ? ident() : null;
  const w3 = w1 === 'export' ? ident() : null;
  let w4: string | null = null;
  if (w1 === 'export' && w3 === 'default') w4 = ident();
  let hasPrefix = false;
  if ((w1 === 'pub' && w2 === 'fn') || (w1 === 'export' && w3 === 'default' && w4 === 'function')) {
    ws();
    hasPrefix = /^[A-Za-z_]/.test(s.slice(p, p + 1));
  }
  if (!hasPrefix) p = save;
  const name = needIdent();
  need('(');
  const args: Arg[] = [];
  const names = new Set<string>();
  if (!lit(')')) {
    do {
      const rest = lit('...');
      const an = needIdent();
      if (names.has(an)) fail('duplicate param ' + an);
      names.add(an);
      need(':');
      const t = type(0);
      if (rest) args.push({ name: an, type: t, rest: true }); else args.push({ name: an, type: t });
    } while (lit(','));
    need(')');
  }
  for (let i = 0; i < args.length - 1; i++) {
    const a = args[i];
    if (a !== undefined && a.rest === true) fail('rest parameter must be last');
  }
  if (!lit('->') && !lit(':')) fail('expected -> or :');
  const result = type(0);
  ws();
  if (p !== s.length) fail('trailing input');
  return { name, args, result };
}
