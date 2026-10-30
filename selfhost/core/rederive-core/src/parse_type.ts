export type Scalar = 'text' | 'bytes' | 'bool' | 'none' | 'i64' | 'u64' | 'f64' | 'json';
export type TypeNode =
  | { k: Scalar }
  | { k: 'union'; alts: TypeNode[] }
  | { k: 'tuple'; items: TypeNode[] }
  | { k: 'list'; item: TypeNode }
  | { k: 'map'; key: TypeNode; val: TypeNode }
  | { k: 'record'; fields: [string, TypeNode][] };

const MAX_DEPTH = 16;
const SCALARS: string[] = ['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function key(n: TypeNode): string {
  switch (n.k) {
    case 'tuple':
      return 'tuple[' + n.items.map(key).join(',') + ']';
    case 'list':
      return 'list[' + key(n.item) + ']';
    case 'map':
      return 'map[' + key(n.key) + ',' + key(n.val) + ']';
    case 'record':
      return (
        'record{' +
        n.fields
          .map((f) => JSON.stringify(f[0]) + ':' + key(f[1]))
          .sort()
          .join(',') +
        '}'
      );
    case 'union':
      return 'union{' + Array.from(new Set(n.alts.map(key))).sort().join(',') + '}';
    default:
      return n.k;
  }
}

function same(a: TypeNode, b: TypeNode): boolean {
  return key(a) === key(b);
}

function jsonShaped(n: TypeNode): boolean {
  switch (n.k) {
    case 'none':
    case 'bool':
    case 'f64':
    case 'text':
    case 'json':
      return true;
    case 'list':
      return jsonShaped(n.item);
    case 'tuple':
      return n.items.every(jsonShaped);
    case 'map':
      return n.key.k === 'text' && jsonShaped(n.val);
    case 'record':
      return n.fields.every((f) => jsonShaped(f[1]));
    case 'union':
      return n.alts.every(jsonShaped);
    default:
      return false;
  }
}

function covers(e: TypeNode, l: TypeNode): boolean {
  if (same(e, l)) return true;
  if (e.k === 'json' && jsonShaped(l)) return true;
  if (e.k === 'list' && l.k === 'list' && covers(e.item, l.item)) return true;
  if (e.k === 'tuple' && l.k === 'tuple' && e.items.length === l.items.length) {
    const li = l.items;
    if (e.items.every((x, i) => covers(x, li[i] as TypeNode))) return true;
  }
  if (e.k === 'map' && l.k === 'map' && covers(e.key, l.key) && covers(e.val, l.val)) return true;
  if (e.k === 'record' && l.k === 'record') {
    const lf = l.fields;
    const ok = e.fields.every((ef) => {
      const m = lf.find((x) => x[0] === ef[0]);
      return m !== undefined && covers(ef[1], m[1]);
    });
    if (ok) return true;
  }
  if (e.k === 'union' && e.alts.some((a) => covers(a, l))) return true;
  if (l.k === 'union' && l.alts.every((a) => covers(e, a))) return true;
  return false;
}

export function parse_type(s: string): TypeNode {
  if (typeof s !== 'string') throw new Error('non-text argument');
  let p = 0;
  const fail = (m: string): never => {
    throw new Error(m + ' at ' + p);
  };
  const ws = (): void => {
    while (p < s.length) {
      const c = s.charCodeAt(p);
      if (c === 9 || c === 10 || c === 13 || c === 32) p++;
      else break;
    }
  };
  const ident = (): string => {
    const m = IDENT.exec(s.slice(p));
    if (m === null) return fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const type = (depth: number): TypeNode => {
    const alts: TypeNode[] = [alt(depth)];
    for (;;) {
      ws();
      if (s[p] !== '|') break;
      p++;
      alts.push(alt(depth));
    }
    if (alts.length === 1) return alts[0] as TypeNode;
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i] as TypeNode, alts[j] as TypeNode)) fail('unreachable union alternative');
      }
    }
    return { k: 'union', alts };
  };
  const alt = (depth: number): TypeNode => {
    ws();
    const name = ident();
    if (SCALARS.includes(name)) return { k: name as Scalar };
    if (name !== 'tuple' && name !== 'list' && name !== 'map' && name !== 'record') {
      return fail('unknown abstract type ' + name);
    }
    ws();
    if (s[p] !== '[') return fail('expected [');
    p++;
    if (depth + 1 > MAX_DEPTH) return fail('types nest too deep');
    const d = depth + 1;
    if (name === 'record') {
      const fields: [string, TypeNode][] = [];
      const seen = new Set<string>();
      for (;;) {
        ws();
        const fname = ident();
        if (seen.has(fname)) fail('duplicate field');
        seen.add(fname);
        ws();
        if (s[p] !== ':') fail('expected :');
        p++;
        fields.push([fname, type(d)]);
        ws();
        if (s[p] === ',') {
          p++;
          continue;
        }
        if (s[p] === ']') {
          p++;
          break;
        }
        fail('expected , or ]');
      }
      return { k: 'record', fields };
    }
    const parts: TypeNode[] = [];
    for (;;) {
      parts.push(type(d));
      ws();
      if (s[p] === ',') {
        p++;
        continue;
      }
      if (s[p] === ']') {
        p++;
        break;
      }
      fail('expected , or ]');
    }
    if (name === 'tuple') return { k: 'tuple', items: parts };
    if (name === 'list') {
      if (parts.length !== 1) return fail('list takes one');
      return { k: 'list', item: parts[0] as TypeNode };
    }
    if (parts.length !== 2) return fail('map takes two');
    return { k: 'map', key: parts[0] as TypeNode, val: parts[1] as TypeNode };
  };
  const r = type(0);
  ws();
  if (p < s.length) fail('unexpected text');
  return r;
}
