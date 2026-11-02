import { createHash } from 'node:crypto';

const SPLIT = /\r\n|\r|\n/;
const LEAD = new RegExp('^[ \\t\\uFEFF]+');
const FEFF = new RegExp('\\uFEFF', 'g');
const ARGUMENT = /^[0-9a-f]{64}$/;
const TRAILING = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/;
const HEAD = /^(\S+)(?:\s+(.*))?$/;
const NAME_COLON = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /\s+(CITED|EARNED|ANCHOR)\s+(.+)$/;
const BAD_SURR = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

const sha = (s) => createHash('sha256').update(s).digest('hex');

function cleanLines(text) {
  return text.split(SPLIT).map((l) => l.replace(LEAD, (r) => r.replace(FEFF, '')).replace(/[ \t]+$/, ''));
}

function classify(line) {
  if (line === '') return 'blank';
  if (line.replace(/^[ \t]+/, '').startsWith('#')) return 'comment';
  if (line[0] === ' ' || line[0] === '\t') return 'cont';
  const m = /[ \t]/.exec(line);
  let name = m ? line.slice(0, m.index) : line;
  if (name.endsWith(':') && DIRECTIVE.test(name.slice(0, -1)) && name.slice(0, -1) !== 'CITED') name = name.slice(0, -1);
  return DIRECTIVE.test(name) && name !== 'CITED' ? 'directive' : 'cont';
}

function directiveParts(line) {
  const m = /[ \t]/.exec(line);
  let name = m ? line.slice(0, m.index) : line;
  const rest = m ? line.slice(m.index) : '';
  if (name.endsWith(':')) name = name.slice(0, -1);
  return [name, rest];
}

function boundOf(langText) {
  const lines = cleanLines(langText);
  const kinds = lines.map(classify);
  let d = -1;
  for (let i = 0; i < lines.length; i++) {
    if (kinds[i] === 'directive' && directiveParts(lines[i])[0] === 'PRIMARY-SHA256') { d = i; break; }
  }
  if (d < 0) return null;
  let rest = directiveParts(lines[d])[1];
  for (let k = 1; k < rest.length; k++) {
    if ((rest[k - 1] === ' ' || rest[k - 1] === '\t') && rest[k] === '#' && (k + 1 >= rest.length || rest[k + 1] === ' ' || rest[k + 1] === '\t')) {
      rest = rest.slice(0, k);
      break;
    }
  }
  const arg = rest.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
  if (!ARGUMENT.test(arg)) return null;
  for (let i = d + 1; i < lines.length; i++) {
    if (kinds[i] === 'directive') break;
    if (kinds[i] !== 'blank' && kinds[i] !== 'comment') return null;
  }
  return arg;
}

function canonical(text) {
  const out = [];
  for (let l of cleanLines(text)) {
    if (l === '') continue;
    l = l.replace(/^[ \t]+/, '  ');
    out.push(l);
  }
  return out.length ? out.join('\n') + '\n' : '';
}

function attrs(s) {
  const local = new Map();
  for (;;) {
    const m = ATTR.exec(s);
    if (!m) break;
    const k = m[1];
    const v = m[2].replace(/^\s+|\s+$/g, '');
    if (local.has(k)) {
      const prev = local.get(k);
      local.set(k, prev === '' ? v : prev + ' ' + v);
    } else local.set(k, v);
    s = s.slice(0, m.index);
  }
  return [s.replace(/^\s+|\s+$/g, ''), local];
}

function codeOf(content) {
  const m = TRAILING.exec(content);
  return m ? m[1].replace(/\s+$/, '') : content;
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
    const code = codeOf(content);
    if (indent === '') {
      let directive = false;
      let name = '';
      let rest = '';
      if (code !== '' && !/^\s/.test(code)) {
        const m = HEAD.exec(code);
        if (m) {
          name = m[1];
          rest = m[2] || '';
          if (NAME_COLON.test(name)) name = name.slice(0, -1);
          directive = DIRECTIVE.test(name);
        }
      }
      if (directive) {
        const [body, at] = attrs(rest);
        cur = { name, args: body, attrs: at, conts: [] };
        entries.push(cur);
      } else if (cur) cur.conts.push(code);
    } else if (cur) {
      const [body, at] = attrs(code);
      for (const [k, v] of at) cur.attrs.set(k, v);
      cur.conts.push(body);
    }
  }
  if (!entries.length) return '\n';
  const lines = [];
  for (const e of entries) {
    let l = e.name;
    if (e.args !== '') l += ' ' + e.args;
    for (const [k, v] of e.attrs) l += ' ' + k + ' ' + v;
    lines.push(l);
    for (const c of e.conts) lines.push('  ' + c);
  }
  return lines.join('\n') + '\n';
}

function wellFormed(s) {
  return typeof s.isWellFormed === 'function' ? s.isWellFormed() : !BAD_SURR.test(s);
}

export function bindingOf(langText, primaryText) {
  const bound = boundOf(langText);
  if (primaryText === null || primaryText === undefined) return { status: 'no-primary', bound, primarySha: null };
  const primarySha = wellFormed(primaryText) ? sha(canonical(primaryText)) : null;
  if (bound === null) return { status: 'unbound', bound, primarySha };
  if (bound === primarySha) return { status: 'ok', bound, primarySha };
  if (primarySha !== null && bound === sha(legacyPrint(primaryText))) return { status: 'legacy', bound, primarySha };
  return { status: 'stale', bound, primarySha };
}
