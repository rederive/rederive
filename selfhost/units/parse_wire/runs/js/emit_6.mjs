const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const ESC = { '"': '"', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', '\\': '\\' };

export default function parse_wire(line) {
  if (typeof line !== 'string') throw new Error('wire line: not text');
  const s = line;
  const n = s.length;
  let i = 0;
  const fail = (m) => { throw new Error('wire line: ' + m + ' at ' + i); };
  const ws = () => {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  };
  const isHex = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  const str = () => {
    i++;
    let out = '';
    let start = i;
    for (;;) {
      if (i >= n) fail('unterminated string');
      const c = s.charCodeAt(i);
      if (c === 34) { out += s.slice(start, i); i++; return out; }
      if (c < 32) fail('control character in string');
      if (c === 92) {
        out += s.slice(start, i);
        i++;
        if (i >= n) fail('bad escape');
        const e = s[i];
        if (e === 'u') {
          if (i + 4 >= n) fail('bad unicode escape');
          for (let k = 1; k <= 4; k++) if (!isHex(s.charCodeAt(i + k))) fail('bad unicode escape');
          out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
          i += 5;
        } else if (Object.prototype.hasOwnProperty.call(ESC, e)) {
          out += ESC[e];
          i++;
        } else fail('unknown escape');
        start = i;
      } else i++;
    }
  };
  const value = (depth) => {
    if (depth > 128) fail('nests too deep');
    if (i >= n) fail('not a JSON value');
    const ch = s[i];
    if (ch === '{') {
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
        ws();
        const v = value(depth + 1);
        Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return o; }
        fail('expected , or }');
      }
    }
    if (ch === '[') {
      i++;
      const a = [];
      ws();
      if (s[i] === ']') { i++; return a; }
      for (;;) {
        ws();
        a.push(value(depth + 1));
        ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return a; }
        fail('expected , or ]');
      }
    }
    if (ch === '"') return str();
    if (s.startsWith('true', i)) { i += 4; return true; }
    if (s.startsWith('false', i)) { i += 5; return false; }
    if (s.startsWith('null', i)) { i += 4; return null; }
    const m = NUMERAL.exec(s.slice(i, i + 100000000));
    if (!m) fail('not a JSON value');
    const t = m[0];
    const num = Number(t);
    if (INTEGER_SPELLING.test(t)) {
      i += t.length;
      if (Number.isSafeInteger(num)) return num;
      const b = BigInt(t);
      if (Number.isFinite(num) && BigInt(num) === b) return num;
      return b;
    }
    i += t.length;
    if (!Number.isFinite(num)) fail(t + ' has no double');
    return num;
  };
  ws();
  const r = value(0);
  ws();
  if (i < n) fail('unexpected text after the value');
  return r;
}
