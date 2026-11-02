import { createHash } from 'node:crypto';

type Result = { readonly status: string; readonly bound: string | null; readonly primarySha: string | null };

const SPLIT_LINES = /\r\n|\r|\n/;
const ARGUMENT = /^[0-9a-f]{64}$/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const HEAD = /^(\S+)(?:\s+(.*))?$/;
const NAME_COLON = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const ALL_SPACE = /^\s*$/;

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return true;
    } else if (c >= 0xdc00 && c <= 0xdfff) return true;
  }
  return false;
}

function normLine(line: string): string {
  let j = 0;
  while (j < line.length && (line[j] === ' ' || line[j] === '\t' || line[j] === '﻿')) j++;
  const lead = line.slice(0, j).split('﻿').join('');
  let rest = lead + line.slice(j);
  let e = rest.length;
  while (e > 0 && (rest[e - 1] === ' ' || rest[e - 1] === '\t')) e--;
  rest = rest.slice(0, e);
  return rest;
}

function canonical(text: string): string | null {
  if (hasLoneSurrogate(text)) return null;
  const kept: string[] = [];
  for (const raw of text.split(SPLIT_LINES)) {
    const l = normLine(raw);
    if (l === '') continue;
    let k = 0;
    while (k < l.length && (l[k] === ' ' || l[k] === '\t')) k++;
    kept.push(k > 0 ? '  ' + l.slice(k) : l);
  }
  return kept.length === 0 ? '' : kept.join('\n') + '\n';
}

type Kind = { readonly kind: 'blank' | 'comment' | 'cont' } | { readonly kind: 'dir'; readonly name: string; readonly rest: string };

function classify(line: string): Kind {
  if (line === '') return { kind: 'blank' };
  let k = 0;
  while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++;
  if (line[k] === '#') return { kind: 'comment' };
  if (k > 0) return { kind: 'cont' };
  let n = 0;
  while (n < line.length && line[n] !== ' ' && line[n] !== '\t') n++;
  const raw = line.slice(0, n);
  let name = raw;
  if (name.endsWith(':')) {
    const base = name.slice(0, -1);
    if (DIRECTIVE.test(base) && base !== 'CITED') name = base;
  }
  if (DIRECTIVE.test(name) && name !== 'CITED') return { kind: 'dir', name, rest: line.slice(n) };
  return { kind: 'cont' };
}

function boundOf(langText: string): string | null {
  const lines = langText.split(SPLIT_LINES).map(normLine);
  const kinds = lines.map(classify);
  let d = -1;
  for (let i = 0; i < kinds.length; i++) {
    const k = kinds[i];
    if (k !== undefined && k.kind === 'dir' && k.name === 'PRIMARY-SHA256') {
      d = i;
      break;
    }
  }
  if (d < 0) return null;
  const dk = kinds[d];
  if (dk === undefined || dk.kind !== 'dir') return null;
  let arg = dk.rest;
  for (let i = 1; i < arg.length; i++) {
    if (arg[i] !== '#') continue;
    const p = arg[i - 1];
    if (p !== ' ' && p !== '\t') continue;
    const nx = i + 1 < arg.length ? arg[i + 1] : '';
    if (nx === '' || nx === ' ' || nx === '\t') {
      arg = arg.slice(0, i);
      break;
    }
  }
  let a = 0;
  let b = arg.length;
  while (a < b && (arg[a] === ' ' || arg[a] === '\t')) a++;
  while (b > a && (arg[b - 1] === ' ' || arg[b - 1] === '\t')) b--;
  arg = arg.slice(a, b);
  if (!ARGUMENT.test(arg)) return null;
  for (let i = d + 1; i < kinds.length; i++) {
    const k = kinds[i];
    if (k === undefined) continue;
    if (k.kind === 'dir') break;
    if (k.kind === 'blank' || k.kind === 'comment') continue;
    return null;
  }
  return arg;
}

function attrs(s0: string): { body: string; map: Map<string, string> } {
  const map = new Map<string, string>();
  let s = s0;
  for (;;) {
    const m = ATTR.exec(s);
    if (m === null) break;
    const kw = m[1];
    const val = (m[2] ?? '').trim();
    if (kw === undefined) break;
    const prev = map.get(kw);
    if (prev !== undefined && prev !== '') map.set(kw, prev + ' ' + val);
    else map.set(kw, val);
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), map };
}

type Entry = { name: string; args: string; attrs: Map<string, string>; conts: string[] };

function legacyPrint(text: string): string {
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  for (const piece0 of text.split('\n')) {
    const piece = piece0.replace(/\r$/, '');
    if (ALL_SPACE.test(piece)) continue;
    let k = 0;
    while (k < piece.length && (piece[k] === ' ' || piece[k] === '\t')) k++;
    const indent = k;
    const content = piece.slice(k);
    if (content.startsWith('#')) continue;
    let code = content;
    const tc = TRAILING_COMMENT.exec(content);
    if (tc !== null) code = (tc[1] ?? '').replace(/\s+$/, '');
    if (indent === 0) {
      let isDir = false;
      let name = '';
      let rest = '';
      if (code !== '' && !/^\s/.test(code)) {
        const h = HEAD.exec(code);
        if (h !== null) {
          name = h[1] ?? '';
          rest = h[2] ?? '';
          if (NAME_COLON.test(name)) name = name.slice(0, -1);
          isDir = DIRECTIVE.test(name);
        }
      }
      if (isDir) {
        const r = attrs(rest);
        cur = { name, args: r.body, attrs: r.map, conts: [] };
        entries.push(cur);
      } else if (cur !== null) {
        cur.conts.push(code);
      }
    } else if (cur !== null) {
      const r = attrs(code);
      for (const [kw, v] of r.map) cur.attrs.set(kw, v);
      cur.conts.push(r.body);
    }
  }
  if (entries.length === 0) return '\n';
  const out: string[] = [];
  for (const e of entries) {
    let l = e.name;
    if (e.args !== '') l += ' ' + e.args;
    for (const [kw, v] of e.attrs) l += ' ' + kw + ' ' + v;
    out.push(l);
    for (const c of e.conts) out.push('  ' + c);
  }
  return out.join('\n') + '\n';
}

export function bindingOf(langText: string, primaryText: string | null): Result {
  const bound = boundOf(langText);
  if (primaryText === null) return { status: 'no-primary', bound, primarySha: null };
  const canon = canonical(primaryText);
  const primarySha = canon === null ? null : sha(canon);
  if (bound === null) return { status: 'unbound', bound, primarySha };
  if (bound === primarySha) return { status: 'ok', bound, primarySha };
  if (primarySha !== null && bound === sha(legacyPrint(primaryText))) return { status: 'legacy', bound, primarySha };
  return { status: 'stale', bound, primarySha };
}
