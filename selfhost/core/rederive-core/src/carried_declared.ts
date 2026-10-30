export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export interface Assertion { expr: string; equals: Json }
export interface CarriedDecl { name: string; from: string; sha: string | null; shape: string | null; assertions: Assertion[] }

const OPENERS = " \t([{,=:;|<>!&-~";
const ATTRS = ["CITED", "EARNED", "ANCHOR"];
const NAME_RE = /^[A-Z][A-Z0-9-]*$/;
const HEAD = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/;
const KEYWORD = /^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/;
const SUBFIELD = /^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/;
const AUTHORITY = /^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/;
const NUMERAL = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const VISIBLE = /[^\s\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]/u;

function trimSp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, "");
}
function isSp(c: string | undefined): boolean {
  return c === " " || c === "\t";
}

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let lastClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.includes(s[i - 1] ?? "") || lastClose === i - 1)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === "\\") j += 2;
        else if (c === '"') { close = j; break; }
        else j++;
      }
      if (close < 0) break;
      out.push([i, close]);
      lastClose = close;
      i = close + 1;
    } else i++;
  }
  return out;
}
function inside(sp: Array<[number, number]>, i: number): boolean {
  return sp.some(([a, b]) => a < i && i < b);
}

function codeOf(content: string): string {
  const sp = spans(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] === "#" && isSp(content[i - 1]) && (i + 1 === content.length || isSp(content[i + 1])) && !inside(sp, i)) {
      return content.slice(0, i).replace(/[ \t]+$/, "");
    }
  }
  return content;
}

function splitAttrs(text: string): string {
  const sp = spans(text);
  for (let i = 1; i < text.length; i++) {
    if (!isSp(text[i - 1])) continue;
    for (const w of ATTRS) {
      if (text.startsWith(w, i) && (i + w.length === text.length || isSp(text[i + w.length])) && !inside(sp, i)) {
        return trimSp(text.slice(0, i));
      }
    }
  }
  return trimSp(text);
}

function checkNumerals(e: string): void {
  const blanked = e.replace(/"(?:\\[^]|[^"\\])*"/g, '""');
  const nums = blanked.match(NUMERAL) ?? [];
  for (const n of nums) {
    const x = Number(n);
    if (!Number.isFinite(x)) throw new Error("numeral");
    if (Math.abs(x) > 2 ** 53) throw new Error("numeral");
    if (x === 0 && /[1-9]/.test(n.split(/[eE]/)[0] ?? "")) throw new Error("numeral");
    if (/^-?\d+$/.test(n) && BigInt(n) !== BigInt(x)) throw new Error("numeral");
  }
}

interface Directive { name: string; args: string; bodies: string[] }

export function carried_declared(text: string): CarriedDecl | null {
  const dirs: Directive[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    const lead = /^[ \t\uFEFF]*/.exec(line);
    const lm = lead ? lead[0] : "";
    const full = (lm.replace(/\uFEFF/g, "") + line.slice(lm.length)).replace(/[ \t]+$/, "");
    if (full === "") continue;
    const im = /^[ \t]*/.exec(full);
    const indent = im ? im[0] : "";
    const content = full.slice(indent.length);
    if (content.startsWith("#")) continue;
    const code = codeOf(content);
    let started = false;
    if (indent === "") {
      const m = /^[^ \t]*/.exec(code);
      const tok = m ? m[0] : "";
      const nm = tok.endsWith(":") ? tok.slice(0, -1) : tok;
      if (NAME_RE.test(nm) && nm !== "CITED") {
        dirs.push({ name: nm, args: splitAttrs(code.slice(tok.length)), bodies: [] });
        started = true;
      }
    }
    if (!started) {
      const cur = dirs[dirs.length - 1];
      if (!cur) continue;
      const body = splitAttrs(" " + code);
      if (body !== "") cur.bodies.push(body);
    }
  }
  const carried = dirs.filter((d) => d.name === "CARRIED");
  const first = carried[0];
  if (!first) return null;
  if (dirs.some((d) => d.name === "CANONICAL-SHA256" || d.name === "SHAPE" || d.name === "AUTHORITY")) throw new Error("subfield directive");
  if (carried.length > 1) throw new Error("two CARRIED");
  const h = HEAD.exec(first.args);
  if (!h) throw new Error("head");
  const name = h[1] ?? "";
  const from = h[2] ?? "";
  let sha: string | null = null;
  let shape: string | null = null;
  const assertions: Assertion[] = [];
  for (const body of first.bodies) {
    if (!KEYWORD.test(body)) continue;
    const m = SUBFIELD.exec(body);
    if (!m) throw new Error("subfield");
    const kw = m[1];
    const value = m[2] ?? "";
    if (kw === "CANONICAL-SHA256") {
      if (sha !== null) throw new Error("dup sha");
      if (!/^[0-9a-f]{64}$/.test(value)) throw new Error("sha");
      sha = value;
    } else if (kw === "SHAPE") {
      if (shape !== null) throw new Error("dup shape");
      if (value === "") throw new Error("shape");
      shape = value;
    } else {
      const a = AUTHORITY.exec(value);
      if (!a) throw new Error("authority");
      const str: Json = JSON.parse(a[1] ?? "");
      if (typeof str !== "string") throw new Error("expr");
      const eText = a[2] ?? "";
      const equals: Json = JSON.parse(eText);
      checkNumerals(eText);
      if (!VISIBLE.test(str)) throw new Error("expr empty");
      assertions.push({ expr: str, equals });
    }
  }
  return { name, from, sha, shape, assertions };
}
