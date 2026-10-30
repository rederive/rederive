const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const NUMERAL_Y = new RegExp(NUMERAL.source.slice(1), "y");

export default function parse_wire(line) {
  if (typeof line !== "string") throw new Error("wire line: not text");
  const s = line;
  const n = s.length;
  let p = 0;
  const fail = (m) => { throw new Error("wire line: " + m + " at " + p); };
  const ws = () => {
    while (p < n) {
      const c = s.charCodeAt(p);
      if (c === 32 || c === 9 || c === 10 || c === 13) p++; else break;
    }
  };
  const hex = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  const readString = () => {
    p++;
    let out = "";
    let start = p;
    for (;;) {
      if (p >= n) fail("unterminated string");
      const c = s.charCodeAt(p);
      if (c === 34) { out += s.slice(start, p); p++; return out; }
      if (c < 32) fail("control character in string");
      if (c === 92) {
        out += s.slice(start, p);
        p++;
        if (p >= n) fail("bad escape");
        const e = s[p];
        switch (e) {
          case '"': out += '"'; break;
          case "/": out += "/"; break;
          case "\\": out += "\\"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            if (p + 4 >= n) fail("bad unicode escape");
            for (let i = 1; i <= 4; i++) if (!hex(s.charCodeAt(p + i))) fail("bad unicode escape");
            out += String.fromCharCode(parseInt(s.slice(p + 1, p + 5), 16));
            p += 4;
            break;
          }
          default: fail("unknown escape");
        }
        p++;
        start = p;
      } else p++;
    }
  };
  const readNumber = () => {
    NUMERAL_Y.lastIndex = p;
    const m = NUMERAL_Y.exec(s);
    if (!m) fail("not a JSON value");
    const text = m[0];
    p += text.length;
    const v = Number(text);
    if (INTEGER_SPELLING.test(text)) {
      if (Number.isSafeInteger(v)) return v;
      if (Number.isFinite(v) && BigInt(v) === BigInt(text)) return v;
      return BigInt(text);
    }
    if (!Number.isFinite(v)) fail(text + " has no double");
    return v;
  };
  const readValue = (depth) => {
    if (depth > 128) fail("nests too deep");
    ws();
    if (p >= n) fail("not a JSON value");
    const c = s[p];
    if (c === "{") {
      p++;
      const o = {};
      ws();
      if (s[p] === "}") { p++; return o; }
      for (;;) {
        ws();
        if (s[p] !== '"') fail("not a JSON value");
        const k = readString();
        ws();
        if (s[p] !== ":") fail("expected colon");
        p++;
        const v = readValue(depth + 1);
        Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
        ws();
        if (s[p] === ",") { p++; continue; }
        if (s[p] === "}") { p++; return o; }
        fail("expected comma or brace");
      }
    }
    if (c === "[") {
      p++;
      const a = [];
      ws();
      if (s[p] === "]") { p++; return a; }
      for (;;) {
        a.push(readValue(depth + 1));
        ws();
        if (s[p] === ",") { p++; continue; }
        if (s[p] === "]") { p++; return a; }
        fail("expected comma or bracket");
      }
    }
    if (c === '"') return readString();
    if (s.startsWith("true", p)) { p += 4; return true; }
    if (s.startsWith("false", p)) { p += 5; return false; }
    if (s.startsWith("null", p)) { p += 4; return null; }
    return readNumber();
  };
  const v = readValue(0);
  ws();
  if (p < n) fail("unexpected text after the value");
  return v;
}
