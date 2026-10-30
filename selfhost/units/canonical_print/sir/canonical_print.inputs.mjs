// Input generator for unit canonical_print (text -> text). Curated coverage prefix first (the first 24 are the frozen
// teaching slice), then a seeded fill of SIR-shaped documents assembled from line fragments. Every value is a well-formed
// string (no lone surrogates), so it round-trips the oracle codec.
const NBSP = ' ', EM = ' ', IDEO = '　', BOM = '﻿', LS = ' ', PS = ' ', VT = '\u000b', FF = '\u000c', NEL = '\u0085';

const CURATED = [
  // --- frozen slice (24): one case per rule family ---
  '',
  'UNIT foo\nKIND FUNCTIONAL\nSIG f(x: text) -> text\n',
  'DESCRIPTION first\n  two spaces\n    four spaces\n\ttab\n \t mixed   \nKIND b',
  '# header comment\nUNIT a\n# between\n  continues UNIT\n   # indented comment\nKIND b',
  'UNIT x # trailing\nSIG f #notcomment\nNOTE a#b\nNOTE end #\n  cont # gone\nNOTE t\t#\ttab-marked',
  'PINNED regex X = /a/ CITED R1 — why\nR2 rule text EARNED round-1 heldout v3\nR3 y ANCHOR ref(js:z)',
  'R1 a CITED one\n  b EARNED two\n  c CITED three\n  d ANCHOR four',
  'UNIT: name\nFOO-BAR baz\nR12 rule\nX:\nAb: lower\nfoo bar\nA::\nX9-Y z',
  'UNIT a\n\n   \n\t\n\nKIND b\n\n',
  'UNIT a\r\nKIND b\r\n  c\r\n\r\n',
  '  orphan continuation\nprose before any directive\nUNIT a\nloose prose   \n  ind   ',
  'UNIT ünï\nDESCRIPTION 日本語 — em dash\n  ✓ cont 🙂',
  `UNIT a\n${NBSP}nbsp start\n${IDEO}\nKIND${NBSP}b\nNOTE c${EM}d`,
  `${BOM}UNIT a\nKIND b`,
  'UNIT a\rKIND b\r',
  'R1 x\n  y CITED a EARNED b\r ANCHOR c',
  'R1 x CITED  \nR2 y CITED \nR3 z CITED\nR4 w EARNED\t\t',
  'R1 a\nprose CITED x\n  ind CITED y',
  `UNIT a\n${NBSP}# gone\n  ${NBSP}# also gone`,
  'BEHAVIOR   \nBEHAVIOR\nNOTE CITED x\nNOTE  EARNED y z',
  `UNIT a${LS}b\nKIND c\nNOTE d${PS}e`,
  '# a\n# b',
  'UNIT\tname\tCITED\tx\n\tR1\ttab CITED y',
  'R1 a CITED b # c\n  d EARNED e # f\nR2 a CITED b EARNED c ANCHOR d',
  // --- held-out curated ---
  '  \n\t\n',
  'unit a\nUNIT b\nUnit c',
  'PINNED charset X = a # b c\nR1 a #\tb\nR2 a\t#\nR3 #x # y',
  `R1 a${EM}CITED b\nR2 a${NBSP}CITED${NBSP}b`,
  'ORACLE-CLASS deterministic\n-X z\n9A b\nR b\nRR c',
  'UNIT a\nKIND b\r\r\n  c\r\r\n',
  'UNIT a\r\r\nKIND b',
  'R1: x CITED y\nNOTE: z',
  'R1 x\n  a CITED b\r c\n  d\rCITED e',
  `R1 x\n  y${LS}EARNED p CITED q`,
  'R1 a\n  CITED x\n   EARNED y',
  `UNIT a\n${VT}vt\n${FF}\nNOTE ${NEL}nel`,
  'UNIT a\n\n# c\n\n  cont after blank and comment',
  'UNIT a\n  x CITED p\n  y CITED q\n  z EARNED r\nUNIT b CITED s\n  t ANCHOR u',
  'R1 a CITEDX b\nR2 a CITED\nR3 aCITED b\nR4 a cited b',
  'NOTE trailing spaces   \nNOTE\t\ttabs\t\t\n  cont\t ',
  'UNIT x\n  #comment-ish\n  a #b\n  c # d # e',
  `${NBSP}UNIT a\nKIND b`,
  'UNIT a\n\r\n\r\r\nKIND b',
  'UNIT a\n  multi CITED x\nR1 b EARNED y\n  c EARNED z\n  d',
  `R1 a CITED b${LS}c`,
  'X\nY\nZ',
  'UNIT get_rgb\nKIND FUNCTIONAL\nFIDELITY spec\nSIG get_rgb(input: text) -> tuple[f64, f64, f64, f64] | none\nENVELOPE text only. Accepted forms: hex;\n  rgb()/rgba(). Anything else -> none.\nBEHAVIOR\nR1 Empty text -> none.\nR2 Forms are tried in order. CITED ANCHOR index.corrected.js\n  more prose EARNED round-1 heldout v7\nORACLE value -> oracles/get_rgb.json',
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const NAMES = ['UNIT', 'KIND', 'SIG', 'NOTE', 'R1', 'R2', 'R10', 'BEHAVIOR', 'PINNED', 'ORACLE-CLASS', 'FOO', 'X-1', 'UNIT:', 'NOTE:', 'lower', 'Mixed', '9X'];
const WORDS = ['alpha', 'beta', 'x', 'f(x)', '->', 'text', '—', 'ü', '日本', '=', '/a+/', 'CITED', 'EARNED', 'ANCHOR', '#', '#x', 'a#b', 'cited', ''];
const SEPS = [' ', ' ', ' ', '  ', '\t', NBSP, EM];
const INDENTS = ['  ', '  ', '    ', '\t', ' ', ' \t'];
const ENDS = ['\n', '\n', '\n', '\r\n'];

function phrase(rnd, k) { const w = []; for (let i = 0; i < k; i++) w.push(pick(rnd, WORDS)); return w.filter((s) => s !== '').join(pick(rnd, SEPS)); }
function line(rnd) {
  const r = rnd();
  if (r < 0.06) return '';
  if (r < 0.10) return pick(rnd, ['   ', '\t', ' \t ']);
  if (r < 0.15) return pick(rnd, ['', '  ', '\t']) + '# ' + phrase(rnd, 2);
  let body = phrase(rnd, 1 + Math.floor(rnd() * 4));
  if (rnd() < 0.3) body += ' ' + pick(rnd, ['CITED', 'EARNED', 'ANCHOR']) + pick(rnd, [' ', '  ', ' ', '\t']) + phrase(rnd, 1 + Math.floor(rnd() * 3));
  if (rnd() < 0.15) body += pick(rnd, [' # ', ' #', '\t# ']) + phrase(rnd, 2);
  if (rnd() < 0.1) body += pick(rnd, ['  ', '\t', ' ']);
  if (rnd() < 0.4) return pick(rnd, INDENTS) + body;
  return pick(rnd, NAMES) + (body ? pick(rnd, [' ', ' ', '\t', '  ']) + body : '');
}
function doc(rnd) {
  const n = 1 + Math.floor(rnd() * 7); const end = pick(rnd, ENDS); let s = '';
  if (rnd() < 0.85) s += pick(rnd, ['UNIT', 'R1', 'NOTE']) + ' ' + phrase(rnd, 2) + end;
  for (let i = 0; i < n; i++) s += line(rnd) + (rnd() < 0.08 ? pick(rnd, ENDS) : end);
  if (rnd() < 0.3) s = s.replace(/\r?\n$/, '');
  return s;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((t) => [t]);
  while (out.length < n) out.push([doc(rnd)]);
  return out;
}
