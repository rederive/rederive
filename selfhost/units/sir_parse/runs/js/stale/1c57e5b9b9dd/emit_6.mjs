const REG = new Map();
const add = (r, k, names) => { for (const n of names.split(' ')) REG.set(n, [r, k]); };
add('B', 'lb', 'UNIT SIG ENVELOPE DEPENDS-ON PINNED EARNED CARRIED');
add('B', 'pr', 'DESCRIPTION NOTE RATIONALE PROVENANCE');
add('P', 'lb', 'KIND FIDELITY ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM BEHAVIOR TABLE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE SHAPE CANONICAL-SHA256 AUTHORITY STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE');
add('P', 'pr', 'INVARIANT SCOPE');
add('P', 'legacy', 'SIR VARIANT CARRIED-DATA NOTES GUARD-PINNED');
add('L', 'lb', 'LANG PRIMARY-SHA256 ABI MECHANISM');

const trim = (s) => s.replace(/^[ \t]+|[ \t]+$/g, '');
const cut40 = (s) => Array.from(s).slice(0, 40).join('');

function attrs(t) {
  const ms = [...t.matchAll(/[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g)];
  if (!ms.length) return [trim(t), []];
  const list = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const s = m.index + m[0].length;
    const e = i + 1 < ms.length ? ms[i + 1].index : t.length;
    list.push([m[1], trim(t.slice(s, e))]);
  }
  return [trim(t.slice(0, ms[0].index)), list];
}

function store(node, list) {
  for (const [k, v] of list) {
    node.attrList.push([k, v]);
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

export default function sir_parse(text) {
  const ast = [], errors = [], warnings = [];
  const lines = text.split(/\r\n|\r|\n/);
  let cur = null;
  const w = (line, code, msg) => warnings.push(msg === undefined ? { line, code } : { line, code, msg });
  const cont = (code, comment) => {
    const [body, list] = attrs(' ' + code);
    store(cur, list);
    if (body !== '') cur.cont.push(body);
    if (comment !== null) cur.comments.push(comment);
  };
  for (let i = 0; i < lines.length; i++) {
    const n = i + 1;
    const line = lines[i].replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = /^[ \t]*/.exec(line)[0];
    const content = line.slice(indent.length);
    if (content[0] === '#') {
      w(n, 'W_LEGACY_COMMENT');
      if (cur) cur.comments.push(content.replace(/^#+[ \t]?/, ''));
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: n, register: null, kind: 'comment' });
      continue;
    }
    const spans = [];
    for (const m of content.matchAll(/"(?:\\.|[^"\\])*"/g)) spans.push([m.index, m.index + m[0].length]);
    let marker = -1;
    for (let j = 0; j < content.length; j++) {
      if (content[j] !== '#' || j === 0) continue;
      const p = content[j - 1];
      if (p !== ' ' && p !== '\t') continue;
      if (j + 1 < content.length && content[j + 1] !== ' ' && content[j + 1] !== '\t') continue;
      if (spans.some(([a, e]) => a < j && j < e)) continue;
      marker = j;
      break;
    }
    let code = content, comment = null;
    if (marker >= 0) {
      code = content.slice(0, marker).replace(/[ \t]+$/, '');
      comment = trim(content.slice(marker + 1));
      w(n, 'W_LEGACY_TRAILING_COMMENT');
    }
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      let name = sp < 0 ? code : code.slice(0, sp);
      const rest = sp < 0 ? '' : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) {
        name = name.slice(0, -1);
        w(n, 'W_LEGACY_COLON', name);
      }
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED') {
        let reg = REG.get(name);
        if (!reg && /^R\d+$/.test(name)) reg = ['P', 'lb'];
        if (!reg) w(n, 'W_UNKNOWN_DIRECTIVE', name);
        const [body, list] = attrs(rest);
        const node = { directive: name, name, args: body, attrs: {}, attrList: [], cont: [], comments: comment !== null ? [comment] : [], line: n, register: reg ? reg[0] : null, kind: reg ? reg[1] : 'unknown' };
        store(node, list);
        ast.push(node);
        cur = node;
        continue;
      }
      const g = /^[A-Z][A-Z0-9-]*(?=\s)/.exec(name);
      if (g) {
        const ch = name.codePointAt(g[0].length);
        w(n, 'W_NAME_SEPARATOR', g[0] + ' is followed by U+' + ch.toString(16).toUpperCase().padStart(4, '0') + ', not a space or tab: not a directive');
      }
      if (cur) {
        cont(code, comment);
        w(n, 'W_UNINDENTED_CONTINUATION');
      } else errors.push({ line: n, code: 'E_NO_DIRECTIVE', msg: cut40(code) });
    } else if (!cur) errors.push({ line: n, code: 'E_ORPHAN_CONTINUATION', msg: cut40(code) });
    else cont(code, comment);
  }
  return { ast, errors, warnings };
}
