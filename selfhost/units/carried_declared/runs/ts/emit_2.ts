export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export interface Assertion { expr: string; equals: Json }
export interface CarriedDecl { name: string; from: string; sha: string | null; shape: string | null; assertions: Assertion[] }

interface Directive { name: string; args: string; bodies: string[] }

const OPENERS = ' \t([{,=:;|<>!&-~';

// quoted spans as [open, close] index pairs
function spansOf(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const n = s.length;
  let lastClose = -2;
  let i = 0;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENERS.indexOf(s[i - 1]) >= 0 || lastClose === i - 1)) {
      let j = i + 1;
      while (j < n) {
        if (s[j] === '\\') j += 2;
        else if (s[j] === '"') break;
        else j++;
      }
      if (j >= n) break;
      spans.push([i, j]);
      lastClose = j;
      i = j + 1;
    } else {
      i++;
    }
  }
  return spans;
}

function inside(spans: Array<[number, number]>, p: number): boolean {
  for (const [a, b] of spans) if (p > a && p < b) return true;
  return false;
}

function isSp(c: string | undefined): boolean {
  return c === ' ' || c === '\t';
}

function trimSp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function cutComment(content: string): string {
  const spans = spansOf(content);
  for (let i = 1; i < content.length; i++) {
    if (content[i] === '#' && isSp(content[i - 1]) && (i + 1 >= content.length || isSp(content[i + 1])) && !inside(spans, i)) {
      return content.slice(0, i).replace(/[ \t]+$/, '');
    }
  }
  return content;
}

function dropAttrs(text: string): string {
  const spans = spansOf(text);
  const words = ['CITED', 'EARNED', 'ANCHOR'];
  for (let i = 1; i < text.length; i++) {
    if (!isSp(text[i - 1])) continue;
    for (const w of words) {
      if (text.startsWith(w, i)) {
        const after = text[i + w.length];
        if ((after === undefined || isSp(after)) && !inside(spans, i)) {
          return trimSp(text.slice(0, i));
        }
      }
    }
  }
  return trimSp(text);
}

const NAME_RE = /^[A-Z][A-Z0-9-]*$/;
const LINES = /\r\n|\r|\n/;
const HEAD = /^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/;
const KEYWORD = /^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/;
const SUBFIELD = /^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/;
const AUTHORITY = /^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/;
const NUMERAL = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const VISIBLE = /[^\s\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]/u;

function parseJson(s: string): Json {
  const v: Json = JSON.parse(s);
  return v;
}

function checkNumerals(e: string): void {
  const blanked = e.replace(/"(?:\\[^]|[^"\\])*"/g, '""');
  const found = blanked.match(NUMERAL);
  if (!found) return;
  for (const num of found) {
    const x = Number(num);
    if (!Number.isFinite(x)) throw new Error('numeral not finite');
    if (Math.abs(x) > 2 ** 53) throw new Error('numeral too large');
    if (x === 0) {
      const mant = num.split(/[eE]/)[0];
      if (/[1-9]/.test(mant)) throw new Error('underflow');
    }
    if (/^-?\d+$/.test(num)) {
      const digits = num.replace('-', '').replace(/^0+(?=\d)/, '');
      if (String(Math.abs(x)) !== digits) throw new Error('inexact integer');
    }
  }
}

export function carried_declared(text: string): CarriedDecl | null {
  const directives: Directive[] = [];
  let cur: Directive | null = null;
  for (const raw of text.split(LINES)) {
    const lead = (raw.match(/^[ \t\uFEFF]*/) ?? [''])[0];
    const line = (lead.replace(/\uFEFF/g, '') + raw.slice(lead.length)).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = (line.match(/^[ \t]*/) ?? [''])[0];
    const content = line.slice(indent.length);
    if (content === '' || content[0] === '#') continue;
    const code = cutComment(content);
    let sp = -1;
    for (let i = 0; i < code.length; i++) {
      if (isSp(code[i])) { sp = i; break; }
    }
    const tok = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp);
    if (indent === '') {
      const nm = tok.endsWith(':') ? tok.slice(0, -1) : tok;
      if (NAME_RE.test(nm) && nm !== 'CITED') {
        cur = { name: nm, args: dropAttrs(rest), bodies: [] };
        directives.push(cur);
        continue;
      }
    }
    if (cur === null) continue;
    const body = dropAttrs(' ' + code);
    if (body !== '') cur.bodies.push(body);
  }

  const carried = directives.filter((d) => d.name === 'CARRIED');
  if (carried.length === 0) return null;
  for (const d of directives) {
    if (d.name === 'CANONICAL-SHA256' || d.name === 'SHAPE' || d.name === 'AUTHORITY') {
      throw new Error('sub-field not indented under CARRIED');
    }
  }
  if (carried.length > 1) throw new Error('one CARRIED table per primary');
  const c = carried[0];
  const hm = HEAD.exec(c.args);
  if (!hm) throw new Error('bad CARRIED head');

  let sha: string | null = null;
  let shape: string | null = null;
  const assertions: Assertion[] = [];
  for (const body of c.bodies) {
    if (!KEYWORD.test(body)) continue;
    const m = SUBFIELD.exec(body);
    if (!m) throw new Error('bad keyword line');
    const value = m[2] ?? '';
    if (m[1] === 'CANONICAL-SHA256') {
      if (sha !== null) throw new Error('repeated hash');
      if (!/^[0-9a-f]{64}$/.test(value)) throw new Error('bad hash');
      sha = value;
    } else if (m[1] === 'SHAPE') {
      if (shape !== null) throw new Error('repeated shape');
      if (value === '') throw new Error('empty shape');
      shape = value;
    } else {
      const am = AUTHORITY.exec(value);
      if (!am) throw new Error('bad authority');
      const exprV = parseJson(am[1]);
      if (typeof exprV !== 'string') throw new Error('expr not string');
      const eText = am[2];
      const equals = parseJson(eText);
      checkNumerals(eText);
      if (!VISIBLE.test(exprV)) throw new Error('empty expr');
      assertions.push({ expr: exprV, equals });
    }
  }
  return { name: hm[1], from: hm[2], sha, shape, assertions };
}
