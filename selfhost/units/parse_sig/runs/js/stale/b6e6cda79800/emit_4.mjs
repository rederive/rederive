const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const MAX_DEPTH = 256;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

export default function parse_sig(s) {
  let i = 0;
  let depth = 0;
  const fail = (m) => { throw new Error('bad SIG: ' + m + ' at ' + i); };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\r' || s[i] === '\n')) i++; };
  const lit = (t) => { ws(); if (s.startsWith(t, i)) { i += t.length; return true; } return false; };
  const need = (t) => { if (!lit(t)) fail("expected '" + t + "'"); };
  const peekIdent = () => { ws(); const m = IDENT.exec(s.slice(i)); return m ? m[0] : null; };
  const ident = () => {
    const m = peekIdent();
    if (m === null) fail('expected an identifier');
    i += m.length;
    return m;
  };

  function type() {
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
  }

  function alt() {
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
      const val = type();
      r = { k: 'map', key, val };
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
  }

  ws();
  const start = i;
  const tryPrefix = (words) => {
    i = start;
    for (const w of words) {
      const m = peekIdent();
      if (m !== w) { i = start; return false; }
      i += m.length;
    }
    if (peekIdent() === null) { i = start; return false; }
    return true;
  };
  if (!tryPrefix(['pub', 'fn'])) tryPrefix(['export', 'default', 'function']);

  const name = ident();
  need('(');
  const args = [];
  const names = new Set();
  if (!lit(')')) {
    for (;;) {
      const rest = lit('...');
      const an = ident();
      if (names.has(an)) fail('duplicate parameter name');
      names.add(an);
      need(':');
      depth = 0;
      const t = type();
      const arg = { name: an, type: t };
      if (rest) arg.rest = true;
      args.push(arg);
      if (rest && peekIdentOrComma()) fail('a rest parameter must be last');
      if (lit(',')) continue;
      need(')');
      break;
    }
  }
  function peekIdentOrComma() { ws(); return s[i] === ','; }
  if (!lit('->') && !lit(':')) fail("expected '->' or ':' before the result type");
  depth = 0;
  const result = type();
  ws();
  if (i !== s.length) fail('unexpected trailing text');
  return { name, args, result };
}
