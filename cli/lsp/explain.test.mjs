// Scars from the review system's self-treatment (selfhost units word_diff, explain_diff, escape_property; 2026-11-02): each
// finding the sighted decomposers made against the pinned code is a fixture here, so it cannot come back.
// Run: node --test cli/lsp/explain.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wordDiff, explainDiff, explain } from './explain.mjs';
import { annotations } from './pr-review.mjs';

const rebuild = (d, side) => d.filter((e) => e.op === '=' || e.op === side).map((e) => e.text).join('');
const H = 'UNIT u\nKIND FUNCTIONAL\nFIDELITY package\nANCHOR pkg@1.0.0 f\nSIG f(x: text) -> text\nBEHAVIOR\n';
const stops = (r) => r.warnings.filter((w) => w.level === 'stop').map((w) => w.kind);

test('word_diff #1: a diff rebuilds both texts exactly (trailing whitespace was emitted three times)', () => {
  for (const [a, b] of [['a ', 'b '], ['a  ', 'b \t'], [' \ta', '  b'], ['x y', 'y x'], ['', ''], ['a b c', 'a b c'], ['a x b c y d', 'a p b c q d']]) {
    const d = wordDiff(a, b); assert.equal(rebuild(d, '-'), a, JSON.stringify([a, b, d])); assert.equal(rebuild(d, '+'), b, JSON.stringify([a, b, d]));
    assert.ok(d.every((e) => e.text !== ''), 'no empty entries');
  }
});

test('explain_diff #1: an edit to the first of two TABLEs (or NOTEs) is seen', () => {
  const r = explainDiff(H + 'R1 r\nTABLE A\n  x | 1\nTABLE B\n  y | 2\n', H + 'R1 r\nTABLE A\n  x | 9\nTABLE B\n  y | 2\n', { oracleChanged: false });
  assert.deepEqual(r.changes.map((c) => [c.label, c.kind]), [['Decision table', 'changed']]); assert.deepEqual(stops(r), ['untested-change']);
});

test('explain_diff #2: a pin\'s continuation lines are compared', () => {
  const r = explainDiff(H + 'R1 r\nPINNED regex X = /a/ CITED R1\n', H + 'R1 r\nPINNED regex X = /a/ CITED R1\n  and also /b/\n', { oracleChanged: false });
  assert.deepEqual(r.changes.map((c) => c.label), ['X (pattern)']);
});

test('explain_diff #3: an edit hidden by the rule-reference reading is still a change', () => {
  assert.equal(explainDiff(H + 'R1 see R1-R3\n', H + 'R1 see R1 - R3\n').changes.length, 1);
});

test('explain_diff #4/#5: ANCHOR is a citation, and citations compare as lists', () => {
  assert.equal(explainDiff(H + 'R1 r CITED ANCHOR x.js\n', H + 'R1 r CITED ANCHOR y.js\n').changes.length, 1);
  assert.equal(explainDiff(H + 'R1 r CITED a|b\n', H + 'R1 r CITED a CITED b\n').changes.length, 1);
  const d = explainDiff(H + 'R1 r CITED a; b\n', H + 'R1 r CITED a CITED b\n').changes[0]; assert.ok(d.whyDiff.some((p) => p.op !== '='), 'the why-diff shows the difference');
});

test('explain_diff #6/#7: a UNIT rename and an unknown directive are seen', () => {
  assert.deepEqual(explainDiff(H + 'R1 r\n', H.replace('UNIT u', 'UNIT v') + 'R1 r\n').changes.map((c) => c.label), ['Name']);
  assert.deepEqual(explainDiff(H + 'R1 r\nWIDGET a\n', H + 'R1 r\nWIDGET b\n').changes.map((c) => c.label), ['WIDGET (not in the SIR vocabulary)']);
  assert.equal(explainDiff(H + 'R1 r\nORACLE-CLASS deterministic\n', H + 'R1 r\nORACLE-CLASS trace\n').changes.length, 1);
});

test('explain_diff #8/#9: the citation Stop reads the parse of the AFTER version, and only for changed parts', () => {
  const r = (b) => b + 'R1 old CITED FIDELITY package — pkg@1.0.0 does this\n';
  const changed = (h) => explainDiff(r(h), r(h).replace('R1 old', 'R1 new'), { oracleChanged: true });
  assert.deepEqual(stops(changed(H.replace('FIDELITY package', 'FIDELITY  package'))), ['citation'], 'two spaces still parse as package');
  assert.deepEqual(stops(changed(H.replace('FIDELITY package', 'FIDELITY spec'))), [], 'spec fidelity: no citation stop');
  assert.deepEqual(stops(explainDiff(H + 'R1 a\n', H + 'R1 a\nR2 b CITED v@2\n', { oracleChanged: true })), [], 'an added part contradicts nothing');
});

test('explain_diff #10: a long quote is cut at a code point', () => {
  const q = 'a'.repeat(108) + '🙂b'; const t = explainDiff(H + `R1 x CITED FIDELITY package — ${q}\n`, H + `R1 y CITED FIDELITY package — ${q}\n`, { oracleChanged: true }).warnings[0].text;
  assert.ok(t.isWellFormed(), 'no lone surrogate');
});

test('explain_diff #11/#15/#16: wording follows the change kinds, stale ids are deduplicated, inherited names are not table entries', () => {
  assert.match(explainDiff(H + 'R1 a\n', H + 'R1 a\nR2 b\n', { oracleChanged: false }).warnings[0].text, /^1 tested part was added /);
  assert.match(explainDiff(H + 'R1 a\n', H + 'R1 b\n', { langs: ['', 'js', 'js'] }).warnings.at(-1).text, /^The JavaScript file was written/);
  assert.equal(explain(H.replace('KIND FUNCTIONAL', 'KIND constructor') + 'R1 a\n').summary[0], 'Kind: constructor (not a kind SIR defines).');
  assert.match(explain(H + 'PINNED __proto__ X = 1 CITED R1\n').sections.find((s) => s.id === 'pins').items[0].label, /^X \(__proto__\)$/);
});

test('escape_property #5: an annotation\'s level and line cannot carry text', () => {
  const a = annotations([{ level: 'error::add-mask', path: 'p', line: '3,title=x', title: 't', message: 'm' }]);
  assert.equal(a, '::error file=p,title=t::m');
});

test('explain_diff round 2 #1/#8: a pin\'s kind and head are compared; an unnamed pin cannot collide with one named "(unnamed)"', () => {
  assert.equal(explainDiff(H + 'R1 r\nPINNED grammar CODE = x CITED R1\n', H + 'R1 r\nPINNED regex CODE = x CITED R1\n').changes.length, 1);
  assert.equal(explainDiff(H + 'R1 r\nPINNED regex HEX6 = x CITED R1\n', H + 'R1 r\nPINNED regex HEX6 extra = x CITED R1\n').changes.length, 1);
  assert.deepEqual(explainDiff(H + 'R1 r\nPINNED text (unnamed) = 1 CITED R1\nPINNED = 2 CITED R1\n', H + 'R1 r\nPINNED = 2 CITED R1\n').changes.map((c) => c.kind), ['removed']);
});

test('explain_diff round 2 #2: text on the BEHAVIOR line is seen; a bare BEHAVIOR is not an item', () => {
  assert.equal(explainDiff(H.replace('BEHAVIOR\n', 'BEHAVIOR a\n') + 'R1 r\n', H.replace('BEHAVIOR\n', 'BEHAVIOR c\n') + 'R1 r\n').changes.length, 1);
  assert.ok(!explain(H + 'R1 r\n').sections.some((s) => s.id === 'more'));
});

test('explain_diff round 2 #4/#5: the anchor is matched as a whole token; flipping FIDELITY in the same PR does not dodge the citation Stop', () => {
  const H2 = H.replace('ANCHOR pkg@1.0.0 f', 'ANCHOR the spec');
  assert.deepEqual(stops(explainDiff(H2 + 'R1 a CITED where the code goes\n', H2 + 'R1 b CITED where the code goes\n', { oracleChanged: true })), []);
  const r1 = 'R1 old CITED FIDELITY package — keeps it\n';
  assert.deepEqual(stops(explainDiff(H + r1, H.replace('FIDELITY package', 'FIDELITY spec') + r1.replace('R1 old', 'R1 new'), { oracleChanged: true })), ['citation']);
});

test('explain_diff round 2 #6/#7: an inserted NOTE is one addition; a change hidden by the reading shows the raw text', () => {
  assert.deepEqual(explainDiff(H + 'R1 r\nNOTE a\nNOTE b\n', H + 'R1 r\nNOTE z\nNOTE a\nNOTE b\n').changes.map((c) => c.kind), ['added']);
  const d = explainDiff(H + 'R1 see R1-R3\n', H + 'R1 see R1–R3\n').changes[0].diff; assert.ok(d.some((p) => p.op !== '='), 'the diff shows what changed');
});

test('explain_diff round 3 #1/#2: a pin named "#2" never hides an unnamed pin; a cited anchor may end in punctuation', () => {
  const pins = explain(H + 'PINNED = a CITED R1\nPINNED = b CITED R1\nPINNED x #2 = c CITED R1\n').sections.find((s) => s.id === 'pins').items.map((i) => i.id);
  assert.equal(new Set(pins).size, 3, pins.join(' | '));
  const r = 'R1 old CITED rule kept by pkg@1.0.0.\n';
  assert.deepEqual(stops(explainDiff(H + r, H + r.replace('R1 old', 'R1 new'), { oracleChanged: true })), ['citation']);
});

// ---- phase 2 (explain_contract, hunk_lines, directive_spans, annotations_text, review_summary, binding_of)
import { hunkLines, spans, gitLine, summary } from './pr-review.mjs';
import { bindingOf } from './analyze.mjs';
import { canonicalSha } from '../sir/sir-parse.mjs';

test('explain_contract #1–#3: the reading never rewrites contract text (no R1 → "rule 1" inside literals, no invented ranges)', () => {
  const e = explain(H + 'R1 waits R3 - 5 seconds\nPINNED regex X = /R1/ CITED R1\nSIG f(R1: text) -> text\n');
  const t = e.sections.flatMap((s) => s.items).map((i) => i.text).join('\n');
  assert.match(t, /waits R3 - 5 seconds/); assert.match(t, /\/R1\//); assert.doesNotMatch(t, /rule \d|rules \d/);
});

test('explain_contract #4/#5: a comment edit and text outside any directive are seen', () => {
  assert.equal(explainDiff(H + 'R1 x # a\n', H + 'R1 x # b\n').changes.length, 1);
  assert.equal(explainDiff('stray first\n' + H + 'R1 x\n', 'stray second\n' + H + 'R1 x\n').changes.length, 1);
});

test('explain_contract #8–#13: multi-line KIND, empty anchor, pins with no "=" or a quoted "=", NBSP in a pin head, empty citations', () => {
  assert.equal(explain('UNIT u\nKIND\n  FUNCTIONAL\n').summary[0], 'A pure function: the same input always gives the same output.');
  assert.ok(!explain('UNIT u\nANCHOR\n').summary.some((x) => x.startsWith('Anchored')));
  const pins = explain(H + 'PINNED regex X\nPINNED text "a=b" = c CITED R1\n').sections.find((s) => s.id === 'pins').items;
  assert.equal(pins[0].text, 'regex X'); assert.equal(pins[1].label, '"a=b" (exact text)'); assert.equal(pins[1].text, 'c');
  assert.equal(explain(H + 'R1 x CITED\n').sections.find((s) => s.id === 'rules').items[0].why[0], 'no reason given');
});

test('hunk_lines F1–F3: header text inside content is not a header; huge ranges are dropped; line 0 is not a line', () => {
  assert.deepEqual(hunkLines('@@ -1,0 +2 @@ q @@ -1 +901,2 @@\n+a\n+q\r@@ -1 +900 @@\n'), [2]);
  assert.deepEqual(hunkLines('@@ -1 +9007199254740992,2 @@\n'), []);
  assert.deepEqual(hunkLines('@@ -1 +9007199254740991 @@\n'), [9007199254740991]);
  assert.deepEqual(hunkLines('@@ -1 +1,20000000 @@\n@@ -1 +5 @@\n'), [5]);
  assert.deepEqual(hunkLines('@@ -1 +0 @@\n@@ -2 +3,2 @@\n'), [3, 4]);
});

test('directive_spans F1/F2: spans are in git lines (a lone CR is not a line), and a final break adds no line', () => {
  const t = 'UNIT u\rKIND k\nSIG s\n'; const g = gitLine(t);
  assert.deepEqual([g(1), g(2), g(3)], [1, 1, 2]);
  assert.deepEqual([...spans('UNIT u\nKIND k\n')], [[1, 1], [2, 2]]);
});

test('annotations F1–F3: missing fields are empty, a malformed element is skipped, a line is a safe integer', () => {
  assert.equal(annotations([{}, null, 3, { level: 'notice', path: 'p', line: 1e21, title: 't', message: 'm' }]), '::error file=,title=::\n::notice file=p,title=t::m');
});

test('review_summary F1–F7 + round 2: a cell renders nothing (code span), cannot break the table, an unknown status fails closed', () => {
  const s = summary({ units: [{ unit: 'a|b`<script>', status: 'FAIL', change: 'x\n## h ![i](https://e.x/i.png)', tests: '✓', bindings: '✓', citations: '✓' }], stops: -1 });
  assert.match(s, /❌ 1 of 1 contract failing/); assert.ok(!s.includes('\n## h'));
  const row = s.split('\n').find((l) => l.startsWith('| ❌'));
  assert.equal(row.split(/(?<!\\)\|/).length, 8, 'six cells');
  assert.ok(row.includes('``a\\|b`<script>``') && row.includes('`x ## h ![i](https://e.x/i.png)`'), row);
  assert.ok(!/Stop/.test(s)); assert.match(summary({ units: [], stops: 2 }), /No SIR contract changed\.\n\n2 Stops/);
});

test('binding_of F1–F4: a binding is read through the parser — next-line, 65-digit and NBSP-separated hashes do not bind', () => {
  const p = 'UNIT u\nKIND FUNCTIONAL\n'; const h = canonicalSha(p);
  assert.equal(bindingOf(`UNIT u\nPRIMARY-SHA256 ${h}\n`, p).status, 'ok');
  for (const lang of [`UNIT u\nPRIMARY-SHA256\n  ${h}\n`, `UNIT u\nPRIMARY-SHA256 ${h}0\n`, `UNIT u\nPRIMARY-SHA256 ${h}\n`, `UNIT u x PRIMARY-SHA256 ${h}\n`]) assert.equal(bindingOf(lang, p).status, 'unbound', JSON.stringify(lang));
});

test('oracle_diff F1–F3, F7–F9, F13/F14: no edit to a test hides — rewritten-with-input, duplicates, moves, unreadable files', async () => {
  const { oracleDiff, shown } = await import('./explain.mjs');
  const t = (v) => ({ t: 'text', v, cu: 'utf8' }); const o = (frozen, heldout) => JSON.stringify({ frozen, heldout });
  const base = o([{ name: 'a', args: [t('x')], expected: t('1') }], [{ name: 'h', args: [t('y')], expected: t('2') }]);
  const both = oracleDiff(base, o([{ name: 'a', args: [t('x')], expected: t('1') }], [{ name: 'h', args: [t('z')], expected: t('9') }]));
  assert.deepEqual([both.rewritten.map((x) => [x.name, x.inputChanged]), both.inputsChanged.map((x) => x.name)], [[['h', true]], ['h']]);
  const dup = oracleDiff(o([{ name: 'a', args: [], expected: t('1') }, { name: 'a', args: [], expected: t('2') }], []), o([{ name: 'a', args: [], expected: t('9') }, { name: 'a', args: [], expected: t('2') }], []));
  assert.deepEqual(dup.rewritten.map((x) => x.name), ['a']);
  const mv = oracleDiff(base, o([{ name: 'a', args: [t('x')], expected: t('1') }, { name: 'h', args: [t('y')], expected: t('2') }], []));
  assert.deepEqual(mv.moved, [{ name: 'h', from: 'hidden', to: 'visible' }]);
  assert.deepEqual([oracleDiff(base, '{').after, oracleDiff(base, '{"vectors":[]}').after], ['unparseable', 'unknown-shape']);
  assert.doesNotThrow(() => oracleDiff(base, o([null, { name: 'q', args: 'x', expected: t('1') }], [])));
  assert.equal(shown({ __t: 'num', v: 'NaN' }), '{"__t":"num","v":"NaN"}'); assert.equal(shown(t('\u009b31m')), '"‹CSI›31m"');
});

test('explain_contract round 2: pin values keep NBSP, an empty value says so, DEPENDS-ON none with a comment, dots-only anchors, empty headers never shadow, TABLE rows compare on real breaks', () => {
  const pins = (t) => explain(H + t).sections.find((s) => s.id === 'pins').items.map((i) => i.text);
  assert.deepEqual(pins('PINNED text X = \u00a0a\u00a0 CITED R1\nPINNED regex Y = CITED R1\nPINNED regex Z\n  /cont-only/\n'), ['\u00a0a\u00a0', '', 'regex Z /cont-only/']);
  assert.equal(explain(H + 'DEPENDS-ON none # vendored\n').sections.find((s) => s.id === 'deps').items[0].text, 'Nothing. No other package is involved.');
  assert.ok(!explain('UNIT u\nANCHOR ...\n').summary.some((x) => x.startsWith('Anchored')));
  const e = explain('UNIT\nSIR shadowed\nFIDELITY\nVARIANT package\nANCHOR\nANCHOR x\n'); assert.equal(e.unit, 'shadowed'); assert.ok(e.summary.includes('Matches the original package exactly, quirks included.') && e.summary.includes('Anchored to x.'));
  assert.equal(explainDiff(H + 'TABLE x ⏎ y\n', H + 'TABLE x\n  y\n').changes.length, 1);
});

test('explain_diff round 5 #3: a legacy VARIANT package holds the citation Stop like FIDELITY package', () => {
  const r = 'R1 old CITED FIDELITY package — kept\n'; const V = H.replace('FIDELITY package', 'VARIANT package');
  assert.deepEqual(stops(explainDiff(V + r, V + r.replace('R1 old', 'R1 new'), { oracleChanged: true })), ['citation']);
});

test('oracle_diff round 2: no collision, kind, malformed-args, junk, reorder or encoding edit hides; shown never throws', async () => {
  const { oracleDiff, shown } = await import('./explain.mjs');
  const t = (v) => ({ t: 'text', v, cu: 'utf8' }); const o = (frozen, extra = {}) => JSON.stringify({ ...extra, frozen, heldout: [] });
  const col = oracleDiff(o([{ name: 'x', args: [], expected: t('a') }, { name: 'x', args: [], expected: t('old') }, { name: 'x #2', args: [], expected: t('new') }]),
    o([{ name: 'x', args: [], expected: t('a') }, { name: 'x', args: [], expected: t('new') }, { name: 'x #2', args: [], expected: t('new') }]));
  assert.equal(col.rewritten.length, 1, 'the literal "x #2" never collides with the second x');
  assert.equal(oracleDiff(o([{ name: 1, args: [], expected: t('a') }]), o([{ name: '1', args: [], expected: t('a') }])).added.length, 1);
  assert.equal(oracleDiff(o([{ name: 'a', args: 'x', expected: t('a') }]), o([{ name: 'a', args: 5, expected: t('a') }])).inputsChanged.length, 1);
  assert.equal(oracleDiff(o([]), o([5])).after, 'malformed-cases');
  assert.equal(oracleDiff(o([{ name: 'a', args: [], expected: t('1') }, { name: 'b', args: [], expected: t('2') }]), o([{ name: 'b', args: [], expected: t('2') }, { name: 'a', args: [], expected: t('1') }])).reordered, true);
  assert.deepEqual(oracleDiff(o([], { encoding: 'sir-canonical-v1' }), o([], { encoding: 'other' })).fileChanged, ['encoding']);
  assert.deepEqual(oracleDiff(o([{ name: 'a', args: [], expected: t('1'), note: 'x' }]), o([{ name: 'a', args: [], expected: t('1'), note: 'y' }])).otherChanged, [{ name: 'a', keys: ['note'] }]);
  assert.doesNotThrow(() => shown({ t: 'f64', v: 5, bits: 'zz' })); assert.equal(typeof shown({ t: 'text' }), 'string');
});

test('explain_contract round 3: an empty pin value is said in the label; a dots-only anchor never hides a real one; an empty KIND gives no sentence', () => {
  const p = explain(H + 'PINNED text E = CITED R1\nPINNED text F = (empty) CITED R1\n').sections.find((s) => s.id === 'pins').items.map((i) => [i.label, i.text]);
  assert.deepEqual(p, [['E (exact text, empty value)', ''], ['F (exact text)', '(empty)']]);
  assert.ok(explain('UNIT u\nANCHOR ...\nANCHOR later.\n').summary.includes('Anchored to later.'));
  assert.deepEqual(explain('UNIT u\nKIND\nFIDELITY\n').summary, []);
});

test('oracle_diff round 3: __proto__ keys, -0 vs 0 and 1e999 vs null names and values are all seen', async () => {
  const { oracleDiff } = await import('./explain.mjs');
  const c = (extra) => ({ name: 'a', args: [], expected: { t: 'none' }, ...extra });
  const f = (cases, top = '') => `{${top}"frozen":${JSON.stringify(cases)},"heldout":[]}`;
  assert.deepEqual(oracleDiff(f([c({})]), '{"frozen":[{"name":"a","args":[],"expected":{"t":"none"},"__proto__":{}}],"heldout":[]}').otherChanged, [{ name: 'a', keys: ['__proto__'] }]);
  assert.deepEqual(oracleDiff(f([]), f([], '"__proto__":{},')).fileChanged, ['__proto__']);
  assert.equal(oracleDiff('{"frozen":[{"name":0,"args":[],"expected":{"t":"none"}}],"heldout":[]}', '{"frozen":[{"name":-0,"args":[],"expected":{"t":"none"}}],"heldout":[]}').added.length, 1);
  assert.equal(oracleDiff('{"frozen":[{"name":null,"args":[],"expected":{"t":"none"}}],"heldout":[]}', '{"frozen":[{"name":1e999,"args":[],"expected":{"t":"none"}}],"heldout":[]}').added.length, 1);
  assert.deepEqual(oracleDiff('{"frozen":[{"name":"a","args":[],"expected":{"t":"none"},"note":0}],"heldout":[]}', '{"frozen":[{"name":"a","args":[],"expected":{"t":"none"},"note":-0}],"heldout":[]}').otherChanged, [{ name: 'a', keys: ['note'] }]);
});

test('oracle_diff round 4: a number swapped for a look-alike map is seen', async () => {
  const { oracleDiff } = await import('./explain.mjs');
  const r = oracleDiff('{"frozen":[{"name":5,"args":[],"expected":5,"k":1}],"heldout":[]}', '{"frozen":[{"name":{"\\u0000n":"5"},"args":[],"expected":{"\\u0000n":"5"},"k":{"\\u0000n":"1"}}],"heldout":[]}');
  assert.equal(r.added.length + r.removed.length, 2, 'the name changed kind');
  const e = oracleDiff('{"frozen":[{"name":"a","args":[],"expected":5}],"heldout":[]}', '{"frozen":[{"name":"a","args":[],"expected":{"\\u0000n":"5"}}],"heldout":[]}');
  assert.equal(e.rewritten.length, 1);
});

test('oracle_diff round 5: a file nested past 2000 levels is reported too deep (a Stop), never compared partially', async () => {
  const { oracleDiff } = await import('./explain.mjs');
  let deep = '"x"'; for (let i = 0; i < 2005; i++) deep = `[${deep}]`;
  assert.equal(oracleDiff('{"frozen":[],"heldout":[]}', `{"frozen":[{"name":"a","args":[],"expected":${deep}}],"heldout":[]}`).after, 'too-deep');
});
