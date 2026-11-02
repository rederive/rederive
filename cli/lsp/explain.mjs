// SIR for humans — a plain-English reading of a contract, and of a change to one (a PR). DETERMINISTIC: every sentence is
// either the contract's own text or a fixed phrase keyed to a directive, never a model's paraphrase, so the readable
// version cannot claim anything the contract does not. Each item carries `checked`: true when it is load-bearing (the
// oracle or a gate holds the code to it), false when it is prose (a prior nobody grades) — the line a reviewer most needs.
import { parse, quotedSpans, sirLines } from '../sir/sir-parse.mjs';
import { display, canonicalString } from '../sir/canon.mjs';

const KIND = { FUNCTIONAL: 'A pure function: the same input always gives the same output.', STATE: 'Changes one of its arguments in place; the tests check the result and the changed argument.', EFFECT: 'Talks to the outside world; the tests check the calls it makes, in order.' };
const FIDELITY = { package: 'Matches the original package exactly, quirks included.', spec: 'Follows the cited standard, even where the original package does not.' };
const PIN_KIND = { regex: 'pattern', charset: 'character set', grammar: 'grammar', text: 'exact text', set: 'set', const: 'constant', names: 'names', number: 'number', constant: 'constant', chars: 'characters', order: 'order', map: 'mapping', bytes: 'bytes' };
const LANG = { js: 'JavaScript', ts: 'TypeScript', rust: 'Rust' };
const own = (table, k) => (typeof k === 'string' && Object.hasOwn(table, k) ? table[k] : undefined);   // never an inherited name (`constructor`, `__proto__`)
// a directive's text, VERBATIM (the reading never rewrites contract text: no `R2` → "rule 2", which ran inside literals and
// invented ranges); a TABLE keeps its row boundaries
const text = (d) => [d.args, ...d.cont].filter(Boolean).join(d.name === 'TABLE' ? ' ⏎ ' : ' ');
// what an edit is compared on: the text plus the directive's `#` comments (legacy parse keeps them aside; an edit to one is a change)
const rawOf = (d) => [d.args, ...d.cont].filter(Boolean).join(d.name === 'TABLE' ? '\n' : ' ') + (d.comments?.length ? ` # ${d.comments.join(' # ')}` : '');   // TABLE rows compare on real line breaks: a literal ⏎ in a row is not a boundary
// a directive's citations, raw: CITED, EARNED and ANCHOR attributes (§23a: all three are citation forms), in order
const cites = (d) => d.attrList.filter(([k]) => k === 'CITED' || k === 'EARNED' || k === 'ANCHOR');
const whyText = ([k, v]) => (k === 'EARNED' ? (v ? `added after a failed test (${v})` : 'added after a failed test') : k === 'ANCHOR' ? (v ? `anchored to ${v}` : 'anchored (no reference given)') : v || 'no reason given');
const cut = (s, n) => { const cp = Array.from(s); return cp.length > n ? cp.slice(0, n - 1).join('') + '…' : s; };   // at a code point, never inside a surrogate pair
// directives with a section of their own; every OTHER directive (ORACLE, STATE, EMIT, an unknown name …) is still shown, so
// no edit to a contract can be invisible in its reading
const OTHER_LABEL = { ORACLE: 'The tests (file and fingerprint)', 'ORACLE-CLASS': 'Kind of tests', STATE: 'What it changes in place', SEAM: 'Export shape', 'TRACE-SEAM': 'Effect boundary', SRC: 'Source location', EFFECT: 'Effect', SURFACE: 'Module surface', EMIT: 'Emits', REQUEST: 'Requests', BRANCH: 'Branch', 'ON-ERROR': 'On error', PAR: 'Unordered window', RING: 'Token ring', LIFECYCLE: 'Resource lifecycle', REACH: 'Off-path unit', TRIGGER: 'Trigger', EARNED: 'Earned rule', BEHAVIOR: 'Behavior header' };
const MAPPED = new Set(['UNIT', 'KIND', 'FIDELITY', 'ANCHOR', 'DESCRIPTION', 'SIG', 'ENVELOPE', 'UNGUARDED-PRECONDITION', 'OUT-OF-DOMAIN', 'PINNED', 'TABLE', 'CARRIED', 'DEPENDS-ON', 'INVARIANT', 'SCOPE', 'NOTE', 'RATIONALE', 'PROVENANCE']);

/** → { unit, summary[], sig, checks[], sections: [{ id, title, checked, items: [{ id, label?, text, why[], raw, rawWhy, line }] }] }.
 *  `raw` / `rawWhy` are the contract's own text (compared by explainDiff); `text` / `why` are the reading (shown). An item's
 *  id is unique: a directive that repeats (two TABLEs, two NOTEs, two pins of one name) is numbered from its second one. */
export function explain(primaryText, { langs = [], oracle = null } = {}) {
  const parsed = parse(primaryText); const ast = parsed.ast.filter((d) => d.kind !== 'comment'); const all = (n) => ast.filter((d) => d.name === n); const one = (n) => all(n)[0];
  const header = (n, legacy) => [...all(n), ...all(legacy)].find((d) => text(d)) ?? one(n) ?? one(legacy);   // the first NON-EMPTY one (an empty UNIT never hides a later SIR); the v0.1 spellings (SIR, VARIANT) are read, never written
  const unit = (header('UNIT', 'SIR') && text(header('UNIT', 'SIR'))) || '(unnamed)';
  const kindArg = header('KIND', 'KIND') && text(header('KIND', 'KIND')), fidArg = header('FIDELITY', 'VARIANT') && text(header('FIDELITY', 'VARIANT'));
  const summary = [!kindArg ? null : own(KIND, kindArg) ?? `Kind: ${kindArg} (not a kind SIR defines).`, !fidArg ? null : own(FIDELITY, fidArg) ?? `Fidelity: ${fidArg} (not a fidelity SIR defines).`].filter(Boolean);
  const anchorText = all('ANCHOR').map((d) => text(d).replace(/\.+$/, '')).find(Boolean) ?? ''; if (anchorText) summary.push(`Anchored to ${anchorText}.`);   // the first anchor with something left once its dots are stripped
  const seen = new Map(); const uid = (base) => { const n = (seen.get(base) ?? 0) + 1; seen.set(base, n); return n === 1 ? base : `${base} #${n}`; };
  const sec = (id, title, checked, items) => (items.length ? [{ id, title, checked, items }] : []);
  // a pin's head is split at the first "=" OUTSIDE a quoted literal, on spaces and tabs only (the parser's one whitespace rule)
  const pinParts = (d) => { const spans = quotedSpans(d.args); let eq = -1; for (let i = 0; i < d.args.length; i++) if (d.args[i] === '=' && !spans.some(([a, b]) => i > a && i < b)) { eq = i; break; } const head = (eq < 0 ? d.args : d.args.slice(0, eq)).replace(/^[ \t]+|[ \t]+$/g, '').split(/[ \t]+/).filter(Boolean); return { kind: head[0] ?? '', name: head[1] ?? '', value: [eq < 0 ? '' : d.args.slice(eq + 1).replace(/^[ \t]+|[ \t]+$/g, ''), ...d.cont].filter(Boolean).join(' '), hasEq: eq >= 0 }; };
  const item = (d, label, shownText = text(d)) => ({ id: uid(d.name === 'PINNED' ? (pinParts(d).name ? 'PIN:' + pinParts(d).name : 'PIN') : d.name), ...(label ? { label } : {}), text: shownText, why: cites(d).map(whyText), raw: rawOf(d), rawWhy: cites(d).map(([k, v]) => (v ? `${k} ${v}` : k)), line: d.line });
  const rules = ast.filter((d) => /^R\d+$/.test(d.name));
  const sections = [
    ...sec('header', 'What kind of unit it is', true, [...all('UNIT').map((d) => item(d, 'Name')), ...all('KIND').map((d) => item(d, 'Kind')), ...all('FIDELITY').map((d) => item(d, 'Fidelity')), ...all('ANCHOR').map((d) => item(d, 'Anchor'))]),
    ...sec('what', 'What it is for', false, all('DESCRIPTION').map((d) => item(d))),
    ...sec('inputs', 'What it accepts', true, [...all('SIG').map((d) => item(d, 'Signature')), ...all('ENVELOPE').map((d) => item(d, 'Inputs it is verified on')), ...all('UNGUARDED-PRECONDITION').map((d) => item(d, 'Assumes, without checking')), ...all('OUT-OF-DOMAIN').map((d) => item(d, 'Not covered'))]),
    ...sec('rules', 'What it does', true, rules.map((d) => item(d, `Rule ${d.name.slice(1)}`))),
    // a pin's empty value is said in its label (', empty value'), never as text a contract could also contain
    ...sec('pins', 'Exact definitions', true, all('PINNED').map((d) => { const { kind, name, value } = pinParts(d); const { hasEq } = pinParts(d); const empty = hasEq && !value; return { ...item(d, `${name || '(unnamed pin)'} (${own(PIN_KIND, kind) ?? (kind || 'no kind')}${empty ? ', empty value' : ''})`, hasEq ? value : text(d)) }; })),
    ...sec('table', 'Decision table', true, all('TABLE').map((d) => item(d))),
    ...sec('data', 'Data it carries', true, all('CARRIED').map((d) => item(d, d.args.split(/[ \t]+/)[0] || 'Carried data'))),
    ...sec('deps', 'What it depends on', true, all('DEPENDS-ON').map((d) => { const it = item(d); return /^none$/i.test(text(d)) ? { ...it, text: 'Nothing. No other package is involved.' } : it; })),
    ...sec('more', 'Other parts of the contract', true, ast.filter((d) => !MAPPED.has(d.name) && !/^R\d+$/.test(d.name) && !(d.name === 'BEHAVIOR' && text(d) === '' && !d.attrList.length)).map((d) => item(d, d.kind === 'unknown' ? `${d.name} (not in the SIR vocabulary)` : own(OTHER_LABEL, d.name) ?? d.name))),
    ...sec('stray', 'Text outside any directive', true, [...parsed.ast.filter((d) => d.kind === 'comment').map((d) => d.line), ...parsed.errors.filter((e) => e.code === 'E_NO_DIRECTIVE' || e.code === 'E_ORPHAN_CONTINUATION').map((e) => e.line)]
      .sort((x, y) => x - y).map((line) => { const t = sirLines(primaryText)[line - 1].replace(/^[ \t]+/, ''); return { id: uid('STRAY'), label: `Line ${line}`, text: t, why: [], raw: t, rawWhy: [], line }; })),
    ...sec('holds', 'Should always hold', false, all('INVARIANT').map((d) => item(d))),
    ...sec('scope', 'In and out of scope', false, all('SCOPE').map((d) => item(d))),
    ...sec('notes', 'Background', false, [...all('NOTE').map((d) => item(d, 'Note')), ...all('RATIONALE').map((d) => item(d, 'Why')), ...all('PROVENANCE').map((d) => item(d, 'Where it came from'))]),
  ];
  const checks = [];
  if (oracle) checks.push(oracle.status === 'ok' ? `${oracle.frozen + oracle.heldout} tests captured from the real package: ${oracle.frozen} the builders could see, ${oracle.heldout} kept hidden from them. The test file's fingerprint matches.` : `The test file does not match this contract (${oracle.status}).`);
  if (langs.length) checks.push(`Written for ${langs.map((l) => `${own(LANG, l.lang) ?? l.lang} ${l.ok ? '✓' : '(out of date)'}`).join(', ')}.`);
  return { unit, summary, sig: one('SIG') ? text(one('SIG')) : null, checks, sections };
}

// a word diff (LCS over words) → [{ op: '=', '+', '-', text }], no entry with empty text
export function wordDiff(a, b) {
  const x = a.split(/(\s+)/), y = b.split(/(\s+)/); const n = x.length, m = y.length; const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; const push = (op, t) => { if (out.length && out.at(-1).op === op) out.at(-1).text += t; else out.push({ op, text: t }); };
  let i = 0, j = 0; while (i < n && j < m) { if (x[i] === y[j]) { push('=', x[i]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) push('-', x[i++]); else push('+', y[j++]); }
  while (i < n) push('-', x[i++]); while (j < m) push('+', y[j++]);
  // readable phrases: change runs separated only by whitespace, or by at most two shared words, become one removal + one
  // insertion. Glue joins two change runs, so it is never the last entry (a trailing shared run stays shared).
  const merged = []; let k = 0;
  while (k < out.length) {
    if (out[k].op === '=') { merged.push(out[k++]); continue; }
    let del = '', ins = '', end = k;
    for (let q = k; q < out.length; q++) {
      const p = out[q]; if (p.op === '-') { del += p.text; end = q; continue; } if (p.op === '+') { ins += p.text; end = q; continue; }
      const glue = q + 1 < out.length && (/^\s*$/.test(p.text) || p.text.trim().split(/\s+/).length <= 2);
      if (!glue) break; del += p.text; ins += p.text;
    }
    if (del) merged.push({ op: '-', text: del }); if (ins) merged.push({ op: '+', text: ins }); k = end + 1;
  }
  return merged.filter((e) => e.text !== '');
}

const KINDS = ['changed', 'added', 'removed'];
/** A change to a contract, in plain English → { unit, changes: [{ section, id, label, kind: changed|added|removed, checked,
 *  diff|text, whyDiff? }], warnings: [{ level: stop|note|ok, kind, text }] }. Items are matched by section and id; they are
 *  compared on the contract's own text and citations, never on the reading (`R1-R3` → `R1 - R3` is a change). */
export function explainDiff(beforeText, afterText, { oracleChanged = null, langs = [] } = {}) {
  const a = explain(beforeText), b = explain(afterText); const changes = [];
  const same = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  // items pair by section and id; items of a REPEATED id (`NOTE`, `NOTE #2` …) pair by identical content first, then in
  // order, so an inserted NOTE is one addition, never a cascade of edits. B is keyed by its own ids; A is re-keyed to match.
  const flat = (e) => e.sections.flatMap((s) => s.items.map((it) => ({ s, it, base: `${s.id}|${it.id.replace(/ #\d+$/, '')}` })));
  const fa = flat(a), fb = flat(b); const B = new Map(fb.map((x) => [`${x.s.id}|${x.it.id}`, x])); const A = new Map();
  for (const base of new Set([...fa, ...fb].map((x) => x.base))) {
    const xs = fa.filter((x) => x.base === base), ys = fb.filter((y) => y.base === base); const used = new Set(); const left = [];
    for (const x of xs) { const y = ys.find((y) => !used.has(y) && y.it.raw === x.it.raw && same(y.it.rawWhy, x.it.rawWhy)); if (y) { used.add(y); A.set(`${y.s.id}|${y.it.id}`, x); } else left.push(x); }
    const free = ys.filter((y) => !used.has(y));
    left.forEach((x, i) => A.set(free[i] ? `${free[i].s.id}|${free[i].it.id}` : `${x.s.id}|${x.it.id}|removed`, x));
  }
  for (const [k, { s, it }] of B) { const old = A.get(k);
    if (!old) changes.push({ section: s.title, id: it.id, label: it.label ?? s.title, kind: 'added', checked: s.checked, text: it.text });
    else if (old.it.raw !== it.raw || !same(old.it.rawWhy, it.rawWhy)) changes.push({ section: s.title, id: it.id, label: it.label ?? s.title, kind: 'changed', checked: s.checked, diff: ((d) => (d.some((p) => p.op !== '=') ? d : wordDiff(old.it.raw, it.raw)))(wordDiff(old.it.text, it.text)), whyDiff: same(old.it.rawWhy, it.rawWhy) ? null : wordDiff(old.it.rawWhy.join('; '), it.rawWhy.join('; ')) }); }
  for (const [k, { s, it }] of A) if (!B.has(k)) changes.push({ section: s.title, id: it.id, label: it.label ?? s.title, kind: 'removed', checked: s.checked, text: it.text });
  const warnings = []; const behavior = changes.filter((c) => c.checked);
  if (behavior.length && oracleChanged === false) { const n = behavior.length; const verbs = KINDS.filter((v) => behavior.some((c) => c.kind === v));
    warnings.push({ level: 'stop', kind: 'untested-change', text: `${n} tested ${n === 1 ? 'part was' : 'parts were'} ${verbs.join(' or ')} (${[...new Set(behavior.map((c) => c.label))].join(', ')}), but the tests did not change. Nothing in this PR proves the new behavior: the hidden tests still expect the old one.` }); }
  // when EITHER version promises package fidelity (flipping FIDELITY in the same PR does not dodge it), a CHANGED tested part
  // whose own citation names the package it must match: "FIDELITY package", or an anchor reference (a whole token with an
  // "@", e.g. colors@1.4.0, trailing . , ; : ) ] ignored) — read on the contract's own text, never the reading. A named pin's
  // id is "PIN:<name>" (":" keeps a pin named "#2" apart from the second unnamed pin, "PIN #2")
  // the same header reading as explain(): the first NON-EMPTY FIDELITY, else VARIANT (its v0.1 spelling), and the first non-empty ANCHOR
  const head = (t) => { const ast = parse(t).ast; const first = (...ns) => ast.find((d) => ns.includes(d.name) && text(d)); const fid = first('FIDELITY') ?? first('VARIANT'); return { fid: fid ? text(fid) : undefined, anchor: first('ANCHOR') ? text(first('ANCHOR')).split(/[ \t]+/)[0] || null : null }; };
  const hb = head(beforeText), ha = head(afterText); const refs = [...new Set([hb.anchor, ha.anchor].filter((r) => r && r.includes('@')))];
  if (hb.fid === 'package' || ha.fid === 'package') {
    const cited = behavior.filter((c) => c.kind === 'changed').map((c) => { const v = [...B.values()].find((v) => v.s.title === c.section && v.it.id === c.id); const i = v ? v.it.rawWhy.findIndex((w) => w.includes('FIDELITY package') || refs.some((r) => w.split(/[ \t]+/).some((t) => t.replace(/[.,;:)\]]+$/, '') === r))) : -1; return { c, w: i >= 0 ? v.it.why[i] : null }; }).filter((x) => x.w);
    if (cited.length) { const q = cited[0].w.replace(/^FIDELITY package — /, ''); warnings.push({ level: 'stop', kind: 'citation', text: `This contract promises to match the original package exactly, and ${cited.map((x) => x.c.label).join(' and ')} still ${cited.length > 1 ? 'cite' : 'cites'} that package as the reason for the old behavior ("${cut(q, 110)}"). The edit contradicts its own citation.` }); }
  }
  if (!behavior.length && changes.length) warnings.push({ level: 'ok', kind: 'prose-only', text: 'Only unchecked prose changed. The code is held to exactly what it was held to before.' });
  const stale = [...new Set(langs.filter((l) => typeof l === 'string' && l !== ''))];
  if (behavior.length && stale.length) warnings.push({ level: 'note', kind: 'stale-langs', text: `The ${stale.map((l) => own(LANG, l) ?? l).join(', ')} ${stale.length > 1 ? 'files were' : 'file was'} written against the old version. ${stale.length > 1 ? 'They go' : 'It goes'} out of date until someone reviews ${stale.length > 1 ? 'them' : 'it'} against this one and re-binds ${stale.length > 1 ? 'them' : 'it'}.` });
  return { unit: b.unit, changes, warnings };
}

// ---- tests: what a PR did to an oracle -----------------------------------------------------------------------------------
// a value as a reviewer reads it: the canonical display (a value outside it, e.g. a legacy-coded one, as its JSON), with every
// control character — C0, DEL and C1, escaped by display or raw — shown by name (‹ESC›, ‹BEL›, ‹CSI›) or code (‹U+0085›)
const NAMES = { 0x1b: 'ESC', 0x07: 'BEL', 0x0a: '\\n', 0x0d: '\\r', 0x09: '\\t', 0x00: 'NUL', 0x9b: 'CSI' };
const nameOf = (c) => `‹${NAMES[c] ?? 'U+' + c.toString(16).toUpperCase().padStart(4, '0')}›`;
export const shown = (tv) => { try { let t; try { t = display(tv); } catch { t = '?'; } if (typeof t !== 'string' || t === '?') t = JSON.stringify(tv) ?? 'undefined';
  return t.replace(/\\u00([0-9a-f]{2})|\\u([0-9a-f]{4})/g, (m, a, b) => { const c = parseInt(a ?? b, 16); return c < 0x20 || (c >= 0x7f && c <= 0x9f) ? nameOf(c) : m; }).replace(/[\u0000-\u001f\u007f-\u009f]/g, (ch) => nameOf(ch.charCodeAt(0))); } catch { return '?'; } };
// a value's identity as text: a TYPED encoding — every value carries its kind (n number, s string, b bool, z null, u
// undefined, [ list, { map), so no JSON value can spell another (the earlier tag {"\u0000n": …} was itself a map a file
// could contain), and -0 / ±Infinity / NaN stay apart from 0 / null. Nesting past 2000 levels encodes as one marker.
const keyOf = (v, depth = 0) => (depth > 2000 ? '!deep' : v === null ? 'z' : v === undefined ? 'u' : typeof v === 'number' ? `n${Object.is(v, -0) ? '-0' : String(v)}` : typeof v === 'string' ? `s${JSON.stringify(v)}` : typeof v === 'boolean' ? `b${v}`
  : Array.isArray(v) ? `[${v.map((x) => keyOf(x, depth + 1)).join(',')}]` : typeof v === 'object' ? `{${Object.keys(v).map((k) => `${JSON.stringify(k)}:${keyOf(v[k], depth + 1)}`).join(',')}}` : `?${typeof v}`);
const same = (x, y) => { try { return canonicalString(x) === canonicalString(y); } catch { return keyOf(x) === keyOf(y); } };
// own keys only: an absent `__proto__` must not read as the prototype ({}), an absent `constructor` as a function
const ownVal = (o, k) => (Object.hasOwn(o, k) ? keyOf(o[k]) : '\u0000absent');
/** Two versions of an oracle file → { before, after: 'ok' | 'unparseable' | 'unknown-shape' | 'malformed-cases' | 'too-deep', added,
 *  removed, rewritten: [{ name, hidden, input, from, to, inputChanged }], inputsChanged, moved, otherChanged: [{ name, keys }],
 *  fileChanged: [key], reordered }. No edit to a test hides: an answer rewritten together with its input is still rewritten;
 *  cases are keyed by (name as JSON, whether it is present, occurrence), so 1 ≠ "1", a missing name ≠ null, and a duplicate's
 *  number can never collide with a literal name; args compare as written (malformed args included); a case's other keys and
 *  the file's own keys (encoding, unit, sig — not its hash) are compared; a junk element makes the file 'malformed-cases';
 *  a change of order is reported. */
export function oracleDiff(beforeJson, afterJson) {
  const read = (t) => {
    let o; try { o = JSON.parse(t); } catch { return { shape: 'unparseable', cases: [], file: {} }; }
    if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.frozen) || !Array.isArray(o.heldout)) return { shape: 'unknown-shape', cases: [], file: {} };
    // nested deeper than keyOf distinguishes (2000 levels): not compared partially — the file is reported as too deep (a Stop)
    { const stack = [[o, 0]]; while (stack.length) { const [v, d] = stack.pop(); if (d > 2000) return { shape: 'too-deep', cases: [], file: {} }; if (v && typeof v === 'object') for (const k of Object.keys(v)) stack.push([v[k], d + 1]); } }
    const seen = new Map(), cases = []; let junk = 0;
    for (const [list, hidden] of [[o.frozen, false], [o.heldout, true]]) for (const c of list) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) { junk++; continue; }
      const has = Object.hasOwn(c, 'name'); const id = JSON.stringify([has ? keyOf(c.name) : null, has]); const k = (seen.get(id) ?? 0) + 1; seen.set(id, k);
      const shownName = (has ? (typeof c.name === 'string' ? c.name : JSON.stringify(c.name) ?? 'undefined') : '(no name)') + (k > 1 ? ` (#${k})` : '');
      const { name: _n, args: _a, expected: _e, ...other } = c;
      cases.push({ key: JSON.stringify([id, k]), name: shownName, hidden, argsRaw: c.args, args: Array.isArray(c.args) ? c.args : [c.args], expected: c.expected, other });
    }
    const { frozen: _f, heldout: _h, canonicalSha256: _c, ...file } = o;
    return { shape: junk ? 'malformed-cases' : 'ok', cases, file };
  };
  const a = read(beforeJson), b = read(afterJson); const A = new Map(a.cases.map((c) => [c.key, c])), B = new Map(b.cases.map((c) => [c.key, c]));
  const input = (c) => (Array.isArray(c.argsRaw) ? c.args.map(shown).join(', ') : `(args: ${shown(c.argsRaw)})`);
  const out = { before: a.shape, after: b.shape, added: [], removed: [], rewritten: [], inputsChanged: [], moved: [], otherChanged: [], fileChanged: [], reordered: false };
  for (const c of b.cases) { const old = A.get(c.key);
    if (!old) { out.added.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) }); continue; }
    const argsChanged = !same(old.argsRaw, c.argsRaw);
    if (argsChanged) out.inputsChanged.push({ name: c.name, hidden: c.hidden, from: input(old), to: input(c) });
    if (!same(old.expected, c.expected)) out.rewritten.push({ name: c.name, hidden: c.hidden, input: input(c), from: shown(old.expected), to: shown(c.expected), inputChanged: argsChanged });
    if (old.hidden !== c.hidden) out.moved.push({ name: c.name, from: old.hidden ? 'hidden' : 'visible', to: c.hidden ? 'hidden' : 'visible' });
    const keys = [...new Set([...Object.keys(old.other), ...Object.keys(c.other)])].filter((k) => ownVal(old.other, k) !== ownVal(c.other, k)).sort();
    if (keys.length) out.otherChanged.push({ name: c.name, keys }); }
  for (const c of a.cases) if (!B.has(c.key)) out.removed.push({ name: c.name, hidden: c.hidden, input: input(c), to: shown(c.expected) });
  out.fileChanged = [...new Set([...Object.keys(a.file), ...Object.keys(b.file)])].filter((k) => ownVal(a.file, k) !== ownVal(b.file, k)).sort();
  const common = (x, y) => x.cases.map((c) => c.key).filter((k) => (y === a ? A : B).has(k));
  out.reordered = JSON.stringify(common(a, b)) !== JSON.stringify(common(b, a));
  return out;
}
