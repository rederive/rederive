type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; attrList: Array<[string, string]>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const LINE_SPLIT = /\r\n|\r|\n/;
const OPENER_PREV = ' \t([{,=:;|<>!&-~';
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+):?(?=[\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}])/u;
const INVISIBLE_LEAD = /^[\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]+(?=(?:[A-Z][A-Z0-9-]*|R\d+)(?:[ \t:\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]|$)|#)/u;
const COMMENT_STRIP = /^#+[ \t]?/;

const REGISTRY = new Map<string, [string, string]>();
function reg(r: string, k: string, names: string[]): void {
  for (const n of names) REGISTRY.set(n, [r, k]);
}
reg('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
reg('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
reg('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT', 'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
reg('P', 'pr', ['INVARIANT', 'SCOPE']);
reg('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
reg('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

function trim(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let lastEnd = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENER_PREV.includes(s[i - 1]) || i === lastEnd)) {
      let j = i + 1;
      let closed = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += cp !== undefined && cp > 0xffff ? 3 : 2;
        } else if (c === '"') {
          closed = j;
          break;
        } else j++;
      }
      if (closed >= 0) {
        out.push([i, closed]);
        lastEnd = closed + 1;
        i = closed + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

function inside(sp: Array<[number, number]>, i: number): boolean {
  for (const [a, b] of sp) if (a < i && i < b) return true;
  return false;
}

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const sp = spans(t);
  const ms: Array<{ index: number; end: number; kw: string }> = [];
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  let m: RegExpExecArray | null = re.exec(t);
  while (m !== null) {
    const kw = m[1];
    const kwIdx = m.index + m[0].length - kw.length;
    if (!inside(sp, kwIdx)) ms.push({ index: m.index, end: m.index + m[0].length, kw });
    if (m[0].length === 0) re.lastIndex++;
    m = re.exec(t);
  }
  if (ms.length === 0) return { body: trim(t), list: [] };
  const list: Array<[string, string]> = [];
  for (let k = 0; k < ms.length; k++) {
    const stop = k + 1 < ms.length ? ms[k + 1].index : t.length;
    list.push([ms[k].kw, trim(t.slice(ms[k].end, stop))]);
  }
  return { body: trim(t.slice(0, ms[0].index)), list };
}

function store(node: Node, k: string, v: string): void {
  node.attrList.push([k, v]);
  const vals: string[] = [];
  for (const [kk, vv] of node.attrList) if (kk === k && vv !== '') vals.push(vv);
  node.attrs[k] = vals.join('; ');
}

function first40(s: string): string {
  return Array.from(s).slice(0, 40).join('');
}

function hex(cp: number): string {
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let current: Node | null = null;
  const pieces = text.split(LINE_SPLIT);

  const cont = (node: Node, code: string, comment: string | undefined): void => {
    const a = attrs(' ' + code);
    for (const [k, v] of a.list) store(node, k, v);
    if (a.body !== '') node.cont.push(a.body);
    if (comment !== undefined) node.comments.push(comment);
  };

  for (let n = 0; n < pieces.length; n++) {
    const line = n + 1;
    const l = pieces[n].replace(/^[ \t\uFEFF]+/, (m) => m.replace(/\uFEFF/g, '')).replace(/[ \t]+$/, '');
    if (l === '') continue;
    const indentM = /^[ \t]*/.exec(l);
    const indent = indentM === null ? '' : indentM[0];
    const content = l.slice(indent.length);

    if (content.startsWith('#')) {
      warnings.push({ line, code: 'W_LEGACY_COMMENT' });
      if (current !== null) {
        current.comments.push(content.replace(COMMENT_STRIP, ''));
      } else {
        ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line, register: null, kind: 'comment' });
      }
      continue;
    }

    const sp = spans(content);
    let code = content;
    let comment: string | undefined = undefined;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      if (i + 1 < content.length && content[i + 1] !== ' ' && content[i + 1] !== '\t') continue;
      if (inside(sp, i)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      comment = trim(content.slice(i + 1));
      warnings.push({ line, code: 'W_LEGACY_TRAILING_COMMENT' });
      break;
    }

    if (indent !== '') {
      if (current === null) errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: first40(code) });
      else cont(current, code, comment);
      continue;
    }

    const sepM = /[ \t]/.exec(code);
    const sepAt = sepM === null ? code.length : sepM.index;
    let name = code.slice(0, sepAt);
    const rest = code.slice(sepAt);
    if (COLON_NAME.test(name) && name.slice(0, -1) !== 'CITED') {
      name = name.slice(0, -1);
      warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
    }
    if (DIRECTIVE_NAME.test(name) && name !== 'CITED') {
      let r: string | null = null;
      let kind = 'unknown';
      const e = REGISTRY.get(name);
      if (e !== undefined) {
        r = e[0];
        kind = e[1];
      } else if (/^R\d+$/.test(name)) {
        r = 'P';
        kind = 'lb';
      } else {
        warnings.push({ line, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
      }
      const a = attrs(rest);
      const node: Node = { directive: name, name, args: a.body, attrs: {}, attrList: [], cont: [], comments: comment !== undefined ? [comment] : [], line, register: r, kind };
      for (const [k, v] of a.list) store(node, k, v);
      ast.push(node);
      current = node;
      continue;
    }

    const g = GLUED.exec(name);
    if (g !== null) {
      const G = g[0].endsWith(':') ? g[0].slice(0, -1) : g[0];
      const cp = name.codePointAt(g[0].length);
      if (cp !== undefined) {
        warnings.push({ line, code: 'W_NAME_SEPARATOR', msg: G + ' is followed by ' + hex(cp) + ', not a space or tab: not ' + (G === 'CITED' ? 'an attribute' : 'a directive') });
      }
    } else {
      const iv = INVISIBLE_LEAD.exec(code);
      if (iv !== null) {
        const cp0 = code.codePointAt(0);
        const tail = code.slice(iv[0].length);
        let msg = 'the line starts with ' + hex(cp0 === undefined ? 0 : cp0) + ' (whitespace or an invisible character) before ';
        if (tail.startsWith('#')) msg += 'a comment marker: not a comment';
        else {
          const w = /^[A-Z0-9-]+/.exec(tail);
          msg += 'a directive-shaped name: not ' + (w !== null && w[0] === 'CITED' ? 'an attribute' : 'a directive');
        }
        warnings.push({ line, code: 'W_NAME_SEPARATOR', msg });
      }
    }

    if (current !== null) {
      cont(current, code, comment);
      warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
    } else {
      errors.push({ line, code: 'E_NO_DIRECTIVE', msg: first40(code) });
    }
  }
  return { ast, errors, warnings };
}
