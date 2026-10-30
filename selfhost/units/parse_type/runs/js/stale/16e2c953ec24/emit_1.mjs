const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('parse_type expects a string');
  let i = 0;
  const fail = (m) => { throw new Error(m + ' at ' + i + ' in ' + JSON.stringify(s)); };
  const ws = () => {
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (c === 9 || c === 10 || c === 13 || c === 32) i++; else break;
    }
  };
  const ident = () => {
    const m = IDENT.exec(s.slice(i));
    if (!m) fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };
  const type = () => {
    const alts = [alt()];
    ws();
    while (s[i] === '|') {
      i++;
      ws();
      alts.push(alt());
      ws();
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };
  const alt = () => {
    ws();
    const name = ident();
    if (SCALARS.has(name)) return { k: name };
    if (name === 'tuple' || name === 'list' || name === 'map' || name === 'record') {
      if (s[i] !== '[') fail("expected '['");
      i++;
      if (name === 'record') {
        const fields = [];
        const seen = new Set();
        for (;;) {
          ws();
          const fname = ident();
          if (seen.has(fname)) fail('duplicate field');
          seen.add(fname);
          ws();
          if (s[i] !== ':') fail("expected ':'");
          i++;
          const t = type();
          fields.push([fname, t]);
          ws();
          if (s[i] === ',') { i++; continue; }
          break;
        }
        if (s[i] !== ']') fail("expected ']'");
        i++;
        return { k: 'record', fields };
      }
      const parts = [];
      for (;;) {
        parts.push(type());
        ws();
        if (s[i] === ',') { i++; continue; }
        break;
      }
      if (s[i] !== ']') fail("expected ']'");
      i++;
      if (name === 'tuple') return { k: 'tuple', items: parts };
      if (name === 'list') {
        if (parts.length !== 1) fail('list takes exactly one type');
        return { k: 'list', item: parts[0] };
      }
      if (parts.length !== 2) fail('map takes exactly two types');
      return { k: 'map', key: parts[0], val: parts[1] };
    }
    fail("unknown abstract type '" + name + "'");
  };
  const t = type();
  ws();
  if (i < s.length) fail('unexpected text');
  return t;
}

export default parse_type;
