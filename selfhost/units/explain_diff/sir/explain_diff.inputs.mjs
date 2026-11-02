// explain_diff input generator: genInputs(n, rnd) -> [before, after, oracleChanged, langs][]
// Seeds are SIR primaries in the shapes the review sees (v0.5 register, legacy # comments, degenerate texts); pairs come
// from mutations that reach every branch of explainDiff and of the explain() reading it diffs.

const STRIP = `UNIT strip
KIND FUNCTIONAL
FIDELITY package
ANCHOR colors@1.4.0 lib/colors.js colors.strip; reproduce the package exactly (R2) and its single pass (R4)
ORACLE-CLASS deterministic
SIG strip(str: text) -> text
ENVELOPE str is any text. Non-text arguments are outside the abstract envelope.
DEPENDS-ON none
DESCRIPTION Remove the single-parameter SGR color codes that colors.js itself emits.
BEHAVIOR
R1 The result is the input text with every CODE occurrence (R2, R3) removed; every other character is kept.
R2 A CODE is ESC "[" one or more ASCII digits "m".
  CITED FIDELITY package — the package removes only this single-parameter SGR form; combined SGR survives
R3 Occurrences are found leftmost-first and do not overlap (see R1-R2).
R4 The removal is ONE pass and is never repeated. CITED FIDELITY package — a single global replacement
PINNED grammar CODE = ESC "[" DIGIT+ "m" CITED R2 — colors@1.4.0 strip
INVARIANT the result never contains a CODE that was present in the input.
ORACLE value -> oracles/strip.json
NOTE 10 frozen + 10 held-out.
SCOPE IN: R1-R4 over any text. OUT: the rest of colors.js.
PROVENANCE colors@1.4.0 (Marak/colors.js, MIT).
`;

const RGB = `UNIT get_rgb
KIND FUNCTIONAL
FIDELITY spec
ANCHOR index.corrected.js — color-string@2.1.4 cs.get.rgb with ONE deliberate correction (R7)
ORACLE-CLASS deterministic
SIG get_rgb(input: text) -> tuple[f64, f64, f64, f64] | none
ENVELOPE text only. Anything else -> none.
DEPENDS-ON none
CARRIED colorNames FROM color-name (npm) — the CSS named-color table
  SHAPE map text -> tuple[u8, u8, u8]
DESCRIPTION Parse a CSS-style color string into [r, g, b, a].
BEHAVIOR
R1 Empty text -> none.
R2 Forms are tried in order: HEX6, ABBR, NUMERIC, PERCENT, KEYWORD (R3–R8).
R5 NUMERIC — alpha with "%" is multiplied by 0.01. CITED ANCHOR index.corrected.js
R6 PERCENT — each channel = round(p * 255 / 100). EARNED round-1 heldout v7
R7 R6 is the ONE deliberate divergence from the package (spec-fidelity). CITED color-string@2.1.4 rounds p * 2.55
TABLE FORMS — first matching row
  starts with "#" | HEX6 or ABBR
  starts with "rgb" | NUMERIC or PERCENT
PINNED regex HEX6 = /^#([a-f\\d]{6})([a-f\\d]{2})?$/i CITED R3
PINNED charset HEXDIGIT = 0-9 a-f A-F CITED R3 R4
INVARIANT channels lie in [0, 255].
ORACLE value -> oracles/get_rgb.json
NOTE 42 frozen + 21 held-out.
NOTE re-encoded 2026-09-22.
SCOPE IN: R1–R9. OUT: hsl().
PROVENANCE color-string@2.1.4 (Qix-/color-string, MIT).
`;

const LEGACY = `# EXEMPLAR (minimal register)
UNIT: min-indent
KIND FUNCTIONAL
FIDELITY package        # reproduce min-indent@1.0.1 exactly
ORACLE-CLASS deterministic
SIG minIndent(string: string) -> number   # default export; pure
DEPENDS-ON none
# The smallest count of leading space/tab characters among content lines.
BEHAVIOR
R1 Leading class is EXACTLY [ \\t]. # a comment after a rule
R2 Content test uses \\S; "a # b" is data CITED min-indent@1.0.1
EARNED round-1 divergence
NOTE: legacy colon form
PROVENANCE min-indent@1.0.1
`;

const MISC = `UNIT bounded_map
KIND STATE
FIDELITY package
SIG bounded_map(items: list[i64], cap: u64) -> list[i64]
STATE mutates items
ENVELOPE items of any length; cap >= 1.
UNGUARDED-PRECONDITION items is a list
OUT-OF-DOMAIN a cap of 0 loops forever
DEPENDS-ON ring_append, ring_token
DESCRIPTION Keep at most cap items.
BEHAVIOR
R1 Drop from the front until at most cap remain. CITED FIDELITY package — p-map@7.0.0 drops oldest
R2 Order is kept. CITED "R9 CITED quoted" stays literal
R10 Ties keep the first. EARNED round-2 cross example 0
CARRIED
CARRIED table1 FROM x
PINNED order KEEP = oldest-first CITED R1
PINNED number CAP = 3
PINNED widget W = w
PINNED = bare
PINNED lonely
RATIONALE why a ring.
INVARIANT length <= cap.
SCOPE IN: R1-R10.
PROVENANCE p-map@7.0.0
`;

const EFFECT = `UNIT send_req
KIND EFFECT
FIDELITY spec
ANCHOR RFC 9110 §9.3.1
SIG send_req(url: text) -> none
DEPENDS-ON NONE
BEHAVIOR
R1 Issue one GET. CITED RFC 9110 R2–R3
R2 Retry never.
NOTE alpha
NOTE beta
`;

const SEEDS = [STRIP, RGB, LEGACY, MISC, EFFECT];
const LANGS = ['js', 'ts', 'rust', 'py', 'go', 'JS'];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const lines = (t) => t.split('\n');
const join = (ls) => ls.join('\n');
const WORDS = ['the', 'text', 'every', 'R3', 'R1-R4', 'R2 – R5', 'rule', 'CODE', 'none', 'é', 'a', 'kept', 'R12', 'R1x', '—', 'x y', '🙂'];

// line-level mutations; each returns a new text
const MUT = {
  editWord: (t, rnd) => { const ls = lines(t); const i = Math.floor(rnd() * ls.length); const ws = ls[i].split(' ');
    if (ws.length > 1) { const j = 1 + Math.floor(rnd() * (ws.length - 1)); ws[j] = pick(rnd, WORDS); } ls[i] = ws.join(' '); return join(ls); },
  insertWord: (t, rnd) => { const ls = lines(t); const i = Math.floor(rnd() * ls.length); ls[i] = ls[i] + ' ' + pick(rnd, WORDS); return join(ls); },
  dropLine: (t, rnd) => { const ls = lines(t); ls.splice(Math.floor(rnd() * ls.length), 1); return join(ls); },
  addRule: (t, rnd) => t.replace(/\nBEHAVIOR\n/, `\nBEHAVIOR\nR${20 + Math.floor(rnd() * 5)} An added rule ${pick(rnd, WORDS)}.${rnd() < 0.5 ? ' CITED FIDELITY package — added by ' + pick(rnd, ['the pkg', 'x@2.0.1']) : ''}\n`),
  removeRule: (t) => { const ls = lines(t); const i = ls.findIndex((l) => /^R\d+ /.test(l)); if (i >= 0) { ls.splice(i, 1); while (/^ /.test(ls[i] ?? '')) ls.splice(i, 1); } return join(ls); },
  editCite: (t, rnd) => t.replace(/CITED [^\n]*/, `CITED ${pick(rnd, ['FIDELITY package — changed', 'the spec', 'p@1.0', 'R3 again', 'a|b'])}`),
  addCite: (t, rnd) => { const ls = lines(t); const idx = ls.map((l, i) => [l, i]).filter(([l]) => /^(R\d+|SIG|PINNED|TABLE|NOTE|DESCRIPTION) /.test(l)); if (!idx.length) return t + 'R1 x';
    const [, i] = pick(rnd, idx); ls[i] += pick(rnd, [' CITED FIDELITY package — x@1.2.3', ' EARNED round-3 v9', ' CITED R4', ' ANCHOR somewhere', ' CITED']); return join(ls); },
  kind: (t, rnd) => t.replace(/^KIND .*$/m, `KIND ${pick(rnd, ['FUNCTIONAL', 'STATE', 'EFFECT', 'PURE', 'functional'])}`),
  fidelity: (t) => (/^FIDELITY package/m.test(t) ? t.replace(/^FIDELITY package/m, 'FIDELITY spec') : t.replace(/^FIDELITY spec/m, 'FIDELITY package')),
  anchor: (t, rnd) => (/^ANCHOR /m.test(t) ? (rnd() < 0.5 ? t.replace(/^ANCHOR .*$/m, 'ANCHOR R1 and R2-R3 of the new anchor') : t.replace(/^ANCHOR .*\n/m, '')) : t.replace(/^KIND .*$/m, (k) => k + '\nANCHOR an added anchor')),
  prose: (t, rnd) => t.replace(/^(DESCRIPTION|NOTE|SCOPE|PROVENANCE|INVARIANT|RATIONALE) (.*)$/m, (m, d, r) => `${d} ${r} ${pick(rnd, WORDS)}`),
  firstNote: (t) => t.replace(/^NOTE (.*)$/m, 'NOTE edited first note'),
  pinEdit: (t, rnd) => t.replace(/^PINNED ([^=\n]*)= ?(.*)$/m, (m, l, r) => (rnd() < 0.5 ? `PINNED ${l}= ${r} plus` : `PINNED ${pick(rnd, ['regex', 'set', 'bytes', 'thing'])} RENAMED = ${r}`)),
  sig: (t) => t.replace(/^SIG (.*)$/m, 'SIG $1 | none'),
  deps: (t, rnd) => t.replace(/^DEPENDS-ON .*$/m, `DEPENDS-ON ${pick(rnd, ['none', 'None', 'colors, R2 helper', 'none CITED FIDELITY package — dep', 'OPAQUE(x)'])}`),
  reorder: (t) => { const ls = lines(t); const i = ls.findIndex((l) => /^R\d+ /.test(l)); const j = ls.findIndex((l, k) => k > i + 1 && /^R\d+ /.test(l));
    if (i >= 0 && j > 0) { const a = ls[i]; ls[i] = ls[j]; ls[j] = a; } return join(ls); },
  comment: (t) => t.replace(/\n/, '\n# just a comment\n').replace(/^(R1 .*)$/m, '$1 # trailing'),
  reindent: (t) => t.replace(/\n  /g, '\n\t'),
  crlf: (t) => t.replace(/\n/g, '\r\n'),
  quoted: (t) => t.replace(/^(R1 .*)$/m, '$1 "a CITED b" and " # c" f("d CITED e") k:" # g" w"h CITED i" "j\\" CITED k" "l""m CITED n" CITED o')
    .replace(/^(R2 .*)$/m, '$1 x=" # p" "unclosed CITED q'),
  unit: (t, rnd) => t.replace(/^UNIT.*$/m, pick(rnd, ['UNIT renamed', 'UNIT', ''])),
  colonFid: (t) => t.replace(/^FIDELITY package/m, 'FIDELITY:  package'),
  pipeWhy: (t) => t.replace(/^R1 (.*)$/m, 'R1 $1 CITED a|b'),
  dupNote: (t, rnd) => t.replace(/^(NOTE|TABLE|PINNED|DESCRIPTION|R1) /m, (m) => `${m}inserted ${pick(rnd, WORDS)}\n${m}`),
  otherDir: (t, rnd) => t.replace(/^(ORACLE|ORACLE-CLASS|STATE|BEHAVIOR)(.*)$/m, (m, d, r) => `${d}${r} ${pick(rnd, WORDS)}`) + pick(rnd, ['', '\nFOO stray text', '\nNOTES legacy notes', '\nEARNED round-9', '\nLANG js', '\nR1A not a rule']),
  pinCont: (t, rnd) => t.replace(/^(PINNED .*)$/m, `$1\n  ${pick(rnd, ['continued', 'R2 more', 'CITED FIDELITY package — cont'])}`),
  pinKind: (t, rnd) => t.replace(/^PINNED (\S+) /m, `PINNED ${pick(rnd, ['regex', 'set', 'thing', 'constructor'])} `),
  anchorCite: (t, rnd) => t.replace(/^(R\d+ .*)$/m, `$1 ANCHOR ${pick(rnd, ['colors@1.4.0 strip', 'index.corrected.js', 'RFC 9110', ''])}`),
};
const MUTS = Object.keys(MUT);

const LONG = 'FIDELITY package — ' + 'the original package keeps this quirk because '.repeat(3) + 'end';
const ASTRAL = 'FIDELITY package — ' + 'a'.repeat(100) + '🙂' + 'bcdefghij';   // 110 code points after the prefix, 111 UTF-16 code units

// curated pairs: [before, after, oracleChanged, langs] — the stamp keeps the first 72 distinct, so this prefix stays under 72
function curated() {
  const C = [];
  const add = (b, a, o = false, l = []) => C.push([b, a, o, l]);
  const s1 = STRIP.replace('every other character is kept', 'every other character is dropped');
  const r4 = (cite) => STRIP.replace(/^R4 .*$/m, 'R4 The removal repeats. CITED ' + cite);
  // degenerate texts
  add('', '', false, []);
  add('', STRIP, false, ['js']);
  add(STRIP, '', true, []);
  add('hello world\nno directives here', 'hello world\nstill none', false, []);
  add('# only a comment\n# another', '# only a comment', null, ['js']);
  add('   \n\t\n', 'UNIT x', false, []);
  add('lower case start\n  indented orphan', 'R1 orphan rule', false, ['ts']);
  // identical and formatting-only
  add(STRIP, STRIP, false, ['js', 'ts']);
  add(STRIP, MUT.crlf(MUT.reindent(MUT.comment(STRIP))), false, ['js']);
  add(LEGACY, LEGACY.replace('# reproduce min-indent@1.0.1 exactly', '# changed comment only'), false, []);
  add(STRIP, MUT.reorder(STRIP), false, []);
  // rule edits, each oracleChanged value, langs (dedup, empties, singular / plural)
  add(STRIP, s1, false, []);
  add(STRIP, s1, true, ['js', 'ts', 'rust', 'py']);
  add(STRIP, s1, null, ['', 'js', 'js']);
  add(STRIP, s1, false, ['JS', 'js', '']);
  // header items: UNIT, KIND, FIDELITY, ANCHOR
  add(STRIP, MUT.fidelity(STRIP), false, []);
  add('UNIT\nSIR legacy-name\nKIND PURE\nTABLE T\n  a \u23ce b\nPINNED text N = \u00a0x\nPINNED text M = y', 'UNIT\nSIR legacy-name\nKIND PURE\nTABLE T\n  a\n  b\nPINNED text N = \u00a0y\nPINNED text M =\nPINNED text C\n  cont\nPINNED text K =\n  cont\nDEPENDS-ON none\n  more', false, ['js']);
  add(STRIP, STRIP.replace(/^ANCHOR .*$/m, 'ANCHOR colors@1.4.0 R1–R4').replace(/^UNIT .*\n/m, ''), true, []);
  add(EFFECT, EFFECT.replace(/^ANCHOR .*\n/m, 'ANCHOR RFC 9110\n  §9.3.1 and R2\n').replace('KIND EFFECT', 'KIND EFFECT\nKIND STATE'), false, []);
  // the citation Stop: FIDELITY from the AFTER parse; changed vs added vs removed; FIDELITY package text vs the anchor's first token
  add(STRIP, STRIP.replace('combined SGR survives', 'combined SGR is removed too'), true, []);
  add(MUT.fidelity(STRIP), STRIP.replace('combined SGR survives', 'combined SGR is removed too'), false, []);
  add(STRIP, MUT.fidelity(STRIP).replace('combined SGR survives', 'combined SGR is removed too'), false, []);
  add(STRIP, MUT.colonFid(STRIP).replace('FIDELITY:  package', 'FIDELITY:  package # comment').replace('one or more ASCII digits', 'digits'), false, []);
  add('FIDELITY\nFIDELITY package\nANCHOR\nANCHOR\n  lib@2 x\nR1 a CITED lib@2\nR2 b CITED FIDELITY package — q', 'FIDELITY\nFIDELITY package\nANCHOR\nANCHOR\n  lib@2 x\nR1 a2 CITED lib@2\nR2 b2 CITED FIDELITY package — q', false, []);
  add(STRIP.replace('FIDELITY package', 'FIDELITY package\n  more'), STRIP.replace('FIDELITY package', 'FIDELITY package\n  more').replace('one or more ASCII digits', 'digits'), false, []);
  add('UNIT u\u2028FIDELITY package\nR1 a CITED FIDELITY package — z', 'UNIT u\u2028FIDELITY package\nR1 b CITED FIDELITY package — z', false, []);
  add('﻿FIDELITY package\nR1 x CITED FIDELITY package — q', '﻿FIDELITY package\nR1 y CITED FIDELITY package — q', false, []);
  add(STRIP, MUT.addRule(STRIP, () => 0.1).replace(/^R1 .*\n/m, ''), false, ['js']);
  add('FIDELITY package\nR1 a CITED FIDELITY package — p', 'FIDELITY package\nR1 a CITED FIDELITY package — p\nR2 b CITED v@2', false, []);
  add('FIDELITY package\nANCHOR lib@2 index.js\nR1 a CITED lib@2 keeps it\nR2 b ANCHOR lib@2 line 9\nR3 c CITED other@3\nR4 d CITED lib@2, line\nR5 e EARNED lib@2\nR6 f CITED (lib@2)\nR7 g CITED lib@2.x\nR8 h CITED lib@2]\nR9 i CITED lib@2).', 'FIDELITY package\nANCHOR lib@3 index.js\nR1 a2 CITED lib@2 keeps it\nR2 b2 ANCHOR lib@2 line 9\nR3 c2 CITED other@3\nR4 d2 CITED lib@2, line\nR5 e2 EARNED lib@2\nR6 f2 CITED (lib@2)\nR7 g2 CITED lib@2.x\nR8 h2 CITED lib@2]\nR9 i2 CITED lib@2).', false, []);
  add('FIDELITY package\nANCHOR the spec\nR1 a CITED where the code goes', 'FIDELITY package\nANCHOR the spec\nR1 b CITED where the code goes', true, []);
  add('FIDELITY package\nANCHOR p@1.0;\nR1 a CITED kept by p@1.0).\nR2 b CITED p@1.0;\nR3 c CITED p@1.0:]', 'FIDELITY package\nANCHOR p@1.0;\nR1 a2 CITED kept by p@1.0).\nR2 b2 CITED p@1.0;\nR3 c2 CITED p@1.0:]', false, []);
  add('FIDELITY spec\nANCHOR\nR1 a CITED x@1\nANCHOR p@1', 'FIDELITY package\nANCHOR\nR1 b CITED x@1\nANCHOR q@1\nR2 CITED', false, []);
  add(STRIP, STRIP.replace('CITED FIDELITY package — a single global replacement', 'EARNED round-2 v3'), false, []);
  add(STRIP, MUT.anchorCite(STRIP, () => 0.1), false, []);
  add(RGB, RGB.replace('CITED ANCHOR index.corrected.js', 'CITED ANCHOR another.js'), false, []);
  add(r4('x'), r4(LONG), false, []);
  add(r4('x'), r4(ASTRAL), false, []);
  add(r4('x'), r4(ASTRAL + 'k'), false, []);
  add(r4('x'), r4('FIDELITY package — ' + 'x'.repeat(111)), false, []);
  add(r4('y'), r4('FIDELITY package — ' + 'x'.repeat(110)), false, []);
  add(MUT.pipeWhy(STRIP), STRIP.replace(/^R1 (.*)$/m, 'R1 $1 CITED a CITED b'), false, []);
  add(STRIP.replace(/^R1 (.*)$/m, 'R1 $1 CITED a; b CITED'), STRIP.replace(/^R1 (.*)$/m, 'R1 $1 CITED a CITED b CITED'), false, []);
  add(STRIP, STRIP.replace(/^R1 (.*)$/m, 'R1 $1\nCITED FIDELITY package — col0 cite').replace(/^R3 (.*)$/m, 'R3 $1\nEARNED col0 earned'), false, ['js']);
  // repeated directives (numbered ids)
  add(RGB, MUT.firstNote(RGB).replace('TABLE FORMS', 'TABLE SECOND\n  x | y\nTABLE FORMS').replace('DESCRIPTION Parse', 'DESCRIPTION Before.\nDESCRIPTION Parse'), false, []);
  add(RGB, RGB.replace('NOTE 42 frozen + 21 held-out.\nNOTE re-encoded 2026-09-22.', 'NOTE re-encoded 2026-09-22.\nNOTE 42 frozen + 21 held-out.\nNOTE third'), false, []);
  add('R1 a\nR1 b\nR1 c\nPINNED regex X = 1\nPINNED regex Y = 9\nPINNED set X = 2\nPINNED regex X = 5\nPINNED = u\nPINNED = v\nFOO f\nBAR g\nFOO h', 'R1 b\nR1 B\nPINNED set X = 2\nPINNED (unnamed) = 3\nPINNED = 4\nPINNED regex #2 = w\nPINNED = v', false, []);
  // pins
  add(STRIP, MUT.pinEdit(STRIP, () => 0.1), false, []);
  add(STRIP, MUT.pinEdit(STRIP, () => 0.9), false, []);
  add(STRIP, STRIP.replace('PINNED grammar CODE', 'PINNED regex CODE'), false, []);
  add(MISC, MISC.replace('PINNED number CAP = 3', 'PINNED number CAP = 4').replace('PINNED widget W = w', 'PINNED widget W = v').replace('PINNED = bare', 'PINNED = bared').replace('PINNED lonely', 'PINNED lonely2').replace('PINNED order KEEP = oldest-first', 'PINNED order KEEP = a = b'), false, []);
  add(RGB, RGB.replace('PINNED charset HEXDIGIT = 0-9 a-f A-F', 'PINNED charset HEXDIGIT = 0-9 a-f A-F\n  continued pin text').replace('PINNED regex HEX6', 'PINNED regex HEX6 extra'), false, []);
  // inputs, deps, carried, other parts, holds, scope, notes
  add(STRIP, MUT.sig(STRIP), false, ['js', 'ts']);
  add(MISC, MISC.replace('UNGUARDED-PRECONDITION items is a list', 'UNGUARDED-PRECONDITION items is a list of i64').replace('OUT-OF-DOMAIN a cap of 0 loops forever', 'OUT-OF-DOMAIN a cap of 0 throws').replace('CARRIED table1 FROM x', 'CARRIED table1 FROM y').replace('CARRIED\n', 'CARRIED\n  orphan cont\n').replace('STATE mutates items', 'STATE mutates cap'), false, ['rust']);
  add(STRIP, STRIP.replace('DEPENDS-ON none', 'DEPENDS-ON colors-core R2'), false, []);
  add(EFFECT, EFFECT.replace('DEPENDS-ON NONE', 'DEPENDS-ON none\n  but really colors'), false, []);
  add(STRIP, STRIP.replace('ORACLE value -> oracles/strip.json', 'ORACLE value -> oracles/strip2.json').replace('ORACLE-CLASS deterministic', 'ORACLE-CLASS trace').replace('BEHAVIOR', 'BEHAVIOR with text'), false, []);
  add(STRIP, STRIP + 'FOO stray text\nNOTES legacy\nLANG js\nR1A x\nSIR 0.4\nEFFECT none\nBEHAVIOR CITED x\nBEHAVIOR', false, ['ts']);
  add(STRIP + 'FOO a\nFOO b', STRIP + 'FOO a\nFOO c', true, []);
  add(STRIP, STRIP.replace('INVARIANT the result', 'INVARIANT the output').replace('SCOPE IN:', 'SCOPE ALL:').replace('PROVENANCE colors@1.4.0', 'PROVENANCE colors@1.4.1'), false, ['js']);
  add(MISC, MISC.replace('RATIONALE why a ring.', 'RATIONALE why a ring buffer.').replace('NOTE', 'NOTE x'), null, ['js']);
  // R-ref rewriting (raw compare, reading diff), quoting, legacy
  add(STRIP, STRIP.replace('(see R1-R2)', '(see R1 - R3, R2–R10, R1-3, R5x, XR5, R7_, R1-R2-R3)'), false, []);
  add('R1 see R1-R3 CITED R2-R4\nR2 see R1-R3\nPINNED regex X CITED a\nBEHAVIOR CITED a', 'R1 see R1–R3 CITED R2 - R4\nR2 see R1–R3\nPINNED regex X CITED b\nBEHAVIOR CITED b', false, []);
  add(STRIP, MUT.quoted(STRIP).replace('R3 Occurrences', 'FOO interloper\nR3 Occurrences'), false, []);
  add(LEGACY, LEGACY.replace('Content test uses', 'Content test now uses').replace('EARNED round-1 divergence', 'EARNED round-2 divergence'), false, ['js']);
  // word-diff shapes, several rules in one pair
  add('R1 a b c d e\nR2 one two three four\nR3 alpha beta gamma delta epsilon\nR4 a  b\nR5\nR6 has text\nR7 a b',
    'R1 a x c y e\nR2 one 2 3 four\nR3 ALPHA beta gamma DELTA epsilon\nR4 a b\nR5 now has text\nR6\nR7 x y b', false, []);
  add('R1 a b c d e\nR2 x \nR3  x\nR4 p q r s t u\nR5  a b', 'R1 x b y d z\nR2 y \nR3  y\nR4 p Q R s T u\nR5  c b', false, []);
  add('UNIT u\rFIDELITY package\rR1 a CITED p@1', 'UNIT u\rFIDELITY package\rR1 b CITED p@1', false, []);
  add('FIDELITY_X\nFIDELITY package\nR1 a CITED FIDELITY package — p\n# c\n  more', 'FIDELITY_X\nFIDELITY package\nR1 a CITED FIDELITY package — p\n# c\n  more2', false, []);
  add('# header comment\nSIR 0.4 strip\nVARIANT package\nANCHOR\nPINNED text EQ = \"a=b\"\nPINNED text \"x=y\" Q = v\nPINNED lonely word\nPINNED regex P =\nDEPENDS-ON none # ok\nTABLE T\n  a | b\n  c | d\nR1 x CITED\nR2 y EARNED\nR3 z ANCHOR\nR4 w # note one\n#x\nR5 q CITED FIDELITY package — v\nSTRAY directive\n  indented # trailing', '# header comment 2\nSIR 0.4 strip\nVARIANT package\nANCHOR\nPINNED text EQ = \"a=c\"\nPINNED text \"x=y\" Q = w\nPINNED lonely words\nPINNED set P =\nDEPENDS-ON none # changed\nTABLE T\n  a | b\n  c | e\nR1 x CITED why\nR2 y EARNED\nR3 z ANCHOR\nR4 w # note two\n##x\nR5 q2 CITED FIDELITY package — v\nSTRAY directive\n  indented # trailing2', false, ['js']);
  add('\n# top\nR1 a # c\n  more\n  # inner', '\n\n# top\nR1 a\n# c\n  more\n  #inner', false, []);
  add('UNIT a\n  b\nANCHOR\nR1 x ANCHOR\n   orphan? no\nbare line', 'UNIT a\n  c\nANCHOR\nR1 x ANCHOR CITED\n   orphan? no\nbare line\nDEPENDS-ON none # c', false, []);
  return C;
}

export function genInputs(n, rnd) {
  // stride-3 interleave: the frozen (first 24) slice samples every stratum, not only the degenerate texts at the top
  const c = curated(); const out = [0, 1, 2].flatMap((r) => c.filter((_, i) => i % 3 === r));
  while (out.length < n) {
    const seed = pick(rnd, SEEDS);
    let before = seed; if (rnd() < 0.3) before = MUT[pick(rnd, MUTS)](before, rnd);
    let after = before; const k = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < k; i++) after = MUT[pick(rnd, MUTS)](after, rnd);
    const oc = pick(rnd, [true, false, false, null]);
    const langs = LANGS.filter(() => rnd() < 0.25);
    out.push([before, after, oc, langs]);
  }
  return out;
}
