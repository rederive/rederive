type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };

const MAX_DEPTH = 16;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function scalarOf(n: string): TypeTree | null {
  switch (n) {
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

function key(t: TypeTree): string {
  switch (t.k) {
    case 'union': return 'union[' + t.alts.map(key).sort().join(',') + ']';
    case 'tuple': return 'tuple[' + t.items.map(key).join(',') + ']';
    case 'list': return 'list[' + key(t.item) + ']';
    case 'map': return 'map[' + key(t.key) + ',' + key(t.val) + ']';
    case 'record': return 'record[' + t.fields.map((f) => f[0] + '=' + key(f[1])).sort().join(',') + ']';
    default: return t.k;
  }
}

function shaped(t: TypeTree): boolean {
  switch (t.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'i64': case 'u64': case 'bytes': return false;
    case 'list': return shaped(t.item);
    case 'map': return t.key.k === 'text' && shaped(t.val);
    case 'tuple': return t.items.every(shaped);
    case 'record': return t.fields.every((f) => shaped(f[1]));
    case 'union': return t.alts.every(shaped);
  }
}

function covers(a: TypeTree, b: TypeTree): boolean {
  if (key(a) === key(b)) return true;
  if (a.k === 'json' && shaped(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length) {
    let ok = true;
    for (let i = 0; i < a.items.length; i++) {
      const x = a.items[i];
      const y = b.items[i];
      if (x === undefined || y === undefined || !covers(x, y)) { ok = false; break; }
    }
    if (ok) return true;
  }
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record') {
    const bf = b.fields;
    const ok = a.fields.every((f) => bf.some((g) => g[0] === f[0] && covers(f[1], g[1])));
    if (ok) return true;
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
      const c = s[p];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') p++; else break;
    }
  };
  const lit = (t: string): boolean => {
    ws();
    if (s.startsWith(t, p)) { p += t.length; return true; }
    return false;
  };
  const expect = (t: string): void => { if (!lit(t)) fail('expected ' + t); };
  const peekIdent = (): string | null => {
    ws();
    const m = IDENT.exec(s.slice(p));
    return m ? m[0] : null;
  };
  const ident = (): string => {
    const id = peekIdent();
    if (id === null) return fail('expected identifier');
    p += id.length;
    return id;
  };

  const type = (depth: number): TypeTree => {
    const alts: TypeTree[] = [];
    for (;;) {
      const alt = parseAlt(depth);
      for (const e of alts) if (covers(e, alt)) fail('unreachable alternative');
      alts.push(alt);
      if (!lit('|')) break;
    }
    const first = alts[0];
    if (alts.length === 1 && first !== undefined) return first;
    return { k: 'union', alts };
  };

  const enter = (depth: number): number => {
    const d = depth + 1;
    if (d > MAX_DEPTH) fail('types nest too deep');
    return d;
  };

  const parseAlt = (depth: number): TypeTree => {
    const id = ident();
    if (id === 'tuple') {
      const d = enter(depth);
      expect('[');
      const items: TypeTree[] = [type(d)];
      while (lit(',')) items.push(type(d));
      expect(']');
      return { k: 'tuple', items };
    }
    if (id === 'list') {
      const d = enter(depth);
      expect('[');
      const item = type(d);
      expect(']');
      return { k: 'list', item };
    }
    if (id === 'map') {
      const d = enter(depth);
      expect('[');
      const k = type(d);
      expect(',');
      const val = type(d);
      expect(']');
      return { k: 'map', key: k, val };
    }
    if (id === 'record') {
      const d = enter(depth);
      expect('[');
      const fields: [string, TypeTree][] = [];
      const one = (): void => {
        const n = ident();
        if (fields.some((f) => f[0] === n)) fail('duplicate field');
        expect(':');
        fields.push([n, type(d)]);
      };
      one();
      while (lit(',')) one();
      expect(']');
      return { k: 'record', fields };
    }
    const sc = scalarOf(id);
    if (sc === null) return fail('unknown type ' + id);
    return sc;
  };

  const save = p;
  const w1 = peekIdent();
  let prefixed = false;
  if (w1 === 'pub') {
    ident();
    if (peekIdent() === 'fn') {
      ident();
      if (peekIdent() !== null) prefixed = true;
    }
  } else if (w1 === 'export') {
    ident();
    if (peekIdent() === 'default') {
      ident();
      if (peekIdent() === 'function') {
        ident();
        if (peekIdent() !== null) prefixed = true;
      }
    }
  }
  if (!prefixed) p = save;

  const name = ident();
  expect('(');
  const args: Arg[] = [];
  ws();
  if (!s.startsWith(')', p)) {
    for (;;) {
      const rest = lit('...');
      const an = ident();
      if (args.some((a) => a.name === an)) fail('duplicate param');
      expect(':');
      const t = type(0);
      args.push(rest ? { name: an, type: t, rest: true } : { name: an, type: t });
      if (!lit(',')) break;
    }
  }
  expect(')');
  if (!lit('->') && !lit(':')) fail('expected -> or :');
  const result = type(0);
  ws();
  if (p !== s.length) fail('trailing text');
  for (let i = 0; i < args.length - 1; i++) {
    const a = args[i];
    if (a !== undefined && a.rest === true) fail('rest not last');
  }
  return { name, args, result };
}
