const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const MAX_DEPTH = 256;

export default function parse_sig(s) {
  let i = 0;
  let depth = 0;
  const fail = (m) => { throw new Error(`bad SIG: ${m} at ${i}`); };
  const ws = () => { while (i < s.length && ' \t\r\n'.includes(s[i])) i++; };
  const lit = (t) => { ws(); if (s.startsWith(t, i)) { i += t.length; return true; } return false; };
  const need = (t) => { if (!lit(t)) fail(`expected '${t}'`); };
  const ident = () => {
    ws();
    const m = IDENT.exec(s.slice(i));
    if (!m) fail('expected an identifier');
    i += m[0].length;
    return m[0];
  };
  const peekIdent = () => { ws(); return IDENT.test(s.slice(i)); };

  const type = () => {
    const alts = [];
    const seen = new Set();
    for (;;) {
      const a = alt();
      const key = JSON.stringify(a);
      if (seen.has(key)) fail('duplicate alternative');
      seen.add(key);
      alts.push(a);
      if (!lit('|')) break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  };

  const alt = () => {
    const name = ident();
    if (SCALARS.has(name)) return { k: name };
    if (name !== 'tuple' && name !== 'list' && name !== 'map' && name !== 'record') fail('unknown type');
    need('[');
    if (++depth > MAX_DEPTH) fail('nesting too deep');
    let r;
    if (name === 'tuple') {
      const items = [type()];
      while (lit(',')) items.push(type());
      r = { k: 'tuple', items };
    } else if (name === 'list') {
      r = { k: 'list', item: type() };
    } else if (name === 'map') {
      const key = type();
      need(',');
      r = { k: 'map', key, val: type() };
    } else {
      const fields = [];
      const names = new Set();
      do {
        const f = ident();
        if (names.has(f)) fail('duplicate field name');
        names.add(f);
        need(':');
        fields.push([f, type()]);
      } while (lit(','));
      r = { k: 'record', fields };
    }
    need(']');
    depth--;
    return r;
  };

  // prefix
  {
    const save = i;
    let ok = false;
    for (const words of [['pub', 'fn'], ['export', 'default', 'function']]) {
      i = save;
      let good = true;
      for (const w of words) {
        ws();
        const m = IDENT.exec(s.slice(i));
        if (!m || m[0] !== w) { good = false; break; }
        i += m[0].length;
      }
      if (good && peekIdent()) { ok = true; break; }
    }
    if (!ok) i = save;
  }

  const name = ident();
  need('(');
  const args = [];
  const pnames = new Set();
  ws();
  if (!lit(')')) {
    for (;;) {
      const rest = lit('...');
      const an = ident();
      if (pnames.has(an)) fail('duplicate parameter name');
      pnames.add(an);
      need(':');
      depth = 0;
      const t = type();
      const arg = { name: an, type: t };
      if (rest) arg.rest = true;
      args.push(arg);
      if (lit(',')) {
        if (rest) fail('a rest parameter must be last');
        continue;
      }
      need(')');
      break;
    }
  }
  if (!lit('->') && !lit(':')) fail("expected '->' or ':' before the result type");
  depth = 0;
  const result = type();
  ws();
  if (i !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
