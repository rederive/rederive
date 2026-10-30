export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export interface Assertion { expr: string; equals: Json }
export interface CarriedDecl {
  name: string; from: string; sha: string | null; shape: string | null; assertions: Assertion[];
}

const OPENERS = " \t([{,=:;|<>!&-~";

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prevClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1] as string) || i - 1 === prevClose)) {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === "\\") j += 2;
        else if (s[j] === '"') break;
        else j++;
      }
      if (j >= s.length) return out;
      out.push([i, j]);
      prevClose = j;
      i = j + 1;
    } else i++;
  }
  return out;
}

function inside(sp: Array<[number, number]>, pos: number): boolean {
  return sp.some(([o, c]) => o < pos && pos < c);
}

const isSp = (c: string | undefined): boolean => c === " " || c === "\t";
const trimSp = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, "");

function cutAttrs(text: string): string {
  const sp = spans(text);
  for (let i = 1; i < text.length; i++) {
    if (!isSp(text[i - 1])) continue;
    const m = /^(?:CITED|EARNED|ANCHOR)/.exec(text.slice(i, i + 6));
    if (!m) continue;
    const after = text[i + m[0].length];
    if (after !== undefined && !isSp(after)) continue;
    if (inside(sp, i)) continue;
    return trimSp(text.slice(0, i));
  }
  return trimSp(text);
}

function cutComment(content: string): string {
  const sp = spans(content);
  for (let k = 1; k < content.length; k++) {
    if (content[k] !== "#") continue;
    if (!isSp(content[k - 1])) continue;
    if (k + 1 < content.length && !isSp(content[k + 1])) continue;
    if (inside(sp, k)) continue;
    return content.slice(0, k).replace(/[ \t]+$/, "");
  }
  return content;
}

interface Dir { name: string; args: string; conts: string[] }

const VISIBLE = new RegExp(
  "[^\\t\\n\\v\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF" +
    "\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E\\u200B-\\u200F\\u202A-\\u202E" +
    "\\u2060-\\u2064\\u2066-\\u206F\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}" +
    "\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}]",
  "u",
);

function checkNumerals(e: string): void {
  const blanked = e.replace(/"(?:\\[^]|[^"\\])*"/g, '""');
  const nums = blanked.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g);
  if (!nums) return;
  for (const n of nums) {
    const x = Number(n);
    if (!Number.isFinite(x)) throw new Error("numeral");
    if (Math.abs(x) > 2 ** 53) throw new Error("numeral");
    if (x === 0) {
      const mant = n.split(/[eE]/)[0] as string;
      if (/[1-9]/.test(mant)) throw new Error("underflow");
    }
    if (/^-?\d+$/.test(n) && BigInt(n) !== BigInt(x)) throw new Error("inexact");
  }
}

export function carried_declared(text: string): CarriedDecl | null {
  const dirs: Dir[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const lead = (/^[ \t\uFEFF]*/.exec(raw) as RegExpExecArray)[0];
    const line = (lead.replace(/\uFEFF/g, "") + raw.slice(lead.length)).replace(/[ \t]+$/, "");
    if (line === "") continue;
    const indent = (/^[ \t]*/.exec(line) as RegExpExecArray)[0];
    const content = line.slice(indent.length);
    if (content === "") continue;
    if (content[0] === "#") continue;
    const code = cutComment(content);
    let started = false;
    if (indent === "") {
      const idx = code.search(/[ \t]/);
      const tokRaw = idx < 0 ? code : code.slice(0, idx);
      const tok = tokRaw.endsWith(":") ? tokRaw.slice(0, -1) : tokRaw;
      if (/^[A-Z][A-Z0-9-]*$/.test(tok) && tok !== "CITED") {
        dirs.push({ name: tok, args: cutAttrs(code.slice(tokRaw.length)), conts: [] });
        started = true;
      }
    }
    if (!started) {
      const cur = dirs[dirs.length - 1];
      if (cur === undefined) continue;
      const body = cutAttrs(" " + code);
      if (body !== "") cur.conts.push(body);
    }
  }
  const carried = dirs.filter((d) => d.name === "CARRIED");
  if (carried.length === 0) return null;
  if (dirs.some((d) => d.name === "CANONICAL-SHA256" || d.name === "SHAPE" || d.name === "AUTHORITY")) {
    throw new Error("col0 subfield");
  }
  if (carried.length > 1) throw new Error("two CARRIED");
  const dir = carried[0] as Dir;
  const head = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/.exec(dir.args);
  if (!head) throw new Error("head");
  let sha: string | null = null;
  let shape: string | null = null;
  const assertions: Assertion[] = [];
  for (const body of dir.conts) {
    if (!/^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/.test(body)) continue;
    const m = /^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/.exec(body);
    if (!m) throw new Error("subfield");
    const kw = m[1];
    const value = m[2] ?? "";
    if (kw === "CANONICAL-SHA256") {
      if (sha !== null) throw new Error("dup sha");
      if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("sha");
      sha = value;
    } else if (kw === "SHAPE") {
      if (shape !== null) throw new Error("dup shape");
      if (value === "") throw new Error("empty shape");
      shape = value;
    } else {
      const a = /^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/.exec(value);
      if (!a) throw new Error("authority");
      const exprParsed: Json = JSON.parse(a[1] as string);
      if (typeof exprParsed !== "string") throw new Error("expr");
      const eText = a[2] as string;
      const equals: Json = JSON.parse(eText);
      checkNumerals(eText);
      if (!VISIBLE.test(exprParsed)) throw new Error("invisible expr");
      assertions.push({ expr: exprParsed, equals });
    }
  }
  return { name: head[1] as string, from: head[2] as string, sha, shape, assertions };
}
