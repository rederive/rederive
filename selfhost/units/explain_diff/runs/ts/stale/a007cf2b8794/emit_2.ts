type Piece = { op: '=' | '-' | '+'; text: string };
type Change = { section: string; id: string; label: string; kind: 'changed' | 'added' | 'removed'; checked: boolean;
  text?: string; diff?: Piece[]; whyDiff?: Piece[] | null };
type Warning = { level: 'stop' | 'ok' | 'note'; kind: string; text: string };
type Review = { unit: string; changes: Change[]; warnings: Warning[] };

type Attr = { kw: string; value: string };
type Directive = { name: string; args: string; pieces: string[]; attrs: Attr[] };
type Item = { section: string; tested: boolean; id: string; label: string | null; raw: string; text: string;
  cites: string[]; why: string[] };
type Row = { match: (d: Directive) => boolean; label: (d: Directive) => string | null };
type Section = { title: string; tested: boolean; rows: Row[] };

const OPENERS: ReadonlySet<string> = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);

function trimST(s: string): string {
  return s.replace(/^[ \t]+|[ \t]+$/g, '');
}

function quotedSpans(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let lastEnd = -1;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1] ?? '') || i === lastEnd)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        } else if (c === '"') {
          close = j;
          break;
        } else {
          j++;
        }
      }
      if (close < 0) break;
      out.push([i, close]);
      i = close + 1;
      lastEnd = i;
    } else {
      i++;
    }
  }
  return out;
}

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const spans = quotedSpans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks: Array<{ start: number; kw: string; vstart: number }> = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const kwStart = m.index + m[0].length - (m[1] ?? '').length;
    const inside = spans.some((sp) => sp[0] < kwStart && kwStart < sp[1]);
    if (!inside) marks.push({ start: m.index, kw: m[1] ?? '', vstart: m.index + m[0].length });
    m = re.exec(piece);
  }
  const first = marks[0];
  if (first === undefined) return { body: trimST(piece), attrs: [] };
  const attrs: Attr[] = [];
  for (let k = 0; k < marks.length; k++) {
    const mk = marks[k];
    if (mk === undefined) continue;
    const nx = marks[k + 1];
    attrs.push({ kw: mk.kw, value: trimST(piece.slice(mk.vstart, nx === undefined ? piece.length : nx.start)) });
  }
  return { body: trimST(piece.slice(0, first.start)), attrs };
}

function parse(text: string): Directive[] {
  const dirs: Directive[] = [];
  let cur: Directive | null = null;
  const leadRe = new RegExp('^[ \\t\\uFEFF]*');
  const bomRe = new RegExp('\\uFEFF', 'g');
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const lm = leadRe.exec(rawLine);
    const leadLen = lm === null ? 0 : lm[0].length;
    const lead = (lm === null ? '' : lm[0]).replace(bomRe, '');
    const line = (lead + rawLine.slice(leadLen)).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = (/^[ \t]*/.exec(line) ?? [''])[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const spans = quotedSpans(content);
    let cut = -1;
    for (let i = 1; i < content.length; i++) {
      if (content[i] !== '#') continue;
      const p = content[i - 1];
      if (p !== ' ' && p !== '\t') continue;
      const n = content[i + 1];
      if (n !== undefined && n !== ' ' && n !== '\t') continue;
      if (spans.some((sp) => sp[0] < i && i < sp[1])) continue;
      cut = i;
      break;
    }
    const code = cut < 0 ? content : content.slice(0, cut).replace(/[ \t]+$/, '');
    let isDir = false;
    let name = '';
    let rest = '';
    if (indent === '') {
      const sp = code.search(/[ \t]/);
      name = sp < 0 ? code : code.slice(0, sp);
      rest = sp < 0 ? '' : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      isDir = /^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED';
    }
    if (isDir) {
      const r = splitAttrs(rest);
      cur = { name, args: r.body, pieces: [], attrs: r.attrs.slice() };
      dirs.push(cur);
    } else if (cur !== null) {
      const r = splitAttrs(' ' + code);
      for (const a of r.attrs) cur.attrs.push(a);
      if (r.body !== '') cur.pieces.push(r.body);
    }
  }
  return dirs;
}

function joined(d: Directive): string {
  return [d.args, ...d.pieces].filter((x) => x !== '').join(' ');
}

function fields(s: string): string[] {
  return s.split(/[ \t]+/).filter((x) => x !== '');
}

const RANGE = new RegExp('\\bR(\\d+)\\s*[-\\u2013]\\s*R?(\\d+)\\b', 'g');
const SINGLE = /\bR(\d+)\b/g;

function readable(s: string): string {
  return s.replace(RANGE, 'rules $1–$2').replace(SINGLE, 'rule $1');
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

const KNOWN_OTHER: ReadonlySet<string> = new Set([
  'SIR', 'VARIANT', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'CARRIED-DATA', 'NOTES', 'GUARD-PINNED', 'LANG',
  'PRIMARY-SHA256', 'ABI', 'MECHANISM',
]);

function named(n: string): Row {
  return { match: (d) => d.name === n, label: () => null };
}
function namedL(n: string, l: string): Row {
  return { match: (d) => d.name === n, label: () => l };
}

const NAMED_ELSEWHERE: ReadonlySet<string> = new Set([
  'UNIT', 'KIND', 'FIDELITY', 'ANCHOR', 'DESCRIPTION', 'SIG', 'ENVELOPE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN',
  'PINNED', 'TABLE', 'CARRIED', 'DEPENDS-ON', 'INVARIANT', 'SCOPE', 'NOTE', 'RATIONALE', 'PROVENANCE',
]);

function pinParts(d: Directive): { kind: string; name: string; value: string } {
  const eq = d.args.indexOf('=');
  const head = eq < 0 ? d.args : d.args.slice(0, eq);
  const value = eq < 0 ? '' : d.args.slice(eq + 1);
  const f = fields(head);
  return { kind: (f[0] ?? '').trim(), name: (f[1] ?? '').trim(), value };
}

const SECTIONS: Section[] = [
  { title: 'What kind of unit it is', tested: true,
    rows: [namedL('UNIT', 'Name'), namedL('KIND', 'Kind'), namedL('FIDELITY', 'Fidelity'), namedL('ANCHOR', 'Anchor')] },
  { title: 'What it is for', tested: false, rows: [named('DESCRIPTION')] },
  { title: 'What it accepts', tested: true,
    rows: [namedL('SIG', 'Signature'), namedL('ENVELOPE', 'Inputs it is verified on'),
      namedL('UNGUARDED-PRECONDITION', 'Assumes, without checking'), namedL('OUT-OF-DOMAIN', 'Not covered')] },
  { title: 'What it does', tested: true,
    rows: [{ match: (d) => /^R[0-9]+$/.test(d.name), label: (d) => 'Rule ' + d.name.slice(1) }] },
  { title: 'Exact definitions', tested: true,
    rows: [{ match: (d) => d.name === 'PINNED',
      label: (d) => {
        const p = pinParts(d);
        const phrase = PIN_KINDS.get(p.kind) ?? (p.kind !== '' ? p.kind : 'no kind');
        return (p.name !== '' ? p.name : '(unnamed pin)') + ' (' + phrase + ')';
      } }] },
  { title: 'Decision table', tested: true, rows: [named('TABLE')] },
  { title: 'Data it carries', tested: true,
    rows: [{ match: (d) => d.name === 'CARRIED', label: (d) => fields(d.args)[0] ?? 'Carried data' }] },
  { title: 'What it depends on', tested: true, rows: [named('DEPENDS-ON')] },
  { title: 'Other parts of the contract', tested: true,
    rows: [{ match: (d) => !NAMED_ELSEWHERE.has(d.name) && !/^R[0-9]+$/.test(d.name)
        && !(d.name === 'BEHAVIOR' && joined(d) === '' && d.attrs.length === 0),
      label: (d) => {
        const l = OTHER_LABELS.get(d.name);
        if (l !== undefined) return l;
        return KNOWN_OTHER.has(d.name) ? d.name : d.name + ' (not in the SIR vocabulary)';
      } }] },
  { title: 'Should always hold', tested: false, rows: [named('INVARIANT')] },
  { title: 'In and out of scope', tested: false, rows: [named('SCOPE')] },
  { title: 'Background', tested: false,
    rows: [namedL('NOTE', 'Note'), namedL('RATIONALE', 'Why'), namedL('PROVENANCE', 'Where it came from')] },
];

function buildItems(text: string): { items: Item[]; dirs: Directive[] } {
  const dirs = parse(text);
  const items: Item[] = [];
  const counts = new Map<string, number>();
  for (const sec of SECTIONS) {
    for (const row of sec.rows) {
      for (const d of dirs) {
        if (!row.match(d)) continue;
        const raw = joined(d);
        let shown = raw;
        let base = d.name;
        if (d.name === 'PINNED') {
          const p = pinParts(d);
          shown = [p.value.trim(), ...d.pieces].filter((x) => x !== '').join(' ');
          base = p.name === '' ? 'PIN' : 'PIN:' + p.name;
        } else if (d.name === 'DEPENDS-ON' && /^[Nn][Oo][Nn][Ee]$/.test(raw)) {
          shown = 'Nothing. No other package is involved.';
        }
        const k = (counts.get(base) ?? 0) + 1;
        counts.set(base, k);
        const cites: string[] = [];
        const why: string[] = [];
        for (const a of d.attrs) {
          cites.push(a.value === '' ? a.kw : a.kw + ' ' + a.value);
          let w = a.value;
          if (a.kw === 'EARNED') w = 'added after a failed test (' + a.value + ')';
          else if (a.kw === 'ANCHOR') w = 'anchored to ' + a.value;
          why.push(readable(w));
        }
        items.push({ section: sec.title, tested: sec.tested, id: k === 1 ? base : base + ' #' + k,
          label: row.label(d), raw, text: readable(shown), cites, why });
      }
    }
  }
  return { items, dirs };
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function tokens(s: string): string[] {
  return s.split(/(\s+)/);
}

function diff(a: string, b: string): Piece[] {
  const x = tokens(a);
  const y = tokens(b);
  const n = x.length;
  const m = y.length;
  const t: number[][] = [];
  for (let i = 0; i <= n; i++) t.push(new Array<number>(m + 1).fill(0));
  const at = (i: number, j: number): number => (t[i] ?? [])[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const rowI = t[i];
    if (rowI === undefined) continue;
    for (let j = m - 1; j >= 0; j--) {
      rowI[j] = x[i] === y[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const s1: Piece[] = [];
  const push = (op: '=' | '-' | '+', text: string): void => {
    const last = s1[s1.length - 1];
    if (last !== undefined && last.op === op) last.text += text;
    else s1.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const xi = x[i] ?? '';
    const yj = y[j] ?? '';
    if (xi === yj) {
      push('=', xi);
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      push('-', xi);
      i++;
    } else {
      push('+', yj);
      j++;
    }
  }
  while (i < n) push('-', x[i++] ?? '');
  while (j < m) push('+', y[j++] ?? '');
  const out: Piece[] = [];
  let p = 0;
  while (p < s1.length) {
    const e = s1[p];
    if (e === undefined) break;
    if (e.op === '=') {
      out.push({ op: '=', text: e.text });
      p++;
      continue;
    }
    let del = '';
    let ins = '';
    let last = p;
    let q = p;
    while (q < s1.length) {
      const f = s1[q];
      if (f === undefined) break;
      if (f.op === '-') {
        del += f.text;
        last = q;
        q++;
      } else if (f.op === '+') {
        ins += f.text;
        last = q;
        q++;
      } else {
        const tr = f.text.trim();
        const glue = q + 1 < s1.length && (tr === '' || tr.split(/\s+/).length <= 2);
        if (!glue) break;
        del += f.text;
        ins += f.text;
        q++;
      }
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    p = last + 1;
  }
  return out.filter((e) => e.text !== '');
}

function groupKey(it: Item): string {
  return it.section + '\n' + it.id.replace(/ #\d+$/, '');
}

function firstArgs(dirs: Directive[], name: string): Directive | undefined {
  return dirs.find((d) => d.name === name);
}

export function explain_diff(before: string, after: string, oracleChanged: boolean | null, langs: readonly string[]): Review {
  const B = buildItems(before);
  const A = buildItems(after);
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const it of [...B.items, ...A.items]) {
    const k = groupKey(it);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
  }
  const pairOf = new Map<Item, Item>();
  const pairedA = new Set<Item>();
  const unpairedBefore: Item[] = [];
  for (const k of keys) {
    const bs = B.items.filter((it) => groupKey(it) === k);
    const as = A.items.filter((it) => groupKey(it) === k);
    const left: Item[] = [];
    for (const b of bs) {
      const a = as.find((c) => !pairedA.has(c) && c.raw === b.raw && sameList(c.cites, b.cites));
      if (a !== undefined) {
        pairedA.add(a);
        pairOf.set(a, b);
      } else {
        left.push(b);
      }
    }
    const leftA = as.filter((c) => !pairedA.has(c));
    let ai = 0;
    for (const b of left) {
      const a = leftA[ai];
      if (a !== undefined) {
        ai++;
        pairedA.add(a);
        pairOf.set(a, b);
      } else {
        unpairedBefore.push(b);
      }
    }
  }
  const unitDir = firstArgs(A.dirs, 'UNIT');
  const unit = unitDir === undefined || unitDir.args === '' ? '(unnamed)' : unitDir.args;

  const changes: Change[] = [];
  const afterOf: Array<Item | null> = [];
  const mk = (it: Item, kind: 'changed' | 'added' | 'removed'): Change => ({
    section: it.section, id: it.id, label: it.label ?? it.section, kind, checked: it.tested,
  });
  for (const a of A.items) {
    const b = pairOf.get(a);
    if (b === undefined) {
      const c = mk(a, 'added');
      c.text = a.text;
      changes.push(c);
      afterOf.push(a);
    } else if (!(a.raw === b.raw && sameList(a.cites, b.cites))) {
      const c = mk(a, 'changed');
      let d = diff(b.text, a.text);
      if (!d.some((e) => e.op !== '=')) d = diff(b.raw, a.raw);
      c.diff = d;
      c.whyDiff = sameList(a.cites, b.cites) ? null : diff(b.cites.join('; '), a.cites.join('; '));
      changes.push(c);
      afterOf.push(a);
    }
  }
  for (const b of unpairedBefore) {
    const c = mk(b, 'removed');
    c.text = b.text;
    changes.push(c);
    afterOf.push(null);
  }

  const warnings: Warning[] = [];
  const tested: Array<{ c: Change; a: Item | null }> = [];
  changes.forEach((c, i) => {
    if (c.checked) tested.push({ c, a: afterOf[i] ?? null });
  });
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((t) => t.c.kind));
    const verbs = (['changed', 'added', 'removed'] as const).filter((v) => kinds.has(v)).join(' or ');
    const labels: string[] = [];
    for (const t of tested) if (!labels.includes(t.c.label)) labels.push(t.c.label);
    warnings.push({ level: 'stop', kind: 'untested-change',
      text: String(N) + (N === 1 ? ' tested part was ' : ' tested parts were ') + verbs + ' (' + labels.join(', ')
        + '), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.' });
  }
  const fb = firstArgs(B.dirs, 'FIDELITY');
  const fa = firstArgs(A.dirs, 'FIDELITY');
  if ((fb !== undefined && fb.args === 'package') || (fa !== undefined && fa.args === 'package')) {
    const refs: string[] = [];
    for (const dirs of [B.dirs, A.dirs]) {
      const an = firstArgs(dirs, 'ANCHOR');
      if (an === undefined) continue;
      const r = fields(an.args)[0];
      if (r !== undefined && r.includes('@')) refs.push(r);
    }
    const citing: Array<{ label: string; why: string }> = [];
    for (const t of tested) {
      if (t.c.kind !== 'changed' || t.a === null) continue;
      const cites = t.a.cites;
      const idx = cites.findIndex((ct) => ct.includes('FIDELITY package')
        || fields(ct).some((tok) => refs.includes(tok.replace(/[.,;:)\]]+$/, ''))));
      if (idx >= 0) citing.push({ label: t.c.label, why: t.a.why[idx] ?? '' });
    }
    const first = citing[0];
    if (first !== undefined) {
      const pre = 'FIDELITY package — ';
      let q = first.why.startsWith(pre) ? first.why.slice(pre.length) : first.why;
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join('') + '…';
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
    const names: ReadonlyMap<string, string> = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['rust', 'Rust']]);
    const list = stale.map((l) => names.get(l) ?? l).join(', ');
    warnings.push({ level: 'note', kind: 'stale-langs',
      text: 'The ' + list + (stale.length === 1
        ? ' file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it.'
        : ' files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.') });
  }
  return { unit, changes, warnings };
}
