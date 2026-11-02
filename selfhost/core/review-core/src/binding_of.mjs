import { createHash } from 'node:crypto';

const ARGUMENT = /^[0-9a-f]{64}$/;
const SPLIT_LINES = /\r\n|\r|\n/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const HEAD = /^(\S+)(?:\s+(.*))?$/;
const NAME_COLON = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const LEAD_RUN = new RegExp("^[ \\t\\uFEFF]*");
const FEFF_ALL = new RegExp("\\uFEFF", "g");

const sha = (s) => createHash('sha256').update(s).digest('hex');

function wellFormed(s) {
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

function cleanLine(line) {
  const lead = LEAD_RUN.exec(line)[0];
  const rest = line.slice(lead.length);
  return (lead.replace(FEFF_ALL, '') + rest).replace(/[ \t]+$/, '');
}

function canonical(text) {
  const kept = [];
  for (const raw of text.split(SPLIT_LINES)) {
    let l = cleanLine(raw);
    if (l === '') continue;
    const m = /^[ \t]+/.exec(l);
    if (m) l = '  ' + l.slice(m[0].length);
    kept.push(l);
  }
  return kept.length ? kept.join('\n') + '\n' : '';
}

function directiveName(line) {
  const i = line.search(/[ \t]/);
  let name = i < 0 ? line : line.slice(0, i);
  if (NAME_COLON.test(name)) {
    const b = name.slice(0, -1);
    if (b !== 'CITED') name = b;
  }
  return { name, end: i < 0 ? line.length : i };
}

function classify(line) {
  if (line === '') return { kind: 'blank' };
  if (line.replace(/^[ \t]+/, '').startsWith('#')) return { kind: 'comment' };
  if (line[0] === ' ' || line[0] === '\t') return { kind: 'cont' };
  const { name, end } = directiveName(line);
  if (name !== 'CITED' && DIRECTIVE.test(name)) return { kind: 'dir', name, end };
  return { kind: 'cont' };
}

function readBound(langText) {
  const lines = langText.split(SPLIT_LINES).map(cleanLine);
  const cls = lines.map(classify);
  let d = -1;
  for (let i = 0; i < lines.length; i++) {
    if (cls[i].kind === 'dir' && cls[i].name === 'PRIMARY-SHA256') { d = i; break; }
  }
  if (d < 0) return null;
  let arg = lines[d].slice(cls[d].end);
  const cm = /[ \t]#(?=[ \t]|$)/.exec(arg);
  if (cm) arg = arg.slice(0, cm.index);
  arg = arg.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
  if (!ARGUMENT.test(arg)) return null;
  for (let i = d + 1; i < lines.length; i++) {
    if (cls[i].kind === 'dir') break;
    if (lines[i] === '') continue;
    if (cls[i].kind !== 'comment') return null;
  }
  return arg;
}

function addAttr(map, k, v) {
  if (map.has(k)) {
    const old = map.get(k);
    map.set(k, old === '' ? v : old + ' ' + v);
  } else map.set(k, v);
}

function attributes(s) {
  const attrs = new Map();
  for (;;) {
    const m = ATTR.exec(s);
    if (!m) break;
    addAttr(attrs, m[1], m[2].trim());
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), attrs };
}

function legacyPrint(text) {
  const entries = [];
  let cur = null;
  for (let piece of text.split('\n')) {
    piece = piece.replace(/\r$/, '');
    if (/^\s*$/.test(piece)) continue;
    const indent = /^[ \t]*/.exec(piece)[0];
    const content = piece.slice(indent.length);
    if (content.startsWith('#')) continue;
    const tm = TRAILING_COMMENT.exec(content);
    const code = tm ? tm[1].replace(/\s+$/, '') : content;
    if (indent === '') {
      let head = null;
      if (code !== '' && !/^\s/.test(code)) {
        const hm = HEAD.exec(code);
        if (hm) {
          let name = hm[1];
          if (NAME_COLON.test(name)) name = name.slice(0, -1);
          if (DIRECTIVE.test(name)) head = { name, rest: hm[2] === undefined ? '' : hm[2] };
        }
      }
      if (head) {
        const { body, attrs } = attributes(head.rest);
        cur = { name: head.name, args: body, attrs, conts: [] };
        entries.push(cur);
      } else if (cur) cur.conts.push(code);
    } else if (cur) {
      const { body, attrs } = attributes(code);
      for (const [k, v] of attrs) cur.attrs.set(k, v);
      cur.conts.push(body);
    }
  }
  const out = [];
  for (const e of entries) {
    let l = e.name;
    if (e.args !== '') l += ' ' + e.args;
    for (const [k, v] of e.attrs) l += ' ' + k + ' ' + v;
    out.push(l);
    for (const c of e.conts) out.push('  ' + c);
  }
  return out.length ? out.join('\n') + '\n' : '\n';
}

export function bindingOf(langText, primaryText) {
  const bound = readBound(langText);
  const isNone = primaryText === null || primaryText === undefined;
  let primarySha = null;
  if (!isNone && wellFormed(primaryText)) primarySha = sha(canonical(primaryText));
  let status;
  if (isNone) status = 'no-primary';
  else if (bound === null) status = 'unbound';
  else if (bound === primarySha) status = 'ok';
  else if (primarySha !== null && bound === sha(legacyPrint(primaryText))) status = 'legacy';
  else status = 'stale';
  return { status, bound, primarySha };
}
