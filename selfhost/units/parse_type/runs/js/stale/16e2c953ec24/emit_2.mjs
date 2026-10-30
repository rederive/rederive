const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('expected text');
  let i = 0;
  const fail = (m) => { throw new Error(m + ' at ' + i + ' in ' + JSON.stringify(s)); };
  const ws = () => {
    while (i < s.length) {
      const c = s[i];
      if (c === '\t' || c === '\n' || c === '\r' || c === ' ') i++; else break;
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
          const f = ident();
          if (seen.has(f)) fail('duplicate field');
          seen.add(f);
          ws();
          if (s[i] !== ':') fail("expected ':'");
          i++;
          const t = type();
          fields.push([f, t]);
          ws();
          if (s[i] === ',') { i++; continue; }
          if (s[i] === ']') { i++; break; }
          fail("expected ']'");
        }
        return { k: 'record', fields };
      }
      const parts = [];
      for (;;) {
        parts.push(type());
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; break; }
        fail("expected ']'");
      }
      if (name === 'tuple') return { k: 'tuple', items: parts };
      if (name === 'list') {
        if (parts.length !== 1) fail('list takes exactly one type');
        return { k: 'list', item: parts[0] };
      }
      if (parts.length !== 2) fail('map takes exactly two types');
      return { k: 'map', key: parts[0], val: parts[1] };
    }
    fail('unknown abstract type ' + name);
  };
  const r = type();
  ws();
  if (i < s.length) fail('unexpected text');
  return r;
}

export default parse_type;
