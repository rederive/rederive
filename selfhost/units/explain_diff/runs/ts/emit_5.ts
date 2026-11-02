type Piece = { op: '=' | '-' | '+'; text: string };
type Change = { section: string; id: string; label: string; kind: 'changed' | 'added' | 'removed'; checked: boolean;
  text?: string; diff?: Piece[]; whyDiff?: Piece[] | null };
type Warning = { level: 'stop' | 'ok' | 'note'; kind: string; text: string };
type Review = { unit: string; changes: Change[]; warnings: Warning[] };

type Attr = { kw: string; value: string };
type Dir = { name: string; args: string; pieces: string[]; attrs: Attr[]; comments: string[] };
type Stray = { line: number; text: string };
type Item = { section: string; tested: boolean; id: string; label: string | null; raw: string; text: string; cits: string[]; why: string[] };

const BOM = String.fromCharCode(0xfeff);
const ENTER = String.fromCharCode(0x23ce);
const DASH = String.fromCharCode(0x2014);
const ELL = String.fromCharCode(0x2026);
const LEAD_RE = new RegExp("^[ \\t" + BOM + "]*");
const COMMENT_LEAD = /^#+[ \t]?/;
const REF_TAIL = /[.,;:)\]]+$/;
const OPENERS: ReadonlySet<string> = new Set([' ', '\t', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const PIN_KINDS: ReadonlyMap<string, string> = new Map([
  ['regex', 'pattern'], ['charset', 'character set'], ['grammar', 'grammar'], ['text', 'exact text'], ['set', 'set'],
  ['const', 'constant'], ['constant', 'constant'], ['names', 'names'], ['number', 'number'], ['chars', 'characters'],
  ['order', 'order'], ['map', 'mapping'], ['bytes', 'bytes']]);
const OTHER_LABELS: ReadonlyMap<string, string> = new Map([
  ['ORACLE', 'The tests (file and fingerprint)'], ['ORACLE-CLASS', 'Kind of tests'], ['STATE', 'What it changes in place'],
  ['SEAM', 'Export shape'], ['TRACE-SEAM', 'Effect boundary'], ['SRC', 'Source location'], ['EFFECT', 'Effect'],
  ['SURFACE', 'Module surface'], ['EMIT', 'Emits'], ['REQUEST', 'Requests'], ['BRANCH', 'Branch'], ['ON-ERROR', 'On error'],
  ['PAR', 'Unordered window'], ['RING', 'Token ring'], ['LIFECYCLE', 'Resource lifecycle'], ['REACH', 'Off-path unit'],
  ['TRIGGER', 'Trigger'], ['EARNED', 'Earned rule'], ['BEHAVIOR', 'Behavior header']]);
const KNOWN_OTHER: ReadonlySet<string> = new Set(['SIR', 'VARIANT', 'SHAPE', 'CANONICAL-SHA256', 'AUTHORITY', 'CARRIED-DATA', 'NOTES',
  'GUARD-PINNED', 'LANG', 'PRIMARY-SHA256', 'ABI', 'MECHANISM', 'CITED', 'R11']);
const NAMED: ReadonlySet<string> = new Set(['UNIT', 'KIND', 'FIDELITY', 'ANCHOR', 'DESCRIPTION', 'SIG', 'ENVELOPE',
  'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'PINNED', 'TABLE', 'CARRIED', 'DEPENDS-ON', 'INVARIANT', 'SCOPE', 'NOTE', 'RATIONALE', 'PROVENANCE']);
const LANG_NAMES: ReadonlyMap<string, string> = new Map([['js', 'JavaScript'], ['ts', 'TypeScript'], ['rust', 'Rust']]);

const trimST = (s: string): string => s.replace(/^[ \t]+|[ \t]+$/g, '');
const fields = (s: string): string[] => s.split(/[ \t]+/).filter((x) => x !== '');

function quotedSpans(s: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let lastClose = -2;
  let p = 0;
  while (p < s.length) {
    const prev = p > 0 ? s.charAt(p - 1) : '';
    if (s.charAt(p) === '"' && (p === 0 || OPENERS.has(prev) || p === lastClose + 1)) {
      let k = p + 1;
      let q = -1;
      while (k < s.length) {
        const ch = s.charAt(k);
        if (ch === '\\') {
          const cp = s.codePointAt(k + 1);
          k += 1 + (cp !== undefined && cp > 0xffff ? 2 : 1);
        } else if (ch === '"') {
          q = k;
          break;
        } else k++;
      }
      if (q < 0) break;
      spans.push([p, q]);
      lastClose = q;
      p = q + 1;
    } else p++;
  }
  return spans;
}
const inside = (spans: Array<[number, number]>, pos: number): boolean => spans.some(([o, c]) => pos > o && pos < c);

function splitAttrs(piece: string): { body: string; attrs: Attr[] } {
  const spans = quotedSpans(piece);
  const re = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
  const marks: Array<{ start: number; end: number; kw: string }> = [];
  let m: RegExpExecArray | null = re.exec(piece);
  while (m !== null) {
    const kw = m[1] ?? '';
    const end = m.index + m[0].length;
    if (!inside(spans, end - kw.length)) marks.push({ start: m.index, end, kw });
    m = re.exec(piece);
  }
  const first = marks[0];
  if (first === undefined) return { body: trimST(piece), attrs: [] };
  const attrs: Attr[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mk = marks[i];
    if (mk === undefined) continue;
    const nx = marks[i + 1];
    attrs.push({ kw: mk.kw, value: trimST(piece.slice(mk.end, nx === undefined ? piece.length : nx.start)) });
  }
  return { body: trimST(piece.slice(0, first.start)), attrs };
}

function parse(text: string): { dirs: Dir[]; strays: Stray[] } {
  const dirs: Dir[] = [];
  const strays: Stray[] = [];
  let cur: Dir | null = null;
  const lines = text.split(/\r\n|\r|\n/);
  for (let n = 0; n < lines.length; n++) {
    let line = lines[n] ?? '';
    const lead = (LEAD_RE.exec(line) ?? [''])[0] ?? '';
    line = lead.split(BOM).join('') + line.slice(lead.length);
    line = line.replace(/[ \t]+$/, '');
    if (line === '') continue;
    const indent = (/^[ \t]*/.exec(line) ?? [''])[0] ?? '';
    const content = line.slice(indent.length);
    if (content.startsWith('#')) {
      if (cur !== null) cur.comments.push(content.replace(COMMENT_LEAD, ''));
      else strays.push({ line: n + 1, text: content });
      continue;
    }
    const spans = quotedSpans(content);
    let code = content;
    let comment: string | null = null;
    for (let i = 1; i < content.length; i++) {
      if (content.charAt(i) !== '#') continue;
      const pv = content.charAt(i - 1);
      const nx = i + 1 < content.length ? content.charAt(i + 1) : '';
      if ((pv === ' ' || pv === '\t') && (nx === '' || nx === ' ' || nx === '\t') && !inside(spans, i)) {
        code = trimST(content.slice(0, i)).replace(/[ \t]+$/, '');
        comment = trimST(content.slice(i + 1));
        break;
      }
    }
    let isDir = false;
    let name = '';
    let rest = '';
    if (indent === '') {
      const w = /[ \t]/.exec(code);
      name = w === null ? code : code.slice(0, w.index);
      rest = w === null ? '' : code.slice(w.index);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name)) name = name.slice(0, -1);
      isDir = /^[A-Z][A-Z0-9-]*$/.test(name) && name !== 'CITED';
    }
    if (isDir) {
      const sp = splitAttrs(rest);
      cur = { name, args: sp.body, pieces: [], attrs: sp.attrs, comments: comment !== null ? [comment] : [] };
      dirs.push(cur);
    } else if (cur === null) {
      strays.push({ line: n + 1, text: content });
    } else {
      const sp = splitAttrs(' ' + code);
      for (const a of sp.attrs) cur.attrs.push(a);
      if (sp.body !== '') cur.pieces.push(sp.body);
      if (comment !== null) cur.comments.push(comment);
    }
  }
  return { dirs, strays };
}

const joinedOf = (d: Dir): string => [d.args, ...d.pieces].filter((s) => s !== '').join(d.name === 'TABLE' ? ' ' + ENTER + ' ' : ' ');
function rawOf(d: Dir): string {
  const base = [d.args, ...d.pieces].filter((s) => s !== '').join(d.name === 'TABLE' ? '\n' : ' ');
  return d.comments.length > 0 ? base + ' # ' + d.comments.join(' # ') : base;
}
function whyOf(a: Attr): string {
  if (a.kw === 'CITED') return a.value === '' ? 'no reason given' : a.value;
  if (a.kw === 'EARNED') return a.value === '' ? 'added after a failed test' : 'added after a failed test (' + a.value + ')';
  return a.value === '' ? 'anchored (no reference given)' : 'anchored to ' + a.value;
}

function items(p: { dirs: Dir[]; strays: Stray[] }): Item[] {
  const out: Item[] = [];
  const mk = (section: string, tested: boolean, base: string, label: string | null, d: Dir, text: string): void => {
    out.push({ section, tested, id: base, label, raw: rawOf(d), text,
      cits: d.attrs.map((a) => (a.value === '' ? a.kw : a.kw + ' ' + a.value)), why: d.attrs.map(whyOf) });
  };
  const plain = (section: string, tested: boolean, list: Array<[Dir, string | null]>): void => {
    for (const [d, label] of list) {
      const j = joinedOf(d);
      const text = d.name === 'DEPENDS-ON' && j.toLowerCase() === 'none' ? 'Nothing. No other package is involved.' : j;
      mk(section, tested, d.name, label, d, text);
    }
  };
  const named = (names: ReadonlyArray<readonly [string, string | null]>): Array<[Dir, string | null]> => {
    const r: Array<[Dir, string | null]> = [];
    for (const [nm, label] of names) for (const d of p.dirs) if (d.name === nm) r.push([d, label]);
    return r;
  };
  plain('What kind of unit it is', true, named([['UNIT', 'Name'], ['KIND', 'Kind'], ['FIDELITY', 'Fidelity'], ['ANCHOR', 'Anchor']]));
  plain('What it is for', false, named([['DESCRIPTION', null]]));
  plain('What it accepts', true, named([['SIG', 'Signature'], ['ENVELOPE', 'Inputs it is verified on'],
    ['UNGUARDED-PRECONDITION', 'Assumes, without checking'], ['OUT-OF-DOMAIN', 'Not covered']]));
  plain('What it does', true, p.dirs.filter((d) => /^R[0-9]+$/.test(d.name)).map((d): [Dir, string | null] => [d, 'Rule ' + d.name.slice(1)]));
  for (const d of p.dirs) {
    if (d.name !== 'PINNED') continue;
    const spans = quotedSpans(d.args);
    let eq = -1;
    for (let i = 0; i < d.args.length; i++) if (d.args.charAt(i) === '=' && !inside(spans, i)) { eq = i; break; }
    const head = eq < 0 ? d.args : d.args.slice(0, eq);
    const value = eq < 0 ? '' : d.args.slice(eq + 1);
    const f = fields(head);
    const kw = f[0] ?? '';
    const nm = f[1] ?? '';
    const shown = eq >= 0 ? [trimST(value), ...d.pieces].filter((s) => s !== '').join(' ') : joinedOf(d);
    const phrase = PIN_KINDS.get(kw) ?? (kw !== '' ? kw : 'no kind');
    const empty = eq >= 0 && shown === '' ? ', empty value' : '';
    mk('Exact definitions', true, nm === '' ? 'PIN' : 'PIN:' + nm, (nm === '' ? '(unnamed pin)' : nm) + ' (' + phrase + empty + ')', d, shown);
  }
  plain('Decision table', true, named([['TABLE', null]]));
  plain('Data it carries', true, p.dirs.filter((d) => d.name === 'CARRIED').map((d): [Dir, string | null] => [d, fields(d.args)[0] ?? 'Carried data']));
  plain('What it depends on', true, named([['DEPENDS-ON', null]]));
  const others: Array<[Dir, string | null]> = [];
  for (const d of p.dirs) {
    if (NAMED.has(d.name) || /^R[0-9]+$/.test(d.name)) continue;
    if (d.name === 'BEHAVIOR' && joinedOf(d) === '' && d.attrs.length === 0) continue;
    const l = OTHER_LABELS.get(d.name);
    others.push([d, l !== undefined ? l : KNOWN_OTHER.has(d.name) ? d.name : d.name + ' (not in the SIR vocabulary)']);
  }
  plain('Other parts of the contract', true, others);
  for (const s of p.strays) {
    out.push({ section: 'Text outside any directive', tested: true, id: 'STRAY', label: 'Line ' + s.line, raw: s.text, text: s.text, cits: [], why: [] });
  }
  plain('Should always hold', false, named([['INVARIANT', null]]));
  plain('In and out of scope', false, named([['SCOPE', null]]));
  plain('Background', false, named([['NOTE', 'Note'], ['RATIONALE', 'Why'], ['PROVENANCE', 'Where it came from']]));
  // stray items belong before Should always hold in production order; reorder by section sequence is already respected above
  const counts = new Map<string, number>();
  for (const it of out) {
    const k = (counts.get(it.id) ?? 0) + 1;
    counts.set(it.id, k);
    if (k >= 2) it.id = it.id + ' #' + k;
  }
  return out;
}

function mergePush(list: Piece[], op: '=' | '-' | '+', text: string): void {
  const last = list[list.length - 1];
  if (last !== undefined && last.op === op) last.text += text;
  else list.push({ op, text });
}

function diff(a: string, b: string): Piece[] {
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
    for (let j = m - 1; j >= 0; j--) row[j] = ta[i] === tb[j] ? 1 + at(i + 1, j + 1) : Math.max(at(i + 1, j), at(i, j + 1));
  }
  const s1: Piece[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const x = ta[i] ?? '';
    const y = tb[j] ?? '';
    if (x === y) { mergePush(s1, '=', x); i++; j++; }
    else if (at(i + 1, j) >= at(i, j + 1)) { mergePush(s1, '-', x); i++; }
    else { mergePush(s1, '+', y); j++; }
  }
  while (i < n) { mergePush(s1, '-', ta[i] ?? ''); i++; }
  while (j < m) { mergePush(s1, '+', tb[j] ?? ''); j++; }
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
      if (q.op === '-') { del += q.text; last = p; }
      else if (q.op === '+') { ins += q.text; last = p; }
      else {
        const t = q.text.trim();
        const glue = p + 1 < s1.length && (t === '' || t.split(/\s+/).length <= 2);
        if (!glue) break;
        del += q.text;
        ins += q.text;
      }
      p++;
    }
    if (del !== '') out.push({ op: '-', text: del });
    if (ins !== '') out.push({ op: '+', text: ins });
    k = last + 1;
  }
  return out.filter((x) => x.text !== '');
}

const sameCits = (x: string[], y: string[]): boolean => x.length === y.length && x.every((v, i) => v === y[i]);
const same = (x: Item, y: Item): boolean => x.raw === y.raw && sameCits(x.cits, y.cits);
const groupKey = (it: Item): string => it.section + '\n' + it.id.replace(/ #[0-9]+$/, '');

function header(dirs: Dir[]): { fid: string | null; ref: string | null } {
  let fid: string | null = null;
  for (const nm of ['FIDELITY', 'VARIANT']) {
    for (const d of dirs) {
      if (fid === null && d.name === nm && joinedOf(d) !== '') fid = joinedOf(d);
    }
  }
  let ref: string | null = null;
  for (const d of dirs) {
    if (ref === null && d.name === 'ANCHOR' && joinedOf(d) !== '') ref = fields(joinedOf(d))[0] ?? '';
  }
  return { fid, ref };
}

export function explain_diff(before: string, after: string, oracleChanged: boolean | null, langs: readonly string[]): Review {
  const pa = parse(before);
  const pb = parse(after);
  const bi = items(pa);
  const ai = items(pb);
  const groups = new Map<string, { b: Item[]; a: Item[] }>();
  const grp = (it: Item): { b: Item[]; a: Item[] } => {
    const k = groupKey(it);
    let g = groups.get(k);
    if (g === undefined) { g = { b: [], a: [] }; groups.set(k, g); }
    return g;
  };
  for (const it of bi) grp(it).b.push(it);
  for (const it of ai) grp(it).a.push(it);
  const pairOf = new Map<Item, Item>();
  const unpairedBefore: Item[] = [];
  for (const g of groups.values()) {
    const usedA: boolean[] = g.a.map(() => false);
    const pb2: number[] = g.b.map(() => -1);
    g.b.forEach((x, bi2) => {
      for (let k = 0; k < g.a.length; k++) {
        const y = g.a[k];
        if (y !== undefined && !usedA[k] && same(x, y)) { usedA[k] = true; pb2[bi2] = k; break; }
      }
    });
    let ptr = 0;
    for (let bi2 = 0; bi2 < g.b.length; bi2++) {
      if ((pb2[bi2] ?? -1) >= 0) continue;
      while (ptr < g.a.length && usedA[ptr]) ptr++;
      if (ptr < g.a.length) { usedA[ptr] = true; pb2[bi2] = ptr; }
    }
    g.b.forEach((x, bi2) => {
      const k = pb2[bi2] ?? -1;
      const y = k >= 0 ? g.a[k] : undefined;
      if (y !== undefined) pairOf.set(y, x);
      else unpairedBefore.push(x);
    });
  }
  const changes: Change[] = [];
  const afterOf: Item[] = [];
  const base = (it: Item): { section: string; id: string; label: string; checked: boolean } =>
    ({ section: it.section, id: it.id, label: it.label ?? it.section, checked: it.tested });
  for (const it of ai) {
    const old = pairOf.get(it);
    if (old === undefined) {
      changes.push({ ...base(it), kind: 'added', text: it.text });
      afterOf.push(it);
    } else if (!same(old, it)) {
      const d1 = diff(old.text, it.text);
      const d = d1.some((x) => x.op !== '=') ? d1 : diff(old.raw, it.raw);
      const why = sameCits(old.cits, it.cits) ? null : diff(old.cits.join('; '), it.cits.join('; '));
      changes.push({ ...base(it), kind: 'changed', diff: d, whyDiff: why });
      afterOf.push(it);
    }
  }
  for (const it of unpairedBefore) {
    changes.push({ ...base(it), kind: 'removed', text: it.text });
    afterOf.push(it);
  }
  const warnings: Warning[] = [];
  const tested: Change[] = changes.filter((c) => c.checked);
  const N = tested.length;
  if (N > 0 && oracleChanged === false) {
    const kinds = new Set(tested.map((c) => c.kind));
    const verbs = (['changed', 'added', 'removed'] as const).filter((v) => kinds.has(v)).join(' or ');
    const labels = Array.from(new Set(tested.map((c) => c.label))).join(', ');
    warnings.push({ level: 'stop', kind: 'untested-change',
      text: N + (N === 1 ? ' tested part was ' : ' tested parts were ') + verbs + ' (' + labels +
        '), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.' });
  }
  const hb = header(pa.dirs);
  const ha = header(pb.dirs);
  if (hb.fid === 'package' || ha.fid === 'package') {
    const refs = [hb.ref, ha.ref].filter((r): r is string => r !== null && r.includes('@'));
    const citing: string[] = [];
    const whys: string[] = [];
    changes.forEach((c, ci) => {
      const it = afterOf[ci];
      if (c.kind !== 'changed' || !c.checked || it === undefined) return;
      const idx = it.cits.findIndex((e) => e.includes('FIDELITY package') ||
        e.split(/[ \t]+/).some((t) => t !== '' && refs.includes(t.replace(REF_TAIL, ''))));
      if (idx < 0) return;
      citing.push(c.label);
      whys.push(it.why[idx] ?? '');
    });
    if (citing.length > 0) {
      const lead = 'FIDELITY package ' + DASH + ' ';
      let q = whys[0] ?? '';
      if (q.startsWith(lead)) q = q.slice(lead.length);
      const cps = Array.from(q);
      if (cps.length > 110) q = cps.slice(0, 109).join('') + ELL;
      warnings.push({ level: 'stop', kind: 'citation',
        text: 'This contract promises to match the original package exactly, and ' + citing.join(' and ') + ' still ' +
          (citing.length === 1 ? 'cites' : 'cite') + ' that package as the reason for the old behavior (' + String.fromCharCode(34) + q +
          String.fromCharCode(34) + '). The edit contradicts its own citation.' });
    }
  }
  if (N === 0 && changes.length > 0) {
    warnings.push({ level: 'ok', kind: 'prose-only', text: 'Only unchecked prose changed. The code is held to exactly what it was held to before.' });
  }
  const stale = Array.from(new Set(langs.filter((l) => l !== '')));
  if (N > 0 && stale.length > 0) {
    const names = stale.map((l) => LANG_NAMES.get(l) ?? l).join(', ');
    warnings.push({ level: 'note', kind: 'stale-langs',
      text: 'The ' + names + (stale.length === 1
        ? ' file was written against the old version. It goes out of date until someone reviews it against this one and re-binds it.'
        : ' files were written against the old version. They go out of date until someone reviews them against this one and re-binds them.') });
  }
  let unit = '(unnamed)';
  const u = pb.dirs.find((d) => d.name === 'UNIT' && joinedOf(d) !== '') ?? pb.dirs.find((d) => d.name === 'SIR' && joinedOf(d) !== '');
  if (u !== undefined) unit = joinedOf(u);
  return { unit, changes, warnings };
}
