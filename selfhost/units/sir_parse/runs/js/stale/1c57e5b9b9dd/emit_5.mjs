const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const REG = new Map();
const add = (r, k, names) => { for (const n of names) REG.set(n, [r, k]); };
add('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
add('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
add('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT',
  'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
add('P', 'pr', ['INVARIANT', 'SCOPE']);
add('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
add('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIR_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;

function attrs(t) {
  const ms = [...t.matchAll(ATTR)];
  if (!ms.length) return [trim(t), []];
  const body = trim(t.slice(0, ms[0].index));
  const list = ms.map((m, i) => {
    const s = m.index + m[0].length;
    const e = i + 1 < ms.length ? ms[i + 1].index : t.length;
    return [m[1], trim(t.slice(s, e))];
  });
  return [body, list];
}

function store(node, k, v) {
  node.attrList.push([k, v]);
  node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
}

const cut40 = (s) => Array.from(s).slice(0, 40).join('');

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, ''));
  let cur = null;
  const cont = (code, comment) => {
    const [body, list] = attrs(' ' + code);
    for (const [k, v] of list) store(cur, k, v);
    if (body !== '') cur.cont.push(body);
    if (comment !== null) cur.comments.push(comment);
  };
  for (let n = 1; n <= lines.length; n++) {
    const line = lines[n - 1];
    if (line === '') continue;
    const indent = line.match(/^[ \t]*/)[0];
    const content = line.slice(indent.length);
    if (content[0] === '#') {
      warnings.push({ code: 'W_LEGACY_COMMENT', line: n });
      if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, ''));
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: n, register: null, kind: 'comment' });
      continue;
    }
    const spans = [...content.matchAll(QUOTED)].map((m) => [m.index, m.index + m[0].length]);
    let code = content, comment = null;
    for (let i = 0; i < content.length; i++) {
      if (content[i] !== '#' || i === 0) continue;
      const p = content[i - 1], q = content[i + 1];
      if (p !== ' ' && p !== '\t') continue;
      if (q !== undefined && q !== ' ' && q !== '\t') continue;
      if (spans.some(([a, e]) => a < i && i < e)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      comment = trim(content.slice(i + 1));
      warnings.push({ code: 'W_LEGACY_TRAILING_COMMENT', line: n });
      break;
    }
    if (indent !== '') {
      if (!cur) errors.push({ code: 'E_ORPHAN_CONTINUATION', line: n, msg: cut40(code) });
      else cont(code, comment);
      continue;
    }
    const sp = code.search(/[ \t]/);
    let name = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp);
    if (COLON_NAME.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ code: 'W_LEGACY_COLON', line: n, msg: name });
    }
    if (DIR_NAME.test(name) && name !== 'CITED') {
      let reg = REG.get(name);
      if (!reg && /^R[0-9]+$/.test(name)) reg = ['P', 'lb'];
      if (!reg) {
        reg = [null, 'unknown'];
        warnings.push({ code: 'W_UNKNOWN_DIRECTIVE', line: n, msg: name });
      }
      const [body, list] = attrs(rest);
      const node = { directive: name, name, args: body, attrs: {}, attrList: [], cont: [], comments: comment !== null ? [comment] : [], line: n, register: reg[0], kind: reg[1] };
      for (const [k, v] of list) store(node, k, v);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = GLUED.exec(name);
    if (g) {
      const c = name.codePointAt(g[0].length);
      warnings.push({ code: 'W_NAME_SEPARATOR', line: n, msg: g[0] + ' is followed by U+' + c.toString(16).toUpperCase().padStart(4, '0') + ', not a space or tab: not a directive' });
    }
    if (cur) {
      cont(code, comment);
      warnings.push({ code: 'W_UNINDENTED_CONTINUATION', line: n });
    } else errors.push({ code: 'E_NO_DIRECTIVE', line: n, msg: cut40(code) });
  }
  return { ast, errors, warnings };
}
