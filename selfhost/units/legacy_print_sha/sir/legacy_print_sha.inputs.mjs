// genInputs(n, rnd) for legacy_print_sha: a curated prefix that reaches every branch of the frozen parser + printer
// (blank/comment/directive/continuation lines, the trailing-comment marker and its line-terminator edge, the colon
// form, attribute extraction incl. the swallow, the overwrite and the line-terminator multi-hit, BOM, CR, the JS
// whitespace set), then a seeded fill of SIR-shaped texts. Every value is a string of Unicode scalar values.
const CURATED = [
  '',
  'UNIT x\n',
  'UNIT legacy_print_sha\nKIND FUNCTIONAL\nSIG f(text: text) -> text\nDESCRIPTION one line\n  and its wrap\nBEHAVIOR\nR1 rule one CITED src.mjs:12\n  more text\nR2 rule two EARNED v3\nORACLE value -> oracles/x.json\n',
  'UNIT x # a comment\nSIG f() -> none #trailing\nNOTE a # b # c',
  '# top comment\n  orphan before any directive\nstray column-0 before any directive\nUNIT a',
  'UNIT: hashSync\nSIG: f\nR2: q\nA: z\nUNIT::x\n',
  'R1 a CITED b EARNED c ANCHOR d',
  'R1 a\n  more CITED x\n  again CITED y\n  last EARNED z',
  'R1 a CITED p\n  EARNED q\n  CITED r',
  '﻿UNIT x\nSIG y',
  'UNIT x\r\nSIG y\r\n  wrap\r\n',
  'UNIT x\r\r\nSIG a b\r\r\n',
  'UNIT a b\nSIG c',
  'UNIT x\nSIG a b\nNOTE c ',
  'UNIT x\nnot a directive  \nlower case words\t\n',
  'UNIT x\n # y\n　\n',
  'PINNED regex A = /^#(x)$/ CITED R1 — the # sign\nPINNED hex = #ff00aa',
  'SIG f\u000b#\u000bx\nNOTE g\u000c#',
  'SIG x CITED \nSIG y CITED  \nSIG z CITED \t ',
  'SIG x\n\tCITED y\n  EARNED  z\nCITED w\nEARNED',
  'UNIT x\n  y\u0085# z\n  w\u0085CITED v',
  'UNIT é 😀 CITED ü\nNOTE ñ — “quoted” 中文 # 注释',
  'FOO-BAR baz\nX\nR12 q\nZ9-Z\nunit lower\nUnit Mixed\n1ABC num',
  'UNIT x\n  a CITED b\r ANCHOR c',
  'UNIT x\n  a CITED p\r CITED q',
  'R1 a CITED b\rc\nR2 d',
  '  \n\t\n　\n\r\n',
  'UNIT x\n  # indented comment\n\t# tab comment\n  y',
  'UNIT x\n\ty z\n \t mixed indent CITED m',
  '#\n#x\n#! UNIT\n##',
  'UNIT\t\tx　y z',
  'UNIT x #\nSIG y#\nNOTE z #x\nNOTE w ##\nNOTE v #\t',
  'UNIT x  # y\nSIG a # b\nNOTE c  d # e',
  'x CITEDy z\nR1 x CITEDy z\nR2 xCITED y\nR3 x NOTCITED y\nR4 x CITED-y z',
  'UNIT\nSIG\nBEHAVIOR\n  \nR1',
  'BEHAVIOR\n  CITED alone\n  x ANCHOR\n  y ANCHOR a',
  'UNIT x\n   lead nbsp CITED  a  \n  trailing 　',
  'UNIT x\n \nSIG y\n tail',
  'NOTE a\r\n# c\r\n  b\r',
  'R1 x\n\u000bvt-led column-0 line\n\u000cff-led',
  'UNIT x CITED a  EARNED b',
  'UNIT x\n  p CITED a  EARNED b  ANCHOR c',
  'SIG a # b\r # c',
  '\n\n\nUNIT tail-blank\n\n\n',
  'UNIT x\n  p ANCHOR q\r ANCHOR  ',
  'UNIT x\n  p ANCHOR  \r ANCHOR q',
  'R1 a\n  b CITED \r CITED  \r CITED v',
];
const ATOMS = ['UNIT', 'SIG', 'KIND', 'R1', 'R7', 'R10', 'NOTE', 'BEHAVIOR', 'PINNED', 'FOO-BAR', 'unit', 'Sig', 'UNIT:', 'R3:', 'UNIT::',
  'CITED', 'CITED', 'EARNED', 'ANCHOR', '#', '#', '##', '#(', '#x', 'x', 'f(a: text)', '->', 'none', 'é', '😀', '中', ' ', '﻿',
  '\u0085', ' ', '\r', '\u000b', '\t', '-', '1', 'a#', ':', '"q # r"', '/a #b/'];
const SEPS = [' ', ' ', ' ', ' ', '  ', '\t', ' ', '　', '\u000b', '\u0085', '﻿', '\r', ' ', ''];
export function genInputs(n, rnd) {
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const line = () => {
    let s = pick(['', '', '', '', ' ', '  ', '\t', ' \t']); const k = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < k; i++) s += (i ? pick(SEPS) : '') + pick(ATOMS);
    if (rnd() < 0.2) s += pick([' ', '\r', '  ', '\t']);
    return s;
  };
  const text = () => {
    const k = Math.floor(rnd() * 9); const ls = [];
    for (let i = 0; i < k; i++) ls.push(line());
    return ls.join(pick(['\n', '\n', '\r\n'])) + pick(['', '\n', '\n', '\r\n', '\n\n']);
  };
  const out = CURATED.map((t) => [t]);
  while (out.length < n) out.push([text()]);
  return out;
}
