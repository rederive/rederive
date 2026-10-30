type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Out = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

const REG = new Map<string, [string, string]>();
const add = (reg: string, kind: string, names: string[]): void => {
  for (const n of names) REG.set(n, [reg, kind]);
};
add('B', 'lb', ['UNIT', 'SIG', 'ENVELOPE', 'DEPENDS-ON', 'PINNED', 'EARNED', 'CARRIED']);
add('B', 'pr', ['DESCRIPTION', 'NOTE', 'RATIONALE', 'PROVENANCE']);
add('P', 'lb', ['KIND', 'FIDELITY', 'ANCHOR', 'SRC', 'TRIGGER', 'REACH', 'ORACLE-CLASS', 'TRACE-SEAM', 'SEAM', 'BEHAVIOR', 'TABLE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'ORACLE', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'STATE', 'EMIT', 'REQUEST', 'BRANCH', 'ON-ERROR', 'PAR', 'RING', 'LIFECYCLE', 'EFFECT', 'SURFACE']);
add('P', 'pr', ['INVARIANT', 'SCOPE']);
add('P', 'legacy', ['SIR', 'VARIANT', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED']);
add('L', 'lb', ['LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);

const MARKER = /^(.*?)(?:^|\s)#(?=\s|$)(.*)$/s;
const COLON_NAME = /^[A-Z][A-Z0-9-]*:$/;
const DIRECTIVE_NAME = /^(?:[A-Z][A-Z0-9-]*|R\d+)$/;
const R_NUM = /^R\d+$/;

function attrs(t: string): { body: string; list: Array<[string, string]> } {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms: Array<{ index: number; end: number; key: string }> = [];
  let m: RegExpExecArray | null = re.exec(t);
  while (m !== null) {
    ms.push({ index: m.index, end: m.index + m[0].length, key: m[1] ?? '' });
    m = re.exec(t);
  }
  const first = ms[0];
  if (first === undefined) return { body: t.trim(), list: [] };
  const list: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const cur = ms[i];
    if (cur === undefined) continue;
    const nxt = ms[i + 1];
    list.push([cur.key, t.slice(cur.end, nxt === undefined ? t.length : nxt.index).trim()]);
  }
  return { body: t.slice(0, first.index).trim(), list };
}

function store(map: Record<string, string>, list: Array<[string, string]>): void {
  for (const [k, v] of list) {
    if (Object.prototype.hasOwnProperty.call(map, k)) map[k] = (map[k] ?? '') + '; ' + v;
    else map[k] = v;
  }
}

const cut = (s: string): string => Array.from(s).slice(0, 40).join('');

export default function sir_parse(text: string): Out {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let cur: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, '').replace(/[ \t]+$/, ''));
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i] ?? '';
    if (raw.trim() === '') continue;
    const im = /^[ \t]*/.exec(raw);
    const indent = im === null ? '' : im[0];
    const content = raw.slice(indent.length);
    if (content.startsWith('#')) {
      warnings.push({ line, code: 'W_LEGACY_COMMENT' });
      const c = content.replace(/^#+\s?/, '');
      if (cur !== null) cur.comments.push(c);
      else ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, cont: [], comments: [content], line, register: null, kind: 'comment' });
      continue;
    }
    let code = content;
    let comment: string | null = null;
    const mm = MARKER.exec(content);
    if (mm !== null) {
      code = (mm[1] ?? '').trimEnd();
      comment = (mm[2] ?? '').trim();
      warnings.push({ line, code: 'W_LEGACY_TRAILING_COMMENT' });
    }
    let isDirective = false;
    let name = '';
    let rest = '';
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      name = sp < 0 ? code : code.slice(0, sp);
      rest = sp < 0 ? '' : code.slice(sp + 1).replace(/^[ \t]+/, '');
      if (COLON_NAME.test(name)) {
        name = name.slice(0, -1);
        warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
      }
      isDirective = DIRECTIVE_NAME.test(name);
    }
    if (isDirective) {
      let reg: string | null = null;
      let kind = 'unknown';
      const e = REG.get(name);
      if (e !== undefined) {
        reg = e[0];
        kind = e[1];
      } else if (R_NUM.test(name)) {
        reg = 'P';
        kind = 'lb';
      } else {
        warnings.push({ line, code: 'W_UNKNOWN_DIRECTIVE', msg: name });
      }
      const a = attrs(rest);
      const at: Record<string, string> = {};
      store(at, a.list);
      const node: Node = { directive: name, name, args: a.body, attrs: at, cont: [], comments: comment !== null ? [comment] : [], line, register: reg, kind };
      ast.push(node);
      cur = node;
      continue;
    }
    if (indent === '') {
      if (cur === null) {
        errors.push({ line, code: 'E_NO_DIRECTIVE', msg: cut(code) });
        continue;
      }
    } else if (cur === null) {
      errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: cut(code) });
      continue;
    }
    const a = attrs(' ' + code);
    cur.cont.push(a.body);
    store(cur.attrs, a.list);
    if (comment !== null) cur.comments.push(comment);
    if (indent === '') warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
  }
  return { ast, errors, warnings };
}
