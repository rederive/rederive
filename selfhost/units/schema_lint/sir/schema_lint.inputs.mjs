// schema_lint input generator: genInputs(n, rnd) -> n argument lists [text, carriedName].
// Round 5b: the content is OVER-read (arguments, continuations, attribute values, comments, quoted text kept), carried is an
// ASCII-letter-bounded word, a name of exactly none gets no name test, the R1 lead drops every U+FEFF, and * + ? no longer
// open a quoted span. The curated prefix leads with those, then every branch of R1-R11, then a seeded fill of SIR-shaped files.
// Inside the ENVELOPE: text is well-formed Unicode; carriedName is none or any well-formed text (the empty text included).

const EMOJI = '\u{1F600}', CJK = '日本語', BOM = '﻿';

const CURATED = [
  // R3/R4 comments are content now: full-line comment text and trailing comments, even after a blank line
  ['UNIT u\nDEPENDS-ON none\n\n# ---- carried table ----\nCARRIED tbl FROM tbl.json\n  SHAPE map[text, text]', 'tbl'],
  ['DEPENDS-ON none # no carried data here\nDEPENDS-ON none #carried\nDEPENDS-ON none\t# tbl\nDEPENDS-ON x #\nNOTE carried', 'tbl'],
  ['# carried\nDEPENDS-ON none\n  # tbl\n\t#carried\nKIND k\n# carried', 'tbl'],
  ['DEPENDS-ON x\n#  tbl\nDEPENDS-ON x\n#   tbl\nDEPENDS-ON x\n# tbl\nDEPENDS-ON x\n###\t tbl\nDEPENDS-ON x # \t tbl\nDEPENDS-ON x\n#', 'x  tbl'],
  ['DEPENDS-ON a\n# tbl\nDEPENDS-ON b # tbl\nDEPENDS-ON c#\ttbl\nDEPENDS-ON d# tbl\nDEPENDS-ON e ## tbl', '# tbl'],
  // R7 attribute values are content, after every continuation; comments after every value
  ['DEPENDS-ON none CITED carried\nDEPENDS-ON none\n  CITED tbl\nDEPENDS-ON none EARNED x ANCHOR carried\nDEPENDS-ON none CITED', 'tbl'],
  ['DEPENDS-ON x CITED z\n  y\nDEPENDS-ON x CITED y\n  z\nDEPENDS-ON x CITED v # c\nDEPENDS-ON x # c\n  CITED v', 'y z'],
  ['DEPENDS-ON x CITED v # c\nDEPENDS-ON x # c\n  CITED v\nDEPENDS-ON x # v\n  c', 'v c'],
  ['DEPENDS-ON x CITED y\nDEPENDS-ON x CITED  CITED y\nDEPENDS-ON "x CITED y"\nDEPENDS-ON x CITEDy', 'x CITED y'],
  ['DEPENDS-ON x CITED\nDEPENDS-ON x CITED CITED\nDEPENDS-ON x\n  CITED', 'x  '],
  // R9 quoted text is read as is
  ['DEPENDS-ON "colorNames, carried"\nDEPENDS-ON "a # carried"\nDEPENDS-ON x\n  "carried"\nDEPENDS-ON "colorNames"', 'colorNames'],
  ['DEPENDS-ON "tbl"\nDEPENDS-ON x"tbl"\nDEPENDS-ON 12"tbl"', 'tbl'],
  // R8 openers: * + ? no longer open a span (marker and attribute split move)
  ['DEPENDS-ON +"y CITED z"\nDEPENDS-ON ?"y CITED z"\nDEPENDS-ON *"y CITED z"\nDEPENDS-ON -"y CITED z"\nDEPENDS-ON ~"y CITED z"\nDEPENDS-ON &"y CITED z"', 'y CITED z'],
  ['DEPENDS-ON x*"a # tbl"\nDEPENDS-ON x("a # tbl"\nDEPENDS-ON /"(?:a|b)*" CITED R5\nDEPENDS-ON x+"a # tbl"', 'a # tbl'],
  // R10 the carried word: ASCII letters bound it, digits, _ and every non-ASCII character do not
  ['DEPENDS-ON miscarried\nDEPENDS-ON carried_tbl\nDEPENDS-ON carried2\nDEPENDS-ON écarried\nDEPENDS-ON carriedX\nDEPENDS-ON CARRIED-data\nDEPENDS-ON xCaRrIeD', null],
  ['DEPENDS-ON uncarried\nDEPENDS-ON carriedly\nDEPENDS-ON 9carried9\nDEPENDS-ON (Carried)\nDEPENDS-ON ſarried\nDEPENDS-ON carrİed\nDEPENDS-ON carried' + EMOJI, ''],
  ['DEPENDS-ON tbl_carried\nDEPENDS-ON tbl_x', 'tbl'],
  // R10 a name of exactly none gets no name test
  ['DEPENDS-ON none\nDEPENDS-ON x none', 'none'],
  ['DEPENDS-ON None\nDEPENDS-ON none', 'None'],
  ['DEPENDS-ON NONE\nDEPENDS-ON none', 'NONE'],
  ['DEPENDS-ON none ', 'none '],
  // R1 every U+FEFF in the leading run goes
  ['DEPENDS-ON x\n ' + BOM + ' ' + BOM + 'tbl\nDEPENDS-ON x\n ' + BOM + 'tbl\nDEPENDS-ON x\n\t' + BOM + BOM + '\ttbl', 'x tbl'],
  [BOM + 'DEPENDS-ON tbl\n' + BOM + BOM + 'DEPENDS-ON carried\nDEPENDS-ON ' + BOM + 'tbl\n' + BOM + ' DEPENDS-ON tbl\n' + BOM + '\t' + BOM + '#carried', 'tbl'],
  ['DEPENDS-ON x\n' + BOM + ' ' + BOM + '\n' + BOM + '\n  ' + BOM + ' \t', 'x'],
  // R1 line breaks and per-line trims
  ['UNIT x\rDEPENDS-ON tbl\rKIND k', 'tbl'],
  ['UNIT x\r\nDEPENDS-ON tbl\r\n\r\nDEPENDS-ON carried\n', null],
  ['DEPENDS-ON tbl   \t\nDEPENDS-ON x\n  ' + BOM + ' tbl', 'tbl'],
  ['', 'tbl'],
  ['', null],
  ['\n\r\n\r', 'x'],
  // R2 blank lines never end a directive
  ['DEPENDS-ON none\n\n   \n\t\n  tbl', 'tbl'],
  ['DEPENDS-ON a\n  b\n\n  c', 'a b c'],
  ['DEPENDS-ON a\n   \n  b', 'a   b'],
  // R5 directive names
  ['DEPENDS-ON-X carried\nDEPENDS-ONX carried\ndepends-on carried\n DEPENDS-ON carried\nDEPENDS-ON carried', null],
  ['UNIT u\nDEPENDS-ON tbl\nDEPENDS-ON:tbl\nDEPENDS-ON: tbl\nDEPENDS-ON:\nNOTE x', 'tbl'],
  ['DEPENDS-ON a\nCITED carried\nCITED: carried\nEARNED carried\nDEPENDS-ON b\nANCHOR tbl', 'tbl'],
  ['DEPENDS-ON a\n⁠KIND carried\nR7 tbl\nR carried\nA-1 x\n9X carried\nX_Y carried', null],
  ['DEPENDS-ON a\nlowercase carried here\n　tbl\n⁠# tbl', 'tbl'],
  ['NOTE tbl\nDEPENDS-ON\nDEPENDS-ON\t\nDEPENDS-ON', 'tbl'],
  ['  DEPENDS-ON tbl\nDEPENDS-ON none', 'tbl'],
  ['DEPENDS-ON\n  tbl', ' tbl'],
  // R10 the name
  ['DEPENDS-ON tbl_v2\nDEPENDS-ON tbl.js\nDEPENDS-ON xtbl\nDEPENDS-ON tbl9\nDEPENDS-ON (tbl)\nDEPENDS-ON 9tbl\nDEPENDS-ON étblé', 'tbl'],
  ['DEPENDS-ON TBL\nDEPENDS-ON Tbl\nDEPENDS-ON tbl', 'TBL'],
  ['DEPENDS-ON x\nDEPENDS-ON none', 'DEPENDS'],
  ['DEPENDS-ON a.b\nDEPENDS-ON axb\nDEPENDS-ON a+b\nDEPENDS-ON (a\nDEPENDS-ON a|b', 'a.b'],
  ['DEPENDS-ON x(\nDEPENDS-ON [y\nDEPENDS-ON a\\b\nDEPENDS-ON ^$\nDEPENDS-ON y (', '('],
  ['DEPENDS-ON -tbl-\nDEPENDS-ON x-tbl\nDEPENDS-ON tbl-', '-tbl'],
  ['DEPENDS-ON aaa\nDEPENDS-ON aa aaa\nDEPENDS-ON aaaa', 'aa'],
  ['DEPENDS-ON x---\nDEPENDS-ON x--', '--'],
  ['DEPENDS-ON ' + EMOJI + 'tbl\nDEPENDS-ON tbl' + EMOJI + '\nDEPENDS-ON é' + EMOJI + 'é', EMOJI],
  ['DEPENDS-ON x ""\nDEPENDS-ON "a"', '""'],
  ['DEPENDS-ON 1.5\nDEPENDS-ON 12', '1'],
  ['DEPENDS-ON tbl', ''],
  ['DEPENDS-ON tbl', null],
  // R11 the hit text
  ['DEPENDS-ON carried ' + 'a'.repeat(120), null],
  ['DEPENDS-ON carried ' + 'c'.repeat(76) + EMOJI + 'zz' + EMOJI.repeat(5), null],
  ['DEPENDS-ON tbl ' + CJK.repeat(40) + ' # carried', 'tbl'],
  ['DEPENDS-ON none CITED ' + 'q'.repeat(100) + '\n  tbl', 'tbl'],
];

const NAMES = [null, '', 'tbl', 'TBL', 'colorNames', 'ON', 'DEPENDS', 'none', 'None', 'x', '_', '1', 'carried', 'a_b9', 'tbl_v2', 'a.b',
  'a|b', '(', 'x y', 'x tbl', 'tbl x', '# tbl', 'x CITED y', '-tbl', '""', CJK, EMOJI];
const WORDS = ['tbl', 'TBL', 'none', 'NONE', 'carried', 'Carried', 'miscarried', 'carried_x', 'carried2', 'écarried', 'colorNames',
  'tbl_v2', 'tbl.js', 'serde_json', '(crate,', 'version', '1)', 'x', 'y', '_', 'ON', 'DEPENDS', '#', '#tbl', '"tbl"', '"carried',
  'carried"', '"a b"', 'x"y"', '*"x', '+"a', '\\"', 'CITED', 'CITED', 'EARNED', 'ANCHOR', 'CITEDx', 'uncarriedX', 'étbl', 'tblé',
  CJK, EMOJI, '1', 'a_b9', ',', '-', 'a.b', 'axb', 'a|b', '(', '-tbl', ' ', '　tbl', ' ', BOM];
const HEADS = ['DEPENDS-ON', 'DEPENDS-ON', 'DEPENDS-ON', 'DEPENDS-ON', 'DEPENDS-ON:', 'DEPENDS-ON-X', 'DEPENDS-ONX', 'depends-on',
  'UNIT', 'KIND', 'NOTE', 'CARRIED', 'CITED', 'EARNED', 'R3', 'DESCRIPTION', BOM + 'DEPENDS-ON', 'DEPENDS-ON tbl', 'prose'];
const SEPS = ['\n', '\n', '\n', '\n', '\r\n', '\r'];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

function randLine(rnd) {
  const r = rnd();
  const words = Array.from({ length: Math.floor(rnd() * 5) }, () => pick(rnd, WORDS));
  const gap = () => (rnd() < 0.85 ? ' ' : pick(rnd, ['\t', '  ', ' \t', ' ']));
  let tail = words.map((w) => gap() + w).join('');
  if (rnd() < 0.2) tail += pick(rnd, [' # ', ' #', '\t# ', ' #x ', ' CITED ', ' EARNED ']) + pick(rnd, WORDS);
  if (rnd() < 0.1) tail += pick(rnd, [' ', '\t', ' \t']);
  if (r < 0.5) return pick(rnd, HEADS) + tail;
  if (r < 0.75) return pick(rnd, ['  ', '    ', '\t', ' ', '  ' + BOM, BOM + ' ' + BOM]) + (rnd() < 0.2 ? '#' : '') + tail.replace(/^[ \t ]+/, '');
  if (r < 0.82) return pick(rnd, ['', '  ', '\t', BOM]);
  if (r < 0.9) return pick(rnd, ['#', '##', '# ', '#\t']) + tail.replace(/^[ \t]+/, '');
  return 'DEPENDS-ON' + tail + ' ' + 'q'.repeat(70 + Math.floor(rnd() * 40)) + (rnd() < 0.5 ? EMOJI.repeat(3) : '');
}

export function genInputs(n, rnd) {
  const out = CURATED.map(([t, c]) => [t, c]);
  while (out.length < n) {
    const k = 1 + Math.floor(rnd() * 7);
    let text = '';
    for (let i = 0; i < k; i++) text += (i ? pick(rnd, SEPS) : '') + randLine(rnd);
    if (rnd() < 0.2) text += '\n';
    out.push([text, pick(rnd, NAMES)]);
  }
  return out;
}
