import { createHash } from 'node:crypto';

const COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const SPLIT = /^(\S+)(?:\s+(.*))?$/;
const COLON = /^[A-Z][A-Z0-9-]*:$/;
const NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const INDENT = /^[ \t]*/;

// R8 attribute extraction.
function extract(piece) {
  let s = piece;
  const a = {};
  for (;;) {
    const m = ATTR.exec(s);
    if (!m) break;
    const value = m[2].trim();
    const k = m[1];
    if (a[k]) a[k] = a[k] + ' ' + value;
    else a[k] = value;
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), attrs: a };
}

export default function legacy_print_sha(text) {
  const dirs = [];
  let cur = null;
  for (let line of text.split('\n')) {
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line.trim() === '') continue;
    const indent = INDENT.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    let code = content;
    const cm = COMMENT.exec(content);
    if (cm) code = cm[1].replace(/\s+$/, '');
    if (indent === '') {
      let started = false;
      const sm = SPLIT.exec(code);
      if (sm) {
        let name = sm[1];
        const tail = sm[2] === undefined ? '' : sm[2];
        if (COLON.test(name)) name = name.slice(0, -1);
        if (/^[A-Z][A-Z0-9-]*$/.test(name)) {
          const r = extract(tail);
          cur = { name, args: r.body, attrs: r.attrs, conts: [] };
          dirs.push(cur);
          started = true;
        }
      }
      if (!started && cur) cur.conts.push(code);
    } else {
      if (!cur) continue;
      const r = extract(code);
      cur.conts.push(r.body);
      Object.assign(cur.attrs, r.attrs);
    }
  }
  let p = '';
  for (const d of dirs) {
    let l = d.name;
    if (d.args !== '') l += ' ' + d.args;
    for (const k of Object.keys(d.attrs)) l += ' ' + k + ' ' + d.attrs[k];
    p += l + '\n';
    for (const c of d.conts) p += '  ' + c + '\n';
  }
  if (dirs.length === 0) p = '\n';
  return createHash('sha256').update(p).digest('hex');
}
