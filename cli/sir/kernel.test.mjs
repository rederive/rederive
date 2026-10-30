// Tier 1 kernel fixes with their scars (rederive's self re-derivation, 2026-10-26; selfhost/FINDINGS.md #11 #17 #19).
// Run: node --test cli/sir/kernel.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, directive } from './v05.mjs';
import { treeSha } from '../tree-sha.mjs';

test('#17 a carried table has ONE canonical form: sorted at every depth, written directly, JSON values only', () => {
  assert.equal(canonical({ a: { y: 2, x: 1 } }), canonical({ a: { x: 1, y: 2 } }), 'nested key order no longer changes the hash');
  assert.equal(canonical({ 10: 1, 9: 2 }), '{"10":1,"9":2}', 'index-like keys sort as text (code units), not JS-object integer order');
  for (const bad of [{ x: -0 }, { x: NaN }, { x: Infinity }, 'ab', [1], { a: undefined }, null]) assert.throws(() => canonical(bad), undefined, String(bad));
});

test('#11 the crate tree hash skips only the crate-root target DIRECTORY', () => {
  const crate = () => { const d = mkdtempSync(join(tmpdir(), 'tree-')); mkdirSync(join(d, 'src')); writeFileSync(join(d, 'Cargo.toml'), '[package]'); writeFileSync(join(d, 'src/lib.rs'), 'pub fn f() {}'); return d; };
  const base = crate(), withRoot = crate(); mkdirSync(join(withRoot, 'target')); writeFileSync(join(withRoot, 'target/x'), 'build output');
  assert.equal(treeSha(withRoot), treeSha(base), 'the crate-root target/ (build output) is ignored');
  const nested = crate(); mkdirSync(join(nested, 'src/target')); writeFileSync(join(nested, 'src/target/mod.rs'), 'pub fn g() {}');
  assert.notEqual(treeSha(nested), treeSha(base), 'a src/target/ module is source: it counts');
  const file = crate(); writeFileSync(join(file, 'src/target'), 'x');
  assert.notEqual(treeSha(file), treeSha(base), 'a FILE named target counts');
});

test('#19 directive() is the parser\'s answer: one reader of a SIR file', () => {
  assert.equal(directive('NOTE a SIG x', 'SIG'), null, 'a SIG hidden behind U+2028 inside a NOTE line is not a directive');
  assert.equal(directive('SIG f(a: text,\n  b: i64) -> text', 'SIG'), 'f(a: text, b: i64) -> text', 'a wrapped SIG is read whole');
  assert.equal(directive('ORACLE-CLASS deterministic\nORACLE value', 'ORACLE'), 'value');
  assert.equal(directive('﻿SIG f() -> none', 'SIG'), 'f() -> none', 'a BOM does not hide the first directive');
  assert.equal(directive('SIG f() -> none # legacy comment', 'SIG'), 'f() -> none');
  assert.equal(directive('SIG', 'SIG'), '', 'a bare directive is present and empty, not absent');
  assert.throws(() => directive('SIG x', 'S.G'), /not a directive name/);
});

// ---- the lint batch (selfhost lint_leak / lint_transcription / vector_set_sha / tree_sha: #10 #13 #21 #23) ----
import { leakLint, transcriptionLint } from './v05.mjs';
const leaks = (t, isPrimary) => leakLint(t, { isPrimary }).hits.map((h) => h.what);

test('#23 a language file carrying behavior is caught STRUCTURALLY, whatever its spacing or line endings', () => {
  for (const t of ['UNIT u\nLANG js\nR1 one space\n', 'UNIT u\rLANG js\rBEHAVIOR\rR1  rule\r', 'UNIT u\nLANG js\nINVARIANT x\n', 'UNIT u\nLANG js\nTABLE t\n'])
    assert.ok(leaks(t, false).includes('behavior in a language file'), JSON.stringify(t));
  assert.deepEqual(leaks('UNIT u\nLANG js\nDESCRIPTION the js variant\nMECHANISM empty text -> none\n', false), [], 'DESCRIPTION (register B) and MECHANISM are allowed');
});

test('#10 #13 #23 the primary firewall: neutral standards and citations are contract; dialect API names are leaks', () => {
  assert.deepEqual(leaks('R5 the hash is SHA-256 of the UTF-8 bytes; keys sort by UTF-16 code units; U+00A0 counts\n', true), [], 'named neutral standards are not leaks');
  assert.deepEqual(leaks('PINNED charset WS = 0009 0020 CITED ECMA-262 LineTerminator and WhiteSpace\n', true), [], 'a citation may name its source');
  for (const t of ['R1 call toLowerCase() on it', 'R1 use Number( x)', 'R1 via JSON.parse', 'R1 an Option<&str>', 'R1 match with \\p{L}', 'R1 per Vec<u8> and String::from'])
    assert.ok(leaks(t + '\n', true).length > 0, t);
  assert.deepEqual(leaks('R1 the result is the text "null"\n', true), [], 'quoted text is data');
});

test('#21 the transcription lint reads the parser\'s lines and cuts hit text at a code point', () => {
  assert.equal(transcriptionLint('UNIT u\rR1 return x\r').hits.length, 1, 'a CR-only file is split into lines');
  const t = transcriptionLint('R1 return ' + 'a'.repeat(87) + '\u{1F600}\n').hits[0].text; assert.ok(t.isWellFormed());
});

// ---- round 3 (selfhost #42 lint_leak, #43 directive, #50 lint_transcription) ----
const hitsOf = (t, isPrimary) => leakLint(t, { isPrimary }).hits;

test('#43 directive(): an attribute-only continuation leaves no double space; a quoted ` # ` is kept', () => {
  assert.equal(directive('SIG a\n  CITED x\n  b', 'SIG'), 'a b');
  assert.equal(directive('PINNED x = "a # b"', 'PINNED'), 'x = "a # b"');
});

test('#42 hit text is the physical line, cut at a code point; one hit per line and kind', () => {
  const t = 'R1 null ' + 'a'.repeat(87) + '\u{1F600}\u{1F600}\n';
  assert.ok(hitsOf(t, true)[0].text.isWellFormed(), 'never half a surrogate pair');
  assert.ok(hitsOf('UNIT u\nLANG js\nR1 ' + 'a'.repeat(92) + '\u{1F600}\n', false)[0].text.isWellFormed(), 'the language-file direction too');
  assert.deepEqual(hitsOf('R1 a\n  b null\n', true).map((h) => [h.line, h.text]), [[2, 'b null']], 'reported on the line that carries it');
  assert.equal(hitsOf('R1 JSON.parse x # JSON.stringify\n', true).length, 1);
});

test('#42 the primary firewall reads what the parser drops, and quotes protect a #', () => {
  assert.ok(leaks('null at top\nUNIT x\n', true).includes('JS value name (say none)'), 'text before the first directive');
  assert.ok(leaks('  null\nUNIT x\n', true).includes('JS value name (say none)'), 'an orphan line before the first directive');
  assert.deepEqual(leaks('R1 "x # null"\n', true), [], 'a quoted # is data: the literal is not cut into a comment');
  assert.deepEqual(leaks('R1 CITED null\n', true), [], 'a citation first on the line is a citation, as anywhere else');
  assert.deepEqual(leaks('R1 a CITED Math.floor(x) and null\n', true), [], 'DECISION: a citation names its source; it is never linted');
});

test('#42 API families: &str in any position, member names of the JS globals, "newline terminator"', () => {
  for (const t of ['R1 takes s&str', 'R1 takes &str', 'R1 a newline terminator', 'R1 Number.isFinite(x)', 'R1 String.fromCharCode(x)', 'R1 Object.Keys(x)'])
    assert.ok(leaks(t + '\n', true).length > 0, t);
  assert.deepEqual(leaks('R1 the result is a String. Then it ends\n', true), [], 'a sentence ending in a type word has no member');
});

test('#42 a register-P name glued by an NBSP is still behavior in a language file; a MECHANISM naming its rule is not', () => {
  assert.ok(leaks('UNIT u\nLANG js\nBEHAVIOR x\n', false).includes('behavior in a language file'));
  assert.deepEqual(leaks('UNIT u\nLANG js\nMECHANISM\n  R4 compares the BigInts with !== and >.\n', false), [], 'DECISION: lexically the same shape as wrapped behavior; not flagged');
});

test('#50 indexed assignment with a trailing blank hits again; both lints break lines alike', () => {
  for (const t of ['R1 a[i] = \n', 'R1 a[i] =\t\n']) assert.ok(transcriptionLint(t).hits.some((h) => h.what === 'indexed assignment'), JSON.stringify(t));
  assert.ok(!transcriptionLint('R1 a[i] == b\n').hits.some((h) => h.what === 'indexed assignment'), 'a comparison is not an assignment');
  assert.equal(transcriptionLint('R1 return a return b\n').lines, 1, 'U+2028 is not a line break (the parser\'s lines)');
  assert.deepEqual(hitsOf('R1 null null\n', true).map((h) => h.line), [1], '…for the leak lint too');
});
