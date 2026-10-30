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

function extract(piece: string): { body: string; attrs: Map<string, string> } {
  const attrs = new Map<string, string>();
  let s = piece;
  for (;;) {
    const m = ATTR.exec(s);
    if (m === null) break;
    const key = m[1] ?? '';
    const value = (m[2] ?? '').trim();
    const old = attrs.get(key);
    if (old !== undefined && old !== '') attrs.set(key, old + ' ' + value);
    else attrs.set(key, value);
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), attrs };
}

export default function legacy_print_sha(text: string): string {
  const dirs: Directive[] = [];
  let current: Directive | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (/^\s*$/.test(line)) continue;
    const indent = (INDENT.exec(line) ?? [''])[0] ?? '';
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const cm = COMMENT.exec(content);
    const code = cm !== null ? (cm[1] ?? '').replace(/\s+$/, '') : content;
    if (indent.length === 0) {
      const sm = SPLIT.exec(code);
      if (sm !== null) {
        let name = sm[1] ?? '';
        const tail = sm[2] ?? '';
        if (COLON.test(name)) name = name.slice(0, -1);
        if (NAME.test(name)) {
          const r = extract(tail);
          const d: Directive = { name, args: r.body, attrs: r.attrs, conts: [] };
          dirs.push(d);
          current = d;
          continue;
        }
      }
      if (current !== null) current.conts.push(code);
    } else {
      if (current === null) continue;
      const r = extract(code);
      current.conts.push(r.body);
      for (const [k, v] of r.attrs) current.attrs.set(k, v);
    }
  }
  let p = '';
  if (dirs.length === 0) p = '\n';
  for (const d of dirs) {
    let l = d.name;
    if (d.args !== '') l += ' ' + d.args;
    for (const [k, v] of d.attrs) l += ' ' + k + ' ' + v;
    p += l + '\n';
    for (const c of d.conts) p += '  ' + c + '\n';
  }
  return createHash('sha256').update(p).digest('hex');
}
