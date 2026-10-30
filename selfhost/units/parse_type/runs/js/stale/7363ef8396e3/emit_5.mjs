const MAX_DEPTH = 256;
const SCALARS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;

function eq(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false;
    return true;
  }
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k) || !eq(a[k], b[k])) return false;
  }
  return true;
}

export function parse_type(s) {
  if (typeof s !== 'string') throw new Error('parse_type: not text');
  let pos = 0;
  const n = s.length;
  const fail = (m) => { throw new Error(m + ' at ' + pos + ' in ' + JSON.stringify(s)); };
  const ws = () => {
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 9 || c === 10 || c === 13 || c === 32) pos++;
      else break;
    }
  };
  const ident = () => {
    const m = IDENT.exec(s.slice(pos));
    if (!m) fail('expected an identifier');
    pos += m[0].length;
    return m[0];
  };
  const expect = (ch) => {
    ws();
    if (s[pos] !== ch) fail("expected '" + ch + "'");
    pos++;
  };

  function type(depth) {
    const alts = [alt(depth)];
    for (;;) {
      ws();
      if (s[pos] !== '|') break;
      pos++;
      const a = alt(depth);
      for (const x of alts) if (eq(x, a)) fail('a union names the same alternative twice');
      alts.push(a);
    }
    return alts.length === 1 ? alts[0] : { k: 'union', alts };
  }

  function alt(depth) {
    ws();
    const name = ident();
    if (SCALARS.has(name)) return { k: name };
    if (name !== 'tuple' && name !== 'list' && name !== 'map' && name !== 'record') {
      fail("unknown abstract type '" + name + "'");
    }
    ws();
    if (s[pos] !== '[') fail("expected '['");
    pos++;
    const d = depth + 1;
    if (d > MAX_DEPTH) fail('types nest deeper than ' + MAX_DEPTH);
    if (name === 'record') {
      const fields = [];
      const seen = new Set();
      for (;;) {
        ws();
        const fname = ident();
        if (seen.has(fname)) fail('duplicate record field');
        seen.add(fname);
        expect(':');
        fields.push([fname, type(d)]);
        ws();
        if (s[pos] === ',') { pos++; continue; }
        break;
      }
      expect(']');
      return { k: 'record', fields };
    }
    const parts = [];
    for (;;) {
      parts.push(type(d));
      ws();
      if (s[pos] === ',') { pos++; continue; }
      break;
    }
    expect(']');
    if (name === 'tuple') return { k: 'tuple', items: parts };
    if (name === 'list') {
      if (parts.length !== 1) fail('list takes exactly one type');
      return { k: 'list', item: parts[0] };
    }
    if (parts.length !== 2) fail('map takes exactly two types');
    return { k: 'map', key: parts[0], val: parts[1] };
  }

  const r = type(0);
  ws();
  if (pos < n) fail('unexpected text');
  return r;
}

export default parse_type;
