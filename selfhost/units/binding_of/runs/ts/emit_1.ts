import { createHash } from 'node:crypto';

type Result = { readonly status: string; readonly bound: string | null; readonly primarySha: string | null };
type Entry = { name: string; args: string; attrs: Map<string, string>; conts: string[] };

const ARGUMENT = /^[0-9a-f]{64}$/;
const SPLIT_LINES = /\r\n|\r|\n/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const HEAD = /^(\S+)(?:\s+(.*))?$/;
const NAME_COLON = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const LEAD_RUN = new RegExp("^[ \\t\\uFEFF]*");
const FEFF_ALL = new RegExp("\\uFEFF", "g");

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function trimST(s: string): string {
  return s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
}

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function canonicalText(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(SPLIT_LINES)) {
    const m = LEAD_RUN.exec(raw);
    const run = m ? m[0] : '';
    let line = run.replace(FEFF_ALL, '') + raw.slice(run.length);
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    const lead = /^[ \t]+/.exec(line);
    if (lead) line = '  ' + line.slice(lead[0].length);
    kept.push(line);
  }
  return kept.length === 0 ? '' : kept.join('\n') + '\n';
}

function lineName(line: string): string {
  const m = /[ \t]/.exec(line);
  const name = m ? line.slice(0, m.index) : line;
  if (name.endsWith(':')) {
    const base = name.slice(0, -1);
    if (DIRECTIVE.test(base) && base !== 'CITED') return base;
  }
  return name;
}

function boundOf(langText: string): string | null {
  const lines = langText.split(SPLIT_LINES).map((raw) => {
    const m = LEAD_RUN.exec(raw);
    const run = m ? m[0] : '';
    return (run.replace(FEFF_ALL, '') + raw.slice(run.length)).replace(/[ \t]+$/, '');
  });
  const kind = (line: string): string => {
    if (line === '') return 'blank';
    if (trimST(line).startsWith('#') && /^[ \t]*#/.test(line)) return 'comment';
    if (line.startsWith(' ') || line.startsWith('\t')) return 'cont';
    const n = lineName(line);
    return DIRECTIVE.test(n) && n !== 'CITED' ? 'directive' : 'cont';
  };
  let d = -1;
  for (let i = 0; i < lines.length; i++) {
    if (kind(lines[i]) === 'directive' && lineName(lines[i]) === 'PRIMARY-SHA256') {
      d = i;
      break;
    }
  }
  if (d < 0) return null;
  const line = lines[d];
  const sep = /[ \t]/.exec(line);
  let rest = sep ? line.slice(sep.index) : '';
  for (let i = 1; i < rest.length; i++) {
    if (rest[i] === '#' && (rest[i - 1] === ' ' || rest[i - 1] === '\t') && (i + 1 === rest.length || rest[i + 1] === ' ' || rest[i + 1] === '\t')) {
      rest = rest.slice(0, i);
      break;
    }
  }
  const arg = trimST(rest);
  if (!ARGUMENT.test(arg)) return null;
  for (let i = d + 1; i < lines.length; i++) {
    const k = kind(lines[i]);
    if (k === 'directive') break;
    if (k !== 'blank' && k !== 'comment') return null;
  }
  return arg;
}

function attrs(input: string): { body: string; found: Array<[string, string]> } {
  let s = input;
  const found: Array<[string, string]> = [];
  for (;;) {
    const m = ATTR.exec(s);
    if (!m) break;
    const kw = m[1];
    const val = (m[2] ?? '').trim();
    const prev = found.find((p) => p[0] === kw);
    if (prev) prev[1] = prev[1] === '' ? val : prev[1] + ' ' + val;
    else found.push([kw, val]);
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), found };
}

function legacyPrint(text: string): string {
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  for (const piece0 of text.split('\n')) {
    const piece = piece0.replace(/\r$/, '');
    if (/^\s*$/.test(piece)) continue;
    const indent = /^[ \t]*/.exec(piece);
    const ind = indent ? indent[0] : '';
    const content = piece.slice(ind.length);
    if (content.startsWith('#')) continue;
    let code = content;
    const tc = TRAILING_COMMENT.exec(content);
    if (tc) code = (tc[1] ?? '').replace(/\s+$/, '');
    if (ind === '') {
      let isDir = false;
      let name = '';
      let rest = '';
      const h = HEAD.exec(code);
      if (code !== '' && h) {
        name = h[1] ?? '';
        rest = h[2] ?? '';
        if (NAME_COLON.test(name)) name = name.slice(0, -1);
        isDir = DIRECTIVE.test(name);
      }
      if (isDir) {
        const a = attrs(rest);
        const e: Entry = { name, args: a.body, attrs: new Map<string, string>(), conts: [] };
        for (const [k, v] of a.found) e.attrs.set(k, v);
        entries.push(e);
        cur = e;
      } else if (cur) {
        cur.conts.push(code);
      }
    } else if (cur) {
      const a = attrs(code);
      for (const [k, v] of a.found) cur.attrs.set(k, v);
      cur.conts.push(a.body);
    }
  }
  const out: string[] = [];
  for (const e of entries) {
    let l = e.name;
    if (e.args !== '') l += ' ' + e.args;
    for (const [k, v] of e.attrs) l += ' ' + k + ' ' + v;
    out.push(l);
    for (const c of e.conts) out.push('  ' + c);
  }
  return out.length === 0 ? '\n' : out.join('\n') + '\n';
}

export function bindingOf(langText: string, primaryText: string | null): Result {
  const bound = boundOf(langText);
  if (primaryText === null) return { status: 'no-primary', bound, primarySha: null };
  const primarySha = wellFormed(primaryText) ? sha(canonicalText(primaryText)) : null;
  if (bound === null) return { status: 'unbound', bound, primarySha };
  if (bound === primarySha) return { status: 'ok', bound, primarySha };
  if (primarySha !== null && bound === sha(legacyPrint(primaryText))) return { status: 'legacy', bound, primarySha };
  return { status: 'stale', bound, primarySha };
}
