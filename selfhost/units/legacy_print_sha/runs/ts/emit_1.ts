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
  let s = piece;
  const a = new Map<string, string>();
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
    if (/^\s*$/.test(line)) continue;
    const indent = (INDENT.exec(line) ?? [''])[0] ?? '';
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const cm = COMMENT.exec(content);
    const code = cm !== null ? (cm[1] ?? '').replace(/\s+$/, '') : content;
    if (indent.length === 0) {
      const sm = SPLIT.exec(code);
      let started = false;
      if (sm !== null) {
        let name = sm[1] ?? '';
        const tail = sm[2] ?? '';
        if (COLON.test(name)) name = name.slice(0, -1);
        if (NAME.test(name)) {
          const r = extract(tail);
          const d: Directive = { name, args: r.body, attrs: r.a, conts: [] };
          dirs.push(d);
          cur = d;
          started = true;
        }
      }
      if (!started && cur !== null) cur.conts.push(code);
    } else {
      if (cur === null) continue;
      const r = extract(code);
      cur.conts.push(r.body);
      for (const [k, v] of r.a) cur.attrs.set(k, v);
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
