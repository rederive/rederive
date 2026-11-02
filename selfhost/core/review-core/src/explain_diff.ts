type Piece = { op: '=' | '-' | '+'; text: string };
type Change = { section: string; id: string; label: string; kind: 'changed' | 'added' | 'removed'; checked: boolean;
  text?: string; diff?: Piece[]; whyDiff?: Piece[] | null };
type Warning = { level: 'stop' | 'ok' | 'note'; kind: string; text: string };
type Review = { unit: string; changes: Change[]; warnings: Warning[] };

type Attr = { k: string; v: string };
type Dir = { name: string; args: string; pieces: string[]; attrs: Attr[]; comments: string[] };
type Stray = { line: number; text: string };
type Item = { section: string; tested: boolean; base: string; id: string; raw: string; text: string;
  rawCit: string[]; why: string[]; label: string | null };

const OPENERS: ReadonlySet<string> = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const RE_LEAD = new RegExp('^[ \\t\\uFEFF]*');
const RE_FEFF = new RegExp('\\uFEFF', 'g');
const NL = '⏎';
const DASH = '—';
const ELL = '…';

function trimST(s: string): string {
  return s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
}

function spans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let i = 0;
  let resume = -1;
  while (i < s.length) {
    if (s.charAt(i) === '"' && (i === 0 || OPENERS.has(s.charAt(i - 1)) || i === resume)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s.charAt(j);
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
          continue;
        }
        if (c === '"') { close = j; break; }
        j++;
      }
      if (close < 0) break;
      out.push([i, close]);
      resume = close + 1;
      i = close + 1;
      continue;
    }
    i++;
  }
  return out;
}

function inSpan(sp: Array<[number, number]>, p: number): boolean {
  return sp.some((r) => p > r[0] && p < r[1]);
}

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const sp = spans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks: Array<{ start: number; kwEnd: number; kw: string }> = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const kw = m[1] ?? '';
    const kwEnd = m.index + m[0].length;
    if (!inSpan(sp, kwEnd - kw.length)) marks.push({ start: m.index, kwEnd, kw });
    m = re.exec(piece);
  }
  const first = marks[0];
  if (first === undefined) return { body: trimST(piece), attrs: [] };
  const attrs: Attr[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    if (mk === undefined) continue;
    const nx = marks[i + 1];
    attrs.push({ k: mk.kw, v: trimST(piece.slice(mk.kwEnd, nx === undefined ? piece.length : nx.start)) });
  }
  return { body: trimST(piece.slice(0, first.start)), attrs };
}

function parse(text: string): { dirs: Dir[]; strays: Stray[] } {
  const dirs: Dir[] = [];
  const strays: Stray[] = [];
  let cur: Dir | null = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n] ?? '';
    const lm = RE_LEAD.exec(line);
    const lead = lm === null ? '' : lm[0];
    const l = (lead.replace(RE_FEFF, '') + line.slice(lead.length)).replace(/[ \t]+$/, '');
    if (l === '') continue;
    const im = /^[ \t]*/.exec(l);
    const indent = im === null ? 0 : im[0].length;
    const content = l.slice(indent);
    if (content.startsWith('#')) {
      if (cur !== null) cur.comments.push(content.replace(/^#+[ \t]?/, ''));
      else strays.push({ line: n + 1, text: content });
      continue;
    }
    const sp = spans(content);
    let code = content;
    let tc: string | null = null;
    for (let k = 1; k < content.length; k++) {
      if (content.charAt(k) !== '#') continue;
      const pv = content.charAt(k - 1);
      if (pv !== ' ' && pv !== '\t') continue;
      const nx = content.charAt(k + 1);
      if (k + 1 < content.length && nx !== ' ' && nx !== '\t') continue;
      if (inSpan(sp, k)) continue;
      code = content.slice(0, k).replace(/[ \t]+$/, '');
      tc = trimST(content.slice(k + 1));
      break;
    }
    if (indent === 0) {
      const te = code.search(/[ \t]/);
      const tok = te < 0 ? code : code.slice(0, te);
      let name = tok;
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED') {
        const sa = splitAttrs(code.slice(tok.length));
        cur = { name, args: sa.body, pieces: [], attrs: sa.attrs, comments: tc !== null ? [tc] : [] };
        dirs.push(cur);
        continue;
      }
    }
    if (cur === null) {
      strays.push({ line: n + 1, text: content });
      continue;
    }
    const sa = splitAttrs(' ' + code);
    for (const a of sa.attrs) cur.attrs.push(a);
    if (sa.body !== '') cur.pieces.push(sa.body);
    if (tc !== null) cur.comments.push(tc);
  }
  return { dirs, strays };
}

function parts(d: Dir): string[] {
  return [d.args, ...d.pieces].filter((s) => s !== '');
}
function joined(d: Dir): string {
  return parts(d).join(d.name === 'TABLE' ? ' ' + NL + ' ' : ' ');
}
function rawOf(d: Dir): string {
  let r = parts(d).join(d.name === 'TABLE' ? '\n' : ' ');
  if (d.comments.length > 0) r += ' # ' + d.comments.join(' # ');
  return r;
}
function fields(s: string): string[] {
  return s.split(/[ \t]+/).filter((x) => x !== '');
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

type Row = { title: string; tested: boolean; pick: (ds: Dir[]) => Dir[]; label: (d: Dir) => string | null };

function byNames(names: string[]): (ds: Dir[]) => Dir[] {
  return (ds) => {
    const out: Dir[] = [];
    for (const nm of names) for (const d of ds) if (d.name === nm) out.push(d);
    return out;
  };
}
function fixed(m: ReadonlyMap<string, string>): (d: Dir) => string | null {
  return (d) => m.get(d.name) ?? null;
}
const noLabel = (): string | null => null;

const ROWS: Row[] = [
  { title: 'What kind of unit it is', tested: true, pick: byNames(['UNIT', 'KIND', 'FIDELITY', 'ANCHOR']),
    label: fixed(new Map([['UNIT', 'Name'], ['KIND', 'Kind'], ['FIDELITY', 'Fidelity'], ['ANCHOR', 'Anchor']])) },
  { title: 'What it is for', tested: false, pick: byNames(['DESCRIPTION']), label: noLabel },
  { title: 'What it accepts', tested: true, pick: byNames(['SIG', 'ENVELOPE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN']),
    label: fixed(new Map([['SIG', 'Signature'], ['ENVELOPE', 'Inputs it is verified on'],
      ['UNGUARDED-PRECONDITION', 'Assumes, without checking'], ['OUT-OF-DOMAIN', 'Not covered']])) },
  { title: 'What it does', tested: true, pick: (ds) => ds.filter((d) => /^R[0-9]+$/.test(d.name)),
    label: (d) => 'Rule ' + d.name.slice(1) },
  { title: 'Exact definitions', tested: true, pick: byNames(['PINNED']), label: noLabel },
  { title: 'Decision table', tested: true, pick: byNames(['TABLE']), label: noLabel },
  { title: 'Data it carries', tested: true, pick: byNames(['CARRIED']), label: (d) => fields(d.args)[0] ?? 'Carried data' },
  { title: 'What it depends on', tested: true, pick: byNames(['DEPENDS-ON']), label: noLabel },
  { title: 'Other parts of the contract', tested: true,
    pick: (ds) => ds.filter((d) => !NAMED.has(d.name) && !/^R[0-9]+$/.test(d.name)
      && (d.name !== 'BEHAVIOR' || joined(d) !== '' || d.attrs.length > 0)),
    label: (d) => {
      const o = OTHER_LABELS.get(d.name);
      if (o !== undefined) return o;
      return KNOWN_OTHER.has(d.name) ? d.name : d.name + ' (not in the SIR vocabulary)';
    } },
  { title: 'Text outside any directive', tested: true, pick: () => [], label: noLabel },
  { title: 'Should always hold', tested: false, pick: byNames(['INVARIANT']), label: noLabel },
  { title: 'In and out of scope', tested: false, pick: byNames(['SCOPE']), label: noLabel },
  { title: 'Background', tested: false, pick: byNames(['NOTE', 'RATIONALE', 'PROVENANCE']),
    label: fixed(new Map([['NOTE', 'Note'], ['RATIONALE', 'Why'], ['PROVENANCE', 'Where it came from']])) },
];

function citations(d: Dir): { rawCit: string[]; why: string[] } {
  const rawCit: string[] = [];
  const why: string[] = [];
  for (const a of d.attrs) {
    rawCit.push(a.v === '' ? a.k : a.k + ' ' + a.v);
    if (a.k === 'CITED') why.push(a.v === '' ? 'no reason given' : a.v);
    else if (a.k === 'EARNED') why.push(a.v === '' ? 'added after a failed test' : 'added after a failed test (' + a.v + ')');
    else why.push(a.v === '' ? 'anchored (no reference given)' : 'anchored to ' + a.v);
  }
  return { rawCit, why };
}

function buildItems(p: { dirs: Dir[]; strays: Stray[] }): Item[] {
  const items: Item[] = [];
  const counts = new Map<string, number>();
  const push = (section: string, tested: boolean, base: string, raw: string, text: string,
    rawCit: string[], why: string[], label: string | null): void => {
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    items.push({ section, tested, base, id: k === 1 ? base : base + ' #' + k, raw, text, rawCit, why, label });
  };
  for (const row of ROWS) {
    if (row.title === 'Text outside any directive') {
      for (const s of p.strays) push(row.title, row.tested, 'STRAY', s.text, s.text, [], [], 'Line ' + s.line);
      continue;
    }
    for (const d of row.pick(p.dirs)) {
      const c = citations(d);
      const raw = rawOf(d);
      if (d.name === 'PINNED') {
        const sp = spans(d.args);
        let eq = -1;
        for (let k = 0; k < d.args.length; k++) {
          if (d.args.charAt(k) === '=' && !inSpan(sp, k)) { eq = k; break; }
        }
        const head = eq < 0 ? d.args : d.args.slice(0, eq);
        const fs = fields(head);
        const kind = fs[0] ?? '';
        const name = fs[1] ?? '';
        const shown = eq < 0 ? joined(d)
          : [trimST(d.args.slice(eq + 1)), ...d.pieces].filter((s) => s !== '').join(' ');
        const phrase = PIN_KINDS.get(kind) ?? (kind !== '' ? kind : 'no kind');
        const empty = eq >= 0 && shown === '' ? ', empty value' : '';
        push(row.title, row.tested, name === '' ? 'PIN' : 'PIN:' + name, raw, shown, c.rawCit, c.why,
          (name === '' ? '(unnamed pin)' : name) + ' (' + phrase + empty + ')');
        continue;
      }
      let text = joined(d);
      if (d.name === 'DEPENDS-ON' && /^none$/i.test(text)) text = 'Nothing. No other package is involved.';
      push(row.title, row.tested, d.name, raw, text, c.rawCit, c.why, row.label(d));
    }
  }
  return items;
}

function wordDiff(a: string, b: string): Piece[] {
  const ta = a.split(/(\s+)/);
  const tb = b.split(/(\s+)/);
  const n = ta.length;
  const m = tb.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i++) L.push(new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => (L[i] ?? [])[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i];
    if (row === undefined) continue;
    for (let j = m - 1; j >= 0; j--) {
      row[j] = ta[i] === tb[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const e1: Piece[] = [];
  const emit = (op: '=' | '-' | '+', text: string): void => {
    const last = e1[e1.length - 1];
    if (last !== undefined && last.op === op) last.text += text;
    else e1.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const x = ta[i] ?? '';
    const y = tb[j] ?? '';
    if (x === y) { emit('=', x); i++; j++; }
    else if (at(i + 1, j) >= at(i, j + 1)) { emit('-', x); i++; }
    else { emit('+', y); j++; }
  }
  while (i < n) { emit('-', ta[i] ?? ''); i++; }
  while (j < m) { emit('+', tb[j] ?? ''); j++; }
  const out: Piece[] = [];
  let k = 0;
  while (k < e1.length) {
    const e = e1[k];
    if (e === undefined) break;
    if (e.op === '=') { out.push(e); k++; continue; }
    let del = '';
    let ins = '';
    let last = k;
    let q = k;
    while (q < e1.length) {
      const f = e1[q];
      if (f === undefined) break;
      if (f.op === '-') { del += f.text; last = q; }
      else if (f.op === '+') { ins += f.text; last = q; }
      else {
        const t = f.text.trim();
        const glue = q + 1 < e1.length && (t === '' || t.split(/\s+/).length <= 2);
        if (!glue) break;
        del += f.text;
        ins += f.text;
      }
      q++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = last + 1;
  }
  return out.filter((x) => x.text !== '');
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}
function equalItems(a: Item, b: Item): boolean {
  return a.raw === b.raw && sameList(a.rawCit, b.rawCit);
}

function header(p: { dirs: Dir[] }): { fid: string; ref: string | null } {
  let fid = '';
  const f = p.dirs.find((d) => d.name === 'FIDELITY' && joined(d) !== '');
  if (f !== undefined) fid = joined(f);
  else {
    const v = p.dirs.find((d) => d.name === 'VARIANT' && joined(d) !== '');
    if (v !== undefined) fid = joined(v);
  }
  const a = p.dirs.find((d) => d.name === 'ANCHOR' && joined(d) !== '');
  return { fid, ref: a === undefined ? null : (fields(joined(a))[0] ?? '') };
}

const LANG_NAMES: ReadonlyMap<string, string> = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['rust', 'Rust']]);

export function explain_diff(before: string, after: string, oracleChanged: boolean | null, langs: readonly string[]): Review {
  const pb = parse(before);
  const pa = parse(after);
  const ib = buildItems(pb);
  const ia = buildItems(pa);
  const gk = (it: Item): string => it.section + '\u0000' + it.id.replace(/ #[0-9]+$/, '');
  const groups = new Map<string, { b: Item[]; a: Item[] }>();
  const grp = (k: string): { b: Item[]; a: Item[] } => {
    let g = groups.get(k);
    if (g === undefined) { g = { b: [], a: [] }; groups.set(k, g); }
    return g;
  };
  for (const it of ib) grp(gk(it)).b.push(it);
  for (const it of ia) grp(gk(it)).a.push(it);
  const pairOf = new Map<Item, Item>();
  const unpairedBefore: Item[] = [];
  for (const g of groups.values()) {
    const usedA = new Set<Item>();
    const pairedB = new Set<Item>();
    for (const b of g.b) {
      const a = g.a.find((x) => !usedA.has(x) && equalItems(x, b));
      if (a !== undefined) { usedA.add(a); pairedB.add(b); pairOf.set(a, b); }
    }
    const lb = g.b.filter((x) => !pairedB.has(x));
    const la = g.a.filter((x) => !usedA.has(x));
    for (let i = 0; i < lb.length; i++) {
      const b = lb[i];
      const a = la[i];
      if (b === undefined) continue;
      if (a === undefined) unpairedBefore.push(b);
      else pairOf.set(a, b);
    }
  }
  const changes: Change[] = [];
  const tested: Array<{ c: Change; a: Item | null }> = [];
  const add = (c: Change, a: Item | null): void => {
    changes.push(c);
    if (c.checked) tested.push({ c, a });
  };
  for (const a of ia) {
    const b = pairOf.get(a);
    if (b === undefined) {
      add({ section: a.section, id: a.id, label: a.label ?? a.section, kind: 'added', checked: a.tested, text: a.text }, a);
    } else if (!equalItems(a, b)) {
      let diff = wordDiff(b.text, a.text);
      if (!diff.some((x) => x.op !== '=')) diff = wordDiff(b.raw, a.raw);
      const whyDiff = sameList(a.rawCit, b.rawCit) ? null : wordDiff(b.rawCit.join('; '), a.rawCit.join('; '));
      add({ section: a.section, id: a.id, label: a.label ?? a.section, kind: 'changed', checked: a.tested, diff, whyDiff }, a);
    }
  }
  for (const b of unpairedBefore) {
    add({ section: b.section, id: b.id, label: b.label ?? b.section, kind: 'removed', checked: b.tested, text: b.text }, b);
  }

  const warnings: Warning[] = [];
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((t) => t.c.kind));
    const verbs = (['changed', 'added', 'removed'] as const).filter((v) => kinds.has(v)).join(' or ');
    const labels: string[] = [];
    for (const t of tested) if (!labels.includes(t.c.label)) labels.push(t.c.label);
    warnings.push({ level: 'stop', kind: 'untested-change',
      text: N + (N === 1 ? ' tested part was ' : ' tested parts were ') + verbs + ' (' + labels.join(', ')
        + '), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.' });
  }
  const hb = header(pb);
  const ha = header(pa);
  if (hb.fid === 'package' || ha.fid === 'package') {
    const refs: string[] = [];
    for (const r of [hb.ref, ha.ref]) if (r !== null && r.includes('@')) refs.push(r);
    const citing: Array<{ label: string; why: string }> = [];
    for (const t of tested) {
      if (t.c.kind !== 'changed' || t.a === null) continue;
      const idx = t.a.rawCit.findIndex((e) => e.includes('FIDELITY package')
        || fields(e).some((tok) => refs.includes(tok.replace(/[.,;:)\]]+$/, ''))));
      if (idx >= 0) citing.push({ label: t.c.label, why: t.a.why[idx] ?? '' });
    }
    const first = citing[0];
    if (first !== undefined) {
      let q = first.why;
      const pre = 'FIDELITY package ' + DASH + ' ';
      if (q.startsWith(pre)) q = q.slice(pre.length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join('') + ELL;
      warnings.push({ level: 'stop', kind: 'citation',
        text: 'This contract promises to match the original package exactly, and ' + citing.map((c) => c.label).join(' and ')
          + ' still ' + (citing.length === 1 ? 'cites' : 'cite') + ' that package as the reason for the old behavior ("'
          + q + '"). The edit contradicts its own citation.' });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: 'ok', kind: 'prose-only',
      text: 'Only unchecked prose changed. The code is held to exactly what it was held to before.' });
  }
  const stale: string[] = [];
  for (const l of langs) if (l !== '' && !stale.includes(l)) stale.push(l);
  if (N > 0 && stale.length > 0) {
    const names = stale.map((l) => LANG_NAMES.get(l) ?? l).join(', ');
    warnings.push({ level: 'note', kind: 'stale-langs',
      text: 'The ' + names + (stale.length === 1
        ? ' file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it.'
        : ' files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.') });
  }

  let unit = '(unnamed)';
  const u = pa.dirs.find((d) => d.name === 'UNIT' && joined(d) !== '');
  if (u !== undefined) unit = joined(u);
  else {
    const s = pa.dirs.find((d) => d.name === 'SIR' && joined(d) !== '');
    if (s !== undefined) unit = joined(s);
  }
  return { unit, changes, warnings };
}
