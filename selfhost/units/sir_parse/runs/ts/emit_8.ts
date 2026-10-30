type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; attrList: Array<[string, string]>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const OPENER_PREV = ' \t([{,=:;|<>!&-~';
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+):?(?=[\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}])/u;
const INVISIBLE_LEAD = /^[\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]+(?=(?:[A-Z][A-Z0-9-]*|R\d+)(?:[ \t:\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]|$)|#)/u;

const REG = new Map<string, [string, string]>();
function reg(r: string, k: string, names: string[]): void {
  for (const n of names) REG.set(n, [r, k]);
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
  let after = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENER_PREV.includes(s[i - 1]) || i === after)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += cp !== undefined && cp > 0xffff ? 3 : 2;
        } else if (c === '"') {
          close = j;
          break;
        } else j++;
      }
      if (close >= 0) {
        out.push([i, close]);
        after = close + 1;
        i = close + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

function inside(sp: Array<[number, number]>, idx: number): boolean {
  for (const [o, c] of sp) if (o < idx && idx < c) return true;
  return false;
}

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const sp = spans(t);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const kept: Array<{ index: number; end: number; kw: string }> = [];
  let m: RegExpExecArray | null = re.exec(t);
  while (m !== null) {
    const kw = m[1];
    const kwIdx = m.index + m[0].length - kw.length;
    if (!inside(sp, kwIdx)) kept.push({ index: m.index, end: m.index + m[0].length, kw });
    m = re.exec(t);
  }
  if (kept.length === 0) return { body: trim(t), list: [] };
  const list: Array<[string, string]> = [];
  for (let n = 0; n < kept.length; n++) {
    const stop = n + 1 < kept.length ? kept[n + 1].index : t.length;
    list.push([kept[n].kw, trim(t.slice(kept[n].end, stop))]);
  }
  return { body: trim(t.slice(0, kept[0].index)), list };
}

function store(node: Node, list: Array<[string, string]>): void {
  for (const pair of list) {
    node.attrList.push([pair[0], pair[1]]);
    const k = pair[0];
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

function cut40(s: string): string {
  return Array.from(s).slice(0, 40).join('');
}

function hex(cp: number | undefined): string {
  return 'U+' + (cp === undefined ? 0 : cp).toString(16).toUpperCase().padStart(4, '0');
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let current: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/);

  const cont = (node: Node, code: string, comment: string | undefined): void => {
    const r = attrs(' ' + code);
    store(node, r.list);
    if (r.body !== '') node.cont.push(r.body);
    if (comment !== undefined) node.comments.push(comment);
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNo = idx + 1;
    const line = lines[idx]
      .replace(/^[ \t\uFEFF]+/, (mm) => mm.replace(/\uFEFF/g, ''))
      .replace(/[ \t]+$/, '');
    if (line === '') continue;
    const im = /^[ \t]*/.exec(line);
    const indent = im === null ? '' : im[0];
    const content = line.slice(indent.length);

    if (content.startsWith('#')) {
      warnings.push({ line: lineNo, code: 'W_LEGACY_COMMENT' });
      if (current !== null) {
        current.comments.push(content.replace(/^#+[ \t]?/, ''));
      } else {
        ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line: lineNo, register: null, kind: 'comment' });
      }
      continue;
    }

    const csp = spans(content);
    let code = content;
    let comment: string | undefined;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      const nx = i + 1 < content.length ? content[i + 1] : '';
      if (nx !== '' && nx !== ' ' && nx !== '\t') continue;
      if (inside(csp, i)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      comment = trim(content.slice(i + 1));
      warnings.push({ line: lineNo, code: 'W_LEGACY_TRAILING_COMMENT' });
      break;
    }

    if (indent === '') {
      let end = code.search(/[ \t]/);
      if (end < 0) end = code.length;
      let name = code.slice(0, end);
      const rest = code.slice(end);
      if (COLON_NAME.test(name) && name.slice(0, -1) !== 'CITED') {
        name = name.slice(0, -1);
        warnings.push({ line: lineNo, code: 'W_LEGACY_COLON', msg: name });
      }
      if (DIRECTIVE_NAME.test(name) && name !== 'CITED') {
        const info = REG.get(name) ?? (/^R\d+$/.test(name) ? ['P', 'lb'] : null);
        if (info === null) warnings.push({ line: lineNo, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
        const r = attrs(rest);
        const node: Node = { directive: name, name, args: r.body, attrs: {}, attrList: [], cont: [], comments: comment !== undefined ? [comment] : [], line: lineNo, register: info === null ? null : info[0], kind: info === null ? 'unknown' : info[1] };
        store(node, r.list);
        ast.push(node);
        current = node;
        continue;
      }
      const g = GLUED.exec(name);
      if (g !== null) {
        const G = g[0].endsWith(':') ? g[0].slice(0, -1) : g[0];
        const C = name.codePointAt(g[0].length);
        warnings.push({ line: lineNo, code: 'W_NAME_SEPARATOR', msg: G + ' is followed by ' + hex(C) + ', not a space or tab: not ' + (G === 'CITED' ? 'an attribute' : 'a directive') });
      } else {
        const v = INVISIBLE_LEAD.exec(code);
        if (v !== null) {
          const after = code.slice(v[0].length);
          let tail: string;
          if (after.startsWith('#')) tail = 'a comment marker: not a comment';
          else {
            const wm = /^[A-Z0-9-]+/.exec(after);
            tail = 'a directive-shaped name: not ' + (wm !== null && wm[0] === 'CITED' ? 'an attribute' : 'a directive');
          }
          warnings.push({ line: lineNo, code: 'W_NAME_SEPARATOR', msg: 'the line starts with ' + hex(code.codePointAt(0)) + ' (whitespace or an invisible character) before ' + tail });
        }
      }
      if (current !== null) {
        cont(current, code, comment);
        warnings.push({ line: lineNo, code: 'W_UNINDENTED_CONTINUATION' });
      } else {
        errors.push({ line: lineNo, code: 'E_NO_DIRECTIVE', msg: cut40(code) });
      }
      continue;
    }

    if (current === null) {
      errors.push({ line: lineNo, code: 'E_ORPHAN_CONTINUATION', msg: cut40(code) });
    } else {
      cont(current, code, comment);
    }
  }
  return { ast, errors, warnings };
}
