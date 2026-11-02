type Item = { id: string; label?: string; text: string; why: string[]; raw: string; rawWhy: string[]; line: number };
type Section = { id: string; title: string; checked: boolean; items: Item[] };
type Reading = { unit: string; summary: string[]; sig: string | null; checks: string[]; sections: Section[] };
type Dir = { name: string; line: number; args: string; cont: string[]; attrs: Array<[string, string]>; comments: string[]; known: boolean };
type Stray = { line: number; text: string };

const LINE_BREAK = /\r\n|\r|\n/;
const COMMENT_LEAD = /^#+[ \t]?/;
const NONE = /^none$/i;
const ATTR = /[ \t]+(CITED|EARNED|ANCHOR)(?=[ \t]|$)/g;
const ANCHOR_DOTS = /\.+$/;
const FEFF = String.fromCharCode(0xfeff);
const RET = String.fromCharCode(0x23ce);
const OPENERS = new Set(['\t', ' ', '(', '[', '{', ',', '=', ':', ';', '|', '<', '>', '!', '&', '-', '~']);
const VOCAB = new Set(('UNIT SIR KIND FIDELITY VARIANT ANCHOR SRC TRIGGER REACH ORACLE-CLASS TRACE-SEAM SEAM SIG ENVELOPE DEPENDS-ON DESCRIPTION BEHAVIOR INVARIANT TABLE PINNED EARNED NOTE RATIONALE SCOPE UNGUARDED-PRECONDITION OUT-OF-DOMAIN ORACLE PROVENANCE CARRIED SHAPE CANONICAL-SHA256 AUTHORITY CARRIED-DATA STATE EMIT REQUEST BRANCH ON-ERROR PAR RING LIFECYCLE EFFECT SURFACE NOTES GUARD-PINNED LANG PRIMARY-SHA256 ABI MECHANISM').split(' '));
const KIND_PHRASE = new Map<string, string>([
  ['FUNCTIONAL', 'A pure function: the same input always gives the same output.'],
  ['STATE', 'Changes one of its arguments in place; the tests check the result and the changed argument.'],
  ['EFFECT', 'Talks to the outside world; the tests check the calls it makes, in order.'],
]);
const FID_PHRASE = new Map<string, string>([
  ['package', 'Matches the original package exactly, quirks included.'],
  ['spec', 'Follows the cited standard, even where the original package does not.'],
]);
const PIN_KIND = new Map<string, string>([
  ['regex', 'pattern'], ['charset', 'character set'], ['grammar', 'grammar'], ['text', 'exact text'], ['set', 'set'],
  ['const', 'constant'], ['names', 'names'], ['number', 'number'], ['constant', 'constant'], ['chars', 'characters'],
  ['order', 'order'], ['map', 'mapping'], ['bytes', 'bytes'],
]);
const OTHER_LABEL = new Map<string, string>([
  ['ORACLE', 'The tests (file and fingerprint)'], ['ORACLE-CLASS', 'Kind of tests'], ['STATE', 'What it changes in place'],
  ['SEAM', 'Export shape'], ['TRACE-SEAM', 'Effect boundary'], ['SRC', 'Source location'], ['EFFECT', 'Effect'],
  ['SURFACE', 'Module surface'], ['EMIT', 'Emits'], ['REQUEST', 'Requests'], ['BRANCH', 'Branch'], ['ON-ERROR', 'On error'],
  ['PAR', 'Unordered window'], ['RING', 'Token ring'], ['LIFECYCLE', 'Resource lifecycle'], ['REACH', 'Off-path unit'],
  ['TRIGGER', 'Trigger'], ['EARNED', 'Earned rule'], ['BEHAVIOR', 'Behavior header'],
]);

type Sec = { id: string; title: string; checked: boolean; members: Array<[string, string | null]> };
const SECS: Sec[] = [
  { id: 'header', title: 'What kind of unit it is', checked: true, members: [['UNIT', 'Name'], ['KIND', 'Kind'], ['FIDELITY', 'Fidelity'], ['ANCHOR', 'Anchor']] },
  { id: 'what', title: 'What it is for', checked: false, members: [['DESCRIPTION', null]] },
  { id: 'inputs', title: 'What it accepts', checked: true, members: [['SIG', 'Signature'], ['ENVELOPE', 'Inputs it is verified on'], ['UNGUARDED-PRECONDITION', 'Assumes, without checking'], ['OUT-OF-DOMAIN', 'Not covered']] },
  { id: 'rules', title: 'What it does', checked: true, members: [] },
  { id: 'pins', title: 'Exact definitions', checked: true, members: [['PINNED', null]] },
  { id: 'table', title: 'Decision table', checked: true, members: [['TABLE', null]] },
  { id: 'data', title: 'Data it carries', checked: true, members: [['CARRIED', null]] },
  { id: 'deps', title: 'What it depends on', checked: true, members: [['DEPENDS-ON', null]] },
  { id: 'more', title: 'Other parts of the contract', checked: true, members: [] },
  { id: 'stray', title: 'Text outside any directive', checked: true, members: [] },
  { id: 'holds', title: 'Should always hold', checked: false, members: [['INVARIANT', null]] },
  { id: 'scope', title: 'In and out of scope', checked: false, members: [['SCOPE', null]] },
  { id: 'notes', title: 'Background', checked: false, members: [['NOTE', 'Note'], ['RATIONALE', 'Why'], ['PROVENANCE', 'Where it came from']] },
];
const SECTION_MEMBERS = new Set<string>();
for (const s of SECS) for (const m of s.members) SECTION_MEMBERS.add(m[0]);

const isST = (c: string | undefined): boolean => c === ' ' || c === '\t';
function trimEndST(s: string): string {
  let e = s.length;
  while (e > 0 && isST(s[e - 1])) e--;
  return s.slice(0, e);
}
function trimStartST(s: string): string {
  let b = 0;
  while (b < s.length && isST(s[b])) b++;
  return s.slice(b);
}
const trimST = (s: string): string => trimEndST(trimStartST(s));

function spansOf(s: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let prevClose = -2;
  let p = 0;
  while (p < s.length) {
    if (s[p] === '"' && (p === 0 || OPENERS.has(s[p - 1] ?? '') || p === prevClose + 1)) {
      let q = p + 1;
      let found = -1;
      while (q < s.length) {
        const c = s[q];
        if (c === '\\') q += 2;
        else if (c === '"') { found = q; break; }
        else q++;
      }
      if (found < 0) break;
      out.push([p, found]);
      prevClose = found;
      p = found + 1;
    } else p++;
  }
  return out;
}
function inside(spans: Array<[number, number]>, pos: number): boolean {
  for (const [a, b] of spans) if (a < pos && pos < b) return true;
  return false;
}

function splitAttrs(s: string): { body: string; pairs: Array<[string, string]> } {
  const spans = spansOf(s);
  const hits: Array<{ index: number; kw: string; end: number }> = [];
  ATTR.lastIndex = 0;
  let m: RegExpExecArray | null = ATTR.exec(s);
  while (m !== null) {
    const kw = m[1] ?? '';
    const start = m.index + m[0].length - kw.length;
    if (!inside(spans, start)) hits.push({ index: m.index, kw, end: m.index + m[0].length });
    m = ATTR.exec(s);
  }
  if (hits.length === 0) return { body: trimST(s), pairs: [] };
  const first = hits[0];
  const body = trimST(s.slice(0, first ? first.index : s.length));
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (!h) continue;
    const nx = hits[i + 1];
    pairs.push([h.kw, trimST(s.slice(h.end, nx ? nx.index : s.length))]);
  }
  return { body, pairs };
}

function textOf(d: Dir): string {
  const pieces = [d.args, ...d.cont].filter((x) => x !== '');
  return pieces.join(d.name === 'TABLE' ? ' ' + RET + ' ' : ' ');
}
function rawOf(d: Dir): string {
  const pieces = [d.args, ...d.cont].filter((x) => x !== '');
  let r = pieces.join(d.name === 'TABLE' ? '\n' : ' ');
  for (const c of d.comments) r += ' # ' + c;
  return r;
}
const isRule = (n: string): boolean => /^R[0-9]+$/.test(n);
const isDirName = (n: string): boolean => /^[A-Z][A-Z0-9-]*$/.test(n);

function parse(text: string): { dirs: Dir[]; strays: Stray[] } {
  const dirs: Dir[] = [];
  const strays: Stray[] = [];
  let cur: Dir | null = null;
  const lines = text.split(LINE_BREAK);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    let raw = lines[i] ?? '';
    let b = 0;
    while (b < raw.length && (isST(raw[b]) || raw[b] === FEFF)) b++;
    raw = raw.slice(0, b).split(FEFF).join('') + raw.slice(b);
    raw = trimEndST(raw);
    if (raw === '') continue;
    const content = trimStartST(raw);
    const indent = raw.slice(0, raw.length - content.length);
    if (content[0] === '#') {
      if (cur) cur.comments.push(content.replace(COMMENT_LEAD, ''));
      else strays.push({ line: lineNo, text: content });
      continue;
    }
    const cspans = spansOf(content);
    let marker = -1;
    for (let k = 0; k < content.length; k++) {
      if (content[k] === '#' && k > 0 && isST(content[k - 1]) && (k + 1 === content.length || isST(content[k + 1])) && !inside(cspans, k)) { marker = k; break; }
    }
    const code = marker < 0 ? content : trimEndST(content.slice(0, marker));
    const trailing: string | null = marker < 0 ? null : trimST(content.slice(marker + 1));
    if (indent === '') {
      let e = 0;
      while (e < code.length && !isST(code[e])) e++;
      let name = code.slice(0, e);
      const rest = code.slice(e);
      if (/^[A-Z][A-Z0-9-]*:$/.test(name) && name.slice(0, -1) !== 'CITED') name = name.slice(0, -1);
      if (isDirName(name) && name !== 'CITED') {
        const sp = splitAttrs(rest);
        const d: Dir = { name, line: lineNo, args: sp.body, cont: [], attrs: sp.pairs, comments: trailing !== null ? [trailing] : [], known: VOCAB.has(name) || isRule(name) };
        dirs.push(d);
        cur = d;
        continue;
      }
    }
    if (!cur) { strays.push({ line: lineNo, text: content }); continue; }
    const sp = splitAttrs(' ' + code);
    for (const p of sp.pairs) cur.attrs.push(p);
    if (sp.body !== '') cur.cont.push(sp.body);
    if (trailing !== null) cur.comments.push(trailing);
  }
  return { dirs, strays };
}

function whyOf(kw: string, v: string): string {
  if (kw === 'CITED') return v !== '' ? v : 'no reason given';
  if (kw === 'EARNED') return v !== '' ? 'added after a failed test (' + v + ')' : 'added after a failed test';
  return v !== '' ? 'anchored to ' + v : 'anchored (no reference given)';
}

export function explain_contract(primaryText: unknown): Reading {
  if (typeof primaryText !== 'string') throw new TypeError('primaryText must be a string');
  const { dirs, strays } = parse(primaryText);
  const head = (n: string, legacy: string): Dir | null => {
    const c = [...dirs.filter((d) => d.name === n), ...dirs.filter((d) => d.name === legacy)];
    for (const d of c) if (textOf(d) !== '') return d;
    return dirs.find((d) => d.name === n) ?? dirs.find((d) => d.name === legacy) ?? null;
  };
  const hu = head('UNIT', 'SIR');
  const ut = hu ? textOf(hu) : '';
  const summary: string[] = [];
  const hk = head('KIND', 'KIND');
  const kt = hk ? textOf(hk) : '';
  if (kt !== '') summary.push(KIND_PHRASE.get(kt) ?? 'Kind: ' + kt + ' (not a kind SIR defines).');
  const hf = head('FIDELITY', 'VARIANT');
  const ft = hf ? textOf(hf) : '';
  if (ft !== '') summary.push(FID_PHRASE.get(ft) ?? 'Fidelity: ' + ft + ' (not a fidelity SIR defines).');
  for (const d of dirs) {
    if (d.name !== 'ANCHOR') continue;
    const t = textOf(d).replace(ANCHOR_DOTS, '');
    if (t !== '') { summary.push('Anchored to ' + t + '.'); break; }
  }
  const sigD = dirs.find((d) => d.name === 'SIG');

  const counts = new Map<string, number>();
  const nextId = (base: string): string => {
    const k = (counts.get(base) ?? 0) + 1;
    counts.set(base, k);
    return k === 1 ? base : base + ' #' + k;
  };
  const mk = (d: Dir, base: string, label: string | null, text: string): Item => {
    const item: Item = { id: nextId(base), text, why: d.attrs.map(([k, v]) => whyOf(k, v)), raw: rawOf(d), rawWhy: d.attrs.map(([k, v]) => (v === '' ? k : k + ' ' + v)), line: d.line };
    if (label !== null) item.label = label;
    return item;
  };
  const plain = (d: Dir, label: string | null): Item => {
    let text = textOf(d);
    if (d.name === 'DEPENDS-ON' && NONE.test(text)) text = 'Nothing. No other package is involved.';
    return mk(d, d.name, label, text);
  };
  const pin = (d: Dir): Item => {
    const spans = spansOf(d.args);
    let eq = -1;
    for (let k = 0; k < d.args.length; k++) if (d.args[k] === '=' && !inside(spans, k)) { eq = k; break; }
    const hd = trimST(eq < 0 ? d.args : d.args.slice(0, eq));
    const words = hd.split(/[ \t]+/).filter((w) => w !== '');
    const kind = words[0] ?? '';
    const name = words[1] ?? '';
    let text = textOf(d);
    let emptyVal = false;
    if (eq >= 0) {
      const value = trimST(d.args.slice(eq + 1));
      text = [value, ...d.cont].filter((x) => x !== '').join(' ');
      emptyVal = value === '';
    }
    const kp = PIN_KIND.get(kind);
    const label = (name !== '' ? name : '(unnamed pin)') + ' (' + (kp !== undefined ? kp : kind !== '' ? kind : 'no kind') + (emptyVal ? ', empty value' : '') + ')';
    return mk(d, name !== '' ? 'PIN:' + name : 'PIN', label, text);
  };

  const sections: Section[] = [];
  for (const s of SECS) {
    const items: Item[] = [];
    if (s.id === 'rules') {
      for (const d of dirs) if (isRule(d.name)) items.push(plain(d, 'Rule ' + d.name.slice(1)));
    } else if (s.id === 'pins') {
      for (const d of dirs) if (d.name === 'PINNED') items.push(pin(d));
    } else if (s.id === 'data') {
      for (const d of dirs) {
        if (d.name !== 'CARRIED') continue;
        let e = 0;
        while (e < d.args.length && !isST(d.args[e])) e++;
        const w = d.args.slice(0, e);
        items.push(plain(d, w !== '' ? w : 'Carried data'));
      }
    } else if (s.id === 'more') {
      for (const d of dirs) {
        if (SECTION_MEMBERS.has(d.name) || isRule(d.name)) continue;
        if (d.name === 'BEHAVIOR' && textOf(d) === '' && d.attrs.length === 0) continue;
        const label = !d.known ? d.name + ' (not in the SIR vocabulary)' : OTHER_LABEL.get(d.name) ?? d.name;
        items.push(plain(d, label));
      }
    } else if (s.id === 'stray') {
      for (const st of strays) {
        items.push({ id: nextId('STRAY'), label: 'Line ' + st.line, text: st.text, why: [], raw: st.text, rawWhy: [], line: st.line });
      }
    } else {
      for (const [name, label] of s.members) for (const d of dirs) if (d.name === name) items.push(plain(d, label));
    }
    if (items.length > 0) sections.push({ id: s.id, title: s.title, checked: s.checked, items });
  }
  return { unit: ut !== '' ? ut : '(unnamed)', summary, sig: sigD ? textOf(sigD) : null, checks: [], sections };
}

export default explain_contract;
