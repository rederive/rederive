type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; attrList: Array<[string, string]>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const REG = new Map<string, [string, string]>();
function addAll(reg: string, kind: string, names: string[]): void {
  for (const n of names) REG.set(n, [reg, kind]);
}
addAll('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
addAll('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
addAll('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT', 'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
addAll('P', 'pr', ['INVARIANT', 'SCOPE']);
addAll('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
addAll('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

const QUOTED = /"(?:\\.|[^"\\])*"/g;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const GLUED = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const COMMENT_STRIP = /^#+[ \t]?/;
const R_DIGITS = /^R\d+$/;

function trimSp(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const ms = Array.from(t.matchAll(ATTR));
  if (ms.length === 0) return { body: trimSp(t), list: [] };
  const list: Array<[string, string]> = [];
  const first = ms[0];
  const body = trimSp(t.slice(0, first ? first.index ?? 0 : 0));
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (!m) continue;
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const nxt = ms[i + 1];
    const stop = nxt ? nxt.index ?? t.length : t.length;
    list.push([m[1] ?? '', trimSp(t.slice(end, stop))]);
  }
  return { body, list };
}

function store(node: Node, k: string, v: string): void {
  node.attrList.push([k, v]);
  node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
}

function cut40(s: string): string {
  return Array.from(s).slice(0, 40).join('');
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let current: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, ''));

  const cont = (cur: Node, code: string, comment: string | null): void => {
    const r = attrs(' ' + code);
    for (const [k, v] of r.list) store(cur, k, v);
    if (r.body !== '') cur.cont.push(r.body);
    if (comment !== null) cur.comments.push(comment);
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = idx + 1;
    const l = lines[idx] ?? '';
    if (l === '') continue;
    const im = /^[ \t]*/.exec(l);
    const indent = im ? im[0] : '';
    const content = l.slice(indent.length);
    if (content.startsWith('#')) {
      warnings.push({ line, code: 'W_LEGACY_COMMENT' });
      if (current) {
        current.comments.push(content.replace(COMMENT_STRIP, ''));
      } else {
        ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line, register: null, kind: 'comment' });
      }
      continue;
    }
    const spans: Array<[number, number]> = [];
    for (const m of content.matchAll(QUOTED)) {
      const a = m.index ?? 0;
      spans.push([a, a + m[0].length]);
    }
    let marker = -1;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      const n = content[i + 1];
      if (n !== undefined && n !== ' ' && n !== '\t') continue;
      if (spans.some((s) => s[0] < i && i < s[1])) continue;
      marker = i;
      break;
    }
    let code = content;
    let comment: string | null = null;
    if (marker >= 0) {
      code = content.slice(0, marker).replace(/[ \t]+$/, '');
      comment = trimSp(content.slice(marker + 1));
      warnings.push({ line, code: 'W_LEGACY_TRAILING_COMMENT' });
    }
    if (indent !== '') {
      if (!current) errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: cut40(code) });
      else cont(current, code, comment);
      continue;
    }
    const sp = code.search(/[ \t]/);
    let name = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp);
    if (COLON_NAME.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
    }
    if (DIRECTIVE_NAME.test(name) && name !== 'CITED') {
      const reg = REG.get(name) ?? (R_DIGITS.test(name) ? (['P', 'lb'] as [string, string]) : undefined);
      if (!reg) warnings.push({ line, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
      const r = attrs(rest);
      const node: Node = { directive: name, name, args: r.body, attrs: {}, attrList: [], cont: [], comments: comment !== null ? [comment] : [], line, register: reg ? reg[0] : null, kind: reg ? reg[1] : 'unknown' };
      for (const [k, v] of r.list) store(node, k, v);
      ast.push(node);
      current = node;
      continue;
    }
    const g = GLUED.exec(name);
    if (g) {
      const ch = name.codePointAt(g[0].length);
      if (ch !== undefined) {
        const hex = ch.toString(16).toUpperCase().padStart(4, '0');
        warnings.push({ line, code: 'W_NAME_SEPARATOR', msg: g[0] + ' is followed by U+' + hex + ', not a space or tab: not a directive' });
      }
    }
    if (current) {
      cont(current, code, comment);
      warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
    } else {
      errors.push({ line, code: 'E_NO_DIRECTIVE', msg: cut40(code) });
    }
  }
  return { ast, errors, warnings };
}
