// Input generator for unit canonical_text (text -> text). Curated coverage prefix first (the first 24 are the frozen
// teaching slice), then a seeded fill of SIR-shaped documents with randomized formatting. Every value is a well-formed
// string (no lone surrogates), so it round-trips the oracle codec and is inside the abstract text type.
const BOM = '﻿', NBSP = ' ', IDEO = '　', EM = ' ', LS = ' ', PS = ' ', NEL = '\u0085', VT = '\u000b', FF = '\u000c';

// one realistic SIR document, as lines, re-formatted several ways below (all must normalize alike)
const DOC = [
  'UNIT get_rgb', 'KIND FUNCTIONAL', 'FIDELITY spec', 'ANCHOR index.corrected.js — color-string@2.1.4 cs.get.rgb',
  'ORACLE-CLASS deterministic', 'SIG get_rgb(input: text) -> tuple[f64, f64, f64, f64] | none',
  'ENVELOPE text only. Accepted forms: hex (#rgb, #rgba, #rrggbb, #rrggbbaa; case-insensitive); rgb()/rgba() with',
  '  three numeric channels and an optional alpha. Anything else -> none.', 'DEPENDS-ON none',
  'DESCRIPTION Parse a CSS-style color string into [r, g, b, a] or none.', 'BEHAVIOR', 'R1 Empty text -> none.',
  'R2 Forms are tried in this order and the FIRST that accepts wins: HEX6, ABBR, NUMERIC. CITED FIDELITY package',
  '  A form must account for the WHOLE text # not a comment here', 'R3 HEX6 — "#" then six hex digits EARNED round-1 heldout v7',
  'TABLE FORMS — first matching row', '  "#" then 6 hex digits | HEX6', '  "rgb(" | NUMERIC',
  'PINNED charset WS = 0009 0020 CITED R1', 'ORACLE value -> oracles/get_rgb.json', 'PROVENANCE color-string@2.1.4 (MIT)',
];
const fmt = (lines, { eol = '\n', ind = (s) => s, tail = '', blank = '', final = true, bom = '' } = {}) =>
  bom + lines.map((l) => (l.startsWith('  ') ? ind(l.slice(2)) : l) + tail).join(eol + blank) + (final ? eol : '');

const CURATED = [
  // --- frozen slice (24) ---
  '',
  'UNIT foo\nKIND FUNCTIONAL\n',
  'UNIT a\nKIND b',
  'UNIT a\r\nKIND b\r\n',
  'UNIT a\rKIND b\r',
  'UNIT a\r\nKIND b\rSIG c\nNOTE d\n\rNOTE e\r\r\n',
  'DESCRIPTION first\n  two\n    four\n\ttab\n \t mixed\n\t \tagain',
  'UNIT a   \nKIND b\t\t\nSIG c \t \nNOTE d' + NBSP + '\nNOTE e' + IDEO + '\nNOTE f' + NBSP + ' \t',
  'UNIT a\n\n   \n\t\t\n \t \nKIND b\n\n\n',
  '   \n\t\n \t\n',
  NBSP + '\n' + IDEO + IDEO + '\n',
  'UNIT a\n' + NBSP + 'nbsp at column 0\n \t' + NBSP + 'indent then nbsp\n' + IDEO + 'ideographic',
  BOM + 'UNIT a\nKIND b',
  'UNIT a\n' + BOM + 'KIND b\nNOTE x' + BOM + 'y',
  BOM + BOM + 'UNIT a',
  '\n' + BOM + 'UNIT a',
  'UNIT a' + LS + 'b\nKIND c' + PS + 'd\nNOTE ' + NEL + 'e',
  'UNIT a\n' + VT + '\n' + FF + 'x\n  ' + VT,
  'R1 a\nprose CITED x\nR1 a CITED x\n  b CITED y\nR1 a\n  see the ANCHOR field',
  'R1 a\n  ' + BOM + 'after indent\n\t' + BOM + BOM + 'tab marks\n ' + BOM + ' ' + BOM + 'second run stays\n  ' + BOM + '  \n' + BOM + ' ' + BOM + 'x\nNOTE y',
  '  orphan\nprose before\nUNIT a',
  fmt(DOC),
  fmt(DOC, { eol: '\r\n', ind: (s) => '\t' + s, tail: '  ' }),
  'UNIT ünï\nDESCRIPTION 日本語 — em dash\n  ✓ cont 🙂\t',
  // --- held-out curated ---
  // idempotence probe pair (FINDINGS #99): the second is the first's normal form, so their oracles must be equal and the
  // second must map to itself
  ' ' + BOM + ' ' + BOM + 'x\n\t' + BOM + '\t' + BOM + BOM + ' y\n' + BOM + ' ' + BOM + '\t' + BOM,
  '  x\n  y\n',
  fmt(DOC, { eol: '\r', ind: (s) => '    ' + s, blank: '\r \t\r' }),
  fmt(DOC, { eol: '\n', ind: (s) => ' \t ' + s, tail: '\t', final: false, bom: BOM }),
  fmt(DOC, { eol: '\r\n', blank: '\r\n', tail: ' ' }),
  fmt(DOC, { tail: NBSP }),
  'UNIT a\n\r\nKIND b',
  '\r\n\r\n',
  '\r',
  '\n',
  ' ',
  '\t',
  BOM,
  BOM + '\n  \n',
  BOM + '  indented first',
  ' ' + BOM + 'x',
  'R1 x CITED  \nR1 a\nloose   ',
  'UNIT a\nKIND b\r\r\n  c\r\r\n',
  'UNIT a\n' + NBSP + '# gone\n  ' + NBSP + '# also',
  'R1 x\n  y CITED a EARNED b\r ANCHOR c',
  'a' + EM + '\t \n\t' + EM + '\n' + EM + '\t',
  'x\n\n\ny',
  '\t\tdeep\n  \t  \t  deeper   ',
  'UNIT a \u0009 \u0009b',
  'line one\n\r\n\r\rline two\n\n\rline three',
  NEL + '\n' + NEL,
  'UNIT a\n' + BOM + BOM + BOM + 'KIND b\n' + BOM + ' \t\n' + BOM + '\t' + BOM + 'x\nNOTE y' + BOM + '\nNOTE z \t' + BOM,
  BOM + '\r' + BOM + BOM + '\r\n' + BOM + '   \n',
  'R1 a\n' + BOM + '  continued after a mark\n  ' + BOM + ' mark after indent',
  'PINNED regex X = /a # b/ CITED R1\n# a comment line\n  # an indented comment\nR1 x # trailing',
  ' ' + BOM + ' ' + BOM,
  '  ' + BOM + '\t' + BOM + 'z',
  '\t' + BOM + BOM + BOM + '\r\n \t' + BOM + 'y \t' + BOM + '\r' + BOM + '\t' + BOM,
  'x \t' + BOM + '\n\t \t' + BOM + NBSP + '\n    ' + BOM + IDEO + 'w',
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const WORDS = ['UNIT', 'KIND', 'R1', 'R12', 'NOTE', 'PINNED', 'alpha', 'x', '->', '—', 'ü', '日本', '#', 'CITED', 'a b', 'f(x)'];
const INDENT = ['', '', '', '  ', '    ', '\t', ' \t', '\t\t', ' '];
const TAIL = ['', '', '', ' ', '\t', '  \t', NBSP, IDEO, NBSP + ' ', ' ' + NBSP, LS];
const EOL = ['\n', '\n', '\n', '\r\n', '\r\n', '\r'];
function line(rnd) {
  const r = rnd();
  if (r < 0.10) return pick(rnd, ['', ' ', '\t', ' \t ', '    ']);
  if (r < 0.13) return pick(rnd, [NBSP, IDEO, NBSP + 'x', LS]);
  let s = pick(rnd, INDENT); const k = 1 + Math.floor(rnd() * 4);
  for (let i = 0; i < k; i++) s += (i ? pick(rnd, [' ', ' ', '\t', NBSP]) : '') + pick(rnd, WORDS);
  if (rnd() < 0.05) s = s.replace(' ', ' ' + BOM);
  if (rnd() < 0.10) { const m = s.match(/^[ \t]*/)[0]; s = m + BOM.repeat(1 + Math.floor(rnd() * 2)) + (rnd() < 0.3 ? pick(rnd, [' ', '\t']) + (rnd() < 0.5 ? BOM : '') : '') + s.slice(m.length); }
  return s + pick(rnd, TAIL);
}
function doc(rnd) {
  const n = 2 + Math.floor(rnd() * 9); const mixed = rnd() < 0.4; const eol = pick(rnd, EOL); let s = rnd() < 0.15 ? BOM : '';
  for (let i = 0; i < n; i++) s += line(rnd) + (i < n - 1 || rnd() < 0.6 ? (mixed ? pick(rnd, EOL) : eol) : '');
  return s;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((t) => [t]);
  while (out.length < n) out.push([doc(rnd)]);
  return out;
}
