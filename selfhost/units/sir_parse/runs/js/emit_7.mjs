const OPENER = ' \t([{,=:;|<>!&-~';
const GLUE_CLS = '\\u000A-\\u000D\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}';
const GLUED = new RegExp('^(?:[A-Z][A-Z0-9-]*|R\\d+):?(?=[' + GLUE_CLS + '])', 'u');
const INVIS = new RegExp('^[' + GLUE_CLS + ']+(?=(?:[A-Z][A-Z0-9-]*|R\\d+)(?:[ \\t:' + GLUE_CLS + ']|$)|#)', 'u');
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIR_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const COMMENT_STRIP = /^#+[ \t]?/;

const REG = new Map();
const addReg = (r, k, names) => { for (const n of names.split(' ')) REG.set(n, [r, k]); };
addReg('B', 'lb', 'UNIT SIG ENVELOPE DEPENDS-ON PINNED EARNED CARRIED');
addReg('B', 'pr', 'DESCRIPTION NOTE RATIONALE PROVENANCE');
addReg('P', 'lb', 'KIND FIDELITY ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR TABLE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE');
addReg('P', 'pr', 'INVARIANT SCOPE');
addReg('P', 'legacy', 'SIR VARIANT CARRIED-DATA NOTES GUARD-PINNED');
addReg('L', 'lb', 'LANG PRIMARY-SHA256 ABI MECHANISM');

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const isSp = (c) => c === ' ' || c === '\t';
const cut40 = (s) => Array.from(s).slice(0, 40).join('');
const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

function spans(s) {
  const out = [];
  let lastEnd = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENER.includes(s[i - 1]) || i === lastEnd)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += cp !== undefined && cp > 0xffff ? 3 : 2;
        } else if (c === '"') { close = j; break; } else j++;
      }
      if (close >= 0) { out.push([i, close]); lastEnd = close + 1; i = close + 1; continue; }
    }
    i++;
  }
  return out;
}

const inside = (sp, k) => sp.some(([a, b]) => a < k && k < b);

function attrs(T) {
  const sp = spans(T);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const kept = [];
  let m;
  while ((m = re.exec(T)) !== null) {
    const kwIdx = m.index + m[0].length - m[1].length;
    if (!inside(sp, kwIdx)) kept.push({ idx: m.index, end: m.index + m[0].length, kw: m[1] });
  }
  if (!kept.length) return [trim(T), []];
  const list = kept.map((g, n) => [g.kw, trim(T.slice(g.end, n + 1 < kept.length ? kept[n + 1].idx : T.length))]);
  return [trim(T.slice(0, kept[0].idx)), list];
}

function store(node, kv) {
  node.attrList.push(kv);
  const k = kv[0];
  node.attrs[k] = node.attrList.filter((a) => a[0] === k && a[1] !== '').map((a) => a[1]).join('; ');
}

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  const lines = text.split(/\r\n|\r|\n/).map((l) =>
    l.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, '')).replace(/[ \t]+$/, ''));
  let cur = null;
  const cont = (code, comment) => {
    const [body, list] = attrs(' ' + code);
    for (const kv of list) store(cur, kv);
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
      if (cur) cur.comments.push(content.replace(COMMENT_STRIP, ''));
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: ln, register: null, kind: 'comment' });
      continue;
    }
    let code = content, comment;
    const sp = spans(content);
    for (let k = 1; k < content.length; k++) {
      if (content[k] === '#' && isSp(content[k - 1]) && (k + 1 === content.length || isSp(content[k + 1])) && !inside(sp, k)) {
        code = content.slice(0, k).replace(/[ \t]+$/, '');
        comment = trim(content.slice(k + 1));
        warnings.push({ code: 'W_LEGACY_TRAILING_COMMENT', line: ln });
        break;
      }
    }
    if (indent !== '') {
      if (!cur) errors.push({ code: 'E_ORPHAN_CONTINUATION', line: ln, msg: cut40(code) });
      else cont(code, comment);
      continue;
    }
    let sepIdx = code.search(/[ \t]/);
    let name = sepIdx < 0 ? code : code.slice(0, sepIdx);
    const rest = code.slice(name.length);
    if (COLON_NAME.test(name) && name.slice(0, -1) !== 'CITED') {
      name = name.slice(0, -1);
      warnings.push({ code: 'W_LEGACY_COLON', line: ln, msg: name });
    }
    if (DIR_NAME.test(name) && name !== 'CITED') {
      let reg = REG.get(name);
      if (!reg && /^R\d+$/.test(name)) reg = ['P', 'lb'];
      if (!reg) warnings.push({ code: 'W_UNKNOWN_DIRECTIVE', line: ln, msg: name });
      const [body, list] = attrs(rest);
      const node = { directive: name, name, args: body, attrs: {}, attrList: [], cont: [], comments: comment !== undefined ? [comment] : [], line: ln, register: reg ? reg[0] : null, kind: reg ? reg[1] : 'unknown' };
      for (const kv of list) store(node, kv);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = GLUED.exec(code);
    if (g) {
      const G = g[0].endsWith(':') ? g[0].slice(0, -1) : g[0];
      const c = code.codePointAt(g[0].length);
      warnings.push({ code: 'W_NAME_SEPARATOR', line: ln, msg: G + ' is followed by ' + hex(c) + ', not a space or tab: not ' + (G === 'CITED' ? 'an attribute' : 'a directive') });
    } else {
      const m = INVIS.exec(code);
      if (m) {
        const after = code.slice(m[0].length);
        let tail;
        if (after[0] === '#') tail = 'a comment marker: not a comment';
        else {
          const w = /^[A-Z0-9-]+/.exec(after)[0];
          tail = 'a directive-shaped name: not ' + (w === 'CITED' ? 'an attribute' : 'a directive');
        }
        warnings.push({ code: 'W_NAME_SEPARATOR', line: ln, msg: 'the line starts with ' + hex(code.codePointAt(0)) + ' (whitespace or an invisible character) before ' + tail });
      }
    }
    if (cur) {
      cont(code, comment);
      warnings.push({ code: 'W_UNINDENTED_CONTINUATION', line: ln });
    } else errors.push({ code: 'E_NO_DIRECTIVE', line: ln, msg: cut40(code) });
  }
  return { ast, errors, warnings };
}
