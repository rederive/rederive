const MAX_DEPTH = 16;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const JSON_SCALARS = new Set(['none', 'bool', 'f64', 'text', 'json']);
const IDENT = /[A-Za-z_][A-Za-z0-9_]*/y;

function key(n) {
  switch (n.k) {
    case 'tuple': return 'tuple[' + n.items.map(key).join(',') + ']';
    case 'list': return 'list[' + key(n.item) + ']';
    case 'map': return 'map[' + key(n.key) + ',' + key(n.val) + ']';
    case 'record': return 'record[' + n.fields.map(([f, t]) => JSON.stringify(f) + ':' + key(t)).sort().join(',') + ']';
    case 'union': return 'union[' + [...new Set(n.alts.map(key))].sort().join(',') + ']';
    default: return n.k;
  }
}

function inJson(n) {
  switch (n.k) {
    case 'list': return inJson(n.item);
    case 'tuple': return n.items.every(inJson);
    case 'map': return n.key.k === 'text' && inJson(n.val);
    case 'record': return n.fields.every(([, t]) => inJson(t));
    case 'union': return n.alts.every(inJson);
    default: return JSON_SCALARS.has(n.k);
  }
}

function covers(e, l) {
  if (key(e) === key(l)) return true;
  if (e.k === 'json' && inJson(l)) return true;
  if (e.k === 'list' && l.k === 'list' && covers(e.item, l.item)) return true;
  if (e.k === 'tuple' && l.k === 'tuple' && e.items.length === l.items.length &&
      e.items.every((x, i) => covers(x, l.items[i]))) return true;
  if (e.k === 'map' && l.k === 'map' && covers(e.key, l.key) && covers(e.val, l.val)) return true;
  if (e.k === 'record' && l.k === 'record' &&
      e.fields.every(([n, t]) => l.fields.some(([n2, t2]) => n2 === n && covers(t, t2)))) return true;
  if (e.k === 'union' && e.alts.some((a) => covers(a, l))) return true;
  if (l.k === 'union' && l.alts.every((a) => covers(e, a))) return true;
  return false;
}

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('non-text argument');
  let pos = 0;
  const fail = (m) => { throw new Error(m + ' at ' + pos + ' in ' + JSON.stringify(s)); };
  const ws = () => {
    while (pos < s.length) {
      const c = s[pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') pos++; else break;
    }
  };
  const ident = () => {
    IDENT.lastIndex = pos;
    const m = IDENT.exec(s);
    if (!m) fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch) => {
    ws();
    if (s[pos] !== ch) fail('expected ' + ch);
    pos++;
  };
  const parts = (depth, one) => {
    const out = [];
    for (;;) {
      out.push(one(depth));
      ws();
      if (s[pos] === ',') { pos++; continue; }
      break;
    }
    expect(']');
    return out;
  };
  const alt = (depth) => {
    ws();
    const name = ident();
    if (SCALARS.has(name)) return { k: name };
    if (name !== 'tuple' && name !== 'list' && name !== 'map' && name !== 'record') {
      pos -= name.length;
      fail("unknown abstract type '" + name + "'");
    }
    expect('[');
    if (depth + 1 > MAX_DEPTH) fail('types nest deeper than ' + MAX_DEPTH);
    const d = depth + 1;
    if (name === 'record') {
      const seen = new Set();
      const fields = parts(d, (dd) => {
        ws();
        const f = ident();
        if (seen.has(f)) fail('duplicate field ' + f);
        seen.add(f);
        expect(':');
        return [f, type(dd)];
      });
      return { k: 'record', fields };
    }
    const ps = parts(d, type);
    if (name === 'tuple') return { k: 'tuple', items: ps };
    if (name === 'list') {
      if (ps.length !== 1) fail('list takes one part');
      return { k: 'list', item: ps[0] };
    }
    if (ps.length !== 2) fail('map takes two parts');
    return { k: 'map', key: ps[0], val: ps[1] };
  };
  const type = (depth) => {
    const alts = [alt(depth)];
    for (;;) {
      ws();
      if (s[pos] === '|') { pos++; alts.push(alt(depth)); } else break;
    }
    if (alts.length === 1) return alts[0];
    for (let j = 1; j < alts.length; j++) {
      for (let i = 0; i < j; i++) {
        if (covers(alts[i], alts[j])) fail('a union alternative is unreachable');
      }
    }
    return { k: 'union', alts };
  };
  const r = type(0);
  ws();
  if (pos !== s.length) fail('unexpected text');
  return r;
}
