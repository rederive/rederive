type Wire = null | boolean | number | bigint | string | readonly Wire[] | { readonly [key: string]: Wire };

const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const MAX_DEPTH = 128;

function fail(msg: string, at: number): never {
  throw new Error("wire line: " + msg + " at " + String(at));
}

export default function parse_wire(line: string): Wire {
  if (typeof line !== "string") throw new Error("wire line: not text");
  const s = line;
  const n = s.length;
  let pos = 0;

  const skip = (): void => {
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) pos++;
      else break;
    }
  };

  const readString = (): string => {
    pos++;
    let out = "";
    let start = pos;
    for (;;) {
      if (pos >= n) fail("unterminated string", pos);
      const c = s.charCodeAt(pos);
      if (c === 34) {
        out += s.slice(start, pos);
        pos++;
        return out;
      }
      if (c < 32) fail("control character in string", pos);
      if (c === 92) {
        out += s.slice(start, pos);
        pos++;
        if (pos >= n) fail("bad escape", pos);
        const e = s[pos];
        pos++;
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
            const hex = s.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad unicode escape", pos);
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          }
          default:
            fail("unknown escape", pos - 1);
        }
        start = pos;
        continue;
      }
      pos++;
    }
  };

  const readNumber = (): Wire => {
    const m = NUMERAL.exec(s.slice(pos));
    if (m === null) return fail("not a JSON value", pos);
    const text = m[0];
    pos += text.length;
    const num = Number(text);
    if (INTEGER_SPELLING.test(text)) {
      if (Number.isSafeInteger(num) || Object.is(num, -0)) return num;
      if (Number.isFinite(num) && BigInt(num) === BigInt(text)) return num;
      return BigInt(text);
    }
    if (!Number.isFinite(num)) fail(text + " has no double", pos);
    return num;
  };

  const readValue = (depth: number): Wire => {
    if (depth > MAX_DEPTH) fail("nests too deep", pos);
    skip();
    if (pos >= n) return fail("not a JSON value", pos);
    const ch = s[pos];
    if (ch === "{") {
      pos++;
      const obj: { [key: string]: Wire } = {};
      skip();
      if (s[pos] === "}") {
        pos++;
        return obj;
      }
      for (;;) {
        skip();
        if (s[pos] !== '"') fail("not a JSON value", pos);
        const key = readString();
        skip();
        if (s[pos] !== ":") fail("expected colon", pos);
        pos++;
        const v = readValue(depth + 1);
        Object.defineProperty(obj, key, { value: v, enumerable: true, writable: true, configurable: true });
        skip();
        if (s[pos] === ",") {
          pos++;
          continue;
        }
        if (s[pos] === "}") {
          pos++;
          return obj;
        }
        return fail("expected comma or brace", pos);
      }
    }
    if (ch === "[") {
      pos++;
      const arr: Wire[] = [];
      skip();
      if (s[pos] === "]") {
        pos++;
        return arr;
      }
      for (;;) {
        arr.push(readValue(depth + 1));
        skip();
        if (s[pos] === ",") {
          pos++;
          continue;
        }
        if (s[pos] === "]") {
          pos++;
          return arr;
        }
        return fail("expected comma or bracket", pos);
      }
    }
    if (ch === '"') return readString();
    if (s.startsWith("true", pos)) {
      pos += 4;
      return true;
    }
    if (s.startsWith("false", pos)) {
      pos += 5;
      return false;
    }
    if (s.startsWith("null", pos)) {
      pos += 4;
      return null;
    }
    return readNumber();
  };

  const result = readValue(0);
  skip();
  if (pos < n) fail("unexpected text after the value", pos);
  return result;
}
