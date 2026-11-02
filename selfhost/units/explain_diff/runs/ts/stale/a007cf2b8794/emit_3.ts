type Piece = { op: '=' | '-' | '+'; text: string };
type Change = { section: string; id: string; label: string; kind: 'changed' | 'added' | 'removed'; checked: boolean;
  text?: string; diff?: Piece[]; whyDiff?: Piece[] | null };
type Warning = { level: 'stop' | 'ok' | 'note'; kind: string; text: string };
type Review = { unit: string; changes: Change[]; warnings: Warning[] };

type Attr = { kw: string; val: string };
type Dir = { name: string; args: string; pieces: string[]; attrs: Attr[] };
type Item = { section: string; tested: boolean; id: string; label: string | null; raw: string; text: string;
  cit: string[]; why: string[]; group: string };

const OPENERS: ReadonlySet<string> = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const FEFF = String.fromCharCode(0xfeff);
const RANGE = new RegExp('\\bR(\\d+)\\s*[-\\u2013]\\s*R?(\\d+)\\b', 'g');
const SINGLE = /\bR(\d+)\b/g;
const REF_TAIL = /[.,;:)\]]+$/;
const ATTR_KW: ReadonlySet<string> = new Set(['CITED', 'EARNED', 'ANCHOR']);

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
  'NOTES', 'GUARD-PINNED', 'LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM']);
const LANG_NAMES: ReadonlyMap<string, string> = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['rust', 'Rust']]);

function trimST(s: string): string { return s.replace(/^[ \t]+|[ \t]+$/g, ''); }

function quotedSpans(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let i = 0;
  let prevClose = -2;
  while (i < s.length) {
    if (s[i] === '"' && (i === 0 || OPENERS.has(s[i - 1]) || i === prevClose + 1)) {
      let j = i + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        } else if (c === '"') { close = j; break; } else j++;
      }
      if (close < 0) break;
      spans.push([i, close]);
      prevClose = close;
      i = close + 1;
    } else i++;
  }
  return spans;
}

function inside(spans: Array<[number, number]>, pos: number): boolean {
  return spans.some((sp) => sp[0] < pos && pos < sp[1]);
}

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const spans = quotedSpans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks: Array<{ start: number; vstart: number; kw: string }> = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const kwStart = m.index + m[0].length - m[1].length;
    if (!inside(spans, kwStart)) marks.push({ start: m.index, vstart: m.index + m[0].length, kw: m[1] });
    m = re.exec(piece);
  }
  if (marks.length === 0) return { body: trimST(piece), attrs: [] };
  const attrs: Attr[] = [];
  for (let k = 0; k < marks.length; k++) {
    const end = k + 1 < marks.length ? marks[k + 1].start : piece.length;
    attrs.push({ kw: marks[k].kw, val: trimST(piece.slice(marks[k].vstart, end)) });
  }
  return { body: trimST(piece.slice(0, marks[0].start)), attrs };
}

function parse(text: string): Dir[] {
  const dirs: Dir[] = [];
  let cur: Dir | null = null;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    let p = 0;
    while (p < raw.length && (raw[p] === ' ' || raw[p] === '\t' || raw[p] === FEFF)) p++;
    const full = (raw.slice(0, p).split(FEFF).join('') + raw.slice(p)).replace(/[ \t]+$/, '');
    if (full === '') continue;
    let q = 0;
    while (q < full.length && (full[q] === ' ' || full[q] === '\t')) q++;
    const content = full.slice(q);
    if (content[0] === '#') continue;
    const spans = quotedSpans(content);
    let cut = content.length;
    for (let k = 1; k < content.length; k++) {
      if (content[k] === '#' && (content[k - 1] === ' ' || content[k - 1] === '\t')
        && (k + 1 === content.length || content[k + 1] === ' ' || content[k + 1] === '\t') && !inside(spans, k)) {
        cut = k;
        break;
      }
    }
    const code = content.slice(0, cut).replace(/[ \t]+$/, '');
    let startsDir = false;
    let name = '';
    let rest = '';
    if (q === 0) {
      const sp = code.search(/[ \t]/);
      name = sp < 0 ? code : code.slice(0, sp);
      rest = sp < 0 ? '' : code.slice(sp);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      startsDir = /^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED';
    }
    if (startsDir) {
      const sa = splitAttrs(rest);
      cur = { name, args: sa.body, pieces: [], attrs: sa.attrs };
      dirs.push(cur);
    } else if (cur !== null) {
      const sa = splitAttrs(' ' + code);
      for (const a of sa.attrs) cur.attrs.push(a);
      if (sa.body !== '') cur.pieces.push(sa.body);
    }
  }
  return dirs;
}

function human(s: string): string {
  return s.replace(RANGE, 'rules $1–$2').replace(SINGLE, 'rule $1');
}

function joined(d: Dir): string {
  return [d.args, ...d.pieces].filter((x) => x !== '').join(' ');
}

type Sel = { test: (n: string) => boolean; label: (d: Dir) => string | null };
const is = (n: string) => (x: string): boolean => x === n;
const lab = (s: string) => (): string | null => s;
const none = (): string | null => null;
const NAMED_ELSEWHERE: ReadonlySet<string> = new Set(['UNIT', 'KIND', 'FIDELITY', 'ANCHOR', 'DESCRIPTION', 'SIG', 'ENVELOPE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'PINNED', 'TABLE', 'CARRIED', 'DEPENDS-ON', 'INVARIANT', 'SCOPE', 'NOTE',
  'RATIONALE', 'PROVENANCE']);
const SECTIONS: Array<{ title: string; tested: boolean; sels: Sel[] }> = [
  { title: 'What kind of unit it is', tested: true, sels: [
    { test: is('UNIT'), label: lab('Name') }, { test: is('KIND'), label: lab('Kind') },
    { test: is('FIDELITY'), label: lab('Fidelity') }, { test: is('ANCHOR'), label: lab('Anchor') }] },
  { title: 'What it is for', tested: false, sels: [{ test: is('DESCRIPTION'), label: none }] },
  { title: 'What it accepts', tested: true, sels: [
    { test: is('SIG'), label: lab('Signature') }, { test: is('ENVELOPE'), label: lab('Inputs it is verified on') },
    { test: is('UNGUARDED-PRECONDITION'), label: lab('Assumes, without checking') },
    { test: is('OUT-OF-DOMAIN'), label: lab('Not covered') }] },
  { title: 'What it does', tested: true, sels: [
    { test: (n) => /^R[0-9]+$/.test(n), label: (d) => 'Rule ' + d.name.slice(1) }] },
  { title: 'Exact definitions', tested: true, sels: [{ test: is('PINNED'), label: () => null }] },
  { title: 'Decision table', tested: true, sels: [{ test: is('TABLE'), label: none }] },
  { title: 'Data it carries', tested: true, sels: [{ test: is('CARRIED'), label: (d) => {
    const f = d.args.split(/[ \t]+/).filter((x) => x !== '');
    return f.length > 0 ? f[0] : 'Carried data';
  } }] },
  { title: 'What it depends on', tested: true, sels: [{ test: is('DEPENDS-ON'), label: none }] },
  { title: 'Other parts of the contract', tested: true, sels: [{
    test: (n) => !NAMED_ELSEWHERE.has(n) && !/^R[0-9]+$/.test(n),
    label: (d) => {
      const o = OTHER_LABELS.get(d.name);
      if (o !== undefined) return o;
      return KNOWN_OTHER.has(d.name) ? d.name : d.name + ' (not in the SIR vocabulary)';
    } }] },
  { title: 'Should always hold', tested: false, sels: [{ test: is('INVARIANT'), label: none }] },
  { title: 'In and out of scope', tested: false, sels: [{ test: is('SCOPE'), label: none }] },
  { title: 'Background', tested: false, sels: [
    { test: is('NOTE'), label: lab('Note') }, { test: is('RATIONALE'), label: lab('Why') },
    { test: is('PROVENANCE'), label: lab('Where it came from') }] },
];

function items(text: string): Item[] {
  const dirs = parse(text);
  const out: Item[] = [];
  const counts = new Map<string, number>();
  for (const sec of SECTIONS) {
    for (const sel of sec.sels) {
      for (const d of dirs) {
        if (!sel.test(d.name)) continue;
        const raw = joined(d);
        if (d.name === 'BEHAVIOR' && raw === '' && d.attrs.length === 0) continue;
        let base = d.name;
        let label = sel.label(d);
        let shown = raw;
        if (d.name === 'PINNED') {
          const eq = d.args.indexOf('=');
          const head = eq < 0 ? d.args : d.args.slice(0, eq);
          const val = eq < 0 ? '' : d.args.slice(eq + 1);
          const f = head.split(/[ \t]+/).filter((x) => x !== '');
          const kind = f.length > 0 ? f[0].trim() : '';
          const name = f.length > 1 ? f[1].trim() : '';
          const phrase = kind === '' ? 'no kind' : (PIN_KINDS.get(kind) ?? kind);
          base = name === '' ? 'PIN' : 'PIN:' + name;
          label = (name === '' ? '(unnamed pin)' : name) + ' (' + phrase + ')';
          shown = [val.trim(), ...d.pieces].filter((x) => x !== '').join(' ');
        } else if (d.name === 'DEPENDS-ON' && /^none$/i.test(raw)) {
          shown = 'Nothing. No other package is involved.';
        }
        const k = (counts.get(base) ?? 0) + 1;
        counts.set(base, k);
        const id = k === 1 ? base : base + ' #' + String(k);
        const cit: string[] = [];
        const why: string[] = [];
        for (const a of d.attrs) {
          if (!ATTR_KW.has(a.kw)) continue;
          cit.push(a.val === '' ? a.kw : a.kw + ' ' + a.val);
          const w = a.kw === 'CITED' ? a.val : a.kw === 'EARNED' ? 'added after a failed test (' + a.val + ')' : 'anchored to ' + a.val;
          why.push(human(w));
        }
        out.push({ section: sec.title, tested: sec.tested, id, label, raw, text: human(shown), cit, why,
          group: sec.title + '\n' + id.replace(/ #[0-9]+$/, '') });
      }
    }
  }
  return out;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function diff(a: string, b: string): Piece[] {
  const x = a.split(/(\s+)/);
  const y = b.split(/(\s+)/);
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
    const last = s1.length > 0 ? s1[s1.length - 1] : undefined;
    if (last !== undefined && last.op === op) last.text += text;
    else s1.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { emit('=', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) { emit('-', x[i]); i++; } else { emit('+', y[j]); j++; }
  }
  while (i < n) { emit('-', x[i]); i++; }
  while (j < m) { emit('+', y[j]); j++; }
  const out: Piece[] = [];
  let k = 0;
  while (k < s1.length) {
    const e = s1[k];
    if (e.op === '=') { out.push({ op: '=', text: e.text }); k++; continue; }
    let del = '';
    let ins = '';
    let lastChange = k;
    let p = k;
    while (p < s1.length) {
      const f = s1[p];
      if (f.op === '-') { del += f.text; lastChange = p; } else if (f.op === '+') { ins += f.text; lastChange = p; } else {
        const t = f.text.trim();
        const glue = p + 1 < s1.length && (t === '' || t.split(/\s+/).length <= 2);
        if (!glue) break;
        del += f.text;
        ins += f.text;
      }
      p++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = lastChange + 1;
  }
  return out.filter((e) => e.text !== '');
}

function firstArgs(dirs: Dir[], name: string): Dir | undefined {
  return dirs.find((d) => d.name === name);
}

export function explain_diff(before: string, after: string, oracleChanged: boolean | null, langs: readonly string[]): Review {
  const bItems = items(before);
  const aItems = items(after);
  const groups = new Map<string, { b: Item[]; a: Item[] }>();
  const grp = (key: string): { b: Item[]; a: Item[] } => {
    let g = groups.get(key);
    if (g === undefined) { g = { b: [], a: [] }; groups.set(key, g); }
    return g;
  };
  for (const it of bItems) grp(it.group).b.push(it);
  for (const it of aItems) grp(it.group).a.push(it);
  const pairOf = new Map<Item, Item>();
  const unpairedBefore: Item[] = [];
  for (const g of groups.values()) {
    const usedA = new Set<Item>();
    const usedB = new Set<Item>();
    for (const b of g.b) {
      const a = g.a.find((c) => !usedA.has(c) && c.raw === b.raw && sameList(c.cit, b.cit));
      if (a !== undefined) { usedA.add(a); usedB.add(b); pairOf.set(a, b); }
    }
    const bl = g.b.filter((c) => !usedB.has(c));
    const al = g.a.filter((c) => !usedA.has(c));
    const common = Math.min(bl.length, al.length);
    for (let i = 0; i < common; i++) pairOf.set(al[i], bl[i]);
    for (let i = common; i < bl.length; i++) unpairedBefore.push(bl[i]);
  }
  const changes: Change[] = [];
  const afterOf: Array<Item | null> = [];
  for (const a of aItems) {
    const b = pairOf.get(a);
    const label = a.label ?? a.section;
    if (b === undefined) {
      changes.push({ section: a.section, id: a.id, label, kind: 'added', checked: a.tested, text: a.text });
      afterOf.push(null);
    } else if (!(a.raw === b.raw && sameList(a.cit, b.cit))) {
      let d = diff(b.text, a.text);
      if (!d.some((e) => e.op !== '=')) d = diff(b.raw, a.raw);
      const whyDiff = sameList(a.cit, b.cit) ? null : diff(b.cit.join('; '), a.cit.join('; '));
      changes.push({ section: a.section, id: a.id, label, kind: 'changed', checked: a.tested, diff: d, whyDiff });
      afterOf.push(a);
    }
  }
  for (const b of unpairedBefore) {
    changes.push({ section: b.section, id: b.id, label: b.label ?? b.section, kind: 'removed', checked: b.tested, text: b.text });
    afterOf.push(null);
  }

  const aDirs = parse(after);
  const bDirs = parse(before);
  const unitDir = firstArgs(aDirs, 'UNIT');
  const unit = unitDir === undefined || unitDir.args === '' ? '(unnamed)' : unitDir.args;

  const warnings: Warning[] = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((c) => c.kind));
    const verbs = (['changed', 'added', 'removed'] as const).filter((v) => kinds.has(v)).join(' or ');
    const labels: string[] = [];
    for (const c of tested) if (!labels.includes(c.label)) labels.push(c.label);
    warnings.push({ level: 'stop', kind: 'untested-change',
      text: String(N) + (N === 1 ? ' tested part was ' : ' tested parts were ') + verbs + ' (' + labels.join(', ')
        + '), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.' });
  }
  const fb = firstArgs(bDirs, 'FIDELITY');
  const fa = firstArgs(aDirs, 'FIDELITY');
  if ((fb !== undefined && fb.args === 'package') || (fa !== undefined && fa.args === 'package')) {
    const refs: string[] = [];
    for (const dirs of [bDirs, aDirs]) {
      const an = firstArgs(dirs, 'ANCHOR');
      if (an === undefined) continue;
      const f = an.args.split(/[ \t]+/).filter((x) => x !== '');
      if (f.length > 0 && f[0].includes('@')) refs.push(f[0]);
    }
    const citing: Array<{ label: string; why: string }> = [];
    changes.forEach((c, idx) => {
      const a = afterOf[idx];
      if (!c.checked || c.kind !== 'changed' || a === null || a === undefined) return;
      const pos = a.cit.findIndex((e) => e.includes('FIDELITY package')
        || e.split(/[ \t]+/).some((tok) => refs.includes(tok.replace(REF_TAIL, '')) && tok.replace(REF_TAIL, '') !== ''));
      if (pos >= 0) citing.push({ label: c.label, why: a.why[pos] });
    });
    if (citing.length > 0) {
      let q = citing[0].why;
      const lead = 'FIDELITY package — ';
      if (q.startsWith(lead)) q = q.slice(lead.length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join('') + '…';
      warnings.push({ level: 'stop', kind: 'citation',
        text: 'This contract promises to match the original package exactly, and ' + citing.map((c) => c.label).join(' and ')
          + ' still ' + (citing.length === 1 ? 'cites' : 'cite') + ' that package as the reason for the old behavior ("' + q
          + '"). The edit contradicts its own citation.' });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: 'ok', kind: 'prose-only', text: 'Only unchecked prose changed. The code is held to exactly what it was held to before.' });
  }
  const stale: string[] = [];
  for (const l of langs) if (l !== '' && !stale.includes(l)) stale.push(l);
  if (N > 0 && stale.length > 0) {
    const names = stale.map((l) => LANG_NAMES.get(l) ?? l).join(', ');
    const tail = stale.length === 1
      ? ' file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it.'
      : ' files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.';
    warnings.push({ level: 'note', kind: 'stale-langs', text: 'The ' + names + tail });
  }
  return { unit, changes, warnings };
}
