const MAX_DEPTH = 256;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('parse_type: text expected');
  let p = 0;
  const n = s.length;
  const fail = (m) => { throw new Error(m + ' at ' + p); };
  const ws = () => {
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === 9 || c === 10 || c === 13 || c === 32) p++; else break;
    }
  };
  const name = () => {
    const m = IDENT.exec(s.slice(p, p + 4096 > n ? n : undefined));
    if (!m) fail('expected an identifier');
    let w = m[0];
    if (w.length === 4096) { const m2 = IDENT.exec(s.slice(p)); w = m2[0]; }
    p += w.length;
    return w;
  };
  const key = (x) => JSON.stringify(x);
  const type = (depth) => {
    const alts = [parseAlt(depth)];
    ws();
    while (p < n && s[p] === '|') {
      p++;
      ws();
      const a = parseAlt(depth);
      const ka = key(a);
      for (const b of alts) if (key(b) === ka) fail('a union names the same alternative twice');
      alts.push(a);
      ws();
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const parseAlt = (depth) => {
    ws();
    const w = name();
    if (SCALARS.has(w)) return { k: w };
    if (w !== 'tuple' && w !== 'list' && w !== 'map' && w !== 'record') fail("unknown abstract type '" + w + "'");
    ws();
    if (s[p] !== '[') fail("expected '['");
    p++;
    const d = depth + 1;
    if (d > MAX_DEPTH) fail('types nest deeper than 256');
    if (w === 'record') {
      const fields = [];
      const seen = new Set();
      for (;;) {
        ws();
        const f = name();
        if (seen.has(f)) fail('duplicate field');
        seen.add(f);
        ws();
        if (s[p] !== ':') fail("expected ':'");
        p++;
        const t = type(d);
        fields.push([f, t]);
        ws();
        if (s[p] === ',') { p++; continue; }
        if (s[p] === ']') { p++; break; }
        fail("expected ']'");
      }
      return { k: 'record', fields };
    }
    const parts = [];
    for (;;) {
      parts.push(type(d));
      ws();
      if (s[p] === ',') { p++; continue; }
      if (s[p] === ']') { p++; break; }
      fail("expected ']'");
    }
    if (w === 'tuple') return { k: 'tuple', items: parts };
    if (w === 'list') {
      if (parts.length !== 1) fail('list takes exactly one type');
      return { k: 'list', item: parts[0] };
    }
    if (parts.length !== 2) fail('map takes exactly two types');
    return { k: 'map', key: parts[0], val: parts[1] };
  };
  const r = type(0);
  ws();
  if (p < n) fail('unexpected text');
  return r;
}

export default parse_type;
