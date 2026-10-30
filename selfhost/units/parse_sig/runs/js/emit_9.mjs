const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const MAX_DEPTH = 16;

function key(t) {
  switch (t.k) {
    case 'union': return 'union[' + t.alts.map(key).sort().join(',') + ']';
    case 'tuple': return 'tuple[' + t.items.map(key).join(',') + ']';
    case 'list': return 'list[' + key(t.item) + ']';
    case 'map': return 'map[' + key(t.key) + ',' + key(t.val) + ']';
    case 'record': return 'record[' + t.fields.map(([n, x]) => n + '=' + key(x)).sort().join(',') + ']';
    default: return t.k;
  }
}

function shaped(t) {
  switch (t.k) {
    case 'i64': case 'u64': case 'bytes': return false;
    case 'union': return t.alts.every(shaped);
    case 'list': return shaped(t.item);
    case 'map': return t.key.k === 'text' && shaped(t.val);
    case 'tuple': return t.items.every(shaped);
    case 'record': return t.fields.every(([, x]) => shaped(x));
    default: return true;
  }
}

function covers(a, b) {
  if (key(a) === key(b)) return true;
  if (a.k === 'json' && shaped(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every(([n, x]) => b.fields.some(([m, y]) => m === n && covers(x, y)))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

export default function parse_sig(s) {
  let i = 0;
  let depth = 0;
  const fail = (m) => { throw new Error('bad SIG: ' + m + ' at ' + i); };
  const ws = () => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++;
  };
  const peekIdent = () => {
    const m = IDENT.exec(s.slice(i));
    return m ? m[0] : null;
  };
  const ident = () => {
    ws();
    const w = peekIdent();
    if (w === null) fail('identifier expected');
    i += w.length;
    return w;
  };
  const lit = (t) => {
    ws();
    if (!s.startsWith(t, i)) fail('expected ' + t);
    i += t.length;
  };
  const test = (t) => {
    ws();
    return s.startsWith(t, i);
  };

  function tryPrefix() {
    for (const words of [['pub', 'fn'], ['export', 'default', 'function']]) {
      const save = i;
      let ok = true;
      for (const w of words) {
        ws();
        if (peekIdent() === w) i += w.length; else { ok = false; break; }
      }
      if (ok) {
        ws();
        if (peekIdent() !== null) return;
      }
      i = save;
    }
  }

  function type() {
    const alts = [];
    for (;;) {
      const a = alt();
      for (const e of alts) if (covers(e, a)) fail('a union alternative is unreachable');
      alts.push(a);
      if (test('|')) i++; else break;
    }
    return alts.length >= 2 ? { k: 'union', alts } : alts[0];
  }

  function enter() {
    depth++;
    if (depth > MAX_DEPTH) fail('types nest deeper than 16');
  }

  function alt() {
    const w = ident();
    if (SCALARS.has(w)) return { k: w };
    if (w === 'tuple') {
      enter(); lit('[');
      const items = [type()];
      while (test(',')) { i++; items.push(type()); }
      lit(']'); depth--;
      return { k: 'tuple', items };
    }
    if (w === 'list') {
      enter(); lit('[');
      const item = type();
      lit(']'); depth--;
      return { k: 'list', item };
    }
    if (w === 'map') {
      enter(); lit('[');
      const kk = type();
      lit(',');
      const val = type();
      lit(']'); depth--;
      return { k: 'map', key: kk, val };
    }
    if (w === 'record') {
      enter(); lit('[');
      const fields = [];
      const seen = new Set();
      for (;;) {
        const n = ident();
        if (seen.has(n)) fail('duplicate field');
        seen.add(n);
        lit(':');
        fields.push([n, type()]);
        if (test(',')) i++; else break;
      }
      lit(']'); depth--;
      return { k: 'record', fields };
    }
    return fail('unknown type');
  }

  tryPrefix();
  const name = ident();
  lit('(');
  const args = [];
  const names = new Set();
  let restSeen = false;
  if (!test(')')) {
    for (;;) {
      if (restSeen) fail('rest parameter must be last');
      let rest = false;
      if (test('...')) { i += 3; rest = true; restSeen = true; }
      const n = ident();
      if (names.has(n)) fail('duplicate parameter');
      names.add(n);
      lit(':');
      depth = 0;
      const t = type();
      const arg = { name: n, type: t };
      if (rest) arg.rest = true;
      args.push(arg);
      if (test(',')) i++; else break;
    }
  }
  lit(')');
  if (test('->')) i += 2;
  else if (test(':')) i++;
  else fail('expected -> or :');
  depth = 0;
  const result = type();
  ws();
  if (i !== s.length) fail('trailing input');
  return { name, args, result };
}
