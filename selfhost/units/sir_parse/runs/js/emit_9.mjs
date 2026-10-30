const GL = String.raw`\u000A-\u000D\u0085   -     　­؀-؅؜۝܏࢐࢑࣢᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}`;
const GLUED = new RegExp(String.raw`^(?:[A-Z][A-Z0-9-]*|R\d+):?(?=[${GL}])`, 'u');
const INVIS = new RegExp(String.raw`^[${GL}]+(?=(?:[A-Z][A-Z0-9-]*|R\d+)(?:[ \t:${GL}]|$)|#)`, 'u');
const LINE_SPLIT = /\r\n|\r|\n/;
const OPENER_PREV = ' \t([{,=:;|<>!&-~';
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;

const REG = new Map();
for (const [r, k, names] of [
  ['B', 'lb', 'UNIT SIG ENVELOPE DEPENDS-ON PINNED EARNED CARRIED'],
  ['B', 'pr', 'DESCRIPTION NOTE RATIONALE PROVENANCE'],
  ['P', 'lb', 'KIND FIDELITY ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR TABLE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE'],
  ['P', 'pr', 'INVARIANT SCOPE'],
  ['P', 'legacy', 'SIR VARIANT CARRIED-DATA NOTES GUARD-PINNED'],
  ['L', 'lb', 'LANG PRIMARY-SHA256 ABI MECHANISM'],
]) for (const n of names.split(' ')) REG.set(n, [r, k]);

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const cut40 = (s) => Array.from(s).slice(0, 40).join('');
const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

function spans(s) {
  const out = [];
  let last = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENER_PREV.includes(s[i - 1]) || i === last + 1)) {
      let j = i + 1;
      let closed = false;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') j += s.codePointAt(j + 1) > 0xffff ? 3 : 2;
        else if (c === '"') { closed = true; break; }
        else j++;
      }
      if (closed) {
        out.push([i, j]);
        last = j;
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

function attrs(t) {
  const sp = spans(t);
  const kept = [];
  for (const m of t.matchAll(ATTR)) {
    const ki = m.index + m[0].length - m[1].length;
    if (sp.some(([o, c]) => o < ki && ki < c)) continue;
    kept.push({ kw: m[1], idx: m.index, end: m.index + m[0].length });
  }
  if (!kept.length) return [trim(t), []];
  const list = kept.map((g, n) => [g.kw, trim(t.slice(g.end, n + 1 < kept.length ? kept[n + 1].idx : t.length))]);
  return [trim(t.slice(0, kept[0].idx)), list];
}

function store(node, list) {
  for (const [k, v] of list) {
    node.attrList.push([k, v]);
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  let cur = null;
  const lines = text.split(LINE_SPLIT).map((l) =>
    l.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, '')).replace(/[ \t]+$/, ''));
  const cont = (code, comment) => {
    const [body, list] = attrs(' ' + code);
    store(cur, list);
    if (body !== '') cur.cont.push(body);
    if (comment !== undefined) cur.comments.push(comment);
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const ln = n + 1;
    if (line === '') continue;
    const indent = line.match(/^[ \t]*/)[0];
    const content = line.slice(indent.length);
    if (content[0] === '#') {
      warnings.push({ code: 'W_LEGACY_COMMENT', line: ln });
      if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, ''));
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: ln, register: null, kind: 'comment' });
      continue;
    }
    let code = content, comment;
    {
      const sp = spans(content);
      for (let i = 1; i < content.length; i++) {
        if (content[i] !== '#') continue;
        const p = content[i - 1];
        if (p !== ' ' && p !== '\t') continue;
        if (i + 1 < content.length && content[i + 1] !== ' ' && content[i + 1] !== '\t') continue;
        if (sp.some(([o, c]) => o < i && i < c)) continue;
        code = content.slice(0, i).replace(/[ \t]+$/, '');
        comment = trim(content.slice(i + 1));
        warnings.push({ code: 'W_LEGACY_TRAILING_COMMENT', line: ln });
        break;
      }
    }
    if (indent !== '') {
      if (!cur) errors.push({ code: 'E_ORPHAN_CONTINUATION', line: ln, msg: cut40(code) });
      else cont(code, comment);
      continue;
    }
    const sepAt = code.search(/[ \t]/);
    let name = sepAt < 0 ? code : code.slice(0, sepAt);
    const rest = sepAt < 0 ? '' : code.slice(sepAt);
    if (COLON_NAME.test(name) && name.slice(0, -1) !== 'CITED') {
      name = name.slice(0, -1);
      warnings.push({ code: 'W_LEGACY_COLON', line: ln, msg: name });
    }
    if (DIRECTIVE_NAME.test(name) && name !== 'CITED') {
      let reg = REG.get(name);
      if (!reg && /^R\d+$/.test(name)) reg = ['P', 'lb'];
      if (!reg) warnings.push({ code: 'W_UNKNOWN_DIRECTIVE', line: ln, msg: name });
      const [body, list] = attrs(rest);
      const node = { directive: name, name, args: body, attrs: {}, attrList: [], cont: [], comments: comment !== undefined ? [comment] : [], line: ln, register: reg ? reg[0] : null, kind: reg ? reg[1] : 'unknown' };
      store(node, list);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = GLUED.exec(name);
    if (g) {
      const G = g[0].endsWith(':') ? g[0].slice(0, -1) : g[0];
      const C = name.codePointAt(g[0].length);
      warnings.push({ code: 'W_NAME_SEPARATOR', line: ln, msg: G + ' is followed by ' + hex(C) + ', not a space or tab: not ' + (G === 'CITED' ? 'an attribute' : 'a directive') });
    } else {
      const m = INVIS.exec(code);
      if (m) {
        const tail = code.slice(m[0].length);
        let msg = 'the line starts with ' + hex(code.codePointAt(0)) + ' (whitespace or an invisible character) before ';
        if (tail[0] === '#') msg += 'a comment marker: not a comment';
        else {
          const w = /^[A-Z0-9-]+/.exec(tail);
          msg += 'a directive-shaped name: not ' + (w && w[0] === 'CITED' ? 'an attribute' : 'a directive');
        }
        warnings.push({ code: 'W_NAME_SEPARATOR', line: ln, msg });
      }
    }
    if (cur) {
      cont(code, comment);
      warnings.push({ code: 'W_UNINDENTED_CONTINUATION', line: ln });
    } else errors.push({ code: 'E_NO_DIRECTIVE', line: ln, msg: cut40(code) });
  }
  return { ast, errors, warnings };
}
