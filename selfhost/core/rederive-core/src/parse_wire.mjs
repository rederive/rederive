const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;

export default function parse_wire(line) {
  if (typeof line !== 'string') throw new Error('wire line: not text');
  const s = line;
  const n = s.length;
  let i = 0;
  const fail = (m) => { throw new Error('wire line: ' + m + ' at ' + i); };
  const ws = () => {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++; else break;
    }
  };
  const hex4 = () => {
    const h = s.slice(i, i + 4);
    if (h.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(h)) fail('bad unicode escape');
    i += 4;
    return parseInt(h, 16);
  };
  const str = () => {
    i++;
    let out = '';
    for (;;) {
      if (i >= n) fail('unterminated string');
      const c = s.charCodeAt(i);
      if (c === 34) { i++; return out; }
      if (c < 0x20) fail('control char in string');
      if (c === 92) {
        i++;
        if (i >= n) fail('bad escape');
        const e = s[i];
        i++;
        switch (e) {
          case '"': out += '"'; break;
          case '/': out += '/'; break;
          case '\\': out += '\\'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': out += String.fromCharCode(hex4()); break;
          default: i--; fail('unknown escape');
        }
      } else {
        out += s[i];
        i++;
      }
    }
  };
  const num = () => {
    const m = NUMERAL.exec(s.slice(i));
    if (!m) fail('not a JSON value');
    const t = m[0];
    i += t.length;
    const v = Number(t);
    if (INTEGER_SPELLING.test(t)) {
      if (Number.isSafeInteger(v) || Object.is(v, -0)) return v;
      if (Number.isFinite(v) && BigInt(v) === BigInt(t)) return v;
      return BigInt(t);
    }
    if (!Number.isFinite(v)) fail(t + ' has no double');
    return v;
  };
  const value = (d) => {
    if (d > 128) fail('nests too deep');
    if (i >= n) fail('not a JSON value');
    const c = s[i];
    if (c === '{') {
      i++;
      const o = {};
      ws();
      if (s[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        if (s[i] !== '"') fail('not a JSON value');
        const k = str();
        ws();
        if (s[i] !== ':') fail('missing colon');
        i++;
        ws();
        const v = value(d + 1);
        Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        fail('expected , or }');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      ws();
      if (s[i] === ']') { i++; return a; }
      for (;;) {
        ws();
        a.push(value(d + 1));
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        fail('expected , or ]');
      }
    }
    if (c === '"') return str();
    if (s.startsWith('true', i)) { i += 4; return true; }
    if (s.startsWith('false', i)) { i += 5; return false; }
    if (s.startsWith('null', i)) { i += 4; return null; }
    return num();
  };
  ws();
  const r = value(0);
  ws();
  if (i < n) fail('unexpected text after the value');
  return r;
}
