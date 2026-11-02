// SIR editor analysis — the ONE engine behind `rdv lsp` (any LSP editor) and the VS Code extension (github.com/rederive/vscode-sir, which bundles it from npm).
// Every judgment is rdv's own: the per-file validator (validateText), the v0.5 lints, the PRIMARY-SHA256 binding and the
// oracle hashes — the editor never holds a second opinion, so what it underlines is what `rdv check` refuses.
// Pure over (path, text, ctx): ctx.read(path) → text | null (an open buffer first, then disk), ctx.list(dir) → file names,
// ctx.mode 'auto' | 'strict' | 'legacy'. Positions are LSP's: 0-based line, UTF-16 character (a JS string index).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, basename, join, resolve } from 'node:path';
import { parse, canonicalSha, canonicalText, DIRECTIVES } from '../sir/sir-parse.mjs';
import { legacyPrintSha } from '../sir/legacy-print.mjs';
import { validateText } from '../sir/validate.mjs';
import { LANGS, transcriptionLint, leakLint, pinLint, schemaLint, carriedDeclared, carriedBinding } from '../sir/v05.mjs';
import { vectorSetSha, ENCODING, TYPES } from '../sir/canon.mjs';
import { MEANINGS } from '../sir/directive-table.mjs';
import { linkSections } from './spec-sections.mjs';

export const SEVERITY = { error: 1, warning: 2, info: 3, hint: 4 };   // LSP DiagnosticSeverity
const TAG_DEPRECATED = 2;
export const diskContext = (open = new Map(), mode = 'auto') => ({
  mode,
  read: (p) => (open.has(p) ? open.get(p) : existsSync(p) ? readFileSync(p, 'utf8') : null),
  list: (d) => { try { return readdirSync(d); } catch { return []; } },
});

// ---- the document and its family ---------------------------------------------------------------------------------------
const FAMILY_FILE = /^(.+?)\.([^.]+)\.sir$/;   // the family() reader's own pattern: <unit>.<lang>.sir
export function load(path, text, ctx) {
  const dir = dirname(path), base = basename(path); const m = base.match(FAMILY_FILE);
  const unit = m ? m[1] : base.replace(/\.sir$/, ''), role = m ? 'language' : 'primary', lang = m ? m[2] : null;
  const langFiles = ctx.list(dir).map((f) => f.match(FAMILY_FILE)).filter((x) => x && x[1] === unit).map((x) => ({ lang: x[2], path: join(dir, x[0]) })).sort((a, b) => a.lang.localeCompare(b.lang));
  const v05 = role === 'language' || langFiles.length > 0;   // a v0.5 family is held to the strict register; a lone v0.1–v0.4 primary is read as legacy
  const mode = ctx.mode === 'strict' || ctx.mode === 'legacy' ? ctx.mode : v05 ? 'strict' : 'legacy';
  const primaryPath = join(dir, `${unit}.sir`);
  return { path, text, dir, unit, role, lang, langFiles, v05, mode, primaryPath, root: basename(dir) === 'sir' ? dirname(dir) : dir,
    lines: text.split(/\r\n|\r|\n/), ast: parse(text, { mode }).ast.filter((d) => d.kind !== 'comment') };
}
const primaryText = (doc, ctx) => (doc.role === 'primary' ? doc.text : ctx.read(doc.primaryPath));
const safeSha = (text) => { try { return canonicalSha(text); } catch { return null; } };
const shortSha = (h) => (h ? h.slice(0, 12) + '…' : '—');
// a directive's lines: its own, then every continuation up to the next directive (trailing blank lines excluded)
function spanOf(doc, i) {
  const d = doc.ast[i]; const next = doc.ast[i + 1]; let end = (next ? next.line : doc.lines.length + 1) - 2;
  while (end > d.line - 1 && !doc.lines[end].trim()) end--;
  return { start: d.line - 1, end };
}
const lineRange = (doc, line0) => { const l = doc.lines[line0] ?? ''; const s = l.length - l.trimStart().length; return { start: { line: line0, character: s }, end: { line: line0, character: l.length } }; };
const firstLine = (doc, name) => { const d = doc.ast.find((x) => x.name === name); return d ? d.line - 1 : 0; };

/** PRIMARY-SHA256 against the primary's canonical text: ok | stale | legacy | unbound | no-primary. */
export function bindingOf(langText, ptext) {
  const bound = langText.match(/^PRIMARY-SHA256\s+([0-9a-f]{64})/m)?.[1] ?? null;
  if (ptext === null) return { status: 'no-primary', bound, primarySha: null };
  const primarySha = safeSha(ptext);
  if (!bound) return { status: 'unbound', bound, primarySha };
  if (bound === primarySha) return { status: 'ok', bound, primarySha };
  let legacy = false; try { legacy = bound === legacyPrintSha(ptext); } catch {}
  return { status: legacy ? 'legacy' : 'stale', bound, primarySha };
}

const oracleMemo = new Map();
/** The primary's ORACLE line against the oracle file: the file's own hash, and the hash the primary declares (§10x). */
export function oracleOf(doc, ctx) {
  const i = doc.ast.findIndex((d) => d.name === 'ORACLE'); if (i < 0) return null;
  const d = doc.ast[i]; const value = [d.args, ...d.cont].join(' ');
  const rel = value.match(/->\s*(\S+)/)?.[1] ?? null; const declared = value.match(/CANONICAL-SHA256\s+([0-9a-f]{64})/)?.[1] ?? null;
  const out = { line: d.line - 1, rel, declared, path: rel ? resolve(doc.root, rel) : null };
  if (!rel) return { ...out, status: 'no-path' };
  const text = ctx.read(out.path); if (text === null) return { ...out, status: 'missing' };
  const hit = oracleMemo.get(out.path); let o;
  if (hit && hit.text === text) o = hit.o;
  else {
    o = { ok: false };
    try { const j = JSON.parse(text); o = { ok: true, encoding: j.encoding, fileSha: j.canonicalSha256, frozen: j.frozen?.length ?? 0, heldout: j.heldout?.length ?? 0 };
      if (j.encoding === ENCODING) { try { o.vectors = vectorSetSha(j); } catch (e) { o.vectorsError = e.message; } } }
    catch (e) { o = { ok: false, error: e.message }; }
    oracleMemo.set(out.path, { text, o });
  }
  if (!o.ok) return { ...out, status: 'unparseable', error: o.error };
  if (o.encoding !== ENCODING) return { ...out, ...o, status: 'legacy-encoding' };
  if (o.vectorsError) return { ...out, ...o, status: 'unhashable' };
  if (o.vectors !== o.fileSha) return { ...out, ...o, status: 'file-sha' };
  if (!declared) return { ...out, ...o, status: 'undeclared' };
  return { ...out, ...o, status: declared === o.vectors ? 'ok' : 'declared-sha' };
}

/** The primary's rules: R<n> → { line (0-based), text, cited }. */
export function rulesOf(ptext) {
  const rules = new Map(); if (ptext === null) return rules;
  for (const d of parse(ptext).ast) if (/^R\d+$/.test(d.name)) rules.set(d.name, { line: d.line - 1, text: [d.args, ...d.cont].filter(Boolean).join(' '), cited: d.attrList.map(([k, v]) => `${k} ${v}`) });
  return rules;
}
// every rule a line names: `R2`, and each rule inside a range (`R1-R4`, `R1–R4`, `R1-4`) — with the span that names it
export function ruleRefs(line) {
  const out = [];
  for (const m of line.matchAll(/\bR(\d+)(?:\s*[-–]\s*R?(\d+))?\b/g)) {
    const a = +m[1], b = m[2] !== undefined ? +m[2] : a; const span = { start: m.index, end: m.index + m[0].length };
    if (b >= a && b - a < 200) for (let n = a; n <= b; n++) out.push({ name: `R${n}`, ...span, single: a === b }); else out.push({ name: `R${a}`, ...span, single: true });
  }
  return out;
}

// ---- diagnostics -------------------------------------------------------------------------------------------------------
const EXPLAIN = {
  E_COMMENT: (m) => `${m || 'a `#` comment'} — v0.5 has no comments: prose lives in DESCRIPTION / NOTE / RATIONALE`,
  E_NO_DIRECTIVE: () => 'text before the first directive: every line is a directive or an indented continuation of one',
  E_UNINDENTED_CONTINUATION: () => 'not a directive at column 0: indent the line to continue the directive above',
  E_ORPHAN_CONTINUATION: () => 'an indented line with no directive above it',
  E_LEGACY_COLON: (m) => `\`${m}:\` is the legacy spelling: write \`${m}\` without the colon`,
  W_LEGACY_COLON: (m) => `\`${m}:\` is the legacy spelling: write \`${m}\` without the colon`,
  E_PSEUDOCODE: (m) => `${m} is pseudocode, not a directive: state the behavior as a numbered rule (R<n>) under BEHAVIOR`,
  E_EMITTER_META: (m) => `${m} is an instruction to an emitter, not contract: a SIR says what the unit does, never how to write it`,
  E_UNKNOWN_DIRECTIVE: (m) => `${m} is not in the SIR vocabulary (§23a)`,
  E_UNCITED_PIN: () => 'a pin must name what earned it: add `CITED <rule or source>` (or `EARNED round-<n> heldout <vector>`)',
  E_NO_SIG: () => 'a primary needs a SIG', E_SIG: (m) => m,
  W_LEGACY_COMMENT: () => 'legacy `#` comment (strict v0.5 refuses it: use NOTE or RATIONALE)',
  W_LEGACY_TRAILING_COMMENT: () => 'legacy trailing `#` comment (strict v0.5 refuses it: make it a CITED attribute or a NOTE)',
  W_UNINDENTED_CONTINUATION: () => 'legacy unindented continuation (strict v0.5 refuses it: indent the line)',
};
const say = (code, msg) => linkSections(EXPLAIN[code] ? EXPLAIN[code](msg) : msg || code).replace(/\[(§[^\]]+)\]\([^)]*\)/g, '$1');   // a diagnostic is plain text: keep the § mark, drop the link
const LEGACY_NAMES = { SIR: 'UNIT', VARIANT: 'FIDELITY', 'CARRIED-DATA': 'CARRIED', NOTES: 'NOTE', 'GUARD-PINNED': 'PINNED' };

export function diagnostics(path, text, ctx) {
  const doc = load(path, text, ctx); const out = []; const seen = new Set();
  const push = (severity, code, line0, message, extra = {}) => { const k = `${code}|${line0}|${extra.key ?? ''}`; if (seen.has(k)) return; seen.add(k);
    out.push({ range: extra.range ?? lineRange(doc, line0), severity, code, source: 'rdv', message, ...(extra.tags ? { tags: extra.tags } : {}), ...(extra.data ? { data: extra.data } : {}) }); };
  const reg = doc.role === 'primary' ? 'P' : 'L';
  // 1. the validator's own per-file checks (a file-level finding, line 0, is placed on the directive it is about)
  const where = { E_SIG: 'SIG', E_STATE_ARG: 'STATE', E_STATE_KIND: 'KIND', W_STATE_UNDECLARED: 'KIND', W_NOTE_DENSITY: 'UNIT' };
  const at = (e) => (e.line ? e.line - 1 : where[e.code] ? firstLine(doc, where[e.code]) : 0);
  const v = validateText(text, { mode: doc.mode, reg });
  for (const e of v.errors) push(SEVERITY.error, e.code, at(e), say(e.code, e.msg));
  for (const w of v.warnings) push(doc.mode === 'legacy' && /^W_LEGACY|^W_UNINDENTED/.test(w.code) ? SEVERITY.hint : SEVERITY.warning, w.code, at(w), say(w.code, w.msg));
  for (const d of doc.ast) if (d.kind === 'legacy' && LEGACY_NAMES[d.name]) push(SEVERITY.hint, 'W_LEGACY_DIRECTIVE', d.line - 1, `${d.name} is read, never written: v0.5 writes ${LEGACY_NAMES[d.name]}`, { tags: [TAG_DEPRECATED] });
  // 2. the v0.5 line lints (the validator runs them family-wide in lintFamily; here they keep their lines)
  const ptext = primaryText(doc, ctx);
  let decl = null; if (ptext !== null) { try { decl = carriedDeclared(ptext); } catch (e) { if (doc.role === 'primary') push(SEVERITY.error, 'E_LINT', firstLine(doc, 'CARRIED'), `carried data: ${e.message}`); } }
  if (doc.v05 || doc.mode === 'strict') {
    for (const h of leakLint(text, { isPrimary: doc.role === 'primary' }).hits) {
      if (doc.role === 'primary') push(SEVERITY.error, 'E_LANGUAGE_LEAK', h.line - 1, `language leak — ${h.what}: the primary is language-neutral; say it in a language file's ABI or MECHANISM`);
      else push(SEVERITY.error, 'E_REGISTER', h.line - 1, 'behavior in a language file: rules belong to the primary; a language file says how (ABI, MECHANISM, PINNED)');
    }
    for (const h of pinLint(text).hits) push(SEVERITY.error, 'E_UNCITED_PIN', h.line - 1, say('E_UNCITED_PIN'));
    for (const h of schemaLint(text, decl?.name).hits) push(SEVERITY.error, 'E_CARRIED_AS_DEPENDENCY', h.line - 1, linkSections(h.what).replace(/\[(§[^\]]+)\]\([^)]*\)/g, '$1'));
  }
  if (doc.role === 'primary') {
    const t = transcriptionLint(text);
    for (const h of t.hits) push(SEVERITY.info, 'I_CODE_SHAPE', h.line - 1, `code shape in the contract (${h.what}): a primary states behavior, not an implementation`);
    if (t.density > 0.10) push(SEVERITY.warning, 'W_TRANSCRIPTION_DENSITY', firstLine(doc, 'UNIT'), `transcription density ${(t.density * 100).toFixed(0)}% > 10% (${t.hitLines} code-shaped lines): this primary reads like a transcription of one implementation`);
  }
  // 3. the family: binding, language registry, oracle
  if (doc.role === 'language') {
    if (!LANGS.has(doc.lang)) push(SEVERITY.error, 'E_LANG_REGISTRY', 0, `'${doc.lang}' is not in the closed language registry (${[...LANGS].join(', ')})`);
    const declared = doc.ast.find((d) => d.name === 'LANG');
    if (declared && declared.args !== doc.lang) push(SEVERITY.error, 'E_FAMILY', declared.line - 1, `LANG ${declared.args} ≠ the filename's language ${doc.lang}`);
    const b = bindingOf(text, ptext); const bl = firstLine(doc, 'PRIMARY-SHA256');
    if (b.status === 'no-primary') push(SEVERITY.error, 'E_NO_PRIMARY', 0, `no primary: ${doc.unit}.sir is not beside this file`);
    else if (b.status === 'unbound') push(SEVERITY.error, 'E_UNBOUND', declared ? declared.line - 1 : 0, 'no PRIMARY-SHA256 binding: a language file names the primary it was written against', { data: { primarySha: b.primarySha } });
    else if (b.status === 'stale') push(SEVERITY.error, 'E_STALE_BINDING', bl, `STALE — bound to ${shortSha(b.bound)}, the primary is now ${shortSha(b.primarySha)}: review this file against the primary, then re-bind`, { data: { primarySha: b.primarySha } });
    else if (b.status === 'legacy') push(SEVERITY.error, 'E_LEGACY_BINDING', bl, 'LEGACY BINDING — bound to the pre-2026-10-26 print hash, which does not cover every character of the primary: re-bind', { data: { primarySha: b.primarySha } });
  } else {
    for (const f of doc.langFiles) {
      if (!LANGS.has(f.lang)) { push(SEVERITY.error, 'E_LANG_REGISTRY', 0, `${basename(f.path)}: '${f.lang}' is not in the closed language registry (${[...LANGS].join(', ')})`); continue; }
      const lt = ctx.read(f.path); if (lt === null) continue; const b = bindingOf(lt, text);
      if (b.status !== 'ok') push(SEVERITY.warning, 'W_FAMILY_' + b.status.toUpperCase(), firstLine(doc, 'UNIT'), `${basename(f.path)} is ${b.status === 'stale' ? `bound to an earlier primary (${shortSha(b.bound)}): review it against this primary and re-bind it` : b.status === 'unbound' ? 'not bound to this primary (no PRIMARY-SHA256)' : 'bound by the legacy print hash: re-bind it'}`, { key: f.path });
    }
    const o = oracleOf(doc, ctx);
    if (o) {
      const msg = { 'no-path': 'ORACLE names no file: write `ORACLE value -> oracles/<unit>.json CANONICAL-SHA256 <hex>`', missing: `${o.rel} does not exist`,
        unparseable: `${o.rel} is not valid JSON: ${o.error}`, 'legacy-encoding': `${o.rel} is untyped (not ${ENCODING}): run sir-factory encode-oracle`,
        unhashable: `${o.rel}: the vectors cannot be hashed (${o.vectorsError})`,
        'file-sha': `${o.rel}: the file says ${shortSha(o.fileSha)}, its vectors hash ${shortSha(o.vectors)} — the oracle was edited after it was frozen`,
        undeclared: `the ORACLE line declares no CANONICAL-SHA256 (the vectors hash ${shortSha(o.vectors)})`,
        'declared-sha': `the primary declares ${shortSha(o.declared)}, the vectors hash ${shortSha(o.vectors)} — the primary and the oracle disagree` }[o.status];
      const code = { 'no-path': 'E_ORACLE_PATH', missing: 'W_NO_ORACLE', unparseable: 'E_ORACLE_JSON', 'legacy-encoding': 'W_ORACLE_LEGACY', unhashable: 'E_ORACLE_FILE_SHA', 'file-sha': 'E_ORACLE_FILE_SHA', undeclared: 'W_ORACLE_UNDECLARED', 'declared-sha': 'E_ORACLE_DECLARED_SHA' }[o.status];
      if (msg) push(code.startsWith('E_') ? SEVERITY.error : SEVERITY.warning, code, o.line, msg);   // never a quick fix: a hash that disagrees is a finding, not a typo
    }
  }
  return out.sort((a, b) => a.range.start.line - b.range.start.line || a.severity - b.severity);
}

// ---- hover -------------------------------------------------------------------------------------------------------------
const REGISTER = { P: 'primary', L: 'language file', B: 'primary and language files' };
const KINDNAME = { lb: 'load-bearing — a claim the oracle or a gate checks', pr: 'prose — an unverified prior, never graded', legacy: 'legacy — read, never written' };
const ATTRS = {
  CITED: 'Attribute: what earned the rule or pin it follows — a rule (`CITED R2`), a fidelity (`CITED FIDELITY package`) or a source. Every PINNED needs one (§23a rule 4).',
  EARNED: 'What earned a rule or pin after an observed divergence: `EARNED round-<n> heldout <vector>`.',
  ANCHOR: 'What the contract (or this line) is anchored to (§12); `ref(<lang>:…)` is the §12x cross-language anchor.',
};
const TYPE_DOC = {
  text: 'Unicode text: a sequence of Unicode scalar values (`cu: utf8`). A lone surrogate has no neutral form; only the js extension can hold one.',
  bytes: 'A byte string, carried as canonical base64.', bool: '`true` or `false`.', none: 'The absent value. Equals only `none`.',
  i64: 'A signed 64-bit integer, exact (a decimal string on the wire).', u64: 'An unsigned 64-bit integer, exact.',
  f64: 'An IEEE-754 double. The 16 hex digits of its bits are normative: `-0` ≠ `+0`, every NaN is one NaN, no tolerance.',
  json: 'none | bool | f64 | text | list[json] | map[text, json] — no undefined, functions or dates (those are envelope facts).',
  tuple: '`tuple[A, B, …]`: a fixed-length sequence, one type per position.', list: '`list[T]`: any number of values of one type.',
  map: '`map[K, V]`: entries sorted by key (a text key by UTF-16 code units).', record: '`record[name: T, …]`: named fields, in declared order.',
};
const VALUE_DOC = {
  KIND: { FUNCTIONAL: 'The result depends only on the arguments (§1).', STATE: 'The unit mutates an argument; the oracle observes `{result, post}` (§11).', EFFECT: 'The unit crosses a `<domain>.<verb>` boundary; graded by a trace oracle (§7, §15).' },
  FIDELITY: { package: 'Reproduce the package exactly, quirks included (§12).', spec: 'Follow the cited standard; where the package deviates from it, the spec wins (§12).' },
  'ORACLE-CLASS': { deterministic: 'Expected values are fixed outputs (§15).', trace: 'Expected values are traces across the declared seam (§15).' },
};
// the rule the cursor is on: `R2`, or the one number of a range under it (`R1-R4` at the 4 → R4)
function ruleAt(line, ch) {
  const ref = ruleRefs(line).find((x) => ch >= x.start && ch <= x.end); if (!ref) return null;
  const sub = [...line.slice(ref.start, ref.end).matchAll(/R?(\d+)/g)].find((m) => ch >= ref.start + m.index && ch <= ref.start + m.index + m[0].length);
  return { name: sub ? `R${sub[1]}` : ref.name, start: ref.start, end: ref.end };
}
const wordAt = (line, ch) => { for (const m of line.matchAll(/[A-Za-z0-9_][A-Za-z0-9_\-]*/g)) if (ch >= m.index && ch <= m.index + m[0].length) return { word: m[0], start: m.index, end: m.index + m[0].length }; return null; };
const md = (value) => ({ kind: 'markdown', value });
function directiveDoc(name) {
  const entry = DIRECTIVES[name] ?? (/^R\d+$/.test(name) ? 'P:lb' : null); if (!entry) return null;
  const [r, k] = entry.split(':'); const meaning = /^R\d+$/.test(name) ? 'One numbered rule under `BEHAVIOR`.' : MEANINGS[name];
  return `**${name}** · ${KINDNAME[k]} · ${REGISTER[r]}\n\n${linkSections(meaning)}`;
}
function ruleDoc(name, rules, refs) {
  const r = rules.get(name); if (!r) return `**${name}** — not a rule of this unit's primary`;
  return [`**${name}** (primary, line ${r.line + 1})`, '', r.text, ...(r.cited.length ? ['', r.cited.map((c) => `\`${c.split(' ')[0]}\` ${c.slice(c.indexOf(' ') + 1)}`).join('  \n')] : []),
    ...(refs?.length ? ['', `Named by: ${refs.map((x) => `${x.file}:${x.line + 1}`).join(', ')}`] : [])].join('\n');
}
export function hover(path, text, pos, ctx) {
  const doc = load(path, text, ctx); const line = doc.lines[pos.line] ?? ''; const w = wordAt(line, pos.character); if (!w) return null;
  const range = (s, e) => ({ start: { line: pos.line, character: s }, end: { line: pos.line, character: e } });
  const own = doc.ast.find((d) => d.line - 1 === pos.line);
  // a rule, alone or inside a range (`R1-R4`) — except a primary's own `R<n>` at column 0, which gets the directive hover
  const ref = ruleAt(line, pos.character);
  if (ref && !(own && w.start === 0 && own.name === ref.name)) { const rules = rulesOf(primaryText(doc, ctx)); const r = rules.get(ref.name);
    const named = refsOf(doc, ref.name, ctx).filter((x) => !(x.path === doc.primaryPath && x.line === r?.line)).map((x) => ({ file: basename(x.path), line: x.line }));
    return { contents: md(ruleDoc(ref.name, rules, named)), range: range(ref.start, ref.end) }; }
  if (w.start === 0 && own && own.name === w.word) { const d = directiveDoc(w.word); if (d) return { contents: md(d + (/^R\d+$/.test(w.word) ? '\n\n' + ruleDoc(w.word, rulesOf(primaryText(doc, ctx))).split('\n').slice(2).join('\n') : '')), range: range(w.start, w.end) }; }
  if (ATTRS[w.word] && w.start > 0) return { contents: md(`**${w.word}**\n\n${linkSections(ATTRS[w.word])}`), range: range(w.start, w.end) };
  const holder = holderOf(doc, pos.line);
  if (/^[0-9a-f]{64}$/.test(w.word)) {
    if (holder?.name === 'PRIMARY-SHA256' && doc.role === 'language') { const b = bindingOf(text, primaryText(doc, ctx));
      return { contents: md(`**PRIMARY-SHA256** — the canonical-text hash of the primary this file was written against (§23b)\n\n${b.status === 'ok' ? `✓ bound: \`${doc.unit}.sir\` hashes to this today` : b.status === 'no-primary' ? `✗ \`${doc.unit}.sir\` is not beside this file` : `✗ ${b.status}: \`${doc.unit}.sir\` now hashes to \`${b.primarySha}\``}`), range: range(w.start, w.end) }; }
    if (holder?.name === 'ORACLE') { const o = oracleOf(doc, ctx);
      return { contents: md(`**Oracle hash** — SHA-256 of the canonical string of the frozen and held-out vectors (§10x)\n\n${o?.status === 'ok' ? `✓ \`${o.rel}\` hashes to this: ${o.frozen} frozen + ${o.heldout} held-out` : `✗ ${o?.status ?? 'no oracle'}${o?.vectors ? `: the vectors hash \`${o.vectors}\`` : ''}`}`), range: range(w.start, w.end) }; }
    return { contents: md('A SHA-256 (64 lowercase hex digits).'), range: range(w.start, w.end) };
  }
  if (holder && VALUE_DOC[holder.name]?.[w.word]) return { contents: md(`**${holder.name} ${w.word}**\n\n${linkSections(VALUE_DOC[holder.name][w.word])}`), range: range(w.start, w.end) };
  if (holder?.name === 'SIG' && doc.role === 'primary' && TYPE_DOC[w.word] && w.start > 0) return { contents: md(`**${w.word}** · abstract type (§10x)\n\n${linkSections(TYPE_DOC[w.word])}`), range: range(w.start, w.end) };
  if (holder?.name === 'LANG' && LANGS.has(w.word)) return { contents: md(`**${w.word}** — a language in the closed registry (${[...LANGS].join(', ')})`), range: range(w.start, w.end) };
  return null;
}
// the directive a line belongs to (its own line or one of its continuations)
function holderOf(doc, line0) { let h = null; for (const d of doc.ast) { if (d.line - 1 > line0) break; h = d; } return h; }

// ---- navigation --------------------------------------------------------------------------------------------------------
export function definition(path, text, pos, ctx) {
  const doc = load(path, text, ctx); const line = doc.lines[pos.line] ?? ''; const holder = holderOf(doc, pos.line);
  const ref = ruleAt(line, pos.character);
  if (ref) { const r = rulesOf(primaryText(doc, ctx)).get(ref.name); if (r) return [{ path: doc.primaryPath, line: r.line, character: 0 }]; }
  if (doc.role === 'language' && (holder?.name === 'PRIMARY-SHA256' || holder?.name === 'UNIT')) return ctx.read(doc.primaryPath) === null ? [] : [{ path: doc.primaryPath, line: 0, character: 0 }];
  if (holder?.name === 'ORACLE') { const o = oracleOf(doc, ctx); if (o?.path && ctx.read(o.path) !== null) return [{ path: o.path, line: 0, character: 0 }]; }
  if (holder?.name === 'CARRIED' && doc.role === 'language') { const b = carriedBinding(text); if (b) { const base = b.module.split('/').pop(); const p = [join(doc.root, 'carried', base), join(doc.root, 'runs', base)].find((x) => ctx.read(x) !== null); if (p) return [{ path: p, line: 0, character: 0 }]; } }
  return [];
}
/** Every line in the family that names a rule (alone or in a range), the rule's own line first. */
export function references(path, text, pos, ctx) {
  const doc = load(path, text, ctx); const ref = ruleAt(doc.lines[pos.line] ?? '', pos.character); return ref ? refsOf(doc, ref.name, ctx) : [];
}
function refsOf(doc, name, ctx) {
  const files = [[doc.primaryPath, primaryText(doc, ctx)], ...doc.langFiles.map((f) => [f.path, f.path === doc.path ? doc.text : ctx.read(f.path)])];
  const out = [];
  for (const [p, t] of files) { if (t === null) continue; t.split(/\r\n|\r|\n/).forEach((l, i) => { for (const r of ruleRefs(l)) if (r.name === name) out.push({ path: p, line: i, character: r.start, endCharacter: r.end }); }); }
  return out;
}

// ---- outline, folding --------------------------------------------------------------------------------------------------
const SYMBOL = { File: 1, Module: 2, Namespace: 3, Class: 5, Method: 6, Property: 7, Field: 8, Interface: 11, Function: 12, Constant: 14, String: 15, Array: 18, Struct: 23, Event: 24 };
const symbolKind = (n) => (/^R\d+$/.test(n) ? SYMBOL.Function : { UNIT: SYMBOL.Module, SIG: SYMBOL.Interface, BEHAVIOR: SYMBOL.Namespace, PINNED: SYMBOL.Constant, EARNED: SYMBOL.Constant, CARRIED: SYMBOL.Struct, ORACLE: SYMBOL.Event, TABLE: SYMBOL.Array,
  NOTE: SYMBOL.String, DESCRIPTION: SYMBOL.String, RATIONALE: SYMBOL.String, PROVENANCE: SYMBOL.String, SCOPE: SYMBOL.String, INVARIANT: SYMBOL.String, ABI: SYMBOL.Class, MECHANISM: SYMBOL.Method }[n] ?? SYMBOL.Property);
const clip = (s, n = 60) => (Array.from(s).length > n ? Array.from(s).slice(0, n - 1).join('') + '…' : s);
export function documentSymbols(path, text, ctx) {
  const doc = load(path, text, ctx); const out = []; let behavior = null;
  doc.ast.forEach((d, i) => {
    const { start, end } = spanOf(doc, i); const isRule = /^R\d+$/.test(d.name);
    const sym = { name: d.name === 'PINNED' ? `PINNED ${d.args.split('=')[0].trim()}` : d.name, detail: clip(d.name === 'PINNED' ? d.args.split('=').slice(1).join('=').trim() : d.args || d.cont[0] || ''), kind: symbolKind(d.name),
      range: { start: { line: start, character: 0 }, end: { line: end, character: (doc.lines[end] ?? '').length } }, selectionRange: { start: { line: start, character: 0 }, end: { line: start, character: d.name.length } }, children: [] };
    if (isRule && behavior) { behavior.children.push(sym); behavior.range.end = sym.range.end; return; }
    behavior = d.name === 'BEHAVIOR' ? sym : null; out.push(sym);
  });
  return out;
}
export function foldingRanges(path, text, ctx) {
  const doc = load(path, text, ctx); const out = []; let block = null;
  doc.ast.forEach((d, i) => { const { start, end } = spanOf(doc, i); if (end > start) out.push({ startLine: start, endLine: end, ...(d.name === 'NOTE' ? { kind: 'comment' } : {}) });
    if (d.name === 'BEHAVIOR') block = { startLine: start, endLine: end }; else if (/^R\d+$/.test(d.name) && block) block.endLine = end; else if (block) { if (block.endLine > block.startLine) out.push(block); block = null; } });
  if (block && block.endLine > block.startLine) out.push(block);
  return out;
}

// ---- completion --------------------------------------------------------------------------------------------------------
const COMPLETION = { Keyword: 14, Snippet: 15, Value: 12, Reference: 18, TypeParameter: 25, EnumMember: 20 };
export function completion(path, text, pos, ctx) {
  const doc = load(path, text, ctx); const line = (doc.lines[pos.line] ?? '').slice(0, pos.character); const reg = doc.role === 'primary' ? 'P' : 'L';
  const rules = () => [...rulesOf(primaryText(doc, ctx))].map(([n, r]) => ({ label: n, kind: COMPLETION.Reference, detail: clip(r.text, 80), documentation: md(r.text) }));
  if (/^[A-Z0-9-]*$/.test(line)) {   // column 0: a directive
    const items = [];
    for (const [name, entry] of Object.entries(DIRECTIVES)) { const [r, k] = entry.split(':'); if (k === 'legacy' || (r !== 'B' && r !== reg)) continue;
      const item = { label: name, kind: COMPLETION.Keyword, detail: `${k === 'lb' ? 'load-bearing' : 'prose'} · ${REGISTER[r]}`, documentation: md(linkSections(MEANINGS[name])), insertText: name + ' ' };
      if (name === 'PINNED') Object.assign(item, { kind: COMPLETION.Snippet, insertText: 'PINNED ${1|regex,charset,grammar,text,set,const,names,number|} ${2:NAME} = ${3:literal} CITED ${4:R1}', insertTextFormat: 2 });
      if (name === 'ORACLE') Object.assign(item, { kind: COMPLETION.Snippet, insertText: `ORACLE value -> oracles/${doc.unit}.json CANONICAL-SHA256 \${1:hash}`, insertTextFormat: 2 });
      if (name === 'UNIT') item.insertText = `UNIT ${doc.unit}`;
      if (name === 'LANG' && doc.lang) item.insertText = `LANG ${doc.lang}`;
      if (name === 'PRIMARY-SHA256') { const sha = safeSha(primaryText(doc, ctx) ?? ''); if (sha && ctx.read(doc.primaryPath) !== null) { item.insertText = `PRIMARY-SHA256 ${sha}`; item.detail = `bind to ${doc.unit}.sir as it is now (${shortSha(sha)})`; } }
      items.push(item); }
    if (doc.role === 'primary') { const n = Math.max(0, ...doc.ast.filter((d) => /^R\d+$/.test(d.name)).map((d) => +d.name.slice(1))) + 1; if (doc.ast.some((d) => d.name === 'BEHAVIOR')) items.unshift({ label: `R${n}`, kind: COMPLETION.Keyword, detail: 'the next rule', insertText: `R${n} `, sortText: '0' }); }
    return items;
  }
  const holder = holderOf(doc, pos.line);
  if (/\b(?:CITED|EARNED)\s+(?:[\w-]*\s+)?R?\d*$/.test(line) || /\bR\d*$/.test(line) && /\b(?:CITED|MECHANISM)\b/.test(line)) return rules();
  const head = line.match(/^([A-Z][A-Z0-9-]*)\s+\w*$/)?.[1];
  if (head && VALUE_DOC[head]) return Object.entries(VALUE_DOC[head]).map(([v, d]) => ({ label: v, kind: COMPLETION.EnumMember, documentation: md(linkSections(d)) }));
  if (head === 'LANG') return [...LANGS].map((l) => ({ label: l, kind: COMPLETION.EnumMember }));
  if (holder?.name === 'SIG' && doc.role === 'primary' && /(?::|->|\[|\||,)\s*\w*$/.test(line)) return [...TYPES, 'tuple', 'list', 'map', 'record'].map((t) => ({ label: t, kind: COMPLETION.TypeParameter, documentation: md(linkSections(TYPE_DOC[t])), ...(['tuple', 'list', 'map', 'record'].includes(t) ? { insertText: `${t}[\${1}]`, insertTextFormat: 2 } : {}) }));
  return [];
}

// ---- formatting, fixes, lenses -----------------------------------------------------------------------------------------
/** The binding normal form (§23b) as the layout: it can only change what the binding already ignores, so a formatted file
 *  keeps its hash — and every language file stays bound. → the new text, or null when there is nothing to change. */
export function format(text) { let t; try { t = canonicalText(text); } catch { return null; } return t === text ? null : t; }
export function codeActions(path, text, diags, ctx) {
  const doc = load(path, text, ctx); const out = [];
  for (const d of diags) {
    const l0 = d.range.start.line, l = doc.lines[l0] ?? '';
    if ((d.code === 'E_STALE_BINDING' || d.code === 'E_LEGACY_BINDING') && d.data?.primarySha) { const m = l.match(/[0-9a-f]{64}/);
      if (m) out.push({ title: `Re-bind to ${doc.unit}.sir as it is now (${shortSha(d.data.primarySha)}) — after reviewing this file against it`, diagnostic: d, edits: [{ range: { start: { line: l0, character: m.index }, end: { line: l0, character: m.index + 64 } }, newText: d.data.primarySha }] }); }
    if (d.code === 'E_UNBOUND' && d.data?.primarySha) out.push({ title: `Bind to ${doc.unit}.sir (${shortSha(d.data.primarySha)})`, diagnostic: d, edits: [{ range: { start: { line: l0 + 1, character: 0 }, end: { line: l0 + 1, character: 0 } }, newText: `PRIMARY-SHA256 ${d.data.primarySha}\n` }] });
    if (d.code === 'E_LEGACY_COLON' || d.code === 'W_LEGACY_COLON') { const m = l.match(/^([A-Z][A-Z0-9-]*):/); if (m) out.push({ title: `Write ${m[1]} without the colon`, diagnostic: d, edits: [{ range: { start: { line: l0, character: m[1].length }, end: { line: l0, character: m[1].length + 1 } }, newText: '' }] }); }
    if (d.code === 'E_COMMENT' && /^#/.test(l)) out.push({ title: 'Turn the comment into a NOTE', diagnostic: d, edits: [{ range: { start: { line: l0, character: 0 }, end: { line: l0, character: l.length } }, newText: 'NOTE ' + l.replace(/^#+[ \t]*/, '') }] });
    if (d.code === 'W_LEGACY_DIRECTIVE') { const m = l.match(/^[A-Z][A-Z0-9-]*/); if (m && LEGACY_NAMES[m[0]] && m[0] !== 'SIR') out.push({ title: `Write ${LEGACY_NAMES[m[0]]}`, diagnostic: d, edits: [{ range: { start: { line: l0, character: 0 }, end: { line: l0, character: m[0].length } }, newText: LEGACY_NAMES[m[0]] }] }); }
  }
  return out;
}
/** One line of state above the lines a reviewer checks: the family's bindings, the oracle, this file's binding. */
export function codeLenses(path, text, ctx) {
  const doc = load(path, text, ctx); const out = [];
  if (doc.role === 'primary') {
    const parts = doc.langFiles.map((f) => { const t = ctx.read(f.path); const b = t === null ? { status: 'unreadable' } : bindingOf(t, text); return { f, b }; });
    if (parts.length) { out.push({ line: firstLine(doc, 'UNIT'), ok: parts.every(({ b }) => b.status === 'ok'), title: 'bindings: ' + parts.map(({ f, b }) => `${f.lang} ${b.status === 'ok' ? '✓' : '✗ ' + b.status}`).join(' · '), command: 'sir.open', arguments: parts.map(({ f }) => f.path) }); }
    else if (doc.v05 === false && doc.mode === 'legacy') out.push({ line: firstLine(doc, 'UNIT'), title: 'single-file SIR (pre-v0.5): read in the legacy register' });
    const o = oracleOf(doc, ctx);
    if (o) out.push({ line: o.line, ok: o.status === 'ok', title: o.status === 'ok' ? `✓ oracle: ${o.frozen} frozen + ${o.heldout} held-out · hash matches` : `✗ oracle: ${o.status}`, ...(o.path && ctx.read(o.path) !== null ? { command: 'sir.open', arguments: [o.path] } : {}) });
  } else {
    const b = bindingOf(text, primaryText(doc, ctx));
    out.push({ line: firstLine(doc, 'PRIMARY-SHA256'), ok: b.status === 'ok', title: b.status === 'ok' ? `✓ bound to ${doc.unit}.sir as it is now` : `✗ ${b.status}${b.primarySha ? ` — ${doc.unit}.sir is now ${shortSha(b.primarySha)}` : ''}`, ...(ctx.read(doc.primaryPath) !== null ? { command: 'sir.open', arguments: [doc.primaryPath] } : {}) });
  }
  return out;
}
