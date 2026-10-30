// The BINDING normal form (canonicalText, 2026-10-26). Each case below is a finding from rederive's own re-derivation of the
// old binding (selfhost/units/canonical_print, sha256(print(parse(t)))): an edit the old hash could not see, or a re-print that
// changed it. Run: node --test cli/sir/sir-parse.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalText, canonicalSha } from './sir-parse.mjs';
import { legacyPrintSha } from './legacy-print.mjs';

const changes = (a, b) => canonicalSha(a) !== canonicalSha(b);
const legacyMisses = (a, b) => legacyPrintSha(a) === legacyPrintSha(b);

test('idempotent — finding 1: the old print was not (re-printing changed the hash)', () => {
  for (const t of ['R1 a\nprose CITED x', 'R1 a\nloose   ', 'R1 x CITED  ', 'UNIT a\nKIND b\r\r\n', '﻿UNIT a\n\tKIND b\r\n\n    c\r', ''])
    assert.equal(canonicalText(canonicalText(t)), canonicalText(t), JSON.stringify(t));
});

test('every content edit changes the hash — the edits the old hash could not see (findings 6-7, BOM and CR, are round-1 cases below: the legacy hash now runs the fixed parser)', () => {
  const cases = [
    ['finding 2: a CITED overwritten by a later one', 'R1 a CITED x\n  b CITED y\n', 'R1 a CITED z\n  b CITED y\n'],
    ['finding 4: text after " # " inside a literal', 'PINNED regex X = /a # b/ CITED R1\n', 'PINNED regex X = /a # c/ CITED R9\n'],
    ['finding 5: an orphan line', '  orphan\nUNIT a\n', '  other\nUNIT a\n'],
  ];
  for (const [why, a, b] of cases) { assert.ok(legacyMisses(a, b), `precondition (${why}): the OLD hash missed this edit`); assert.ok(changes(a, b), why); }
});

test('formatting never changes the hash: line endings, indentation width, trailing space, blank lines, a leading BOM', () => {
  const base = 'UNIT a\nBEHAVIOR\n  R1 x CITED y\n';
  for (const t of ['UNIT a\r\nBEHAVIOR\r\n    R1 x CITED y\r\n', 'UNIT a\rBEHAVIOR\r\tR1 x CITED y\r', '﻿UNIT a   \n\n\nBEHAVIOR\t\n \t R1 x CITED y\n\n'])
    assert.equal(canonicalSha(t), canonicalSha(base), JSON.stringify(t));
});

test('comments count: a # line is content, not formatting', () => {
  assert.ok(changes('UNIT a\n# one\n', 'UNIT a\n# two\n'));
});

// ---- round 1 (the canonical_text re-derivation): the hash and the parser must see the SAME lines ----
import { parse, print } from './sir-parse.mjs';
const meaning = (t) => print(parse(t).ast);   // what the parser understood, independent of line numbers and indent stats

test('idempotent where round 1 found it was not: a BOM reaching the start of the output', () => {
  for (const t of ['\n﻿UNIT a', '﻿﻿UNIT a\nKIND b', '\r\n﻿  x\nUNIT a']) assert.equal(canonicalText(canonicalText(t)), canonicalText(t), JSON.stringify(t));
});

test('equal hashes mean equal parses: CR is a line break and a BOM is not content, for BOTH', () => {
  for (const [a, b] of [['UNIT a\rKIND b', 'UNIT a\nKIND b'], ['﻿UNIT a\nKIND b', 'UNIT a\nKIND b'], ['UNIT a\n﻿KIND b', 'UNIT a\nKIND b']]) {
    assert.equal(canonicalSha(a), canonicalSha(b), `hash ${JSON.stringify(a)}`); assert.equal(meaning(a), meaning(b), `parse ${JSON.stringify(a)}`);
  }
  assert.match(meaning('UNIT a\rKIND b'), /^UNIT a\nKIND b\n$/);
});

test('property: random formatting changes leave BOTH the hash and the parse unchanged (2,000 seeded documents)', () => {
  let s = 99; const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const WORDS = ['UNIT', 'KIND', 'R1', 'R2', 'SIG f(x: text) -> text', 'prose', 'CITED R1', 'EARNED round-1', 'x # y', 'é z', ' nb', 'a\tb'];
  for (let i = 0; i < 2000; i++) {
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => (rnd() < 0.4 ? pick(['  ', '\t', '    ']) : '') + Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(WORDS)).join(' '));
    const doc = lines.join('\n') + '\n';
    const noisy = (rnd() < 0.3 ? '﻿' : '') + lines.map((l) => { const m = l.match(/^[ \t]+/); const body = m ? pick(['  ', '\t', ' \t ', '      ']) + l.slice(m[0].length) : l;
      return body + pick(['', ' ', '\t', '  \t']) + (rnd() < 0.2 ? pick(['\n', '\r\n', '\r']) + pick(['', '   ', '\t']) : ''); }).join(pick(['\n', '\r\n', '\r'])) + pick(['', '\n', '\r\n\r\n']);
    assert.equal(canonicalSha(noisy), canonicalSha(doc), `hash ${JSON.stringify(noisy)}`);
    assert.equal(meaning(noisy), meaning(doc), `parse ${JSON.stringify(noisy)}`);
  }
});

test('a lone surrogate is refused: UTF-8 cannot carry it, so every lone surrogate would hash alike', () => {
  assert.throws(() => canonicalSha('NOTE a\ud800'), /lone surrogate/);
});

// ---- the parser batch (selfhost sir_parse, Tier 1 #27): attributes per §23a, one whitespace rule, continuations alike ----
test('#27 every trailing attribute is its own; repeats are kept in order, never overwritten', () => {
  const ast = (t) => parse(t).ast.map((d) => [d.name, d.args, d.attrs, d.cont]);
  assert.deepEqual(ast('R1 x CITED a EARNED b'), [['R1', 'x', { CITED: 'a', EARNED: 'b' }, []]]);
  assert.deepEqual(ast('R1 a CITED x\n  b CITED y'), [['R1', 'a', { CITED: 'x; y' }, ['b']]], 'a continuation CITED no longer overwrites the first');
  assert.deepEqual(ast('UNIT u\nprose CITED x # c'), [['UNIT', 'u', { CITED: 'x' }, ['prose']]], 'an unindented continuation is read like an indented one');
  assert.deepEqual(ast('SIG x'), [], 'an NBSP is content, not a separator: no directive');
  assert.deepEqual(ast('R1 x CITED'), [['R1', 'x', { CITED: '' }, []]], 'an empty value is kept, not dropped');
  const msg = parse('  ' + 'a'.repeat(39) + '\u{1F600}').errors[0].msg; assert.ok(msg.isWellFormed(), 'a diagnostic is cut at a code point');
});

// ---- round 3 (selfhost #43: sir_parse / directive, 2026-10-26) ----
const node = (t, mode) => parse(t, { mode }).ast[0];
const codes = (t, mode) => { const r = parse(t, { mode }); return [...r.errors, ...r.warnings].map((x) => x.code); };

test('#43 a keyword first on the directive line splits exactly as on a continuation', () => {
  assert.deepEqual([node('SIG CITED x').args, node('SIG CITED x').attrs], ['', { CITED: 'x' }], 'not SIG "CITED x"');
  assert.deepEqual(node('R1 CITED x').attrs, node('R1\n  CITED x').attrs);
});

test('#43 attribute values: attrList keeps every occurrence; the joined string has no stray separator', () => {
  assert.deepEqual(node('R1 x CITED a; b').attrList, [['CITED', 'a; b']]);
  assert.deepEqual(node('R1 x CITED a CITED b').attrList, [['CITED', 'a'], ['CITED', 'b']], 'distinguishable from one value "a; b"');
  assert.equal(node('R1 x CITED CITED b').attrs.CITED, 'b', 'an empty value adds no "; "');
  assert.equal(node('R1 x\n  ANCHOR\n  ANCHOR d').attrs.ANCHOR, 'd');
  assert.equal(node('R1 x CITED').attrs.CITED, '', 'a bare keyword is still present');
});

test('#43 an attribute-only continuation adds no empty piece (no double space when joined)', () => {
  assert.deepEqual(node('SIG a\n  CITED x\n  b').cont, ['b']);
});

test('#43 one whitespace rule: only a space or tab separates, trims, marks a comment or makes a line blank', () => {
  assert.deepEqual([node('UNIT x # c').args, codes('UNIT x # c')], ['x # c', []], 'an NBSP before # is content, not a comment marker');
  assert.equal(node('UNIT x ').args, 'x ', 'an NBSP is not trimmed');
  assert.deepEqual(node('UNIT u\n# c').comments, [' c'], 'the comment strip removes one space/tab, never an NBSP');
  assert.deepEqual(node('UNIT u\n ').cont, [' '], 'an NBSP-only line is content (canonicalText keeps it), not a blank line');
  assert.ok(changes('UNIT u\n \n', 'UNIT u\n'), 'precondition: the binding already counts that line');
});

test('#43 a directive name glued to its text by other whitespace is REPORTED, never silently prose', () => {
  assert.deepEqual(codes('BEHAVIOR x', 'strict'), ['E_NAME_SEPARATOR']);
  assert.deepEqual(codes('UNIT u\nSIG　f', 'strict'), ['E_NAME_SEPARATOR'], 'not a generic unindented continuation');
  assert.ok(codes('UNIT u\nSIG f').includes('W_NAME_SEPARATOR'), 'legacy warns');
  assert.match(parse('BEHAVIOR x', { mode: 'strict' }).errors[0].msg, /BEHAVIOR is followed by U\+00A0/);
});

test('#43 a column-0 CITED (not a directive) is the attribute of the directive above', () => {
  assert.deepEqual(parse('R1 a\nCITED x').ast.map((d) => [d.name, d.attrs]), [['R1', { CITED: 'x' }]]);
  assert.deepEqual(codes('R1 a\nCITED x', 'strict'), ['E_UNINDENTED_CONTINUATION']);
  assert.deepEqual(parse('R1 a\nEARNED e').ast.map((d) => d.name), ['R1', 'EARNED'], 'EARNED and ANCHOR are directives in the table: unchanged');
});

test('#43 a ` # ` inside a double-quoted literal is data, not a comment (strict reports nothing)', () => {
  assert.deepEqual([node('PINNED x = "a # b"').args, codes('PINNED x = "a # b"', 'strict')], ['x = "a # b"', []]);
  assert.deepEqual([node('PINNED x = "a" # c').args, node('PINNED x = "a" # c').comments], ['x = "a"', ['c']], 'a comment after the literal still splits');
});
