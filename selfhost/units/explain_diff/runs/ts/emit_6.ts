type Piece = { op: '=' | '-' | '+'; text: string };
type Change = { section: string; id: string; label: string; kind: 'changed' | 'added' | 'removed'; checked: boolean;
  text?: string; diff?: Piece[]; whyDiff?: Piece[] | null };
type Warning = { level: 'stop' | 'ok' | 'note'; kind: string; text: string };
type Review = { unit: string; changes: Change[]; warnings: Warning[] };

type Attr = { kw: string; value: string };
type Dir = { name: string; args: string; pieces: string[]; attrs: Attr[]; comments: string[] };
type Stray = { line: number; text: string };
type Item = { section: string; id: string; label: string | null; raw: string; text: string; cites: string[]; why: string[]; tested: boolean };

const OPENERS = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const COMMENT_LEAD = /^#+[ \t]?/;
const REF_TAIL = /[.,;:)\]]+$/;
const ATTR_SRC = '[ \\t]+(CITED|EARNED|ANCHOR)(?=[ \\t]|$)';

function tt(s: string): string { return s.replace(/^[ \t]+|[ \t]+$/g, ''); }
function fields(s: string): string[] { return s.split(/[ \t]+/).filter((x) => x !== ''); }

function quoted(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let lastClose = -2;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1] ?? '') || i === lastClose + 1)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          j += 1;
          if (j < s.length) {
            const cp = s.codePointAt(j) ?? 0;
            j += cp > 0xffff ? 2 : 1;
          }
        } else if (c === '"') { close = j; break; } else j += 1;
      }
      if (close < 0) break;
      spans.push([i, close]);
      lastClose = close;
      i = close + 1;
    } else i += 1;
  }
  return spans;
}
function inside(spans: Array<[number, number]>, p: number): boolean {
  for (const [a, b] of spans) if (a < p && p < b) return true;
  return false;
}

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const spans = quoted(piece);
  const re = new RegExp(ATTR_SRC, 'g');
  const marks: Array<{ start: number; kw: string; kwEnd: number }> = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const kw = m[1] ?? '';
    const kwEnd = m.index + m[0].length;
    if (!inside(spans, kwEnd - kw.length)) marks.push({ start: m.index, kw, kwEnd });
    m = re.exec(piece);
  }
  if (marks.length === 0) return { body: tt(piece), attrs: [] };
  const first = marks[0];
  const body = tt(piece.slice(0, first ? first.start : 0));
  const attrs: Attr[] = [];
  for (let k = 0; k < marks.length; k++) {
    const mk = marks[k];
    if (!mk) continue;
    const nx = marks[k + 1];
    attrs.push({ kw: mk.kw, value: tt(piece.slice(mk.kwEnd, nx ? nx.start : piece.length)) });
  }
  return { body, attrs };
}

function splitComment(content: string): { code: string; comment: string | null } {
  const spans = quoted(content);
  for (let k = 1; k < content.length; k++) {
    if (content[k] !== '#') continue;
    const prev = content[k - 1];
    if (prev !== ' ' && prev !== '\t') continue;
    const nx = content[k + 1];
    if (nx !== undefined && nx !== ' ' && nx !== '\t') continue;
    if (inside(spans, k)) continue;
    return { code: content.slice(0, k).replace(/[ \t]+$/, ''), comment: tt(content.slice(k + 1)) };
  }
  return { code: content, comment: null };
}

function parse(text: string): { dirs: Dir[]; strays: Stray[] } {
  const dirs: Dir[] = [];
  const strays: Stray[] = [];
  let cur: Dir | null = null;
  const lead = new RegExp('^[ \\t\\uFEFF]*');
  const lines = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n] ?? '';
    const lm = lead.exec(raw);
    const lm0 = lm ? lm[0] : '';
    const line = (lm0.replace(/﻿/g, '') + raw.slice(lm0.length)).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const im = /^[ \t]*/.exec(line);
    const indentLen = im ? im[0].length : 0;
    const content = line.slice(indentLen);
    if (content.startsWith('#')) {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ''));
      else strays.push({ line: n + 1, text: content });
      continue;
    }
    const sc = splitComment(content);
    const code = sc.code;
    let isDir = false;
    let name = '';
    let rest = '';
    if (indentLen === 0) {
      const sp = code.search(/[ \t]/);
      let nm = sp < 0 ? code : code.slice(0, sp);
      rest = sp < 0 ? '' : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(nm)) nm = nm.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(nm) && nm !== 'CITED') { isDir = true; name = nm; }
    }
    if (isDir) {
      const r = splitAttrs(rest);
      cur = { name, args: r.body, pieces: [], attrs: r.attrs, comments: sc.comment !== null ? [sc.comment] : [] };
      dirs.push(cur);
    } else if (cur === null) {
      strays.push({ line: n + 1, text: content });
    } else {
      const r = splitAttrs(' ' + code);
      for (const a of r.attrs) cur.attrs.push(a);
      if (r.body !== '') cur.pieces.push(r.body);
      if (sc.comment !== null) cur.comments.push(sc.comment);
    }
  }
  return { dirs, strays };
}

function joined(d: Dir): string {
  return [d.args, ...d.pieces].filter((s) => s !== '').join(d.name === 'TABLE' ? ' ⏎ ' : ' ');
}
function rawOf(d: Dir): string {
  const t = [d.args, ...d.pieces].filter((s) => s !== '').join(d.name === 'TABLE' ? '\n' : ' ');
  return d.comments.length > 0 ? t + ' # ' + d.comments.join(' # ') : t;
}
function citesOf(d: Dir): string[] {
  return d.attrs.map((a) => (a.value === '' ? a.kw : a.kw + ' ' + a.value));
}
function whyOf(d: Dir): string[] {
  return d.attrs.map((a) => {
    if (a.kw === 'CITED') return a.value;
    if (a.kw === 'EARNED') return a.value === '' ? 'added after a failed test' : 'added after a failed test (' + a.value + ')';
    return a.value === '' ? 'anchored (no reference given)' : 'anchored to ' + a.value;
  });
}

const PIN_KINDS: ReadonlyMap<string, string> = new Map([
  ['regex', 'pattern'], ['charset', 'character set'], ['grammar', 'grammar'], ['text', 'exact text'], ['set', 'set'],
  ['const', 'constant'], ['constant', 'constant'], ['names', 'names'], ['number', 'number'], ['chars', 'characters'],
  ['order', 'order'], ['map', 'mapping'], ['bytes', 'bytes'],
]);
const OTHER_LABELS: ReadonlyMap<string, string> = new Map([
  ['ORACLE', 'The tests (file and fingerprint)'], ['ORACLE-CLASS', 'Kind of tests'], ['STATE', 'What it changes in place'],
  ['SEAM', 'Export shape'], ['TRACE-SEAM', 'Effect boundary'], ['SRC', 'Source location'], ['EFFECT', 'Effect'],
  ['SURFACE', 'Module surface'], ['EMIT', 'Emits'], ['REQUEST', 'Requests'], ['BRANCH', 'Branch'], ['ON-ERROR', 'On error'],
  ['PAR', 'Unordered window'], ['RING', 'Token ring'], ['LIFECYCLE', 'Resource lifecycle'], ['REACH', 'Off-path unit'],
  ['TRIGGER', 'Trigger'], ['EARNED', 'Earned rule'], ['BEHAVIOR', 'Behavior header'],
]);
const KNOWN_OTHER: ReadonlySet<string> = new Set(['SIR', 'VARIANT', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'CARRIED-DATA',
  'NOTES', 'GUARD-PINNED', 'LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM', 'CITED', 'R11']);
const NAMED: ReadonlySet<string> = new Set(['UNIT', 'KIND', 'FIDELITY', 'ANCHOR', 'DESCRIPTION', 'SIG', 'ENVELOPE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'PINNED', 'TABLE', 'CARRIED', 'DEPENDS-ON', 'INVARIANT', 'SCOPE', 'NOTE',
  'RATIONALE', 'PROVENANCE']);

type Sec = { title: string; tested: boolean; pick: (dirs: Dir[]) => Dir[]; label: (d: Dir) => string | null };
function names(dirs: Dir[], list: string[]): Dir[] {
  const out: Dir[] = [];
  for (const n of list) for (const d of dirs) if (d.name === n) out.push(d);
  return out;
}
function fixed(m: Record<string, string>): (d: Dir) => string | null {
  const mp: ReadonlyMap<string, string> = new Map(Object.entries(m));
  return (d) => mp.get(d.name) ?? null;
}
const isRule = (n: string): boolean => /^R[0-9]+$/.test(n);

const SECS: Sec[] = [
  { title: 'What kind of unit it is', tested: true, pick: (ds) => names(ds, ['UNIT', 'KIND', 'FIDELITY', 'ANCHOR']),
    label: fixed({ UNIT: 'Name', KIND: 'Kind', FIDELITY: 'Fidelity', ANCHOR: 'Anchor' }) },
  { title: 'What it is for', tested: false, pick: (ds) => names(ds, ['DESCRIPTION']), label: () => null },
  { title: 'What it accepts', tested: true, pick: (ds) => names(ds, ['SIG', 'ENVELOPE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN']),
    label: fixed({ SIG: 'Signature', ENVELOPE: 'Inputs it is verified on', 'UNGUARDED-PRECONDITION': 'Assumes, without checking', 'OUT-OF-DOMAIN': 'Not covered' }) },
  { title: 'What it does', tested: true, pick: (ds) => ds.filter((d) => isRule(d.name)), label: (d) => 'Rule ' + d.name.slice(1) },
  { title: 'Exact definitions', tested: true, pick: (ds) => names(ds, ['PINNED']), label: () => null },
  { title: 'Decision table', tested: true, pick: (ds) => names(ds, ['TABLE']), label: () => null },
  { title: 'Data it carries', tested: true, pick: (ds) => names(ds, ['CARRIED']), label: (d) => fields(d.args)[0] ?? 'Carried data' },
  { title: 'What it depends on', tested: true, pick: (ds) => names(ds, ['DEPENDS-ON']), label: () => null },
  { title: 'Other parts of the contract', tested: true,
    pick: (ds) => ds.filter((d) => !NAMED.has(d.name) && !isRule(d.name) && !(d.name === 'BEHAVIOR' && joined(d) === '' && d.attrs.length === 0)),
    label: (d) => {
      const l = OTHER_LABELS.get(d.name);
      if (l !== undefined) return l;
      return KNOWN_OTHER.has(d.name) ? d.name : d.name + ' (not in the SIR vocabulary)';
    } },
  { title: 'Text outside any directive', tested: true, pick: () => [], label: () => null },
  { title: 'Should always hold', tested: false, pick: (ds) => names(ds, ['INVARIANT']), label: () => null },
  { title: 'In and out of scope', tested: false, pick: (ds) => names(ds, ['SCOPE']), label: () => null },
  { title: 'Background', tested: false, pick: (ds) => names(ds, ['NOTE', 'RATIONALE', 'PROVENANCE']),
    label: fixed({ NOTE: 'Note', RATIONALE: 'Why', PROVENANCE: 'Where it came from' }) },
];

function pinParts(d: Dir): { base: string; label: string; text: string } {
  const spans = quoted(d.args);
  let eq = -1;
  for (let k = 0; k < d.args.length; k++) if (d.args[k] === '=' && !inside(spans, k)) { eq = k; break; }
  const head = eq < 0 ? d.args : d.args.slice(0, eq);
  const f = fields(head);
  const kind = f[0] ?? '';
  const nm = f[1] ?? '';
  let text: string;
  if (eq >= 0) text = [tt(d.args.slice(eq + 1)), ...d.pieces].filter((s) => s !== '').join(' ');
  else text = joined(d);
  const phrase = kind === '' ? 'no kind' : (PIN_KINDS.get(kind) ?? kind);
  const empty = eq >= 0 && text === '' ? ', empty value' : '';
  return { base: nm === '' ? 'PIN' : 'PIN:' + nm, label: (nm === '' ? '(unnamed pin)' : nm) + ' (' + phrase + empty + ')', text };
}

function build(src: string): { items: Item[]; dirs: Dir[] } {
  const { dirs, strays } = parse(src);
  const items: Item[] = [];
  const counts = new Map<string, number>();
  const push = (section: string, base: string, label: string | null, raw: string, text: string, cites: string[], why: string[], tested: boolean): void => {
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    items.push({ section, id: k === 1 ? base : base + ' #' + k, label, raw, text, cites, why, tested });
  };
  for (const s of SECS) {
    if (s.title === 'Text outside any directive') {
      for (const st of strays) push(s.title, 'STRAY', 'Line ' + st.line, st.text, st.text, [], [], s.tested);
      continue;
    }
    for (const d of s.pick(dirs)) {
      let base = d.name;
      let label = s.label(d);
      let text = joined(d);
      if (d.name === 'PINNED') {
        const p = pinParts(d);
        base = p.base; label = p.label; text = p.text;
      } else if (d.name === 'DEPENDS-ON' && text.replace(/[A-Z]/g, (c) => c.toLowerCase()) === 'none') {
        text = 'Nothing. No other package is involved.';
      }
      push(s.title, base, label, rawOf(d), text, citesOf(d), whyOf(d), s.tested);
    }
  }
  return { items, dirs };
}

function tokens(s: string): string[] { return s.split(/(\s+)/); }

function diff(a: string, b: string): Piece[] {
  const x = tokens(a);
  const y = tokens(b);
  const n = x.length;
  const m = y.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i++) L.push(new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const s1: Piece[] = [];
  const emit = (op: '=' | '-' | '+', text: string): void => {
    const last = s1[s1.length - 1];
    if (last && last.op === op) last.text += text;
    else s1.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const xi = x[i] ?? '';
    const yj = y[j] ?? '';
    if (xi === yj) { emit('=', xi); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { emit('-', xi); i++; } else { emit('+', yj); j++; }
  }
  while (i < n) { emit('-', x[i] ?? ''); i++; }
  while (j < m) { emit('+', y[j] ?? ''); j++; }
  const out: Piece[] = [];
  let p = 0;
  while (p < s1.length) {
    const e = s1[p];
    if (!e) break;
    if (e.op === '=') { out.push({ op: '=', text: e.text }); p++; continue; }
    let del = '';
    let ins = '';
    let last = p;
    let q = p;
    while (q < s1.length) {
      const g = s1[q];
      if (!g) break;
      if (g.op === '-') { del += g.text; last = q; } else if (g.op === '+') { ins += g.text; last = q; } else {
        const t = g.text.trim();
        const glue = q + 1 < s1.length && (t === '' || t.split(/\s+/).length <= 2);
        if (glue) { del += g.text; ins += g.text; } else break;
      }
      q++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    p = last + 1;
  }
  return out.filter((e) => e.text !== '');
}

function header(dirs: Dir[]): { fid: string | null; ref: string | null } {
  let fid: string | null = null;
  for (const n of ['FIDELITY', 'VARIANT']) {
    const d = dirs.find((x) => x.name === n && joined(x) !== '');
    if (d) { fid = joined(d); break; }
  }
  const a = dirs.find((x) => x.name === 'ANCHOR' && joined(x) !== '');
  return { fid, ref: a ? (fields(joined(a))[0] ?? null) : null };
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, k) => v === b[k]);
}

export function explain_diff(before: string, after: string, oracleChanged: boolean | null, langs: readonly string[]): Review {
  const B = build(before);
  const A = build(after);
  const gid = (it: Item): string => it.section + '\u0001' + it.id.replace(/ #[0-9]+$/, '');
  const order: string[] = [];
  const gb = new Map<string, Item[]>();
  const ga = new Map<string, Item[]>();
  for (const [list, mp] of [[B.items, gb], [A.items, ga]] as Array<[Item[], Map<string, Item[]>]>) {
    for (const it of list) {
      const k = gid(it);
      if (!gb.has(k) && !ga.has(k)) order.push(k);
      const arr = mp.get(k);
      if (arr) arr.push(it); else mp.set(k, [it]);
    }
  }
  const pairOf = new Map<Item, Item>();
  const unpairedBefore: Item[] = [];
  for (const k of order) {
    const bs = gb.get(k) ?? [];
    const as = ga.get(k) ?? [];
    const usedB = new Set<Item>();
    const usedA = new Set<Item>();
    for (const b of bs) {
      const a = as.find((x) => !usedA.has(x) && x.raw === b.raw && sameList(x.cites, b.cites));
      if (a) { usedA.add(a); usedB.add(b); pairOf.set(a, b); }
    }
    const lb = bs.filter((x) => !usedB.has(x));
    const la = as.filter((x) => !usedA.has(x));
    const c = Math.min(lb.length, la.length);
    for (let t = 0; t < c; t++) {
      const b = lb[t];
      const a = la[t];
      if (a && b) pairOf.set(a, b);
    }
    for (let t = c; t < lb.length; t++) { const b = lb[t]; if (b) unpairedBefore.push(b); }
  }
  const changes: Change[] = [];
  const afterOf = new Map<Change, Item>();
  const cap = (it: Item): { section: string; id: string; label: string; checked: boolean } =>
    ({ section: it.section, id: it.id, label: it.label ?? it.section, checked: it.tested });
  for (const a of A.items) {
    const b = pairOf.get(a);
    if (b === undefined) {
      changes.push({ ...cap(a), kind: 'added', text: a.text });
      continue;
    }
    if (a.raw === b.raw && sameList(a.cites, b.cites)) continue;
    let d = diff(b.text, a.text);
    if (!d.some((e) => e.op !== '=')) d = diff(b.raw, a.raw);
    const why = sameList(a.cites, b.cites) ? null : diff(b.cites.join('; '), a.cites.join('; '));
    const ch: Change = { ...cap(a), kind: 'changed', diff: d, whyDiff: why };
    changes.push(ch);
    afterOf.set(ch, a);
  }
  for (const b of unpairedBefore) changes.push({ ...cap(b), kind: 'removed', text: b.text });

  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  const warnings: Warning[] = [];
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((c) => c.kind));
    const verbs = ['changed', 'added', 'removed'].filter((v) => kinds.has(v as Change['kind'])).join(' or ');
    const labels: string[] = [];
    for (const c of tested) if (!labels.includes(c.label)) labels.push(c.label);
    warnings.push({ level: 'stop', kind: 'untested-change', text: N + (N === 1 ? ' tested part was ' : ' tested parts were ') + verbs +
      ' (' + labels.join(', ') + '), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.' });
  }
  const hb = header(B.dirs);
  const ha = header(A.dirs);
  if (hb.fid === 'package' || ha.fid === 'package') {
    const refs: string[] = [];
    for (const r of [hb.ref, ha.ref]) if (r !== null && r.includes('@')) refs.push(r);
    const citing: Array<{ label: string; why: string }> = [];
    for (const c of tested) {
      if (c.kind !== 'changed') continue;
      const it = afterOf.get(c);
      if (it === undefined) continue;
      const pos = it.cites.findIndex((e) => e.includes('FIDELITY package') ||
        e.split(/[ \t]+/).some((tok) => refs.includes(tok.replace(REF_TAIL, ''))));
      if (pos >= 0) citing.push({ label: c.label, why: it.why[pos] ?? '' });
    }
    const first = citing[0];
    if (first) {
      let q = first.why.startsWith('FIDELITY package — ') ? first.why.slice('FIDELITY package — '.length) : first.why;
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join('') + '…';
      warnings.push({ level: 'stop', kind: 'citation', text: 'This contract promises to match the original package exactly, and ' +
        citing.map((c) => c.label).join(' and ') + ' still ' + (citing.length === 1 ? 'cites' : 'cite') +
        ' that package as the reason for the old behavior ("' + q + '"). The edit contradicts its own citation.' });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: 'ok', kind: 'prose-only', text: 'Only unchecked prose changed. The code is held to exactly what it was held to before.' });
  }
  const stale: string[] = [];
  for (const l of langs) if (l !== '' && !stale.includes(l)) stale.push(l);
  if (N > 0 && stale.length > 0) {
    const LN: ReadonlyMap<string, string> = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['rust', 'Rust']]);
    const nm = stale.map((l) => LN.get(l) ?? l).join(', ');
    warnings.push({ level: 'note', kind: 'stale-langs', text: 'The ' + nm + (stale.length === 1
      ? ' file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it.'
      : ' files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.') });
  }
  let unit = '(unnamed)';
  const ud = A.dirs.find((d) => d.name === 'UNIT' && joined(d) !== '') ?? A.dirs.find((d) => d.name === 'SIR' && joined(d) !== '');
  if (ud) unit = joined(ud);
  return { unit, changes, warnings };
}
