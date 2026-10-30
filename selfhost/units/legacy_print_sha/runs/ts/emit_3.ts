import { createHash } from 'node:crypto';

interface Directive {
  name: string;
  args: string;
  attrs: Map<string, string>;
  conts: string[];
}

const COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const SPLIT = /^(\S+)(?:\s+(.*))?$/;
const COLON = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^[A-Z][A-Z0-9-]*$/;
const INDENT = /^[ \t]*/;

function extract(piece: string): { body: string; a: Map<string, string> } {
  const a = new Map<string, string>();
  let s = piece;
  for (;;) {
    const m = ATTR.exec(s);
    if (m === null) break;
    const k = m[1] ?? '';
    const value = (m[2] ?? '').trim();
    const old = a.get(k);
    if (old !== undefined && old !== '') a.set(k, old + ' ' + value);
    else a.set(k, value);
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), a };
}

export default function legacy_print_sha(text: string): string {
  const dirs: Directive[] = [];
  let cur: Directive | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') continue;
    const indMatch = INDENT.exec(line);
    const indent = indMatch === null ? '' : indMatch[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const cm = COMMENT.exec(content);
    const code = cm !== null ? (cm[1] ?? '').replace(/\s+$/, '') : content;
    if (indent === '') {
      const sm = SPLIT.exec(code);
      let started = false;
      if (sm !== null) {
        let name = sm[1] ?? '';
        const tail = sm[2] ?? '';
        if (COLON.test(name)) name = name.slice(0, -1);
        if (NAME.test(name)) {
          const { body, a } = extract(tail);
          cur = { name, args: body, attrs: a, conts: [] };
          dirs.push(cur);
          started = true;
        }
      }
      if (!started && cur !== null) cur.conts.push(code);
    } else {
      if (cur === null) continue;
      const { body, a } = extract(code);
      cur.conts.push(body);
      for (const [k, v] of a) cur.attrs.set(k, v);
    }
  }
  let p = '';
  for (const d of dirs) {
    let l = d.name;
    if (d.args !== '') l += ' ' + d.args;
    for (const [k, v] of d.attrs) l += ' ' + k + ' ' + v;
    p += l + '\n';
    for (const c of d.conts) p += '  ' + c + '\n';
  }
  if (dirs.length === 0) p = '\n';
  return createHash('sha256').update(p).digest('hex');
}
