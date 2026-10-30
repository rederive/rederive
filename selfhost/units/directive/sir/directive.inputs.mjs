// genInputs(n, rnd) for unit directive (round 5b: the 6199e2c parser - the OPENER set is space, tab and ( [ { , = : ; | < > ! & - ~
// plus line start, and a quote right after a closed span opens the next (not * + ?); sirLines drops EVERY U+FEFF in the leading run of
// spaces, tabs and marks; glued NAME: and an invisible lead are reported - diagnostics only, the value is unchanged; directive(text, 'CITED') throws).
// [text, name] argument lists. Order: PRIMARY curated (72: every rule, boundary and throw path; sized to the 24 frozen + 48
// held-out stamp, interleaved so the frozen slice samples every group), then SECONDARY curated (more boundaries, reached by any
// larger n), then a seeded fill of SIR-like texts in the envelope. All non-ASCII is written as escapes.
const PRIMARY = [
  // R1 name grammar and the CITED refusal
  ['UNIT x\nSIG f(a: text) -> text\nKIND FUNCTIONAL', 'SIG'],
  ['R007 seven\nR7 plain', 'R007'],
  ['SIG x', ''],
  ['SIG x', 'SIG\n'],
  ['SIG: x', 'SIG:'],
  ['SIG a\nCITED x', 'CITED'],
  ['x', '\u00c4'],
  // R2 lines
  ['KIND a\r\nSIG crlf\r\n  more\r\nSTATE s', 'SIG'],
  ['KIND a\rSIG cr-only\r  more\rSTATE s', 'SIG'],
  ['\ufeff\ufeffSIG a\n\ufeff  b\n  \ufeffc', 'SIG'],
  ['SIG a\u2028SIG b\u0085', 'SIG'],
  ['', 'SIG'],
  // R3 skipped lines, R6 directive lines
  ['SIG \t ', 'SIG'],
  ['ORACLE value', 'ORACLE-CLASS'],
  ['SIGNAL on\nSIG-X y\nSIG real', 'SIG'],
  ['SIG first\nSIG second', 'SIG'],
  ['SIG\nSIG later', 'SIG'],
  ['SIG: legacy colon', 'SIG'],
  ['SIG a\n# comment\n  b', 'SIG'],
  // one whitespace rule; glued names (NBSP, U+3000, and the Cf / NEXT LINE separators) are content
  ['SIG \u00a0x\u00a0', 'SIG'],
  ['SIG a\n\u00a0\n  b', 'SIG'],
  ['SIG\u00a0x\nSIG real', 'SIG'],
  ['UNIT u\nSIG\u200bx\nSIG\u2060y\nSIG\u180ez', 'UNIT'],
  ['UNIT u\nSIG\u0085x\nSIG\u3000y', 'SIG'],
  // R7 continuations
  ['ENVELOPE first line\n  continued here\n\tand tab\n    four\nNOTE n', 'ENVELOPE'],
  ['SIG a\nsig b\nprose line\nKIND k', 'SIG'],
  // R5 comments
  ['SIG f() -> text # trailing comment', 'SIG'],
  ['SIG a#b # c', 'SIG'],
  ['SIG # only comment', 'SIG'],
  // R4 quoted spans: token-start openers, inch marks, escapes, unclosed quotes
  ['SIG "a # b" c # d', 'SIG'],
  ['SIG "a # b', 'SIG'],
  ['SIG pipe 12" wide # note "q', 'SIG'],
  ['PINNED regex Q = /"/ # c "x"', 'PINNED'],
  ['SIG f("a # b") x=" # " k:" # " [" # "] {" # "} a," # "', 'SIG'],
  ['SIG a"b # c"', 'SIG'],
  ['SIG x\u00a0"a # b"', 'SIG'],
  ['SIG "x\\" # y" z', 'SIG'],
  ['SIG "x\\\\" # y" z', 'SIG'],
  ['SIG "a\\\u2028" # b "c"', 'SIG'],
  ['SIG "a\\\ud83d\ude00" # b "c"', 'SIG'],
  ['SIG "a""b # c" d', 'SIG'],
  ['SIG a\n  "b # c" # d', 'SIG'],
  // R8 attributes, quoted keywords
  ['PINNED regex A = /x/ CITED R1', 'PINNED'],
  ['SIG a CITEDx XCITED b', 'SIG'],
  ['SIG CITED x\n  b', 'SIG'],
  ['SIG "a CITED b" c CITED d', 'SIG'],
  ['R1 "a CITED b" null', 'R1'],
  ['SIG a\n  "x EARNED y" ANCHOR z\n  w', 'SIG'],
  ['SIG "a CITED # b" c', 'SIG'],
  ['SIG "open CITED x', 'SIG'],
  ['SIG a\n  CITED x\n  b', 'SIG'],
  ['SIG a\nCITED: b', 'SIG'],
  ['CITED: x\nSIG a\nCITED:\nCITED:: y', 'SIG'],
  ['SIG a\nEARNED b CITED c', 'EARNED'],
  // round 5 (#75): the wider OPENER set, "/" and word characters still open nothing, a quote right after a closed span opens
  ['SIG a;"b # c" d|"e # f" g', 'SIG'],
  ['SIG <"a # b"> !"c CITED d" &"e # f"', 'SIG'],
  ['SIG +"a # b" -"c # d" *"e # f" ~"g # h" ?"i # j" x', 'SIG'],
  ['SIG /"a # b"/ # c', 'SIG'],
  ['SIG f(x)"a # b" 12"c # d"', 'SIG'],
  ['SIG """a # b" # c', 'SIG'],
  ['SIG "a"""b # c', 'SIG'],
  ['SIG a""b # c"', 'SIG'],
  ['PINNED regex Q = /"(?:a|b)*"/ CITED R5 "x"\n  y +"a # b" ?"c # d"', 'PINNED'],
  ['SIG a\n  "b CITED c";"d CITED e" CITED f', 'SIG'],
  // round 5 (#76): a BOM run right after the indent is dropped once
  ['SIG a\n  ﻿"b # c"', 'SIG'],
  ['SIG a\n\t﻿﻿b\n ﻿ ﻿c\n﻿ ﻿d', 'SIG'],
  ['﻿  SIG x\n  ﻿\n﻿ \t\nSIG y\n ﻿SIG z', 'SIG'],
  // round 5 (#83): glued NAME: and an invisible lead are reported, never directives (value unchanged)
  ['R1:​x\nR1 real', 'R1'],
  ['UNIT u\n⁠KIND k\nKIND j', 'UNIT'],
  ['SIG a\nCITED:​x\n﻿⁠R1 y', 'SIG'],
  ['ORACLE value -> oracles/u.json  CANONICAL-SHA256 ' + 'ab'.repeat(32), 'ORACLE'],
  ['UNIT \u00e9t\u00e9 \ud83d\ude00\n  \u00fcber', 'UNIT'],
];
const SECONDARY = [
  ['SIG:: double', 'SIG'], ['SIG a\n\n  \n\t\n  b', 'SIG'], ['SIG a\u00a0# b', 'SIG'], ['SIG \u000bx\u000c\n\u000b', 'SIG'], ['  orphan\nSIG a', 'SIG'], ['SIG a #', 'SIG'], ['SIG a # b\n  c # d', 'SIG'], ['SIG "a\\', 'SIG'], ['SIG "x "y # z', 'SIG'], ['SIG a\tEARNED b ANCHOR c', 'SIG'], ['SIG a"b CITED c"', 'SIG'], ['SIG a\nCITED b\nKIND k', 'SIG'], ['SIG a\nANCHOR CITED x', 'ANCHOR'], ['SIG a\n"b # c" d', 'SIG'],
  ['UNIT u\n\u2060KIND k\nKIND j', 'KIND'], ['SIG a\n  x\ufeff # c', 'SIG'], ['SIG a=\"b # c\" \u00a0"d # e"', 'SIG'],
  ['CITED x', 'CITED'], ['FOO bar', 'FOO'], ['A-- x', 'A--'],
  ['SIG', 'SIG'], ['SIG\tx', 'SIG'], ['ORACLE-CLASS deterministic\nORACLE value -> oracles/x.json', 'ORACLE'],
  ['R12: rule twelve', 'R12'], ['NOTE n SIG x', 'NOTE'], ['SIG a\nFOO b\n  c', 'SIG'], ['SIG a\n  # indented comment\n  b', 'SIG'],
  ['PROVENANCE pkg@1 (MIT),\n  file x.js; re-cut 2026', 'PROVENANCE'], ['SIG a\n x', 'SIG'], ['SIG a \t \n  b\t', 'SIG'],
  ['SIG a #b', 'SIG'], ['SIG a # b # c', 'SIG'], ['SIG\u3000# c', 'SIG'], ['# SIG commented\nSIG real', 'SIG'],
  ['SIG a\n # c\n  b', 'SIG'], ['SIG a #\u00a0b', 'SIG'], ['SIG a\u2028# b', 'SIG'], ['\u00a0SIG x\nSIG y', 'SIG'],
  ['SIG a\t#\tb', 'SIG'], ['SIG a\n\u00a0 b\n\u3000c', 'SIG'], ['SIG\n  b', 'SIG'], ['SIG " # " # tail', 'SIG'], ['SIG a # "b # c"', 'SIG'],
  ['SIG "" # c', 'SIG'], ['SIG "#" x', 'SIG'], ['"SIG" x\nSIG "y', 'SIG'], ['# "x\nSIG a "b # c"', 'SIG'], ['SIG "a" "b # c" "d', 'SIG'],
  ['SIG "a\\\u2029" # b', 'SIG'], ['SIG "a\\\u2028 # b', 'SIG'], ['SIG ""a" # b "', 'SIG'], ['SIG ("a # b"', 'SIG'], ['SIG 3" # x "', 'SIG'],
  ['SIG "a \\"CITED\\" b" c', 'SIG'], ['SIG a\n"x CITED y"', 'SIG'], ['SIG a\n  x "CITED" y', 'SIG'], ['SIG a\n  x=" CITED " ANCHOR q', 'SIG'],
  ['SIG a CITED', 'SIG'], ['SIG a CITED b', 'SIG'], ['SIG CITED x', 'SIG'], ['SIG\tEARNED e\n  CITED c\n  ANCHOR a', 'SIG'],
  ['CITED orphan\nSIG a', 'SIG'], ['SIG a\nCITED', 'SIG'], ['SIG a\n  x CITEDCITED y\n  z\tANCHOR', 'SIG'], ['SIG a\n  b ANCHOR z\n  c', 'SIG'],
  ['SIG a\nCITED: "b # c"', 'SIG'], ['SIG a\nEARNED: e', 'EARNED'],
  ['sig x', 'sig'], ['SIG x', 'S.G'], ['x', '-A'], ['x', '1A'], ['x', 'R1a'], ['x', 'SIG X'], ['SIG x', 'CITED:'],
  ['SIG  \u000b\u000cx\u3000\u2002\u00a0\u2003\ufeff', 'SIG'], ['SIG x\u0085', 'SIG'], ['SIG \u200bx\u200b', 'SIG'], ['SIG\u2028x\nKIND k', 'KIND'],
  ['SIG a|"b # c"', 'SIG'], ['SIG list<"a # b">', 'SIG'], ['SIG a\n  \ufeff"b # c"', 'SIG'], ['SIG a\n\ufeff"b # c"', 'SIG'],
  ['SIG "open "a # b" x', 'SIG'], ['SIG "a"b # c', 'SIG'], ['SIG "a"x"b # c"', 'SIG'],
  ['SIG a\n\ufeff \ufeff\tb # c\n\ufeff\ufeff \ufeff\n \ufeff\t\ufeff\ufeffSIG z\n\ufeffx\ufeff \ufeffy', 'SIG'], ['\ufeff \ufeffSIG a\nSIG b', 'SIG'],
  ['PINNED regex Q = /(?:a|"b)/ CITED R5 "x"', 'PINNED'], ['PINNED regex Q = /[,"]/ # c "z"', 'PINNED'],
];

const NAMES = ['SIG', 'SIG', 'EARNED', 'ANCHOR', 'ORACLE', 'ORACLE-CLASS', 'STATE', 'PROVENANCE', 'KIND', 'LANG', 'UNIT', 'DEPENDS-ON', 'NOTE', 'R1', 'ENVELOPE', 'FOO'];
const BAD = ['sig', '', 'S.G', 'SIG:', '1', 'Sig', 'CITED'];
const HEADS = ['SIG', 'ORACLE', 'ORACLE-CLASS', 'STATE', 'PROVENANCE', 'KIND', 'LANG', 'UNIT', 'DEPENDS-ON', 'NOTE', 'R1', 'R12', 'ENVELOPE', 'FOO',
  'SIGNAL', 'SIG-X', 'XSIG', 'sig', 'prose', '#', '# SIG', '\ufeffSIG', 'SIG:', 'NOTE:', ' SIG', 'SIG x', 'CITED', 'EARNED', 'ANCHOR',
  'CITED:', '\u00a0SIG', '"SIG"', '\u00a0', '"a # b"', 'EARNED:', '\u2060SIG', 'R1:\u200b', 'SIG:\u2060', '\ufeff  SIG'];
const SEPS = [' ', ' ', ' ', '\t', '  ', ' \t', '\u00a0', '\u3000', '', ':', '\u200b', '\u2060', '\u0085'];
const VALUES = ['f(a: text) -> text', 'value -> oracles/x.json', 'deterministic', 'mutates xs', 'none', 'js', 'a # b', 'a #b', 'x CITED R1',
  'x CITED a EARNED b', 'CITED lead', ' padded ', '\u00a0nb\u00a0', '\ufeffbom\ufeff', 'tail\u0085', '\u3000wide\u3000', 'caf\u00e9',
  '\ud83d\ude00 astral', '', '  ', 'rederive@1.0', '#', 'a b', '"q # q" r', '"open # x', 'a\u00a0# b', '"e\\" # f"', 'x\u2028y', 'EARNED',
  '\u000b', '12" wide # n "q', '/"/ # c "x"', 'f("a # b")', 'k=" # "', 'a"b # c"', '"a\\\u2028" # b "c"', '"a CITED b" c', 'a "x CITED',
  '"\\\ud83d\ude00" # z', '"a""b # c"', 'x\u00a0"a # b"', '"a\\', ';"a # b"', 'x|"y # z" w', '<"p # q">', '!"a CITED b" c', '/"a # b"/ # d',
  '""" # x"', '-"m # n"', '?"q # r" s', 'a&"b # c"', '"a"x"b # c"', '+"p" "q # r"'];
const CONTS = ['continued text', 'CITED c1', 'more ANCHOR z', '# indented comment', 'x # y', '\u00a0', 'w\u00a0# c', 'deeper', '"p # q"',
  'EARNED', 'CITED', '"p CITED q" r', 'in 3" # x', '(" # ") CITED c', '\ufeff"p # q"', '+"p CITED q" r', '|"a # b"', '\ufeff\ufeffbom', '\ufeff \ufeffx'];
const TERMS = ['\n', '\n', '\n', '\r\n', '\r', '\u2028', '\u0085'];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

function randomLine(rnd) {
  const r = rnd();
  if (r < 0.06) return pick(rnd, ['', '  ', '\t', '\u00a0']);
  if (r < 0.3) return pick(rnd, ['  ', '\t', '    ', ' ', ' \ufeff', '\ufeff ']) + pick(rnd, CONTS) + (rnd() < 0.2 ? ' \t' : '');
  const head = pick(rnd, HEADS);
  if (rnd() < 0.15) return head;
  return head + pick(rnd, SEPS) + pick(rnd, VALUES) + (rnd() < 0.1 ? ' ' : '');
}

export function genInputs(n, rnd) {
  const out = [0, 1, 2].flatMap((g) => PRIMARY.filter((_, i) => i % 3 === g)).concat(SECONDARY).map((a) => a.slice());
  while (out.length < n) {
    const k = 1 + Math.floor(rnd() * 7); let text = ''; const used = [];
    for (let i = 0; i < k; i++) { const l = randomLine(rnd); text += (i ? pick(rnd, TERMS) : '') + l; const w = l.split(/[ \t:]/)[0].replace(/^\ufeff/, ''); if (NAMES.includes(w)) used.push(w); }
    if (rnd() < 0.2) text += pick(rnd, TERMS);
    const r = rnd();
    out.push([text, r < 0.04 ? pick(rnd, BAD) : r < 0.75 && used.length ? pick(rnd, used) : pick(rnd, NAMES)]);
  }
  return out;
}
