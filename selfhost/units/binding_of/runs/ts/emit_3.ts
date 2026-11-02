import { createHash } from 'node:crypto';

const SPLIT_LINES = /\r\n|\r|\n/;
const ARGUMENT = /^[0-9a-f]{64}$/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const HEAD = /^(\S+)(?:\s+(.*))?$/;
const NAME_COLON = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const FEFF = String.fromCharCode(0xfeff);

type Result = { readonly status: string; readonly bound: string | null; readonly primarySha: string | null };

function sha(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

function isSpTab(c: string): boolean {
  return c === ' ' || c === '\t';
}

function normLine(line: string): string {
  let i = 0;
  let lead = '';
  while (i < line.length && (isSpTab(line[i] ?? '') || line[i] === FEFF)) {
    if (line[i] !== FEFF) lead += line[i];
    i++;
  }
  let rest = line.slice(i);
  let end = rest.length;
  while (end > 0 && isSpTab(rest[end - 1] ?? '')) end--;
  rest = rest.slice(0, end);
  return lead + rest;
}

function trimTrailing(line: string): string {
  let end = line.length;
  while (end > 0 && isSpTab(line[end - 1] ?? '')) end--;
  return line.slice(0, end);
}

function wellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i++;
      else return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}

function canonical(text: string): string {
  const kept: string[] = [];
  for (const raw of text.split(SPLIT_LINES)) {
    let i = 0;
    while (i < raw.length && (isSpTab(raw[i] ?? '') || raw[i] === FEFF)) i++;
    const lead = raw.slice(0, i).split(FEFF).join('');
    const line = trimTrailing(lead + raw.slice(i));
    if (line === '') continue;
    if (isSpTab(line[0] ?? '')) {
      let j = 0;
      while (j < line.length && isSpTab(line[j] ?? '')) j++;
      kept.push('  ' + line.slice(j));
    } else kept.push(line);
  }
  return kept.length === 0 ? '' : kept.join('\n') + '\n';
}

function lineName(line: string): string {
  let k = 0;
  while (k < line.length && !isSpTab(line[k] ?? '')) k++;
  let name = line.slice(0, k);
  if (NAME_COLON.test(name) && name.slice(0, -1) !== 'CITED') name = name.slice(0, -1);
  return name;
}

function classify(line: string): 'blank' | 'comment' | 'cont' | 'dir' {
  if (line === '') return 'blank';
  let i = 0;
  while (i < line.length && isSpTab(line[i] ?? '')) i++;
  if (line[i] === '#') return 'comment';
  if (i > 0) return 'cont';
  const name = lineName(line);
  return name !== 'CITED' && DIRECTIVE.test(name) ? 'dir' : 'cont';
}

function boundOf(lang: string): string | null {
  const lines = lang.split(SPLIT_LINES).map(normLine);
  let d = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (classify(line) === 'dir' && lineName(line) === 'PRIMARY-SHA256') {
      d = i;
      break;
    }
  }
  if (d < 0) return null;
  const line = lines[d] ?? '';
  let k = 0;
  while (k < line.length && !isSpTab(line[k] ?? '')) k++;
  let rest = line.slice(k);
  for (let p = 1; p < rest.length; p++) {
    if (rest[p] === '#' && isSpTab(rest[p - 1] ?? '') && (p + 1 === rest.length || isSpTab(rest[p + 1] ?? ''))) {
      rest = rest.slice(0, p);
      break;
    }
  }
  let a = 0;
  let b = rest.length;
  while (a < b && isSpTab(rest[a] ?? '')) a++;
  while (b > a && isSpTab(rest[b - 1] ?? '')) b--;
  const arg = rest.slice(a, b);
  if (!ARGUMENT.test(arg)) return null;
  for (let i = d + 1; i < lines.length; i++) {
    const c = classify(lines[i] ?? '');
    if (c === 'dir') break;
    if (c !== 'blank' && c !== 'comment') return null;
  }
  return arg;
}

function addAttr(m: Map<string, string>, kw: string, val: string): void {
  const prev = m.get(kw);
  if (prev === undefined || prev === '') m.set(kw, val);
  else m.set(kw, prev + ' ' + val);
}

function attributes(piece: string): { body: string; attrs: Map<string, string> } {
  const attrs = new Map<string, string>();
  let s = piece;
  for (;;) {
    const m = ATTR.exec(s);
    if (m === null) break;
    const kw = m[1] ?? '';
    const val = (m[2] ?? '').trim();
    addAttr(attrs, kw, val);
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), attrs };
}

type Entry = { name: string; args: string; attrs: Map<string, string>; conts: string[] };

function legacyPrint(text: string): string {
  const entries: Entry[] = [];
  let cur: Entry | null = null;
  for (const p of text.split('\n')) {
    const piece = p.replace(/\r$/, '');
    if (/^\s*$/.test(piece)) continue;
    let i = 0;
    while (i < piece.length && isSpTab(piece[i] ?? '')) i++;
    const indent = piece.slice(0, i);
    const content = piece.slice(i);
    if (content[0] === '#') continue;
    const tm = TRAILING_COMMENT.exec(content);
    const code = tm === null ? content : (tm[1] ?? '').replace(/\s+$/, '');
    if (indent === '') {
      let name: string | null = null;
      let rest = '';
      if (code !== '' && !/^\s/.test(code)) {
        const hm = HEAD.exec(code);
        if (hm !== null) {
          name = hm[1] ?? '';
          rest = hm[2] ?? '';
          if (NAME_COLON.test(name)) name = name.slice(0, -1);
          if (!DIRECTIVE.test(name)) name = null;
        }
      }
      if (name !== null) {
        const r = attributes(rest);
        cur = { name, args: r.body, attrs: r.attrs, conts: [] };
        entries.push(cur);
      } else if (cur !== null) cur.conts.push(code);
    } else if (cur !== null) {
      const r = attributes(code);
      for (const [k, v] of r.attrs) cur.attrs.set(k, v);
      cur.conts.push(r.body);
    }
  }
  if (entries.length === 0) return '\n';
  const out: string[] = [];
  for (const e of entries) {
    let l = e.name;
    if (e.args !== '') l += ' ' + e.args;
    for (const [k, v] of e.attrs) l += ' ' + k + ' ' + v;
    out.push(l);
    for (const c of e.conts) out.push('  ' + c);
  }
  return out.join('\n') + '\n';
}

export function bindingOf(langText: string, primaryText: string | null): Result {
  const bound = boundOf(langText);
  if (primaryText === null) return { status: 'no-primary', bound, primarySha: null };
  const primarySha = wellFormed(primaryText) ? sha(canonical(primaryText)) : null;
  if (bound === null) return { status: 'unbound', bound, primarySha };
  if (bound === primarySha) return { status: 'ok', bound, primarySha };
  if (primarySha !== null && bound === sha(legacyPrint(primaryText))) return { status: 'legacy', bound, primarySha };
  return { status: 'stale', bound, primarySha };
}
