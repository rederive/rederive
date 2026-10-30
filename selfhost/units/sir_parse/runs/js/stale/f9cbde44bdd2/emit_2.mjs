const MARKER = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const COMMENT_STRIP = /^#+\s?/;

const REG = new Map();
const add = (reg, kind, names) => { for (const n of names) REG.set(n, [reg, kind]); };
add('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
add('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
add('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT',
  'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
add('P', 'pr', ['INVARIANT', 'SCOPE']);
add('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
add('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

function attrs(t) {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms = [];
  let m;
  while ((m = re.exec(t)) !== null) ms.push(m);
  if (ms.length === 0) return [t.trim(), []];
  const body = t.slice(0, ms[0].index).trim();
  const list = ms.map((g, i) => {
    const end = g.index + g[0].length;
    const next = i + 1 < ms.length ? ms[i + 1].index : t.length;
    return [g[1], t.slice(end, next).trim()];
  });
  return [body, list];
}

function store(map, list) {
  for (const [k, v] of list) {
    if (Object.hasOwn(map, k)) map[k] = map[k] + '; ' + v;
    else map[k] = v;
  }
}

const cut40 = (s) => Array.from(s).slice(0, 40).join('');

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, '').replace(/[ \t]+$/, ''));
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) {
      warnings.push({ code: 'W_LEGACY_COMMENT', line: ln });
      if (cur) cur.comments.push(content.replace(COMMENT_STRIP, ''));
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, cont: [], comments: [content], line: ln, register: null, kind: 'comment' });
      continue;
    }
    let code = content, comment;
    const mk = MARKER.exec(content);
    if (mk) {
      code = mk[1].trimEnd();
      comment = mk[2].trim();
      warnings.push({ code: 'W_LEGACY_TRAILING_COMMENT', line: ln });
    }
    if (indent !== '') {
      if (!cur) { errors.push({ code: 'E_ORPHAN_CONTINUATION', line: ln, msg: cut40(code) }); continue; }
      const [body, list] = attrs(' ' + code);
      cur.cont.push(body);
      store(cur.attrs, list);
      if (comment !== undefined) cur.comments.push(comment);
      continue;
    }
    const sp = code.search(/[ \t]/);
    let name = sp === -1 ? code : code.slice(0, sp);
    const rest = sp === -1 ? '' : code.slice(sp + 1).replace(/^[ \t]+/, '');
    if (COLON_NAME.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ code: 'W_LEGACY_COLON', line: ln, msg: name });
    }
    if (DIRECTIVE_NAME.test(name)) {
      let reg = null, kind = 'unknown';
      const e = REG.get(name);
      if (e) { reg = e[0]; kind = e[1]; }
      else if (/^R\d+$/.test(name)) { reg = 'P'; kind = 'lb'; }
      else warnings.push({ code: 'W_UNKNOWN_DIRECTIVE', line: ln, msg: name });
      const [body, list] = attrs(rest);
      const a = {};
      store(a, list);
      const node = { directive: name, name, args: body, attrs: a, cont: [], comments: comment !== undefined ? [comment] : [], line: ln, register: reg, kind };
      ast.push(node);
      cur = node;
    } else if (cur) {
      const [body, list] = attrs(' ' + code);
      cur.cont.push(body);
      store(cur.attrs, list);
      if (comment !== undefined) cur.comments.push(comment);
      warnings.push({ code: 'W_UNINDENTED_CONTINUATION', line: ln });
    } else {
      errors.push({ code: 'E_NO_DIRECTIVE', line: ln, msg: cut40(code) });
    }
  }
  return { ast, errors, warnings };
}
