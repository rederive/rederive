const REG = new Map();
const add = (r, k, names) => { for (const n of names.split(' ')) REG.set(n, [r, k]); };
add('B', 'lb', 'UNIT SIG ENVELOPE DEPENDS-ON PINNED EARNED CARRIED');
add('B', 'pr', 'DESCRIPTION NOTE RATIONALE PROVENANCE');
add('P', 'lb', 'KIND FIDELITY ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR TABLE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE');
add('P', 'pr', 'INVARIANT SCOPE');
add('P', 'legacy', 'SIR VARIANT CARRIED-DATA NOTES GUARD-PINNED');
add('L', 'lb', 'LANG PRIMARY-SHA256 ABI MECHANISM');

const LINE_SPLIT = /\r\n|\r|\n/;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const COMMENT_STRIP = /^#+[ \t]?/;
const sp = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const cut40 = (s) => Array.from(s).slice(0, 40).join('');

function attrs(t) {
  const ms = [...t.matchAll(ATTR)];
  if (!ms.length) return [sp(t), []];
  const body = sp(t.slice(0, ms[0].index));
  const list = ms.map((m, i) => {
    const s = m.index + m[0].length;
    const e = i + 1 < ms.length ? ms[i + 1].index : t.length;
    return [m[1], sp(t.slice(s, e))];
  });
  return [body, list];
}

function store(node, k, v) {
  node.attrList.push([k, v]);
  node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
}

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  const lines = text.split(LINE_SPLIT).map((l) => l.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, ''));
  let cur = null;
  const cont = (code, comment) => {
    const [body, list] = attrs(' ' + code);
    for (const [k, v] of list) store(cur, k, v);
    if (body !== '') cur.cont.push(body);
    if (comment !== null) cur.comments.push(comment);
  };
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    const ln = n + 1;
    if (line === '') continue;
    const content = line.replace(/^[ \t]+/, '');
    const indent = line.length - content.length;
    if (content[0] === '#') {
      warnings.push({ code: 'W_LEGACY_COMMENT', line: ln });
      if (cur) cur.comments.push(content.replace(COMMENT_STRIP, ''));
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: ln, register: null, kind: 'comment' });
      continue;
    }
    const spans = [...content.matchAll(QUOTED)].map((m) => [m.index, m.index + m[0].length]);
    let marker = -1;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      if (i + 1 < content.length && content[i + 1] !== ' ' && content[i + 1] !== '\t') continue;
      if (spans.some(([a, e]) => a < i && i < e)) continue;
      marker = i;
      break;
    }
    let code = content, comment = null;
    if (marker >= 0) {
      code = content.slice(0, marker).replace(/[ \t]+$/, '');
      comment = sp(content.slice(marker + 1));
      warnings.push({ code: 'W_LEGACY_TRAILING_COMMENT', line: ln });
    }
    if (indent > 0) {
      if (!cur) errors.push({ code: 'E_ORPHAN_CONTINUATION', line: ln, msg: cut40(code) });
      else cont(code, comment);
      continue;
    }
    const m = /[ \t]/.exec(code);
    let name = m ? code.slice(0, m.index) : code;
    const rest = m ? code.slice(m.index) : '';
    if (COLON_NAME.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ code: 'W_LEGACY_COLON', line: ln, msg: name });
    }
    if (DIRECTIVE_NAME.test(name) && name !== 'CITED') {
      const r = REG.has(name) ? REG.get(name) : (/^R\d+$/.test(name) ? ['P', 'lb'] : null);
      if (!r) warnings.push({ code: 'W_UNKNOWN_DIRECTIVE', line: ln, msg: name });
      const node = { directive: name, name, args: '', attrs: {}, attrList: [], cont: [], comments: comment !== null ? [comment] : [], line: ln, register: r ? r[0] : null, kind: r ? r[1] : 'unknown' };
      const [body, list] = attrs(rest);
      node.args = body;
      for (const [k, v] of list) store(node, k, v);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = GLUED.exec(name);
    if (g) {
      const ch = name.slice(g[0].length);
      const cp = ch.codePointAt(0);
      warnings.push({ code: 'W_NAME_SEPARATOR', line: ln, msg: g[0] + ' is followed by U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ', not a space or tab: not a directive' });
    }
    if (cur) {
      cont(code, comment);
      warnings.push({ code: 'W_UNINDENTED_CONTINUATION', line: ln });
    } else {
      errors.push({ code: 'E_NO_DIRECTIVE', line: ln, msg: cut40(code) });
    }
  }
  return { ast, errors, warnings };
}
