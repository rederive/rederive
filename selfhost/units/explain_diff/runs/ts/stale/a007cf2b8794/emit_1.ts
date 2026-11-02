type Piece = { op: '=' | '-' | '+'; text: string };
type Change = { section: string; id: string; label: string; kind: 'changed' | 'added' | 'removed'; checked: boolean;
  text?: string; diff?: Piece[]; whyDiff?: Piece[] | null };
type Warning = { level: 'stop' | 'ok' | 'note'; kind: string; text: string };
type Review = { unit: string; changes: Change[]; warnings: Warning[] };

type Attr = { k: string; v: string };
type Dir = { name: string; args: string; conts: string[]; attrs: Attr[] };
type Item = { section: string; tested: boolean; id: string; label: string | null; raw: string; text: string;
  cites: string[]; why: string[] };

const OPENERS = ' \t([{,=:;|<>!&-~';
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const RANGE = new RegExp('\\bR(\\d+)\\s*[-\\u2013]\\s*R?(\\d+)\\b', 'g');
const SINGLE = /\bR(\d+)\b/g;
const REF_TAIL = /[.,;:)\]]+$/;
const LEAD = new RegExp('^[ \\t\\uFEFF]*');
const FEFF_ALL = new RegExp('\\uFEFF', 'g');

const PIN_KINDS: ReadonlyMap<string, string> = new Map([
  ['regex', 'pattern'], ['charset', 'character set'], ['grammar', 'grammar'], ['text', 'exact text'], ['set', 'set'],
  ['const', 'constant'], ['constant', 'constant'], ['names', 'names'], ['number', 'number'], ['chars', 'characters'],
  ['order', 'order'], ['map', 'mapping'], ['bytes', 'bytes']]);
const OTHER_LABELS: ReadonlyMap<string, string> = new Map([
  ['ORACLE', 'The tests (file and fingerprint)'], ['ORACLE-CLASS', 'Kind of tests'], ['STATE', 'What it changes in place'],
  ['SEAM', 'Export shape'], ['TRACE-SEAM', 'Effect boundary'], ['SRC', 'Source location'], ['EFFECT', 'Effect'],
  ['SURFACE', 'Module surface'], ['EMIT', 'Emits'], ['REQUEST', 'Requests'], ['BRANCH', 'Branch'],
  ['ON-ERROR', 'On error'], ['PAR', 'Unordered window'], ['RING', 'Token ring'], ['LIFECYCLE', 'Resource lifecycle'],
  ['REACH', 'Off-path unit'], ['TRIGGER', 'Trigger'], ['EARNED', 'Earned rule'], ['BEHAVIOR', 'Behavior header']]);
const KNOWN_OTHER: ReadonlySet<string> = new Set(['SIR', 'VARIANT', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY',
  'CARRIED-DATA', 'NOTES', 'GUARD-PINNED', 'LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM', 'CITED']);
const NAMED: ReadonlySet<string> = new Set(['UNIT', 'KIND', 'FIDELITY', 'ANCHOR', 'DESCRIPTION', 'SIG', 'ENVELOPE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'PINNED', 'TABLE', 'CARRIED', 'DEPENDS-ON', 'INVARIANT', 'SCOPE', 'NOTE',
  'RATIONALE', 'PROVENANCE']);
const LANG_NAMES: ReadonlyMap<string, string> = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['rust', 'Rust']]);

function trimST(s: string): string { return s.replace(/^[ \t]+|[ \t]+$/g, ''); }

function quotedSpans(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let pos = 0;
  let prevEnd = -1;
  while (pos < s.length) {
    if (s[pos] === '"' && (pos === 0 || OPENERS.includes(s.charAt(pos - 1)) || pos === prevEnd)) {
      let j = pos + 1;
      let close = -1;
      while (j < s.length) {
        const c = s[j];
        if (c === '\\') {
          const cp = s.codePointAt(j + 1);
          j += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        } else if (c === '"') { close = j; break; } else j++;
      }
      if (close < 0) break;
      spans.push([pos, close]);
      prevEnd = close + 1;
      pos = close + 1;
    } else pos++;
  }
  return spans;
}

function inSpan(spans: Array<[number, number]>, p: number): boolean {
  return spans.some(([a, b]) => p > a && p < b);
}

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const spans = quotedSpans(piece);
  const marks: Array<{ start: number; kwEnd: number; kw: string }> = [];
  const re = new RegExp(ATTR.source, 'g');
  let m = re.exec(piece);
  while (m !== null) {
    const kw = m[1] ?? '';
    const kwStart = m.index + m[0].length - kw.length;
    if (!inSpan(spans, kwStart)) marks.push({ start: m.index, kwEnd: m.index + m[0].length, kw });
    m = re.exec(piece);
  }
  const first = marks[0];
  if (first === undefined) return { body: trimST(piece), attrs: [] };
  const attrs: Attr[] = [];
  marks.forEach((mk, i) => {
    const next = marks[i + 1];
    attrs.push({ k: mk.kw, v: trimST(piece.slice(mk.kwEnd, next === undefined ? piece.length : next.start)) });
  });
  return { body: trimST(piece.slice(0, first.start)), attrs };
}

function parse(text: string): Dir[] {
  const dirs: Dir[] = [];
  let cur: Dir | null = null;
  for (const line0 of text.split(/\r\n|\r|\n/)) {
    const run = (line0.match(LEAD) ?? [''])[0];
    const line = (run.replace(FEFF_ALL, '') + line0.slice(run.length)).replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = (line.match(/^[ \t]*/) ?? [''])[0];
    const content = line.slice(indent.length);
    if (content.startsWith('#')) continue;
    const spans = quotedSpans(content);
    let code = content;
    for (let i = 1; i < content.length; i++) {
      if (content[i] === '#' && (content[i - 1] === ' ' || content[i - 1] === '\t') &&
        (i + 1 === content.length || content[i + 1] === ' ' || content[i + 1] === '\t') && !inSpan(spans, i)) {
        code = content.slice(0, i).replace(/[ \t]+$/, '');
        break;
      }
    }
    let startsNew = false;
    if (indent === '') {
      const idx = code.search(/[ \t]/);
      let name = idx < 0 ? code : code.slice(0, idx);
      const rest = idx < 0 ? '' : code.slice(idx);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      if (/^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED') {
        const sp = splitAttrs(rest);
        cur = { name, args: sp.body, conts: [], attrs: sp.attrs };
        dirs.push(cur);
        startsNew = true;
      }
    }
    if (!startsNew && cur !== null) {
      const sp = splitAttrs(' ' + code);
      for (const a of sp.attrs) cur.attrs.push(a);
      if (sp.body !== '') cur.conts.push(sp.body);
    }
  }
  return dirs;
}

function readable(s: string): string {
  return s.replace(RANGE, 'rules $1–$2').replace(SINGLE, 'rule $1');
}

function joined(d: Dir): string {
  return [d.args, ...d.conts].filter((x) => x !== '').join(' ');
}

type Row = { match: (d: Dir) => boolean; label: (d: Dir) => string | null };
type Sec = { title: string; tested: boolean; rows: Row[] };

const named = (n: string, label: string | null): Row => ({ match: (d) => d.name === n, label: () => label });
const RULE_RE = /^R[0-9]+$/;

const SECTIONS: Sec[] = [
  { title: 'What kind of unit it is', tested: true, rows: [named('UNIT', 'Name'), named('KIND', 'Kind'),
    named('FIDELITY', 'Fidelity'), named('ANCHOR', 'Anchor')] },
  { title: 'What it is for', tested: false, rows: [named('DESCRIPTION', null)] },
  { title: 'What it accepts', tested: true, rows: [named('SIG', 'Signature'), named('ENVELOPE', 'Inputs it is verified on'),
    named('UNGUARDED-PRECONDITION', 'Assumes, without checking'), named('OUT-OF-DOMAIN', 'Not covered')] },
  { title: 'What it does', tested: true, rows: [{ match: (d) => RULE_RE.test(d.name), label: (d) => 'Rule ' + d.name.slice(1) }] },
  { title: 'Exact definitions', tested: true, rows: [named('PINNED', null)] },
  { title: 'Decision table', tested: true, rows: [named('TABLE', null)] },
  { title: 'Data it carries', tested: true, rows: [{ match: (d) => d.name === 'CARRIED', label: (d) => {
    const f = d.args.split(/[ \t]+/).filter((x) => x !== '')[0];
    return f === undefined ? 'Carried data' : f;
  } }] },
  { title: 'What it depends on', tested: true, rows: [named('DEPENDS-ON', null)] },
  { title: 'Other parts of the contract', tested: true, rows: [{
    match: (d) => !NAMED.has(d.name) && !RULE_RE.test(d.name) && d.name !== 'INVARIANT' && d.name !== 'SCOPE' &&
      !(d.name === 'BEHAVIOR' && joined(d) === '' && d.attrs.length === 0),
    label: (d) => {
      const l = OTHER_LABELS.get(d.name);
      if (l !== undefined) return l;
      if (KNOWN_OTHER.has(d.name)) return d.name;
      return d.name + ' (not in the SIR vocabulary)';
    } }] },
  { title: 'Should always hold', tested: false, rows: [named('INVARIANT', null)] },
  { title: 'In and out of scope', tested: false, rows: [named('SCOPE', null)] },
  { title: 'Background', tested: false, rows: [named('NOTE', 'Note'), named('RATIONALE', 'Why'),
    named('PROVENANCE', 'Where it came from')] },
];

function buildItems(dirs: Dir[]): Item[] {
  const out: Item[] = [];
  const counts = new Map<string, number>();
  for (const sec of SECTIONS) {
    for (const row of sec.rows) {
      for (const d of dirs) {
        if (!row.match(d)) continue;
        const raw = joined(d);
        let shown = raw;
        let base = d.name;
        let label = row.label(d);
        if (d.name === 'PINNED') {
          const eq = d.args.indexOf('=');
          const head = eq < 0 ? d.args : d.args.slice(0, eq);
          const val = eq < 0 ? '' : d.args.slice(eq + 1);
          const fields = head.split(/[ \t]+/).filter((x) => x !== '');
          const kind = (fields[0] ?? '').trim();
          const nm = (fields[1] ?? '').trim();
          shown = [val.trim(), ...d.conts].filter((x) => x !== '').join(' ');
          base = nm === '' ? 'PIN' : 'PIN:' + nm;
          const phrase = PIN_KINDS.get(kind) ?? (kind !== '' ? kind : 'no kind');
          label = (nm === '' ? '(unnamed pin)' : nm) + ' (' + phrase + ')';
        } else if (d.name === 'DEPENDS-ON' && /^none$/i.test(raw)) {
          shown = 'Nothing. No other package is involved.';
        }
        const cites: string[] = [];
        const why: string[] = [];
        for (const a of d.attrs) {
          cites.push(a.v === '' ? a.k : a.k + ' ' + a.v);
          let w = a.v;
          if (a.k === 'EARNED') w = 'added after a failed test (' + a.v + ')';
          else if (a.k === 'ANCHOR') w = 'anchored to ' + a.v;
          why.push(readable(w));
        }
        const k = (counts.get(base) ?? 0) + 1;
        counts.set(base, k);
        out.push({ section: sec.title, tested: sec.tested, id: k === 1 ? base : base + ' #' + k, label, raw,
          text: readable(shown), cites, why });
      }
    }
  }
  return out;
}

function diffTokens(s: string): string[] { return s.split(/(\s+)/); }

function diff(a: string, b: string): Piece[] {
  const x = diffTokens(a);
  const y = diffTokens(b);
  const n = x.length;
  const m = y.length;
  const L: number[][] = [];
  for (let i = 0; i <= n; i++) L.push(new Array<number>(m + 1).fill(0));
  const g = (i: number, j: number): number => (L[i] ?? [])[j] ?? 0;
  for (let i = n - 1; i >= 0; i--) {
    const row = L[i] ?? [];
    for (let j = m - 1; j >= 0; j--) {
      row[j] = x[i] === y[j] ? g(i + 1, j + 1) + 1 : Math.max(g(i + 1, j), g(i, j + 1));
    }
  }
  const s1: Piece[] = [];
  const emit = (op: '=' | '-' | '+', text: string): void => {
    const last = s1[s1.length - 1];
    if (last !== undefined && last.op === op) last.text += text;
    else s1.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const ti = x[i] ?? '';
    const tj = y[j] ?? '';
    if (ti === tj) { emit('=', ti); i++; j++; } else if (g(i + 1, j) >= g(i, j + 1)) { emit('-', ti); i++; } else { emit('+', tj); j++; }
  }
  while (i < n) { emit('-', x[i] ?? ''); i++; }
  while (j < m) { emit('+', y[j] ?? ''); j++; }
  const out: Piece[] = [];
  let k = 0;
  while (k < s1.length) {
    const e = s1[k];
    if (e === undefined) break;
    if (e.op === '=') { out.push({ op: '=', text: e.text }); k++; continue; }
    let del = '';
    let ins = '';
    let last = k;
    let p = k;
    while (p < s1.length) {
      const q = s1[p];
      if (q === undefined) break;
      if (q.op === '-') { del += q.text; last = p; p++; } else if (q.op === '+') { ins += q.text; last = p; p++; } else {
        const t = q.text.trim();
        const glue = p + 1 < s1.length && (t === '' || t.split(/\s+/).length <= 2);
        if (!glue) break;
        del += q.text;
        ins += q.text;
        p++;
      }
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = last + 1;
  }
  return out.filter((e) => e.text !== '');
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function firstDir(dirs: Dir[], name: string): Dir | undefined {
  return dirs.find((d) => d.name === name);
}

export function explain_diff(before: string, after: string, oracleChanged: boolean | null, langs: readonly string[]): Review {
  const bd = parse(before);
  const ad = parse(after);
  const bi = buildItems(bd);
  const ai = buildItems(ad);
  const gk = (it: Item): string => it.section + '\u0000' + it.id.replace(/ #[0-9]+$/, '');
  const order: string[] = [];
  const bg = new Map<string, Item[]>();
  const ag = new Map<string, Item[]>();
  const add = (mp: Map<string, Item[]>, it: Item): void => {
    const k = gk(it);
    if (!bg.has(k) && !ag.has(k) && !order.includes(k)) order.push(k);
    const l = mp.get(k);
    if (l === undefined) mp.set(k, [it]); else l.push(it);
  };
  for (const it of bi) add(bg, it);
  for (const it of ai) add(ag, it);
  const pairOf = new Map<Item, Item>();
  const pairedB = new Set<Item>();
  const unpairedBefore: Item[] = [];
  for (const k of order) {
    const bl = bg.get(k) ?? [];
    const al = ag.get(k) ?? [];
    for (const b of bl) {
      const hit = al.find((a) => !pairOf.has(a) && a.raw === b.raw && sameList(a.cites, b.cites));
      if (hit !== undefined) { pairOf.set(hit, b); pairedB.add(b); }
    }
    const lb = bl.filter((b) => !pairedB.has(b));
    const la = al.filter((a) => !pairOf.has(a));
    lb.forEach((b, i) => {
      const a = la[i];
      if (a !== undefined) { pairOf.set(a, b); pairedB.add(b); }
    });
    for (const b of bl) if (!pairedB.has(b)) unpairedBefore.push(b);
  }
  const changes: Change[] = [];
  const records: Array<{ ch: Change; a: Item }> = [];
  for (const a of ai) {
    const b = pairOf.get(a);
    const label = a.label ?? a.section;
    if (b === undefined) {
      changes.push({ section: a.section, id: a.id, label, kind: 'added', checked: a.tested, text: a.text });
    } else if (!(a.raw === b.raw && sameList(a.cites, b.cites))) {
      let d = diff(b.text, a.text);
      if (!d.some((e) => e.op !== '=')) d = diff(b.raw, a.raw);
      const wd = sameList(a.cites, b.cites) ? null : diff(b.cites.join('; '), a.cites.join('; '));
      const ch: Change = { section: a.section, id: a.id, label, kind: 'changed', checked: a.tested, diff: d, whyDiff: wd };
      changes.push(ch);
      records.push({ ch, a });
    }
  }
  for (const b of unpairedBefore) {
    changes.push({ section: b.section, id: b.id, label: b.label ?? b.section, kind: 'removed', checked: b.tested, text: b.text });
  }
  const ud = firstDir(ad, 'UNIT');
  const unit = ud === undefined || ud.args === '' ? '(unnamed)' : ud.args;

  const warnings: Warning[] = [];
  const tested = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const verbs = (['changed', 'added', 'removed'] as const).filter((v) => tested.some((c) => c.kind === v)).join(' or ');
    const labels = Array.from(new Set(tested.map((c) => c.label))).join(', ');
    warnings.push({ level: 'stop', kind: 'untested-change', text: String(N) + (N === 1 ? ' tested part was ' : ' tested parts were ') +
      verbs + ' (' + labels + '), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.' });
  }
  const fb = firstDir(bd, 'FIDELITY');
  const fa = firstDir(ad, 'FIDELITY');
  if ((fb !== undefined && fb.args === 'package') || (fa !== undefined && fa.args === 'package')) {
    const refs: string[] = [];
    for (const dirs of [bd, ad]) {
      const an = firstDir(dirs, 'ANCHOR');
      if (an === undefined) continue;
      const f = an.args.split(/[ \t]+/).filter((x) => x !== '')[0];
      if (f !== undefined && f.includes('@')) refs.push(f);
    }
    const citing: Array<{ label: string; why: string }> = [];
    for (const r of records) {
      if (!r.ch.checked) continue;
      const idx = r.a.cites.findIndex((c) => c.includes('FIDELITY package') ||
        c.split(/[ \t]+/).some((t) => refs.includes(t.replace(REF_TAIL, ''))));
      if (idx < 0) continue;
      citing.push({ label: r.ch.label, why: r.a.why[idx] ?? '' });
    }
    const f0 = citing[0];
    if (f0 !== undefined) {
      const pre = 'FIDELITY package — ';
      let q = f0.why.startsWith(pre) ? f0.why.slice(pre.length) : f0.why;
      const cp = Array.from(q);
      if (cp.length > 110) q = cp.slice(0, 109).join('') + '…';
      warnings.push({ level: 'stop', kind: 'citation', text: 'This contract promises to match the original package exactly, and ' +
        citing.map((c) => c.label).join(' and ') + ' still ' + (citing.length === 1 ? 'cites' : 'cite') +
        ' that package as the reason for the old behavior (' + '"' + q + '"' + '). The edit contradicts its own citation.' });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: 'ok', kind: 'prose-only', text: 'Only unchecked prose changed. The code is held to exactly what it was held to before.' });
  }
  const stale = Array.from(new Set(langs.filter((l) => l !== '')));
  if (N > 0 && stale.length > 0) {
    const names = stale.map((l) => LANG_NAMES.get(l) ?? l).join(', ');
    warnings.push({ level: 'note', kind: 'stale-langs', text: 'The ' + names + (stale.length === 1
      ? ' file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it.'
      : ' files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.') });
  }
  return { unit, changes, warnings };
}
