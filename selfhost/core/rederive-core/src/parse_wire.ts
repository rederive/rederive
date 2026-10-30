type Wire = null | boolean | number | bigint | string | readonly Wire[] | { readonly [key: string]: Wire };

const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const MAX_DEPTH = 128;

function fail(msg: string, at: number): never {
  throw new Error("wire line: " + msg + " at " + String(at));
}

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

export default function parse_wire(line: string): Wire {
  if (typeof line !== "string") throw new Error("wire line: not text");
  const s: string = line;
  const n = s.length;
  let i = 0;

  function skip(): void {
    while (i < n) {
      const c = s.charCodeAt(i);
      if (c === 32 || c === 9 || c === 10 || c === 13) i++;
      else break;
    }
  }

  function readString(): string {
    i++;
    let out = "";
    let start = i;
    for (;;) {
      if (i >= n) fail("unterminated string", i);
      const c = s.charCodeAt(i);
      if (c === 34) {
        out += s.slice(start, i);
        i++;
        return out;
      }
      if (c < 32) fail("control character in string", i);
      if (c === 92) {
        out += s.slice(start, i);
        i++;
        if (i >= n) fail("bad escape", i);
        const e = s.charAt(i);
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
            if (i + 4 >= n) fail("bad unicode escape", i);
            for (let k = 1; k <= 4; k++) {
              if (!isHex(s.charCodeAt(i + k))) fail("bad unicode escape", i);
            }
            out += String.fromCharCode(parseInt(s.slice(i + 1, i + 5), 16));
            i += 4;
            break;
          }
          default:
            fail("unknown escape", i);
        }
        i++;
        start = i;
        continue;
      }
      i++;
    }
  }

  function readNumber(): number | bigint {
    const m = NUMERAL.exec(s.slice(i));
    if (m === null) fail("not a JSON value", i);
    const text = m[0];
    i += text.length;
    const num = Number(text);
    if (INTEGER_SPELLING.test(text)) {
      if (Number.isSafeInteger(num)) return num;
      if (Number.isFinite(num) && BigInt(num) === BigInt(text)) return num;
      return BigInt(text);
    }
    if (!Number.isFinite(num)) fail(text + " has no double", i);
    return num;
  }

  function readValue(depth: number): Wire {
    if (depth > MAX_DEPTH) fail("nests too deep", depth);
    skip();
    if (i >= n) fail("not a JSON value", i);
    const c = s.charAt(i);
    if (c === "{") {
      i++;
      const obj: { [key: string]: Wire } = {};
      skip();
      if (s.charAt(i) === "}") {
        i++;
        return obj;
      }
      for (;;) {
        skip();
        if (s.charAt(i) !== '"') fail("not a JSON value", i);
        const key = readString();
        skip();
        if (s.charAt(i) !== ":") fail("expected colon", i);
        i++;
        const v = readValue(depth + 1);
        Object.defineProperty(obj, key, { value: v, writable: true, enumerable: true, configurable: true });
        skip();
        const d = s.charAt(i);
        if (d === ",") { i++; continue; }
        if (d === "}") { i++; return obj; }
        fail("expected comma or close", i);
      }
    }
    if (c === "[") {
      i++;
      const arr: Wire[] = [];
      skip();
      if (s.charAt(i) === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(readValue(depth + 1));
        skip();
        const d = s.charAt(i);
        if (d === ",") { i++; continue; }
        if (d === "]") { i++; return arr; }
        fail("expected comma or close", i);
      }
    }
    if (c === '"') return readString();
    if (s.startsWith("true", i)) { i += 4; return true; }
    if (s.startsWith("false", i)) { i += 5; return false; }
    if (s.startsWith("null", i)) { i += 4; return null; }
    return readNumber();
  }

  const result = readValue(0);
  skip();
  if (i < n) fail("unexpected text after the value", i);
  return result;
}
