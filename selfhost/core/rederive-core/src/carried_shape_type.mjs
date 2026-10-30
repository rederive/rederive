const TRIM = /^[ \t\r\n]+|[ \t\r\n]+$/g;
const ARROW = /^map[ \t\r\n]+(.+?)[ \t\r\n]*->[ \t\r\n]*(.+)$/s;
const WIDEN = /(^|[[,|:][ \t\r\n]*)([ui])(8|16|32)(?=[ \t\r\n]*(?:[\],|]|$))/g;
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*/;
const WORDS = new Set(['text', 'bytes', 'bool', 'none', 'i64', 'u64', 'f64', 'json']);

function normalize(s) {
  s = s.replace(TRIM, '');
  const m = ARROW.exec(s);
  if (m) return 'map[' + normalize(m[1]) + ', ' + normalize(m[2]) + ']';
  return s;
}

function same(a, b) {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'list': return same(a.item, b.item);
    case 'map': return same(a.key, b.key) && same(a.val, b.val);
    case 'tuple':
      return a.items.length === b.items.length && a.items.every((x, i) => same(x, b.items[i]));
    case 'record': {
      if (a.fields.length !== b.fields.length) return false;
      return a.fields.every(([n, t]) => b.fields.some(([n2, t2]) => n === n2 && same(t, t2)));
    }
    case 'union':
      return a.alts.every((x) => b.alts.some((y) => same(x, y))) &&
        b.alts.every((y) => a.alts.some((x) => same(x, y)));
    default: return true;
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
  if (same(a, b)) return true;
  if (a.k === 'json' && jsonable(b)) return true;
  if (a.k === 'list' && b.k === 'list' && covers(a.item, b.item)) return true;
  if (a.k === 'tuple' && b.k === 'tuple' && a.items.length === b.items.length &&
    a.items.every((x, i) => covers(x, b.items[i]))) return true;
  if (a.k === 'map' && b.k === 'map' && covers(a.key, b.key) && covers(a.val, b.val)) return true;
  if (a.k === 'record' && b.k === 'record' &&
    a.fields.every(([n, f]) => b.fields.some(([n2, g]) => n === n2 && covers(f, g)))) return true;
  if (a.k === 'union' && a.alts.some((x) => covers(x, b))) return true;
  if (b.k === 'union' && b.alts.every((y) => covers(a, y))) return true;
  return false;
}

function parse(text) {
  let p = 0;
  let depth = 0;
  const ws = () => { while (p < text.length && ' \t\r\n'.includes(text[p])) p++; };
  const fail = (msg) => { throw new Error(msg + ' at ' + p); };
  const ident = () => {
    ws();
    const m = IDENT.exec(text.slice(p));
    if (!m) fail('expected an identifier');
    p += m[0].length;
    return m[0];
  };
  const expect = (c) => {
    ws();
    if (text[p] !== c) fail("expected '" + c + "'");
    p++;
  };
  const open = () => { if (++depth > 16) fail('types nest deeper than 16'); };
  function alt() {
    const w = ident();
    if (WORDS.has(w)) return { k: w };
    if (w === 'list') {
      expect('['); open();
      const item = type();
      expect(']'); depth--;
      return { k: 'list', item };
    }
    if (w === 'map') {
      expect('['); open();
      const key = type();
      expect(',');
      const val = type();
      expect(']'); depth--;
      return { k: 'map', key, val };
    }
    if (w === 'tuple') {
      expect('['); open();
      const items = [type()];
      for (;;) {
        ws();
        if (text[p] === ',') { p++; items.push(type()); } else break;
      }
      expect(']'); depth--;
      return { k: 'tuple', items };
    }
    if (w === 'record') {
      expect('['); open();
      const fields = [];
      const names = new Set();
      for (;;) {
        const n = ident();
        if (names.has(n)) fail('duplicate field');
        names.add(n);
        expect(':');
        fields.push([n, type()]);
        ws();
        if (text[p] === ',') p++; else break;
      }
      expect(']'); depth--;
      return { k: 'record', fields };
    }
    fail('unknown type word ' + w);
  }
  function type() {
    const alts = [alt()];
    for (;;) {
      ws();
      if (text[p] === '|') { p++; alts.push(alt()); } else break;
    }
    if (alts.length === 1) return alts[0];
    for (let i = 0; i < alts.length; i++) {
      for (let j = i + 1; j < alts.length; j++) {
        if (covers(alts[i], alts[j])) fail('a union alternative is unreachable');
      }
    }
    return { k: 'union', alts };
  }
  const t = type();
  ws();
  if (p < text.length) fail('trailing text');
  return t;
}

export default function carried_shape_type(shape) {
  const seg = shape.split(';')[0];
  const norm = normalize(seg).replace(WIDEN, (_m, left, sign) => left + sign + '64');
  return parse(norm);
}
