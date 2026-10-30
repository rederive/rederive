const GL = '\\u000A-\\u000D\\u0085\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\u00AD\\u0600-\\u0605\\u061C\\u06DD\\u070F\\u0890\\u0891\\u08E2\\u180E\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB\\u{110BD}\\u{110CD}\\u{13430}-\\u{1343F}\\u{1BCA0}-\\u{1BCA3}\\u{1D173}-\\u{1D17A}\\u{E0001}\\u{E0020}-\\u{E007F}';
const GLUED = new RegExp('^(?:[A-Z][A-Z0-9-]*|R\\d+):?(?=[' + GL + '])', 'u');
const INVIS = new RegExp('^[' + GL + ']+(?=(?:[A-Z][A-Z0-9-]*|R\\d+)(?:[ \\t:' + GL + ']|$)|#)', 'u');
const OPENER = ' \t([{,=:;|<>!&-~';

const REG = new Map();
const add = (r, k, names) => { for (const n of names.split(' ')) REG.set(n, [r, k]); };
add('B', 'lb', 'UNIT SIG ENVELOPE DEPENDS-ON PINNED EARNED CARRIED');
add('B', 'pr', 'DESCRIPTION NOTE RATIONALE PROVENANCE');
add('P', 'lb', 'KIND FIDELITY ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR TABLE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE');
add('P', 'pr', 'INVARIANT SCOPE');
add('P', 'legacy', 'SIR VARIANT CARRIED-DATA NOTES GUARD-PINNED');
add('L', 'lb', 'LANG PRIMARY-SHA256 ABI MECHANISM');

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const isSp = (c) => c === ' ' || c === '\t';
const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
const cut40 = (s) => Array.from(s).slice(0, 40).join('');

function spans(s) {
  const out = [];
  let lastClose = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENER.includes(s[i - 1]) || (lastClose >= 0 && i === lastClose + 1))) {
      let j = i + 1;
      let closed = false;
      while (j < s.length) {
        if (s[j] === '\\') {
          const cp = s.codePointAt(j + 1);
          j += cp !== undefined && cp > 0xffff ? 3 : 2;
        } else if (s[j] === '"') { closed = true; break; } else j++;
      }
      if (closed) { out.push([i, j]); lastClose = j; i = j + 1; continue; }
    }
    i++;
  }
  return out;
}
const inside = (sp, k) => sp.some(([a, b]) => a < k && k < b);

function attrs(T) {
  const sp = spans(T);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms = [];
  let m;
  while ((m = re.exec(T)) !== null) {
    if (m[0].length === 0) re.lastIndex++;
    const kwIdx = m.index + m[0].length - m[1].length;
    if (inside(sp, kwIdx)) continue;
    ms.push({ idx: m.index, end: m.index + m[0].length, kw: m[1] });
  }
  if (!ms.length) return [trim(T), []];
  const list = ms.map((g, n) => [g.kw, trim(T.slice(g.end, n + 1 < ms.length ? ms[n + 1].idx : T.length))]);
  return [trim(T.slice(0, ms[0].idx)), list];
}

function store(node, list) {
  for (const [k, v] of list) {
    node.attrList.push([k, v]);
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  const lines = text.split(/\r\n|\r|\n/).map((p) =>
    p.replace(/^[ \t﻿]+/, (m) => m.replace(/﻿/g, '')).replace(/[ \t]+$/, ''));
  let cur = null;
  const cont = (code, comment) => {
    const [body, list] = attrs(' ' + code);
    store(cur, list);
    if (body !== '') cur.cont.push(body);
    if (comment !== null) cur.comments.push(comment);
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const ln = n + 1;
    if (line === '') continue;
    const indent = line.match(/^[ \t]*/)[0];
    const content = line.slice(indent.length);
    if (content[0] === '#') {
      warnings.push({ code: 'W_LEGACY_COMMENT', line: ln });
      const c = content.replace(/^#+[ \t]?/, '');
      if (cur) cur.comments.push(c);
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: ln, register: null, kind: 'comment' });
      continue;
    }
    let code = content, comment = null;
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
    const rest = sepIdx < 0 ? '' : code.slice(sepIdx);
    if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== 'CITED') {
      name = name.slice(0, -1);
      warnings.push({ code: 'W_LEGACY_COLON', line: ln, msg: name });
    }
    if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED') {
      let reg = REG.get(name);
      if (!reg && /^R[0-9]+$/.test(name)) reg = ['P', 'lb'];
      if (!reg) warnings.push({ code: 'W_UNKNOWN_DIRECTIVE', line: ln, msg: name });
      const [body, list] = attrs(rest);
      const node = { directive: name, name, args: body, attrs: {}, attrList: [], cont: [], comments: comment !== null ? [comment] : [], line: ln, register: reg ? reg[0] : null, kind: reg ? reg[1] : 'unknown' };
      store(node, list);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = GLUED.exec(code);
    if (g) {
      const G = g[0].endsWith(':') ? g[0].slice(0, -1) : g[0];
      const cp = code.codePointAt(g[0].length);
      warnings.push({ code: 'W_NAME_SEPARATOR', line: ln, msg: G + ' is followed by ' + hex(cp) + ', not a space or tab: not ' + (G === 'CITED' ? 'an attribute' : 'a directive') });
    } else {
      const v = INVIS.exec(code);
      if (v) {
        const after = code.slice(v[0].length);
        let tail;
        if (after.startsWith('#')) tail = 'a comment marker: not a comment';
        else {
          const w = /^[A-Z0-9-]+/.exec(after);
          tail = 'a directive-shaped name: not ' + (w && w[0] === 'CITED' ? 'an attribute' : 'a directive');
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
