type Node = { directive: string; name: string; body?: string; args: string; attrs: Record<string, string>; cont: string[]; comments: string[]; line: number; register: string | null; kind: string };
type Diag = { line: number; code: string; msg?: string };
type Result = { ast: Node[]; errors: Diag[]; warnings: Diag[] };

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

const has = (o: Record<string, string>, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

function attrs(t: string): { body: string; found: Array<[string, string]> } {
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const ms = Array.from(t.matchAll(re));
  const first = ms[0];
  if (first === undefined) return { body: t.trim(), found: [] };
  const found: Array<[string, string]> = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m === undefined) continue;
    const next = ms[i + 1];
    const start = (m.index ?? 0) + m[0].length;
    const end = next === undefined ? t.length : (next.index ?? t.length);
    found.push([m[1] ?? '', t.slice(start, end).trim()]);
  }
  return { body: t.slice(0, first.index ?? 0).trim(), found };
}

function store(map: Record<string, string>, found: Array<[string, string]>): void {
  for (const [k, v] of found) {
    if (has(map, k)) map[k] = (map[k] ?? '') + '; ' + v;
    else map[k] = v;
  }
}

const cut = (s: string): string => Array.from(s).slice(0, 40).join('');

export default function sir_parse(text: string): Result {
  const ast: Node[] = [];
  const errors: Diag[] = [];
  const warnings: Diag[] = [];
  let current: Node | null = null;
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.replace(/^﻿+/, '').replace(/[ \t]+$/, ''));

  const continuation = (cur: Node, code: string, comment: string | null): void => {
    const r = attrs(' ' + code);
    cur.cont.push(r.body);
    store(cur.attrs, r.found);
    if (comment !== null) cur.comments.push(comment);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i] ?? '';
    if (raw.trim() === '') continue;
    const im = /^[ \t]*/.exec(raw);
    const indent = im === null ? '' : im[0];
    const content = raw.slice(indent.length);

    if (content.startsWith('#')) {
      warnings.push({ line, code: 'W_LEGACY_COMMENT' });
      if (current !== null) {
        current.comments.push(content.replace(/^#+\s?/, ''));
      } else {
        ast.push({ directive: '#', name: '#', body: content, args: '', attrs: {}, cont: [], comments: [content], line, register: null, kind: 'comment' });
      }
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

    if (indent !== '') {
      if (current === null) {
        errors.push({ line, code: 'E_ORPHAN_CONTINUATION', msg: cut(code) });
      } else {
        continuation(current, code, comment);
      }
      continue;
    }

    const sp = code.search(/[ \t]/);
    let name = sp < 0 ? code : code.slice(0, sp);
    const rest = sp < 0 ? '' : code.slice(sp).replace(/^[ \t]+/, '');
    if (COLON_NAME.test(name)) {
      name = name.slice(0, -1);
      warnings.push({ line, code: 'W_LEGACY_COLON', msg: name });
    }
    if (DIRECTIVE_NAME.test(name)) {
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
      const r = attrs(rest);
      const a: Record<string, string> = {};
      store(a, r.found);
      const node: Node = { directive: name, name, args: r.body, attrs: a, cont: [], comments: comment !== null ? [comment] : [], line, register: reg, kind };
      ast.push(node);
      current = node;
    } else if (current !== null) {
      continuation(current, code, comment);
      warnings.push({ line, code: 'W_UNINDENTED_CONTINUATION' });
    } else {
      errors.push({ line, code: 'E_NO_DIRECTIVE', msg: cut(code) });
    }
  }
  return { ast, errors, warnings };
}
