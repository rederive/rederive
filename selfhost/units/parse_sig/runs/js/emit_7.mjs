const SC = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDRE = /^[A-Za-z_][A-Za-z0-9_]*/;

const key = (t) => {
  switch (t.k) {
    case 'union': return 'union<' + [...new Set(t.alts.map(key))].sort().join(',') + '>';
    case 'tuple': return 'tuple<' + t.items.map(key).join(',') + '>';
    case 'list': return 'list<' + key(t.item) + '>';
    case 'map': return 'map<' + key(t.key) + ',' + key(t.val) + '>';
    case 'record': return 'record<' + [...new Set(t.fields.map(([n, v]) => n + '=' + key(v)))].sort().join(',') + '>';
    default: return t.k;
  }
};

const shaped = (t) => {
  switch (t.k) {
    case 'i64': case 'u64': case 'bytes': return false;
    case 'list': return shaped(t.item);
    case 'map': return t.key.k === 'text' && shaped(t.val);
    case 'tuple': return t.items.every(shaped);
    case 'record': return t.fields.every(([, v]) => shaped(v));
    case 'union': return t.alts.every(shaped);
    default: return true;
  }
};

const covers = (a, b) => {
  if (key(a) === key(b)) return true;
  if (a.k === 'json' && shaped(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every(([n, v]) => b.fields.some(([m, w]) => m === n && covers(v, w)))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
};

export default function parse_sig(s) {
  let p = 0;
  const bad = (m) => { throw new Error('bad SIG: ' + m + ' at ' + p); };
  const ws = () => { while (p < s.length && (s[p] === ' ' || s[p] === '\t' || s[p] === '\r' || s[p] === '\n')) p++; };
  const peekId = () => { const m = IDRE.exec(s.slice(p)); return m ? m[0] : null; };
  const ident = () => { ws(); const id = peekId(); if (id === null) bad('identifier expected'); p += id.length; return id; };
  const lit = (l) => { ws(); if (s.startsWith(l, p)) { p += l.length; return true; } return false; };
  const need = (l) => { if (!lit(l)) bad('expected ' + l); };

  let depth = 0;
  const comp = (f) => { if (++depth > 16) bad('types nest deeper than 16'); const r = f(); depth--; return r; };

  const alt = () => {
    const id = ident();
    if (id === 'tuple') {
      return comp(() => {
        need('[');
        const items = [type()];
        while (lit(',')) items.push(type());
        need(']');
        return { k: 'tuple', items };
      });
    }
    if (id === 'list') {
      return comp(() => { need('['); const item = type(); need(']'); return { k: 'list', item }; });
    }
    if (id === 'map') {
      return comp(() => { need('['); const key = type(); need(','); const val = type(); need(']'); return { k: 'map', key, val }; });
    }
    if (id === 'record') {
      return comp(() => {
        need('[');
        const fields = [];
        const seen = new Set();
        do {
          const n = ident();
          if (seen.has(n)) bad('duplicate field');
          seen.add(n);
          need(':');
          fields.push([n, type()]);
        } while (lit(','));
        need(']');
        return { k: 'record', fields };
      });
    }
    if (!SC.has(id)) bad('unknown type');
    return { k: id };
  };

  const type = () => {
    const alts = [alt()];
    while (lit('|')) alts.push(alt());
    for (let i = 1; i < alts.length; i++) {
      for (let j = 0; j < i; j++) if (covers(alts[j], alts[i])) bad('a union alternative is unreachable');
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };

  ws();
  const save = p;
  let ok = false;
  for (const words of [['pub', 'fn'], ['export', 'default', 'function']]) {
    p = save;
    let good = true;
    for (const w of words) {
      ws();
      if (peekId() === w) p += w.length; else { good = false; break; }
    }
    if (good) { ws(); if (peekId() !== null) { ok = true; break; } }
  }
  if (!ok) p = save;
  const name = ident();
  need('(');
  const args = [];
  const names = new Set();
  let restSeen = false;
  ws();
  if (!lit(')')) {
    for (;;) {
      if (restSeen) bad('rest parameter must be last');
      const rest = lit('...');
      const n = ident();
      if (names.has(n)) bad('duplicate parameter');
      names.add(n);
      need(':');
      depth = 0;
      const t = type();
      const a = { name: n, type: t };
      if (rest) { a.rest = true; restSeen = true; }
      args.push(a);
      if (lit(',')) continue;
      need(')');
      break;
    }
  }
  if (!lit('->') && !lit(':')) bad('expected -> or :');
  depth = 0;
  const result = type();
  ws();
  if (p !== s.length) bad('trailing text');
  return { name, args, result };
}
