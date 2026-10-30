type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; attrList: Array<[string, string]>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const REG = new Map<string, [string, string]>();
const reg = (r: string, k: string, names: string[]): void => { for (const n of names) REG.set(n, [r, k]); };
reg('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
reg('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
reg('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT', 'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
reg('P', 'pr', ['INVARIANT', 'SCOPE']);
reg('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
reg('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

const trim = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, '');
const isSp = (c: string | undefined): boolean => c === ' ' || c === '\t';
const cut40 = (s: string): string => Array.from(s).slice(0, 40).join('');

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms = Array.from(t.matchAll(re));
  const first = ms[0];
  if (first === undefined) return { body: trim(t), list: [] };
  const list: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m === undefined) continue;
    const next = ms[i + 1];
    const start = (m.index ?? 0) + m[0].length;
    const end = next === undefined ? t.length : (next.index ?? 0);
    list.push([m[1] ?? '', trim(t.slice(start, end))]);
  }
  return { body: trim(t.slice(0, first.index ?? 0)), list };
}

function store(node: Node, list: Array<[string, string]>): void {
  for (const [k, v] of list) {
    node.attrList.push([k, v]);
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let cur: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^\uFEFF+/, '').replace(/[ \t]+$/, ''));
  for (let li = 0; li < lines.length; li++) {
    const line = li + 1;
    const raw = lines[li] ?? '';
    if (raw === '') continue;
    const cm = /^[ \t]*/.exec(raw);
    const indent = cm === null ? '' : cm[0];
    const content = raw.slice(indent.length);
    if (content.startsWith('#')) {
      warnings.push({ line, code: 'W_LEGACY_COMMENT' });
      if (cur !== null) {
        cur.comments.push(content.replace(/^#+[ \t]?/, ''));
      } else {
        ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line, register: null, kind: 'comment' });
      }
      continue;
    }
    const spans = Array.from(content.matchAll(/"(?:\\.|[^"\\])*"/g));
    let marker = -1;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      if (!isSp(content[i - 1])) continue;
      if (i + 1 < content.length && !isSp(content[i + 1])) continue;
      let inside = false;
      for (const s of spans) {
        const a = s.index ?? 0;
        if (a < i && i < a + s[0].length) { inside = true; break; }
      }
      if (inside) continue;
      marker = i;
      break;
    }
    let code = content;
    let comment: string | null = null;
    if (marker >= 0) {
      code = content.slice(0, marker).replace(/[ \t]+$/, '');
      comment = trim(content.slice(marker + 1));
      warnings.push({ line, code: 'W_LEGACY_TRAILING_COMMENT' });
    }
    const doContinue = (target: Node, c: string, cmt: string | null): void => {
      const r = attrs(' ' + c);
      store(target, r.list);
      if (r.body !== '') target.cont.push(r.body);
      if (cmt !== null) target.comments.push(cmt);
    };
    if (indent !== '') {
      if (cur === null) errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: cut40(code) });
      else doContinue(cur, code, comment);
      continue;
    }
    let sp = -1;
    for (let i = 0; i < code.length; i++) { if (isSp(code[i])) { sp = i; break; } }
    let name = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp);
    if (/^[A-Z][A-Z0-9-]*:$/.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
    }
    if (/^(?:[A-Z][A-Z0-9-]*|R\d+)$/.test(name) && name !== 'CITED') {
      const info = REG.get(name);
      if (info === undefined) warnings.push({ line, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
      const r = attrs(rest);
      const node: Node = { directive: name, name, args: r.body, attrs: {}, attrList: [], cont: [], comments: comment !== null ? [comment] : [], line, register: info === undefined ? null : info[0], kind: info === undefined ? 'unknown' : info[1] };
      store(node, r.list);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = /^(?:[A-Z][A-Z0-9-]*|R\d+)(?=\s)/.exec(name);
    if (g !== null) {
      const cp = name.codePointAt(g[0].length) ?? 0;
      warnings.push({ line, code: 'W_NAME_SEPARATOR', msg: g[0] + ' is followed by U+' + cp.toString(16).toUpperCase().padStart(4, '0') + ', not a space or tab: not a directive' });
    }
    if (cur !== null) {
      doContinue(cur, code, comment);
      warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
    } else {
      errors.push({ line, code: 'E_NO_DIRECTIVE', msg: cut40(code) });
    }
  }
  return { ast, errors, warnings };
}
