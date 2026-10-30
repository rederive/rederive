const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const MAX_DEPTH = 256;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('parse_type expects text');
  let p = 0;
  const n = s.length;
  const ws = () => {
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === 9 || c === 10 || c === 13 || c === 32) p++;
      else break;
    }
  };
  const fail = (m) => { throw new Error(m + ' at ' + p); };
  const ident = () => {
    const m = IDENT.exec(s.slice(p, p + 4096 > n ? n : n));
    if (!m) fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const parseType = (depth) => {
    const alts = [];
    const keys = new Set();
    for (;;) {
      const a = parseAlt(depth);
      const key = JSON.stringify(a);
      if (keys.has(key)) fail('a union names the same alternative twice');
      keys.add(key);
      alts.push(a);
      ws();
      if (p < n && s[p] === '|') { p++; continue; }
      break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const parseAlt = (depth) => {
    ws();
    const name = ident();
    if (SCALARS.has(name)) return { k: name };
    if (name !== 'tuple' && name !== 'list' && name !== 'map' && name !== 'record') {
      fail("unknown abstract type '" + name + "'");
    }
    ws();
    if (p >= n || s[p] !== '[') fail("expected '['");
    if (depth + 1 > MAX_DEPTH) fail('types nest deeper than 256');
    p++;
    if (name === 'record') {
      const fields = [];
      const seen = new Set();
      for (;;) {
        ws();
        const fname = ident();
        if (seen.has(fname)) fail('duplicate field');
        seen.add(fname);
        ws();
        if (p >= n || s[p] !== ':') fail("expected ':'");
        p++;
        fields.push([fname, parseType(depth + 1)]);
        ws();
        if (p < n && s[p] === ',') { p++; continue; }
        break;
      }
      if (p >= n || s[p] !== ']') fail("expected ']'");
      p++;
      return { k: 'record', fields };
    }
    const parts = [];
    for (;;) {
      parts.push(parseType(depth + 1));
      ws();
      if (p < n && s[p] === ',') { p++; continue; }
      break;
    }
    if (p >= n || s[p] !== ']') fail("expected ']'");
    if (name === 'tuple') { p++; return { k: 'tuple', items: parts }; }
    if (name === 'list') {
      if (parts.length !== 1) fail('list takes exactly one type');
      p++;
      return { k: 'list', item: parts[0] };
    }
    if (parts.length !== 2) fail('map takes exactly two types');
    p++;
    return { k: 'map', key: parts[0], val: parts[1] };
  };
  const t = parseType(0);
  ws();
  if (p < n) fail('unexpected text');
  return t;
}

export default parse_type;
