const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export default function parse_sig(s) {
  let i = 0;
  const fail = (m) => { throw new Error('bad SIG: ' + m + ' at ' + i); };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++; };
  const ident = () => {
    const m = IDENT.exec(s.slice(i));
    if (!m) fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };
  const eat = (t) => {
    if (!s.startsWith(t, i)) fail("expected '" + t + "'");
    i += t.length;
  };
  const alt = () => {
    ws();
    const w = ident();
    if (SCALARS.has(w)) return { k: w };
    if (w === 'tuple' || w === 'list' || w === 'map' || w === 'record') {
      eat('[');
      let r;
      if (w === 'tuple') {
        const items = [type()];
        ws();
        while (s[i] === ',') { i++; items.push(type()); ws(); }
        r = { k: 'tuple', items };
      } else if (w === 'list') {
        r = { k: 'list', item: type() };
        ws();
      } else if (w === 'map') {
        const key = type();
        ws();
        eat(',');
        const val = type();
        r = { k: 'map', key, val };
        ws();
      } else {
        const fields = [];
        const seen = new Set();
        for (;;) {
          ws();
          const n = ident();
          if (seen.has(n)) fail('duplicate field');
          seen.add(n);
          ws();
          eat(':');
          fields.push([n, type()]);
          ws();
          if (s[i] === ',') { i++; continue; }
          break;
        }
        r = { k: 'record', fields };
      }
      eat(']');
      return r;
    }
    i -= w.length;
    return fail('unknown type');
  };
  const type = () => {
    const alts = [alt()];
    ws();
    while (s[i] === '|') { i++; alts.push(alt()); ws(); }
    return alts.length > 1 ? { k: 'union', alts } : alts[0];
  };

  ws();
  for (const p of ['pub fn', 'export default function']) {
    if (s.startsWith(p, i) && (s[i + p.length] === ' ' || s[i + p.length] === '\t')) {
      i += p.length;
      break;
    }
  }
  ws();
  const name = ident();
  ws();
  eat('(');
  ws();
  const args = [];
  const names = new Set();
  let sawRest = false;
  if (s[i] !== ')') {
    for (;;) {
      if (sawRest) fail('rest parameter not last');
      ws();
      let rest = false;
      if (s.startsWith('...', i)) { i += 3; rest = true; ws(); }
      const n = ident();
      if (names.has(n)) fail('duplicate parameter');
      names.add(n);
      ws();
      eat(':');
      const t = type();
      const a = { name: n, type: t };
      if (rest) { a.rest = true; sawRest = true; }
      args.push(a);
      ws();
      if (s[i] === ',') { i++; continue; }
      break;
    }
  }
  eat(')');
  ws();
  if (s.startsWith('->', i)) i += 2;
  else if (s[i] === ':') i++;
  else fail("expected '->'");
  const result = type();
  ws();
  if (i !== s.length) fail('trailing input');
  return { name, args, result };
}
