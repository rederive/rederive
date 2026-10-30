// pin_lint input generator: genInputs(n, rnd) -> list of [text]. Curated prefix (the first 24 are the frozen slice), then a
// seeded fill assembled from line fragments. Every value is well-formed text; non-text input is OUT (the code throws).
const CURATED = [
  'PINNED regex X = /a/ CITED R1',                                   // cited on its own line
  'UNIT u\nPINNED charset C = 0-9\nPINNED charset D = a-f ANCHOR spec\nEARNED round-2 heldout v3', // mixed: uncited, attr, EARNED args
  'PINNED x = 1 # not cited',                                        // a comment never cites
  'PINNED x = "a CITED b"',                                          // keyword inside a quoted span is data
  'PINNED x\n  CITED R1',                                            // continuation attribute counts
  'PINNED x\n\n# c\n  EARNED r1\nNOTE n\n  CITED late',              // blank + comment do not end; the next directive does
  'PINNED x CITED\nPINNED y CITED \u00a0 ANCHOR\nPINNED z CITED \u00a0\nPINNED q CITED ""\nPINNED r CITED \'\u200b\'\nPINNED s CITED \u0085\nPINNED t CITED \u201c\u201d', // VISIBLE: NBSP, quotes, Cf hide; NEL, curly quotes show
  'EARNED\nEARNED CITED\nEARNED\n  round-1\nEARNED: r2\nEARNED\n  "" CITED\nEARNED \u00a0\nEARNED\n\n# c\nprose', // EARNED text: bare, attr-only, continuation, colon, invisible
  'A\rPINNED x\rB CITED y\r\nPINNED z',                              // CR and CRLF break lines; column-0 prose continues
  '\ufeffPINNED a\n  \ufeffCITED b\n\ufeff \ufeffPINNED c\n\ufeff\t\ufeff\ufeff \ufeffCITED d\n\ufeff\ufeffPINNED e\nPINNED f\n\ufeff', // every FEFF in the leading run goes
  ' PINNED a\n\tEARNED b\n PINNED c\n\u000bPINNED d\nPINNED e\nPINNED: f\nPINNED:g', // only column 0 makes a pin
  'PINNEDS x\n  CITED y\nPINNED-X\nPINNED_x\nPINNED9\nR1 rule\npinned x\nEARNEDx', // other names are other directives / prose
  'PINNED x citeD\nPINNED y Cited z\nPINNED w CITEDx\nPINNED v xCITED y\nPINNED u CITED:y\nPINNED t\tCITED\tq', // case + boundary
  'PINNED x\nCITED R1\nPINNED y\nCITED: R2',                          // column-0 CITED is an attribute line; CITED: is prose
  'PINNED ' + 'b'.repeat(120),                                       // cut at 96
  'PINNED ' + 'a'.repeat(88) + '\u{1F600}z',                          // cut counts characters (a supplementary one is 1)
  '',                                                                // empty
  'PINNED',                                                          // bare keyword
  'PINNED x #CITED y\nPINNED y#\tCITED z\nPINNED z # q CITED w\nPINNED w CITED v #',   // comment-marker boundaries
  'NOTE no pins here\nR1 x CITED y',                                 // zero pins
  'PINNED x   \t\n',                                                 // trailing SP stripped in the hit text
  '  CITED orphan\nPINNED x\n# CITED y\n  # ANCHOR z',               // orphan before any directive; comment lines
  'PINNED x="a CITED b"\nPINNED y/"a CITED b"\nPINNED z 12"a CITED b"\nPINNED w /"(?:a|b)*"/ CITED R5\nPINNED v +"a CITED b"\nPINNED u ?"a CITED b"\nPINNED t ~"a CITED b"', // openers: = ~ open; / digit * + ? do not
  'PINNED x "a\\" CITED b"\nPINNED y "a" "b CITED c"\nPINNED z "a""b CITED c"\nPINNED w "open CITED q', // escape, spans, unclosed
  // ---- held-out from here
  'PINNED x "a # b" CITED c\nPINNED y "a # b"',
  'PINNED a\nPINNED b\n  ANCHOR\n  CITED\n  EARNED  　',
  'X\n  PINNED in continuation CITED\nPINNED x\n\n\n\n  ANCHOR far',
  'PINNED ' + 'é'.repeat(100),
  'PINNED x "\\\u{1F600}" CITED\nPINNED y "\\',
  'EARNED  \nEARNED # x\nEARNED "" ',
  'PINNED x (\"CITED y\")\nPINNED z [\"q CITED r\"]',
  'PINNED x CITED CITED\nPINNED y ANCHOR EARNED z',
  'GUARD-PINNED x\nNOTE PINNED y\nEARNED\r\n\r\n  CITED k\r',
  '#PINNED x\nPINNED y\n#\tCITED z',
  'PINNED x\n\u000b CITED y\nPINNED z\n CITED w',
  'PINNED ' + 'a'.repeat(90) + ' # tail comment kept in the text',
];

const LEADS = ['', '\ufeff\ufeff', '\ufeff \ufeff', ' \ufeff', '', '', '', '', '  ', '\t', ' ', '﻿', ' ', '\u000b'];
const KEYS = ['PINNED', 'PINNED', 'PINNED', 'EARNED', 'EARNED', 'PINNED:', 'EARNED:', 'pinned', 'PINNEDS', 'PINNED_', 'NOTE', 'R2', 'CITED', 'ANCHOR', 'x'];
const BODIES = ['', ' ""', " '", ' \u00a0', ' \u200b', ' *"a', ' +"a CITED b"', ' regex X = /a/', ' x = "q"', ' round-1 heldout v2', ' x="a', ' é ü 日本', ' 12" wide', ' "a"', ' (\'q\')', '  ', ' a\\'];
const TAILS = ['', '', ' CITED ""', " CITED ''", ' CITED \u00a0', ' ANCHOR \u200b', ' CITED \u0085', ' CITED \u201cx\u201d', ' CITED R1', ' CITED', ' cited', ' EARNED round-1', ' ANCHOR spec', ' ANCHOR', ' CITEDx', ' CITED:x',
  ' # not cited', ' # CITED x', ' "CITED x"', ' " CITED x"', '"', ' CITED  ', '\tCITED\tq', ' #', ' #x CITED y', ' CITED "a', '   ', '\t'];
const OTHERS = ['', '', '  round-2 heldout v3', '  ""', '  \u00a0', 'prose', '  \u2060', '\ufeff \ufeff  CITED q', ' x *"a CITED b"', '  CITED R1', '  CITED', 'NOTE x', '# CITED R2', '  # anchor', '﻿# x', 'prose CITED y', 'CITED z',
  'CITED: z', '  EARNED', '  ANCHOR "a b"', ' CITED w', '  x # CITED', ' \t ', '﻿'];
const SEPS = ['\n', '\n', '\n', '\n', '\r\n', '\r'];

export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const out = CURATED.map((t) => [t]);
  while (out.length < n) {
    const k = 1 + Math.floor(rnd() * 7); let t = '';
    for (let i = 0; i < k; i++) {
      const line = rnd() < 0.55 ? pick(LEADS) + pick(KEYS) + pick(BODIES) + pick(TAILS) + (rnd() < 0.3 ? pick(TAILS) : '') + (rnd() < 0.08 ? ' ' + 'z'.repeat(90) : '') : pick(OTHERS);
      t += (i ? pick(SEPS) : '') + line;
    }
    if (rnd() < 0.1) t += '\n';
    out.push([t]);
  }
  return out;
}
