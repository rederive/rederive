// The editor engine (cli/lsp/analyze.mjs) must never be a second opinion: across every v0.5 family in the repo it reports
// exactly where rdv's validator does (every validator error with a line is underlined on that line, a family the validator
// passes has no editor error, a family it fails has one), it sees an unsaved edit the way rdv would see it saved, and its
// formatter can never stale a binding. Run: node --test cli/lsp/analyze.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import * as A from './analyze.mjs';
import { validate } from '../sir/validate.mjs';
import { canonicalSha } from '../sir/sir-parse.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const COLORS = join(ROOT, 'packages/colors'), P = join(COLORS, 'sir/strip.sir'), J = join(COLORS, 'sir/strip.js.sir');
const read = (p) => readFileSync(p, 'utf8');
const files = execFileSync('git', ['ls-files', '*.sir'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').map((f) => join(ROOT, f));
const errs = (ds) => ds.filter((d) => d.severity === A.SEVERITY.error);
const lineOf = (text, prefix) => text.split('\n').findIndex((l) => l.startsWith(prefix));

test('parity with rdv\'s validator on every v0.5 family in the repo', () => {
  const primaries = files.filter((f) => basename(dirname(f)) === 'sir' && !/\.[^.]+\.sir$/.test(basename(f)) && files.some((g) => g !== f && dirname(g) === dirname(f) && basename(g).startsWith(basename(f, '.sir') + '.')));
  assert.ok(primaries.length >= 50, `expected the corpus, found ${primaries.length} families`);
  let failing = 0;
  for (const p of primaries) {
    const unit = basename(p, '.sir'), sirDir = dirname(p); const v = validate(dirname(sirDir), { unit }); const ctx = A.diskContext();
    const fam = [p, ...files.filter((g) => g !== p && dirname(g) === sirDir && basename(g).startsWith(unit + '.'))];
    const by = Object.fromEntries(fam.map((f) => [f === p ? 'primary' : basename(f).split('.').slice(-2, -1)[0], A.diagnostics(f, read(f), ctx)]));
    const all = errs(Object.values(by).flat());
    if (v.ok) assert.deepEqual(all.map((d) => d.code), [], `${p}: rdv passes it, the editor must not underline an error`);
    else { failing++; assert.ok(all.length, `${p}: rdv fails it (${v.errors.map((e) => e.code)}), the editor must show an error`); }
    for (const e of v.errors.filter((x) => x.line)) assert.ok((by[e.where] ?? []).some((d) => d.code === e.code && d.range.start.line === e.line - 1), `${p}: ${e.code} @${e.where}:${e.line} not underlined`);
  }
  assert.ok(failing >= 1, 'the corpus carries at least one failing control');
});

test('the shipped colors bundle is clean, and its lenses say so', () => {
  const ctx = A.diskContext();
  assert.deepEqual(A.diagnostics(P, read(P), ctx), []);
  assert.deepEqual(A.diagnostics(J, read(J), ctx), []);
  assert.deepEqual(A.codeLenses(P, read(P), ctx).map((l) => l.ok), [true, true]);
  assert.match(A.codeLenses(P, read(P), ctx)[1].title, /9 frozen \+ 8 held-out · hash matches/);
});

test('an unsaved primary edit stales every language file; the re-bind fix binds to exactly canonicalSha', () => {
  const p2 = read(P).replace('R1 The result', 'R1 The output'); const ctx = A.diskContext(new Map([[P, p2]]));
  const d = A.diagnostics(J, read(J), ctx); assert.deepEqual(d.map((x) => x.code), ['E_STALE_BINDING']);
  assert.deepEqual(A.diagnostics(P, p2, ctx).map((x) => x.code), ['W_FAMILY_STALE', 'W_FAMILY_STALE', 'W_FAMILY_STALE']);
  const [fix] = A.codeActions(J, read(J), d, ctx); assert.equal(fix.edits[0].newText, canonicalSha(p2));
  const lines = read(J).split('\n'); const e = fix.edits[0]; lines[e.range.start.line] = lines[e.range.start.line].slice(0, e.range.start.character) + e.newText + lines[e.range.start.line].slice(e.range.end.character);
  assert.deepEqual(A.diagnostics(J, lines.join('\n'), ctx), []);
});

test('a tampered oracle is caught two ways and never offered a fix', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sir-lsp-')); cpSync(COLORS, dir, { recursive: true });
  const op = join(dir, 'oracles/strip.json'), o = JSON.parse(read(op)); const pp = join(dir, 'sir/strip.sir');
  o.heldout[0].expected = { t: 'text', v: 'tampered', cu: 'utf8' }; writeFileSync(op, JSON.stringify(o));
  const d = A.diagnostics(pp, read(pp), A.diskContext()); assert.deepEqual(d.map((x) => x.code), ['E_ORACLE_FILE_SHA']);
  assert.deepEqual(A.codeActions(pp, read(pp), d, A.diskContext()), []);
  assert.equal(validate(dir, { unit: 'strip' }).errors.some((e) => e.code === 'E_ORACLE_FILE_SHA'), true, 'rdv agrees');
});

test('strict-register mistakes are underlined on their line', () => {
  const t = read(J).replace('DEPENDS-ON none', 'DEPENDS-ON none\n# a comment\nR9 a rule in a language file\nPINNED regex X = /a/');
  const d = A.diagnostics(J, t, A.diskContext()); const at = (c) => d.filter((x) => x.code === c).map((x) => x.range.start.line);
  const ls = t.split('\n');
  assert.deepEqual(at('E_COMMENT'), [ls.indexOf('# a comment')]);
  assert.deepEqual(at('E_REGISTER'), [ls.indexOf('R9 a rule in a language file')]);
  assert.deepEqual(at('E_UNCITED_PIN'), [ls.indexOf('PINNED regex X = /a/')]);
  assert.ok(d.some((x) => x.code === 'E_STALE_BINDING') === false, 'a language-file edit does not move its own binding');
});

test('format never changes a binding — on every SIR file in the repo', () => {
  let changed = 0;
  for (const f of files) { const t = read(f); let before; try { before = canonicalSha(t); } catch { continue; } const out = A.format(t); if (out === null) continue; changed++;
    assert.equal(canonicalSha(out), before, f); assert.equal(A.format(out), null, `${f}: format is idempotent`); }
  assert.ok(changed > 0, 'some corpus file is not in normal form (the property is exercised)');
});

test('hover, definition and references follow rules across the family', () => {
  const ctx = A.diskContext(), j = read(J), p = read(P);
  const m = lineOf(j, 'MECHANISM R1-R4'); const at = j.split('\n')[m].indexOf('R4') + 1;
  assert.match(A.hover(J, j, { line: m, character: at }, ctx).contents.value, /^\*\*R4\*\* \(primary, line \d+\)\n\nThe removal is ONE pass/);
  assert.deepEqual(A.definition(J, j, { line: m, character: at }, ctx), [{ path: P, line: lineOf(p, 'R4 '), character: 0 }]);
  const refs = A.references(P, p, { line: lineOf(p, 'R2 '), character: 1 }, ctx).map((r) => basename(r.path));
  for (const f of ['strip.sir', 'strip.js.sir', 'strip.ts.sir', 'strip.rust.sir']) assert.ok(refs.includes(f), `R2 is named in ${f}`);
  assert.match(A.hover(P, p, { line: lineOf(p, 'PINNED'), character: 2 }, ctx).contents.value, /\[§23a\]\(https:\/\/github\.com\/rederive\/sir-spec/);
  assert.match(A.hover(J, j, { line: lineOf(j, 'PRIMARY-SHA256'), character: 30 }, ctx).contents.value, /✓ bound/);
});

test('completion offers the register\'s directives and binds PRIMARY-SHA256 to the primary as it is', () => {
  const ctx = A.diskContext(), j = read(J);
  const labels = A.completion(J, j + '\n', { line: j.split('\n').length, character: 0 }, ctx).map((c) => c.label);
  assert.ok(labels.includes('MECHANISM') && !labels.includes('BEHAVIOR') && !labels.includes('SIR'), labels.join(' '));
  assert.equal(A.completion(J, j, { line: 2, character: 3 }, ctx).find((c) => c.label === 'PRIMARY-SHA256').insertText, `PRIMARY-SHA256 ${canonicalSha(read(P))}`);
  const sig = read(P).split('\n'); const s = lineOf(read(P), 'SIG '); sig[s] = 'SIG strip(str: '; assert.ok(A.completion(P, sig.join('\n'), { line: s, character: sig[s].length }, ctx).some((c) => c.label === 'f64'));
});

test('the outline nests the rules under BEHAVIOR', () => {
  const s = A.documentSymbols(P, read(P), A.diskContext()); const b = s.find((x) => x.name === 'BEHAVIOR');
  assert.deepEqual(b.children.map((c) => c.name), ['R1', 'R2', 'R3', 'R4']);
  assert.ok(!s.some((x) => /^R\d/.test(x.name)));
});
