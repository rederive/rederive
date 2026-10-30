type Wire = null | boolean | number | bigint | string | readonly Wire[] | { readonly [key: string]: Wire };

const INTEGER_SPELLING = /^-?[0-9]+$/;
const NUMERAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/;
const MAX_DEPTH = 128;

function fail(msg: string): never {
  throw new Error("wire line: " + msg);
}

function isHex(c: number): boolean {
  return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

export default function parse_wire(line: string): Wire {
  if (typeof line !== "string") throw new Error("wire line: not text");
  const s = line;
  const n = s.length;
  let pos = 0;
  const numSticky = new RegExp(NUMERAL.source, "y");

  function skipWs(): void {
    while (pos < n) {
      const c = s.charCodeAt(pos);
      if (c === 32 || c === 9 || c === 10 || c === 13) pos++;
      else break;
    }
  }

  function readString(): string {
    pos++;
    let out = "";
    let start = pos;
    for (;;) {
      if (pos >= n) fail("unterminated string at " + pos);
      const c = s.charCodeAt(pos);
      if (c === 34) {
        out += s.slice(start, pos);
        pos++;
        return out;
      }
      if (c < 32) fail("a control character in a string at " + pos);
      if (c === 92) {
        out += s.slice(start, pos);
        pos++;
        if (pos >= n) fail("bad escape at " + pos);
        const e = s[pos];
        if (e === '"') out += '"';
        else if (e === "/") out += "/";
        else if (e === "\\") out += "\\";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "n") out += "\n";
        else if (e === "r") out += "\r";
        else if (e === "t") out += "\t";
        else if (e === "u") {
          if (pos + 4 >= n) fail("bad unicode escape at " + pos);
          for (let i = 1; i <= 4; i++) {
            if (!isHex(s.charCodeAt(pos + i))) fail("bad unicode escape at " + pos);
          }
          out += String.fromCharCode(parseInt(s.slice(pos + 1, pos + 5), 16));
          pos += 4;
        } else fail("unknown escape at " + pos);
        pos++;
        start = pos;
        continue;
      }
      pos++;
    }
  }

  function readNumber(): number | bigint {
    numSticky.lastIndex = pos;
    const m = numSticky.exec(s);
    if (m === null) fail("not a JSON value at " + pos);
    const text = m[0];
    pos += text.length;
    const num = Number(text);
    if (INTEGER_SPELLING.test(text)) {
      if (Number.isSafeInteger(num)) return num;
      if (Number.isFinite(num) && BigInt(num) === BigInt(text)) return num;
      return BigInt(text);
    }
    if (!Number.isFinite(num)) fail(text + " has no double at " + pos);
    return num;
  }

  function readValue(depth: number): Wire {
    if (depth > MAX_DEPTH) fail("nests too deep at " + (pos + 1));
    skipWs();
    if (pos >= n) fail("not a JSON value at " + pos);
    const ch = s[pos];
    if (ch === "{") {
      pos++;
      const obj: { [key: string]: Wire } = {};
      skipWs();
      if (s[pos] === "}") {
        pos++;
        return obj;
      }
      for (;;) {
        skipWs();
        if (s[pos] !== '"') fail("expected a key at " + pos);
        const key = readString();
        skipWs();
        if (s[pos] !== ":") fail("expected a colon at " + pos);
        pos++;
        const v = readValue(depth + 1);
        Object.defineProperty(obj, key, { value: v, enumerable: true, writable: true, configurable: true });
        skipWs();
        if (s[pos] === ",") {
          pos++;
          continue;
        }
        if (s[pos] === "}") {
          pos++;
          return obj;
        }
        fail("expected a comma or brace at " + pos);
      }
    }
    if (ch === "[") {
      pos++;
      const arr: Wire[] = [];
      skipWs();
      if (s[pos] === "]") {
        pos++;
        return arr;
      }
      for (;;) {
        arr.push(readValue(depth + 1));
        skipWs();
        if (s[pos] === ",") {
          pos++;
          continue;
        }
        if (s[pos] === "]") {
          pos++;
          return arr;
        }
        fail("expected a comma or bracket at " + pos);
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
  }

  const result = readValue(0);
  skipWs();
  if (pos < n) fail("unexpected text after the value at " + pos);
  return result;
}
