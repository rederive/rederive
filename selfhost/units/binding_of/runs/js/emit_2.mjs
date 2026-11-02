import { createHash } from 'node:crypto';

const FEFF = String.fromCharCode(0xfeff);
const LEAD = new RegExp('^[ \\t' + FEFF + ']*');
const ARGUMENT = /^[0-9a-f]{64}$/;
const SPLIT = /\r\n|\r|\n/;
const TRAILING_COMMENT = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const HEAD = /^(\S+)(?:\s+(.*))?$/;
const NAME_COLON = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;

function sha(s) {
  return createHash('sha256').update(s).digest('hex');
}

function cleanLine(l) {
  const lead = l.match(LEAD)[0];
  const rest = l.slice(lead.length);
  const lead2 = lead.split(FEFF).join('');
  return { lead: lead2, text: (lead2 + rest).replace(/[ \t]+$/, '') };
}

function canonical(text) {
  const out = [];
  for (const raw of text.split(SPLIT)) {
    const { lead, text: t } = cleanLine(raw);
    if (t === '') continue;
    if (lead.length > 0) out.push('  ' + t.slice(lead.length));
    else out.push(t);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

function isDirectiveLine(line) {
  let name = line.split(/[ \t]/)[0];
  if (name.endsWith(':')) {
    const pre = name.slice(0, -1);
    if (DIRECTIVE.test(pre) && pre !== 'CITED') name = pre;
  }
  return DIRECTIVE.test(name) && name !== 'CITED' ? name : null;
}

function readBound(langText) {
  const lines = langText.split(SPLIT).map((l) => cleanLine(l).text);
  const kinds = lines.map((line) => {
    if (line === '') return { k: 'blank' };
    if (line.replace(/^[ \t]+/, '').startsWith('#')) return { k: 'comment' };
    if (line[0] === ' ' || line[0] === '\t') return { k: 'cont' };
    const n = isDirectiveLine(line);
    if (n !== null) return { k: 'dir', name: n };
    return { k: 'cont' };
  });
  let d = -1;
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i].k === 'dir' && kinds[i].name === 'PRIMARY-SHA256') { d = i; break; }
  }
  if (d < 0) return null;
  const line = lines[d];
  const m = line.search(/[ \t]/);
  let rest = m < 0 ? '' : line.slice(m);
  for (let k = 1; k < rest.length; k++) {
    if (rest[k] === '#' && (rest[k - 1] === ' ' || rest[k - 1] === '\t') &&
        (k + 1 === rest.length || rest[k + 1] === ' ' || rest[k + 1] === '\t')) {
      rest = rest.slice(0, k);
      break;
    }
  }
  const arg = rest.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
  if (!ARGUMENT.test(arg)) return null;
  for (let i = d + 1; i < lines.length; i++) {
    if (kinds[i].k === 'dir') break;
    if (kinds[i].k === 'cont') return null;
  }
  return arg;
}

function attrs(s) {
  const map = new Map();
  for (;;) {
    const m = ATTR.exec(s);
    if (!m) break;
    const kw = m[1];
    const val = m[2].trim();
    if (map.has(kw) && map.get(kw) !== '') map.set(kw, map.get(kw) + ' ' + val);
    else map.set(kw, val);
    s = s.slice(0, m.index);
  }
  return { body: s.trim(), map };
}

function legacySha(text) {
  const entries = [];
  let cur = null;
  for (let piece of text.split('\n')) {
    piece = piece.replace(/\r$/, '');
    if (/^\s*$/.test(piece)) continue;
    const indent = piece.match(/^[ \t]*/)[0];
    const content = piece.slice(indent.length);
    if (content.startsWith('#')) continue;
    const tc = TRAILING_COMMENT.exec(content);
    const code = tc ? tc[1].replace(/\s+$/, '') : content;
    if (indent === '') {
      let dir = null;
      if (code !== '') {
        const h = HEAD.exec(code);
        if (h && !/^\s/.test(code)) {
          let name = h[1];
          if (NAME_COLON.test(name)) name = name.slice(0, -1);
          if (DIRECTIVE.test(name)) dir = { name, rest: h[2] === undefined ? '' : h[2] };
        }
      }
      if (dir) {
        const a = attrs(dir.rest);
        cur = { name: dir.name, args: a.body, attrs: a.map, conts: [] };
        entries.push(cur);
      } else if (cur) {
        cur.conts.push(code);
      }
    } else if (cur) {
      const a = attrs(code);
      for (const [k, v] of a.map) cur.attrs.set(k, v);
      cur.conts.push(a.body);
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
  return sha(out.length ? out.join('\n') + '\n' : '\n');
}

export function bindingOf(langText, primaryText) {
  const bound = readBound(langText);
  if (primaryText === null || primaryText === undefined) {
    return { status: 'no-primary', bound, primarySha: null };
  }
  const primarySha = primaryText.isWellFormed() ? sha(canonical(primaryText)) : null;
  let status;
  if (bound === null) status = 'unbound';
  else if (bound === primarySha) status = 'ok';
  else if (primarySha !== null && bound === legacySha(primaryText)) status = 'legacy';
  else status = 'stale';
  return { status, bound, primarySha };
}
