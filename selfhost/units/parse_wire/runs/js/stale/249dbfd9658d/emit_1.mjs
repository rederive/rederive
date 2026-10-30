const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;

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
  const str = () => {
    i++;
    let out = '';
    for (;;) {
      if (i >= n) fail('unterminated string');
      const c = s.charCodeAt(i);
      if (c === 34) { i++; return out; }
      if (c < 32) fail('a control character in a string');
      if (c === 92) {
        i++;
        if (i >= n) fail('bad escape');
        const e = s[i];
        switch (e) {
          case '"': out += '"'; break;
          case '/': out += '/'; break;
          case '\\': out += '\\'; break;
          case 'b': out += '\b'; break;
          case 'f': out += '\f'; break;
          case 'n': out += '\n'; break;
          case 'r': out += '\r'; break;
          case 't': out += '\t'; break;
          case 'u': {
            const h = s.slice(i + 1, i + 5);
            if (h.length !== 4 || !/^[0-9a-fA-F]{4}$/.test(h)) fail('bad unicode escape');
            out += String.fromCharCode(parseInt(h, 16));
            i += 4;
            break;
          }
          default: fail('unknown escape');
        }
        i++;
      } else {
        out += s[i];
        i++;
      }
    }
  };
  const value = (depth) => {
    if (depth > 128) fail('nests too deep');
    ws();
    if (i >= n) fail('not a JSON value');
    const c = s[i];
    if (c === '[') {
      i++;
      const arr = [];
      ws();
      if (s[i] === ']') { i++; return arr; }
      for (;;) {
        arr.push(value(depth + 1));
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return arr; }
        fail('not a JSON value');
      }
    }
    if (c === '{') {
      i++;
      const obj = {};
      ws();
      if (s[i] === '}') { i++; return obj; }
      for (;;) {
        ws();
        if (s[i] !== '"') fail('not a JSON value');
        const k = str();
        ws();
        if (s[i] !== ':') fail('not a JSON value');
        i++;
        const v = value(depth + 1);
        Object.defineProperty(obj, k, { value: v, writable: true, enumerable: true, configurable: true });
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return obj; }
        fail('not a JSON value');
      }
    }
    if (c === '"') return str();
    if (s.startsWith('true', i)) { i += 4; return true; }
    if (s.startsWith('false', i)) { i += 5; return false; }
    if (s.startsWith('null', i)) { i += 4; return null; }
    NUMERAL.lastIndex = i;
    const m = NUMERAL.exec(s);
    if (!m) fail('not a JSON value');
    const t = m[0];
    i += t.length;
    const num = Number(t);
    if (INTEGER_SPELLING.test(t)) {
      if (Number.isSafeInteger(num)) return num;
      if (Number.isFinite(num) && BigInt(num) === BigInt(t)) return num;
      return BigInt(t);
    }
    if (!Number.isFinite(num)) fail(t + ' has no double');
    return num;
  };
  const v = value(0);
  ws();
  if (i < n) fail('unexpected text after the value');
  return v;
}
