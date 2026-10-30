const MAX_DEPTH = 16;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function key(n) {
  switch (n.k) {
    case 'tuple': return 'tuple(' + n.items.map(key).join(',') + ')';
    case 'list': return 'list(' + key(n.item) + ')';
    case 'map': return 'map(' + key(n.key) + ',' + key(n.val) + ')';
    case 'record': return 'record(' + n.fields.map((f) => JSON.stringify(f[0]) + ':' + key(f[1])).sort().join(',') + ')';
    case 'union': return 'union(' + [...new Set(n.alts.map(key))].sort().join(',') + ')';
    default: return n.k;
  }
}

function shaped(n) {
  switch (n.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'list': return shaped(n.item);
    case 'tuple': return n.items.every(shaped);
    case 'map': return n.key.k === 'text' && shaped(n.val);
    case 'record': return n.fields.every((f) => shaped(f[1]));
    case 'union': return n.alts.every(shaped);
    default: return false;
  }
}

function covers(e, l) {
  if (key(e) === key(l)) return true;
  if (e.k === 'json' && shaped(l)) return true;
  if (e.k === 'list' && l.k === 'list' && covers(e.item, l.item)) return true;
  if (e.k === 'tuple' && l.k === 'tuple' && e.items.length === l.items.length &&
      e.items.every((x, i) => covers(x, l.items[i]))) return true;
  if (e.k === 'map' && l.k === 'map' && covers(e.key, l.key) && covers(e.val, l.val)) return true;
  if (e.k === 'record' && l.k === 'record' &&
      e.fields.every((f) => l.fields.some((g) => g[0] === f[0] && covers(f[1], g[1])))) return true;
  if (e.k === 'union' && e.alts.some((a) => covers(a, l))) return true;
  if (l.k === 'union' && l.alts.every((a) => covers(e, a))) return true;
  return false;
}

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('not text');
  let p = 0;
  const fail = (m) => { throw new Error(m + ' at ' + p); };
  const ws = () => {
    while (p < s.length) {
      const c = s[p];
      if (c === '\t' || c === '\n' || c === '\r' || c === ' ') p++; else break;
    }
  };
  const name = () => {
    const m = IDENT.exec(s.slice(p));
    if (!m) fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const type = (depth) => {
    const alts = [alt(depth)];
    for (;;) {
      ws();
      if (s[p] === '|') { p++; alts.push(alt(depth)); } else break;
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i], alts[j])) fail('unreachable union alternative');
      }
    }
    return { k: 'union', alts };
  };
  const alt = (depth) => {
    ws();
    const nm = name();
    if (SCALARS.has(nm)) return { k: nm };
    if (nm !== 'tuple' && nm !== 'list' && nm !== 'map' && nm !== 'record') fail('unknown abstract type');
    ws();
    if (s[p] !== '[') fail('expected [');
    p++;
    const d = depth + 1;
    if (d > MAX_DEPTH) fail('types nest too deep');
    if (nm === 'record') {
      const fields = [];
      const seen = new Set();
      for (;;) {
        ws();
        const fn = name();
        if (seen.has(fn)) fail('duplicate field');
        seen.add(fn);
        ws();
        if (s[p] !== ':') fail('expected :');
        p++;
        fields.push([fn, type(d)]);
        ws();
        if (s[p] === ',') { p++; continue; }
        if (s[p] === ']') { p++; break; }
        fail('expected , or ]');
      }
      return { k: 'record', fields };
    }
    const parts = [];
    for (;;) {
      parts.push(type(d));
      ws();
      if (s[p] === ',') { p++; continue; }
      if (s[p] === ']') { p++; break; }
      fail('expected , or ]');
    }
    if (nm === 'tuple') return { k: 'tuple', items: parts };
    if (nm === 'list') {
      if (parts.length !== 1) fail('list takes one');
      return { k: 'list', item: parts[0] };
    }
    if (parts.length !== 2) fail('map takes two');
    return { k: 'map', key: parts[0], val: parts[1] };
  };
  const r = type(0);
  ws();
  if (p < s.length) fail('unexpected text');
  return r;
}
