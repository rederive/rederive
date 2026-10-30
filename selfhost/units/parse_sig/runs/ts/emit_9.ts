type TypeTree = { k: 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json' } | { k: 'union'; alts: TypeTree[] }
  | { k: 'tuple'; items: TypeTree[] } | { k: 'list'; item: TypeTree } | { k: 'map'; key: TypeTree; val: TypeTree }
  | { k: 'record'; fields: [string, TypeTree][] };
type Arg = { name: string; type: TypeTree; rest?: true };
type Sig = { name: string; args: Arg[]; result: TypeTree };
type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';

const SCALARS: string[] = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const MAX_DEPTH = 16;

function isScalar(n: string): n is Scalar {
  return SCALARS.indexOf(n) >= 0;
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

function jsonShaped(t: TypeTree): boolean {
  switch (t.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'i64': case 'u64': case 'bytes': return false;
    case 'list': return jsonShaped(t.item);
    case 'map': return t.key.k === 'text' && jsonShaped(t.val);
    case 'tuple': return t.items.every(jsonShaped);
    case 'record': return t.fields.every((f) => jsonShaped(f[1]));
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
    if (a.fields.every((f) => bf.some((g) => g[0] === f[0] && covers(f[1], g[1])))) return true;
  }
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

export default function parse_sig(s: string): Sig {
  let pos = 0;
  const fail = (m: string): never => { throw new Error('bad SIG: ' + m + ' at ' + pos); };
  const ws = (): void => {
    while (pos < s.length) {
      const c = s[pos];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') pos++; else break;
    }
  };
  const peekIdent = (): string | null => {
    ws();
    const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(pos));
    return m ? m[0] : null;
  };
  const ident = (): string => {
    const id = peekIdent();
    if (id === null) return fail('identifier expected');
    pos += id.length;
    return id;
  };
  const lit = (t: string): boolean => {
    ws();
    if (s.startsWith(t, pos)) { pos += t.length; return true; }
    return false;
  };
  const expect = (t: string): void => { if (!lit(t)) fail('expected ' + t); };

  const parseType = (depth: number): TypeTree => {
    const alts: TypeTree[] = [];
    for (;;) {
      const alt = parseAlt(depth);
      for (const e of alts) if (covers(e, alt)) fail('a union alternative is unreachable');
      alts.push(alt);
      if (!lit('|')) break;
    }
    const first = alts[0];
    if (first === undefined) return fail('type expected');
    return alts.length === 1 ? first : { k: 'union', alts };
  };

  const parseAlt = (depth: number): TypeTree => {
    const id = ident();
    const enter = (): void => { if (depth + 1 > MAX_DEPTH) fail('types nest deeper than 16'); };
    if (id === 'tuple') {
      enter();
      expect('[');
      const items: TypeTree[] = [parseType(depth + 1)];
      while (lit(',')) items.push(parseType(depth + 1));
      expect(']');
      return { k: 'tuple', items };
    }
    if (id === 'list') {
      enter();
      expect('[');
      const item = parseType(depth + 1);
      expect(']');
      return { k: 'list', item };
    }
    if (id === 'map') {
      enter();
      expect('[');
      const k = parseType(depth + 1);
      expect(',');
      const val = parseType(depth + 1);
      expect(']');
      return { k: 'map', key: k, val };
    }
    if (id === 'record') {
      enter();
      expect('[');
      const fields: [string, TypeTree][] = [];
      for (;;) {
        const fname = ident();
        if (fields.some((f) => f[0] === fname)) fail('duplicate field');
        expect(':');
        fields.push([fname, parseType(depth + 1)]);
        if (!lit(',')) break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    if (isScalar(id)) return { k: id };
    return fail('unknown type ' + id);
  };

  const tryPrefix = (words: string[]): boolean => {
    const save = pos;
    for (const w of words) {
      const id = peekIdent();
      if (id !== w) { pos = save; return false; }
      pos += id.length;
    }
    if (peekIdent() === null) { pos = save; return false; }
    return true;
  };

  if (!tryPrefix(['pub', 'fn'])) tryPrefix(['export', 'default', 'function']);
  const name = ident();
  expect('(');
  const args: Arg[] = [];
  if (!lit(')')) {
    for (;;) {
      const rest = lit('...');
      const an = ident();
      if (args.some((a) => a.name === an)) fail('duplicate param');
      expect(':');
      const type = parseType(0);
      const arg: Arg = rest ? { name: an, type, rest: true } : { name: an, type };
      args.push(arg);
      if (lit(',')) continue;
      expect(')');
      break;
    }
  }
  for (let i = 0; i < args.length - 1; i++) {
    const a = args[i];
    if (a !== undefined && a.rest === true) fail('rest parameter must be last');
  }
  if (!lit('->') && !lit(':')) fail('-> expected');
  const result = parseType(0);
  ws();
  if (pos !== s.length) fail('trailing input');
  return { name, args, result };
}
