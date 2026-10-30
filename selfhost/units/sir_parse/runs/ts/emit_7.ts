type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; attrList: Array<[string, string]>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const LINE_SPLIT = /\r\n|\r|\n/;
const OPENER_PREV = ' \t([{,=:;|<>!&-~';
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+):?(?=[\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}])/u;
const INVISIBLE_LEAD = /^[\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]+(?=(?:[A-Z][A-Z0-9-]*|R\d+)(?:[ \t:\u000A-\u000D\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\u00AD\u0600-\u0605\u061C\u06DD\u070F\u0890\u0891\u08E2\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF\uFFF9-\uFFFB\u{110BD}\u{110CD}\u{13430}-\u{1343F}\u{1BCA0}-\u{1BCA3}\u{1D173}-\u{1D17A}\u{E0001}\u{E0020}-\u{E007F}]|$)|#)/u;
const ATTR_SRC = '[ \\t]+(CITED|EARNED|ANCHOR)(?=[ \\t]|$)';
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

function trimSp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function spansOf(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const n = s.length;
  let lastEnd = -1;
  let i = 0;
  while (i < n) {
    if (s[i] === '"' && (i === 0 || OPENER_PREV.includes(s[i - 1] ?? '') || i === lastEnd)) {
      let j = i + 1;
      let close = -1;
      while (j < n) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += cp !== undefined && cp > 0xffff ? 3 : 2;
        } else if (c === '"') {
          close = j;
          break;
        } else {
          j += 1;
        }
      }
      if (close >= 0) {
        spans.push([i, close]);
        lastEnd = close + 1;
        i = close + 1;
        continue;
      }
    }
    i += 1;
  }
  return spans;
}

function inside(spans: Array<[number, number]>, idx: number): boolean {
  for (const [o, c] of spans) if (o < idx && idx < c) return true;
  return false;
}

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const spans = spansOf(t);
  const re = new RegExp(ATTR_SRC, 'g');
  const kept: Array<{ index: number; end: number; kw: string }> = [];
  let m: RegExpExecArray | null = re.exec(t);
  while (m !== null) {
    const kw = m[1] ?? '';
    const end = m.index + m[0].length;
    if (!inside(spans, end - kw.length)) kept.push({ index: m.index, end, kw });
    m = re.exec(t);
  }
  const first = kept[0];
  if (first === undefined) return { body: trimSp(t), list: [] };
  const list: Array<[string, string]> = [];
  kept.forEach((g, k) => {
    const nx = kept[k + 1];
    list.push([g.kw, trimSp(t.slice(g.end, nx === undefined ? t.length : nx.index))]);
  });
  return { body: trimSp(t.slice(0, first.index)), list };
}

function store(node: Node, list: Array<[string, string]>): void {
  for (const [k, v] of list) {
    node.attrList.push([k, v]);
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

function hex(cp: number | undefined): string {
  return 'U+' + (cp ?? 0).toString(16).toUpperCase().padStart(4, '0');
}

function cut40(s: string): string {
  return Array.from(s).slice(0, 40).join('');
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let current: Node | null = null;
  const lines = text.split(LINE_SPLIT);
  for (let li = 0; li < lines.length; li++) {
    const line = li + 1;
    const raw = lines[li] ?? '';
    const l = raw.replace(/^[ \t\uFEFF]+/, (x) => x.replace(/\uFEFF/g, '')).replace(/[ \t]+$/, '');
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
    let code = content;
    let comment: string | undefined;
    const cs = spansOf(content);
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const prev = content[i - 1];
      if (prev !== ' ' && prev !== '\t') continue;
      const nx = content[i + 1];
      if (nx !== undefined && nx !== ' ' && nx !== '\t') continue;
      if (inside(cs, i)) continue;
      code = content.slice(0, i).replace(/[ \t]+$/, '');
      comment = trimSp(content.slice(i + 1));
      warnings.push({ line, code: 'W_LEGACY_TRAILING_COMMENT' });
      break;
    }
    const cont = (): void => {
      if (current === null) return;
      const a = attrs(' ' + code);
      store(current, a.list);
      if (a.body !== '') current.cont.push(a.body);
      if (comment !== undefined) current.comments.push(comment);
    };
    if (indent !== '') {
      if (current === null) errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: cut40(code) });
      else cont();
      continue;
    }
    const sp = code.search(/[ \t]/);
    let name = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp);
    if (COLON_NAME.test(name) && name.slice(0, -1) !== 'CITED') {
      name = name.slice(0, -1);
      warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
    }
    if (DIRECTIVE_NAME.test(name) && name !== 'CITED') {
      const rk = REGISTRY.get(name) ?? (/^R\d+$/.test(name) ? (['P', 'lb'] as [string, string]) : undefined);
      if (rk === undefined) warnings.push({ line, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
      const a = attrs(rest);
      const node: Node = { directive: name, name, args: a.body, attrs: {}, attrList: [], cont: [], comments: comment !== undefined ? [comment] : [], line, register: rk === undefined ? null : rk[0], kind: rk === undefined ? 'unknown' : rk[1] };
      store(node, a.list);
      ast.push(node);
      current = node;
      continue;
    }
    const g = GLUED.exec(name);
    if (g !== null) {
      const gw = g[0].endsWith(':') ? g[0].slice(0, -1) : g[0];
      warnings.push({ line, code: 'W_NAME_SEPARATOR', msg: gw + ' is followed by ' + hex(name.codePointAt(g[0].length)) + ', not a space or tab: not ' + (gw === 'CITED' ? 'an attribute' : 'a directive') });
    } else {
      const m = INVISIBLE_LEAD.exec(code);
      if (m !== null) {
        const after = code.slice(m[0].length);
        let tail: string;
        if (after.startsWith('#')) tail = 'a comment marker: not a comment';
        else {
          const w = /^[A-Z0-9-]+/.exec(after);
          tail = 'a directive-shaped name: not ' + (w !== null && w[0] === 'CITED' ? 'an attribute' : 'a directive');
        }
        warnings.push({ line, code: 'W_NAME_SEPARATOR', msg: 'the line starts with ' + hex(code.codePointAt(0)) + ' (whitespace or an invisible character) before ' + tail });
      }
    }
    if (current !== null) {
      cont();
      warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
    } else {
      errors.push({ line, code: 'E_NO_DIRECTIVE', msg: cut40(code) });
    }
  }
  return { ast, errors, warnings };
}
