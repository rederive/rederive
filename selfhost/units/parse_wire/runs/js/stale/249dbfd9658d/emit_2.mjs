const INT = /^-?[0-9]+$/;
const NUM = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const MAXD = 128;

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
  const hex = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  const str = () => {
    i++;
    let out = '';
    let start = i;
    for (;;) {
      if (i >= n) fail('unterminated string');
      const c = s.charCodeAt(i);
      if (c === 34) { out += s.slice(start, i); i++; return out; }
      if (c < 32) fail('a control character in a string');
      if (c === 92) {
        out += s.slice(start, i);
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
            for (let k = 1; k <= 4; k++) {
              if (i + k >= n || !hex(s.charCodeAt(i + k))) { i += k; fail('bad unicode escape'); }
            }
            out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
            i += 4;
            break;
          }
          default: fail('unknown escape');
        }
        i++;
        start = i;
      } else i++;
    }
  };
  const val = (d) => {
    if (d > MAXD) fail('nests too deep');
    ws();
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
        if (s[i] !== ':') fail('expected colon');
        i++;
        const v = val(d + 1);
        Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        fail('expected comma or close');
      }
    }
    if (c === '[') {
      i++;
      const a = [];
      ws();
      if (s[i] === ']') { i++; return a; }
      for (;;) {
        a.push(val(d + 1));
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        fail('expected comma or close');
      }
    }
    if (c === '"') return str();
    if (s.startsWith('true', i)) { i += 4; return true; }
    if (s.startsWith('false', i)) { i += 5; return false; }
    if (s.startsWith('null', i)) { i += 4; return null; }
    const m = NUM.exec(s.slice(i));
    if (!m) fail('not a JSON value');
    const t = m[0];
    i += t.length;
    const x = Number(t);
    if (INT.test(t)) {
      if (Number.isSafeInteger(x) || Object.is(x, -0)) return x;
      if (Number.isFinite(x) && BigInt(x) === BigInt(t)) return x;
      return BigInt(t);
    }
    if (!Number.isFinite(x)) fail(t + ' has no double');
    return x;
  };
  const v = val(0);
  ws();
  if (i < n) fail('unexpected text after the value');
  return v;
}
