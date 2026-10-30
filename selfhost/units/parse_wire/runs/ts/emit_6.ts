type Wire = null | boolean | number | bigint | string | readonly Wire[] | { readonly [key: string]: Wire };

const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const MAX_DEPTH = 128;

export default function parse_wire(line: string): Wire {
  if (typeof line !== "string") throw new Error("wire line: not text");
  const s: string = line;
  const n = s.length;
  let pos = 0;

  const fail = (msg: string): Error => new Error("wire line: " + msg + " at " + pos);

  const skip = (): void => {
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) pos++;
      else break;
    }
  };

  const hex4 = (): number => {
    if (pos + 4 > n) throw fail("bad unicode escape");
    const h = s.slice(pos, pos + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(h)) throw fail("bad unicode escape");
    pos += 4;
    return parseInt(h, 16);
  };

  const readString = (): string => {
    pos++;
    let out = "";
    for (;;) {
      if (pos >= n) throw fail("unterminated string");
      const c = s.charCodeAt(pos);
      if (c === 0x22) {
        pos++;
        return out;
      }
      if (c < 0x20) throw fail("control character in string");
      if (c === 0x5c) {
        pos++;
        if (pos >= n) throw fail("unterminated string");
        const e = s.charAt(pos);
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
          case "u": out += String.fromCharCode(hex4()); break;
          default: throw fail("unknown escape");
        }
      } else {
        out += s.charAt(pos);
        pos++;
      }
    }
  };

  const readNumber = (): number | bigint => {
    const m = NUMERAL.exec(s.slice(pos));
    if (m === null) throw fail("not a JSON value");
    const text = m[0];
    pos += text.length;
    const num = Number(text);
    if (INTEGER_SPELLING.test(text)) {
      if (Number.isSafeInteger(num) || Object.is(num, -0)) return num;
      if (Number.isFinite(num) && BigInt(num) === BigInt(text)) return num;
      return BigInt(text);
    }
    if (!Number.isFinite(num)) throw fail(text + " has no double");
    return num;
  };

  const readValue = (depth: number): Wire => {
    if (depth > MAX_DEPTH) throw fail("nests too deep");
    skip();
    if (pos >= n) throw fail("not a JSON value");
    const ch = s.charAt(pos);
    if (ch === "{") {
      pos++;
      const obj: { [key: string]: Wire } = {};
      skip();
      if (s.charAt(pos) === "}") {
        pos++;
        return obj;
      }
      for (;;) {
        skip();
        if (s.charAt(pos) !== '"') throw fail("expected key");
        const key = readString();
        skip();
        if (s.charAt(pos) !== ":") throw fail("expected colon");
        pos++;
        const v = readValue(depth + 1);
        Object.defineProperty(obj, key, { value: v, writable: true, enumerable: true, configurable: true });
        skip();
        const d = s.charAt(pos);
        if (d === ",") {
          pos++;
          continue;
        }
        if (d === "}") {
          pos++;
          return obj;
        }
        throw fail("expected comma or close");
      }
    }
    if (ch === "[") {
      pos++;
      const arr: Wire[] = [];
      skip();
      if (s.charAt(pos) === "]") {
        pos++;
        return arr;
      }
      for (;;) {
        arr.push(readValue(depth + 1));
        skip();
        const d = s.charAt(pos);
        if (d === ",") {
          pos++;
          continue;
        }
        if (d === "]") {
          pos++;
          return arr;
        }
        throw fail("expected comma or close");
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
  if (pos < n) throw fail("unexpected text after the value");
  return result;
}
