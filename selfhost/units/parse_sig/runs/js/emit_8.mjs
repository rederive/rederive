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
    case 'tuple': return t.items.every(shaped);
    case 'list': return shaped(t.item);
    case 'map': return t.key.k === 'text' && shaped(t.val);
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
  if (a.k === 'union' && a.alts.some(x => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every(y => covers(a, y))) return true;
  return false;
}

export default function parse_sig(s) {
  let i = 0;
  let depth = 0;
  const bad = (m) => { throw new Error('bad SIG: ' + m + ' at ' + i); };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++; };
  const lit = (l) => { ws(); if (s.startsWith(l, i)) { i += l.length; return true; } return false; };
  const need = (l) => { if (!lit(l)) bad('expected ' + l); };
  const peekIdent = () => { ws(); const m = IDENT.exec(s.slice(i)); return m ? m[0] : null; };
  const ident = () => { const m = peekIdent(); if (!m) bad('expected identifier'); i += m.length; return m; };

  function alt() {
    const w = ident();
    if (SCALARS.has(w)) return { k: w };
    if (w !== 'tuple' && w !== 'list' && w !== 'map' && w !== 'record') bad('unknown type ' + w);
    if (++depth > MAX_DEPTH) bad('types nest deeper than 16');
    need('[');
    let r;
    if (w === 'tuple') {
      const items = [type()];
      while (lit(',')) items.push(type());
      r = { k: 'tuple', items };
    } else if (w === 'list') {
      r = { k: 'list', item: type() };
    } else if (w === 'map') {
      const key = type();
      need(',');
      r = { k: 'map', key, val: type() };
    } else {
      const fields = [];
      const seen = new Set();
      do {
        const n = ident();
        if (seen.has(n)) bad('duplicate field');
        seen.add(n);
        need(':');
        fields.push([n, type()]);
      } while (lit(','));
      r = { k: 'record', fields };
    }
    need(']');
    depth--;
    return r;
  }

  function type() {
    const alts = [alt()];
    while (lit('|')) {
      const a = alt();
      if (alts.some(e => covers(e, a))) bad('a union alternative is unreachable');
      alts.push(a);
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  }

  const start = i;
  ws();
  const save = i;
  let pref = false;
  const w1 = peekIdent();
  if (w1 === 'pub') {
    i += 3;
    if (peekIdent() === 'fn') { i += 2; pref = true; }
  } else if (w1 === 'export') {
    i += 6;
    if (peekIdent() === 'default') {
      i += 7;
      if (peekIdent() === 'function') { i += 8; pref = true; }
    }
  }
  if (pref && !peekIdent()) pref = false;
  if (!pref) i = save;
  void start;

  const name = ident();
  need('(');
  const args = [];
  const names = new Set();
  if (!lit(')')) {
    for (;;) {
      const rest = lit('...');
      const n = ident();
      if (names.has(n)) bad('duplicate param');
      names.add(n);
      need(':');
      depth = 0;
      const t = type();
      const arg = { name: n, type: t };
      if (rest) arg.rest = true;
      args.push(arg);
      if (lit(',')) continue;
      need(')');
      break;
    }
  }
  for (let j = 0; j < args.length - 1; j++) if (args[j].rest) bad('rest parameter must be last');
  if (!lit('->') && !lit(':')) bad('expected -> or :');
  depth = 0;
  const result = type();
  ws();
  if (i !== s.length) bad('trailing input');
  return { name, args, result };
}
