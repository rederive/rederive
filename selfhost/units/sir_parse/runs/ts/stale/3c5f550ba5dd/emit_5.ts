type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; attrList: Array<[string, string]>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const REG = new Map<string, [string, string]>();
function reg(r: string, k: string, names: string[]): void {
  for (const n of names) REG.set(n, [r, k]);
}
reg('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
reg('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
reg('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT',
  'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
reg('P', 'pr', ['INVARIANT', 'SCOPE']);
reg('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
reg('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

function trim(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const ms = Array.from(t.matchAll(/[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g));
  const first = ms[0];
  if (first === undefined) return { body: trim(t), list: [] };
  const list: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const nx = ms[i + 1];
    const start = m.index + m[0].length;
    const end = nx === undefined ? t.length : nx.index;
    list.push([m[1], trim(t.slice(start, end))]);
  }
  return { body: trim(t.slice(0, first.index)), list };
}

function store(node: Node, list: Array<[string, string]>): void {
  for (const [k, v] of list) {
    node.attrList.push([k, v]);
    node.attrs[k] = node.attrList.filter((p) => p[0] === k && p[1] !== '').map((p) => p[1]).join('; ');
  }
}

function cut40(s: string): string {
  return Array.from(s).slice(0, 40).join('');
}

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let cur: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = n + 1;
    const raw = lines[n].replace(/^\uFEFF+/, '').replace(/[ \t]+$/, '');
    if (raw === '') continue;
    const content = raw.replace(/^[ \t]+/, '');
    const indent = raw.length - content.length;
    if (content.startsWith('#')) {
      warnings.push({ line, code: 'W_LEGACY_COMMENT' });
      if (cur !== null) {
        cur.comments.push(content.replace(/^#+[ \t]?/, ''));
      } else {
        ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, attrList: [], cont: [], comments: [content], line, register: null, kind: 'comment' });
      }
      continue;
    }
    const spans: Array<[number, number]> = [];
    for (const m of content.matchAll(/"(?:\\.|[^"\\])*"/g)) spans.push([m.index, m.index + m[0].length]);
    let marker = -1;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      const nx = i + 1 < content.length ? content[i + 1] : '';
      if (nx !== '' && nx !== ' ' && nx !== '\t') continue;
      if (spans.some(([a, e]) => a < i && i < e)) continue;
      marker = i;
      break;
    }
    let code = content;
    let comment: string | undefined;
    if (marker >= 0) {
      code = content.slice(0, marker).replace(/[ \t]+$/, '');
      comment = trim(content.slice(marker + 1));
      warnings.push({ line, code: 'W_LEGACY_TRAILING_COMMENT' });
    }
    const doContinue = (c: Node): void => {
      const a = attrs(' ' + code);
      store(c, a.list);
      if (a.body !== '') c.cont.push(a.body);
      if (comment !== undefined) c.comments.push(comment);
    };
    if (indent > 0) {
      if (cur === null) errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: cut40(code) });
      else doContinue(cur);
      continue;
    }
    const sp = code.search(/[ \t]/);
    let name = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp);
    if (/^[A-Z][A-Z0-9-]*:$/.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
    }
    if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED') {
      let register: string | null = null;
      let kind = 'unknown';
      const e = REG.get(name);
      if (e !== undefined) {
        register = e[0];
        kind = e[1];
      } else if (/^R\d+$/.test(name)) {
        register = 'P';
        kind = 'lb';
      } else {
        warnings.push({ line, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
      }
      const a = attrs(rest);
      const node: Node = { directive: name, name, args: a.body, attrs: {}, attrList: [], cont: [], comments: comment !== undefined ? [comment] : [], line, register, kind };
      store(node, a.list);
      ast.push(node);
      cur = node;
      continue;
    }
    const g = /^[A-Z][A-Z0-9-]*(?=\s)/.exec(name);
    if (g !== null) {
      const cp = name.codePointAt(g[0].length) ?? 0;
      const hex = cp.toString(16).toUpperCase().padStart(4, '0');
      warnings.push({ line, code: 'W_NAME_SEPARATOR', msg: g[0] + ' is followed by U+' + hex + ', not a space or tab: not a directive' });
    }
    if (cur !== null) {
      doContinue(cur);
      warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
    } else {
      errors.push({ line, code: 'E_NO_DIRECTIVE', msg: cut40(code) });
    }
  }
  return { ast, errors, warnings };
}
