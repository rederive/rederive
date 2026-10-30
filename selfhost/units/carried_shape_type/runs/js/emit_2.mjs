const TRIM = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDEN = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const WORDS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);

function norm(s) {
  s = s.replace(TRIM, '');
  const m = ARROW.exec(s);
  if (m) return 'map[' + norm(m[1]) + ', ' + norm(m[2]) + ']';
  return s;
}

function key(t) {
  switch (t.k) {
    case 'list': return 'list(' + key(t.item) + ')';
    case 'map': return 'map(' + key(t.key) + ',' + key(t.val) + ')';
    case 'tuple': return 'tuple(' + t.items.map(key).join(',') + ')';
    case 'record': return 'record(' + t.fields.map(([n, x]) => JSON.stringify(n) + ':' + key(x)).sort().join(',') + ')';
    case 'union': return 'union(' + [...new Set(t.alts.map(key))].sort().join(',') + ')';
    default: return t.k;
  }
}

function jsonable(t) {
  switch (t.k) {
    case 'none': case 'bool': case 'f64': case 'text': case 'json': return true;
    case 'list': return jsonable(t.item);
    case 'tuple': return t.items.every(jsonable);
    case 'map': return t.key.k === 'text' && jsonable(t.val);
    case 'record': return t.fields.every(([, x]) => jsonable(x));
    case 'union': return t.alts.every(jsonable);
    default: return false;
  }
}

function covers(a, b) {
  if (key(a) === key(b)) return true;
  if (a.k === 'json' && jsonable(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
      a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
      a.fields.every(([n, f]) => b.fields.some(([m, g]) => m === n && covers(f, g)))) return true;
  if (a.k === 'union' && a.alts.some(x => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every(x => covers(a, x))) return true;
  return false;
}

function parse(text) {
  let p = 0;
  let depth = 0;
  const err = m => { throw new Error(m + ' at ' + p); };
  const ws = () => { while (p < text.length && ' \t\r\n'.includes(text[p])) p++; };
  const ident = () => {
    const m = IDENT.exec(text.slice(p));
    if (!m) err('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const expect = c => { ws(); if (text[p] !== c) err("expected '" + c + "'"); p++; };
  const open = () => { expect('['); if (depth >= 16) err('types nest deeper than 16'); depth++; };
  function type() {
    const alts = [];
    for (;;) {
      alts.push(alt());
      ws();
      if (text[p] === '|') { p++; continue; }
      break;
    }
    if (alts.length === 1) return alts[0];
    for (let i = 0; i < alts.length; i++)
      for (let j = i + 1; j < alts.length; j++)
        if (covers(alts[i], alts[j])) err('a union alternative is unreachable');
    return { k: 'union', alts };
  }
  function alt() {
    ws();
    const w = ident();
    if (WORDS.has(w)) return { k: w };
    if (w === 'list') {
      open();
      const item = type();
      expect(']'); depth--;
      return { k: 'list', item };
    }
    if (w === 'map') {
      open();
      const key = type();
      expect(',');
      const val = type();
      expect(']'); depth--;
      return { k: 'map', key, val };
    }
    if (w === 'tuple') {
      open();
      const items = [type()];
      for (;;) {
        ws();
        if (text[p] === ',') { p++; items.push(type()); } else break;
      }
      expect(']'); depth--;
      return { k: 'tuple', items };
    }
    if (w === 'record') {
      open();
      const fields = [];
      const seen = new Set();
      for (;;) {
        ws();
        const n = ident();
        if (seen.has(n)) err('duplicate field');
        seen.add(n);
        expect(':');
        fields.push([n, type()]);
        ws();
        if (text[p] === ',') { p++; continue; }
        break;
      }
      expect(']'); depth--;
      return { k: 'record', fields };
    }
    err('unknown type word');
  }
  const t = type();
  ws();
  if (p < text.length) err('unexpected trailing text');
  return t;
}

export default function carried_shape_type(shape) {
  const seg = shape.split(';')[0];
  const n = norm(seg).replace(WIDEN, (m, a, b, c) => a + b + '64');
  return parse(n);
}
