const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const COMPOSITES = new Set(['tuple', 'list', 'map', 'record']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const MAX_DEPTH = 256;

export default function parse_sig(s) {
  let i = 0;
  let depth = 0;
  const fail = (m) => { throw new Error('bad SIG: ' + m + ' at ' + i); };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++; };
  const peekIdent = () => { const m = IDENT.exec(s.slice(i)); return m ? m[0] : null; };
  const ident = () => {
    ws();
    const w = peekIdent();
    if (w === null) fail('expected an identifier');
    i += w.length;
    return w;
  };
  const lit = (t) => { ws(); if (s.startsWith(t, i)) { i += t.length; return true; } return false; };
  const need = (t) => { if (!lit(t)) fail("expected '" + t + "'"); };

  function tryPrefix(words) {
    const save = i;
    for (const w of words) {
      ws();
      if (peekIdent() !== w) { i = save; return false; }
      i += w.length;
    }
    ws();
    if (peekIdent() === null) { i = save; return false; }
    return true;
  }

  function type() {
    const alts = [];
    const keys = new Set();
    for (;;) {
      const a = alt();
      const key = JSON.stringify(a);
      if (keys.has(key)) fail('duplicate alternative');
      keys.add(key);
      alts.push(a);
      if (!lit('|')) break;
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  }

  function alt() {
    const w = ident();
    if (SCALARS.has(w)) return { k: w };
    if (!COMPOSITES.has(w)) fail('unknown type');
    if (++depth > MAX_DEPTH) fail('nesting too deep');
    need('[');
    let r;
    if (w === 'list') {
      r = { k: 'list', item: type() };
    } else if (w === 'map') {
      const key = type();
      need(',');
      r = { k: 'map', key, val: type() };
    } else if (w === 'tuple') {
      const items = [type()];
      while (lit(',')) items.push(type());
      r = { k: 'tuple', items };
    } else {
      const fields = [];
      const names = new Set();
      do {
        const n = ident();
        if (names.has(n)) fail('duplicate field name');
        names.add(n);
        need(':');
        fields.push([n, type()]);
      } while (lit(','));
      r = { k: 'record', fields };
    }
    need(']');
    depth--;
    return r;
  }

  if (!tryPrefix(['pub', 'fn'])) tryPrefix(['export', 'default', 'function']);
  const name = ident();
  need('(');
  const args = [];
  const seen = new Set();
  ws();
  if (!lit(')')) {
    for (;;) {
      const rest = lit('...');
      const an = ident();
      if (seen.has(an)) fail('duplicate parameter name');
      seen.add(an);
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
  if (i !== s.length) fail('unexpected trailing input');
  return { name, args, result };
}
