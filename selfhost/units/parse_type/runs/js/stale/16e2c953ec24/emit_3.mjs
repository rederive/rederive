const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('not text');
  let p = 0;
  const n = s.length;
  const fail = (m) => { throw new Error(m + ' at ' + p + ' in ' + JSON.stringify(s)); };
  const ws = () => {
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === 9 || c === 10 || c === 13 || c === 32) p++; else break;
    }
  };
  const name = () => {
    const m = IDENT.exec(s.slice(p));
    if (!m) fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const type = () => {
    const alts = [alt()];
    ws();
    while (p < n && s[p] === '|') {
      p++;
      alts.push(alt());
      ws();
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const alt = () => {
    ws();
    const nm = name();
    if (SCALARS.has(nm)) return { k: nm };
    if (nm === 'tuple' || nm === 'list' || nm === 'map' || nm === 'record') {
      if (s[p] !== '[') fail("expected '['");
      p++;
      if (nm === 'record') {
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
          fields.push([f, type()]);
          ws();
          if (s[p] === ',') { p++; continue; }
          break;
        }
        if (s[p] !== ']') fail("expected ']'");
        p++;
        return { k: 'record', fields };
      }
      const parts = [];
      for (;;) {
        parts.push(type());
        ws();
        if (s[p] === ',') { p++; continue; }
        break;
      }
      if (s[p] !== ']') fail("expected ']'");
      p++;
      if (nm === 'tuple') return { k: 'tuple', items: parts };
      if (nm === 'list') {
        if (parts.length !== 1) fail('list takes exactly one type');
        return { k: 'list', item: parts[0] };
      }
      if (parts.length !== 2) fail('map takes exactly two types');
      return { k: 'map', key: parts[0], val: parts[1] };
    }
    fail('unknown abstract type ' + nm);
  };
  const t = type();
  ws();
  if (p < n) fail('unexpected text');
  return t;
}

export default parse_type;
