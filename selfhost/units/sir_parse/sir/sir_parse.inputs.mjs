// Input generator for sir_parse (rederive@6199e2cc8b75 cli/sir/sir-parse.mjs, legacy mode). genInputs(n, rnd) -> [[text], ...]
// Curated prefix: every rule / branch / diagnostic of the SIR, then seeded random SIR-like documents.
// Round 2 (rederive@b15b56613f9d): attribute groups, merges, the space-or-tab name rule, code-point msg cuts.
// Round 3 (rederive@31803f408bef, FINDINGS #43): attrList, keyword-first directive lines, non-empty joins, the one space/tab
// whitespace rule (comment marker, trims, comment strip, blank lines), quoted '#', W_NAME_SEPARATOR, column-0 CITED.
// Round 4 (rederive@978444f3baf3, FINDINGS #59-#62): token-start quote openers vs inch marks / pattern quotes, escape pairs over
// any code point (U+2028, astral), unclosed quotes, quoted attribute keywords, glued() over White_Space + Cf, `CITED:`.
// Round 5 (rederive@bb8ded84fa50, FINDINGS #75 #76 #83): every OPENER-PREV character and the non-openers around it, adjacent
// literals, a BOM after the indent, the pinned GLUE set, a glued `NAME:`, the invisible lead, "not an attribute" for CITED.
// Round 5b (rederive@6199e2cc8b75, FINDINGS #99 #102 #105 #107): every BOM of the leading space/tab/BOM run, no * + ? openers,
// the invisible lead before a glued name and before "#", the lead message naming what follows.
const VT = '\u000B', FF = '\u000C', OGHAM = '\u1680', NNBSP = '\u202F', MMSP = '\u205F', IDSP = '\u3000';
const WJ = String.fromCodePoint(0x2060), ZWSP = String.fromCodePoint(0x200B), TAG = String.fromCodePoint(0xE0001);
const LS = '\u2028', PS = '\u2029', BOM = '\uFEFF', NBSP = '\u00A0', NEL = '\u0085', ASTRAL = '\u{1F600}';

const CURATED = [
  '',                                                        // R1: the empty text is one empty line
  '   \t  ',                                                 // R2: whitespace-only
  'UNIT sir_parse\nKIND FUNCTIONAL\nFIDELITY package\nSIG f(x: text) -> text\n',
  'UNIT a\r\nKIND b\rSIG c\n\nNOTE d\r\n',                   // R1: CRLF, CR, LF; line numbers
  BOM + 'UNIT a\n' + BOM + BOM + 'KIND b\n  ' + BOM + 'cont',  // R1 BOM at line start; a BOM after the indent stays and trims
  'UNIT a   \t\nDESCRIPTION x\t \n  more   \n',              // R1 trailing spaces / tabs
  'UNIT a\n' + NBSP + '\n\u3000\u2002\nKIND b',             // R2: lines of only non-ASCII WS are skipped
  '# top comment\n## second\nUNIT u\n# inside\n  #indented comment\n###   triple\n#',  // R4 both branches
  '#' + NBSP + 'nbsp comment\nUNIT u\n#' + NBSP + 'x\n#\t tab',  // R4: one WS char stripped (NBSP / tab)
  '# c\n  orphan after comment\nprose after comment',        // R4: a comment node is never CURRENT -> orphan + no-directive
  'UNIT u # trailing\nKIND k #\nSIG s ## not\nNOTE a #b not\nNOTE x\t#\ty\nNOTE p #  spaced  ',  // R5 variants
  'UNIT u\n  cont # c2\nprose # pc\nPINNED regex X = /a # b/ CITED R1',  // R5 on continuation / prose (comment dropped) / literal
  'UNIT u' + NBSP + '# nb\nNOTE x #' + NBSP + 'y\n' + NBSP + '# lead',  // R5 with NBSP; NBSP-led column-0 line
  'UNIT u\n  a' + LS + '# c\n  b # c' + LS + 'd\n  e' + LS + 'f # g',  // R5 separators
  'UNIT a' + LS + 'b\nUNIT' + LS + 'x\nKIND ' + LS + ' y\nKIND k\n' + PS + 'z',  // R6 separators in the head
  'UNIT: hashSync\nR1: rule\nFOO: bar\nfoo: baz\nKIND:: x\nX-1: y',  // R6 colon names
  'UNIT u\nFOO bar\nLET x = 1\nR0 zero\nR12 twelve\nR007 lead\nR1A mixed\nA- dash\nx lower\nÉTAT y\n1ABC num\n-X dash',  // R6/R7 names
  'UNIT u\nSIR v0.1\nVARIANT spec\nCARRIED-DATA t\nNOTES n\nGUARD-PINNED g\nINVARIANT i\nSCOPE s',  // legacy / pr rows
  'LANG rust\nPRIMARY-SHA256 00\nABI a\nMECHANISM m\nDESCRIPTION d\nRATIONALE r\nPROVENANCE p',
  'KIND k\nFIDELITY f\nANCHOR a\nSRC s\nTRIGGER t\nREACH r\nORACLE-CLASS d\nTRACE-SEAM http\nSEAM index\nBEHAVIOR\nTABLE T',
  'UNGUARDED-PRECONDITION x\nOUT-OF-DOMAIN y\nORACLE value\nSHAPE s\nCANONICAL-SHA256 h\nAUTHORITY a\nSTATE mutates x\nEMIT e',
  'REQUEST r\nBRANCH b\nON-ERROR o\nPAR p\nRING r\nLIFECYCLE l\nEFFECT e\nSURFACE s\nENVELOPE e\nDEPENDS-ON none\nCARRIED c\nEARNED e CITED x',
  'UNIT\nKIND' + NBSP + '\nSIG' + NEL + 'x\nNOTE\u000Bvt\nNOTE\u000Cff',  // R6 bare names, NBSP rest, NEL is not WS
  'R1 a CITED x EARNED y ANCHOR z\nR2 CITED at start\nR3 b CITED\nR4 c CITEDx y\nR5 d xCITED y\nR6 e  EARNED   spaced  ',  // R10
  'R1 a ANCHOR ' + NBSP + '\nR2 b CITED ' + NBSP + 'v' + NBSP + '\nR3 c\tCITED\tt',  // R10 values that trim to empty / NBSP
  'R1 a CITED x\n  b EARNED e\n  c CITED y\n  d\n  CITED z\n  e ANCHOR q # cm',  // R9: replacing, keyword at start of body
  'R1 a\n  p CITED u' + LS + 'v EARNED w\n  q CITED a' + LS + ' CITED c\n  r EARNED e' + LS + ' ANCHOR f' + PS + ' CITED g',  // R10 passes
  'R1 a\nprose CITED not extracted\nprose   kept   \nmore' + NBSP,  // R8 verbatim
  '  orphan one\n\torphan tab\nUNIT u\n    four\n\ttab\n \t mixed',  // R9 orphans then continuations
  'lowercase first line that is quite long and goes well beyond forty characters\n  orphan continuation also longer than forty characters total',  // msg cut
  'x ## y\nplain # comment dropped\nUNIT u',              // E_NO_DIRECTIVE with/without marker
  'é' + ASTRAL + ' astral prose\n  ' + ASTRAL + ASTRAL + ' orphan\nUNIT ' + ASTRAL + ' x CITED ' + ASTRAL,  // non-BMP short
  'abcdefghijklmnopqrstuvwxyzabcdefghijklm' + 'Z' + ASTRAL + ' tail',  // 40 positions ending on a BMP char before astral
  'UNIT u\n\n\n  # indented comment\n\n  cont\n',             // blank lines between
  '\r\n\r\n  \r\nUNIT late',                                 // leading blank lines, line numbering
  'UNIT u\nKIND k\n' + LS + '\n' + PS + 'x',                  // separator-only line (WS -> skipped), separator-led line
  '#\n# \nUNIT u\n#\n#\t',                                    // bare marks
  'TABLE T — a | b\n  row | x\n  row2 | y CITED r',
  'R1 x CITED a\nR2 y\n  z ANCHOR b\nR3 w EARNED c CITED d',
  'R1 a\n  p CITED a' + LS + ' CITED ' + NBSP + '\n#' + BOM + 'bom-led comment',  // R10 and R4 strips a BOM
  // ---- round 2: R10 groups, merges and joins; R6 space-or-tab names; R5 any WS; R8 prose read as a continuation; code-point cuts
  'R1 x CITED a EARNED b ANCHOR c CITED d',
  'R1 x CITED CITED b\nR2 y EARNED\nR3 z\tANCHOR\t\tq\nR4 w ANCHOR  ANCHOR',
  'R1 x CITED a; b\nR2 x CITED a CITED b',
  'R1 a CITED x\n  CITED y\n  b EARNED\nprose ANCHOR z # pc\n  c ANCHOR\nmore CITED w',
  'R1 CITED x\nNOTE  EARNED y\n  CITED\n\tEARNED e',
  'R1 a CITED' + NBSP + 'x\nR2 a' + NBSP + 'CITED x\nR3 aCITED x\nR4 a CITEDx y\nR5 a cited x\nR6 a CITED-x\n  ' + NBSP + 'CITED z',
  'BEHAVIOR' + NBSP + '\nUNIT\u3000x\nKIND' + NBSP + 'k\nR1 a\nSIG' + NBSP + 'f',
  'UNIT x' + NBSP + '# c\nR1 a' + LS + '# c\n  p # q' + LS + 'r\n  s' + LS + 't # u',
  'x'.repeat(39) + ASTRAL + 'tail after the cut\n\t' + 'y'.repeat(38) + ASTRAL + ASTRAL + 'z',
  ASTRAL.repeat(45) + '\n  ' + 'é'.repeat(41),
  'UNIT u\nprose only\nCITED x\nEARNED e CITED c\nANCHOR a',
  // ---- round 3 (#43): keyword-first directive lines, attrList, non-empty joins
  'SIG CITED x\nR1 EARNED e ANCHOR a\nNOTE\tCITED\tt\nUNIT CITED\nBEHAVIOR  ANCHOR',
  'R1 a CITED\n  CITED x\n  CITED\n  b CITED y\nR2 c EARNED\n  EARNED\nR3 d ANCHOR a\n  ANCHOR',
  'R1 a CITED x; y\n  CITED z\nR2 b CITED  CITED w CITED',
  'R1 a\n  CITED x\n  EARNED\n  ANCHOR q\n\tCITED x2 EARNED e2',
  // one whitespace rule: blank lines, comment marker, trims, comment strip
  NBSP + '\nUNIT u\n' + NBSP + '\n' + IDSP + '\n' + LS + '\n' + VT + '\n' + BOM + NBSP,
  'UNIT u\n' + NBSP + NBSP + '\n  ' + NBSP + '\n\t' + IDSP + ' x',
  'UNIT u' + NBSP + '# nb\nNOTE x #' + NBSP + 'y\nNOTE z ' + NBSP + '#' + NBSP + '\nNOTE w\t#\t' + NBSP + 'v' + NBSP + '\t',
  'UNIT u\n#' + NBSP + 'nb\n#\tt\n# \ts\n##' + IDSP + 'x\n  #' + FF + 'ff',
  'R1 ' + NBSP + 'a' + NBSP + ' CITED ' + NBSP + 'v' + NBSP + '\n  ' + NBSP + 'c' + NBSP + '\nprose' + NBSP + ' EARNED ' + IDSP,
  // a double-quoted # is data, not a comment marker
  'PINNED x = "a # b" CITED R1\nNOTE "q" # real\nNOTE "a\\" # b" # c\nNOTE "unterminated # c',
  'NOTE "a" # c "b # d"\nNOTE "x\\\\" # c\nNOTE ""#"" # e\nNOTE " # " " # "',
  'NOTE "a\\' + LS + ' # b" # c\nNOTE "a\\' + PS + '" # d\nNOTE "' + ASTRAL + ' # ' + ASTRAL + '"\nNOTE "\\' + ASTRAL + '" # f',
  'UNIT u\n  cont "x # y" more # z\nprose "a # b"\n  "open # x\n  a "b" "c # d',
  'PINNED regex Q = /"/ # c "x" CITED R1\nNOTE it\'s "open # c',
  'NOTE "\\\\"" # x\nNOTE \\"a # b"\nNOTE x"y # z"w\nNOTE "a" "b # c" "d"',
  // W_NAME_SEPARATOR: a directive-shaped name glued by a non-space/tab whitespace character
  'BEHAVIOR' + NBSP + 'x\nUNIT' + IDSP + 'x\nR1' + LS + 'a\nKIND' + VT + 'k\nSIG' + FF + 's',
  'X-Y' + OGHAM + 'a\nAB1' + NNBSP + 'b\nNOTE' + MMSP + 'c\nR12' + BOM + 'x\nE' + ' ' + 'e\nZ' + PS + 'z',
  'Ab' + NBSP + 'x\nUNIT:' + NBSP + 'x\nA:' + NBSP + 'b\nUNIT' + NEL + 'x\nUNIT​x\nUNIT' + NBSP + NBSP + 'x # c',
  'UNIT u\nBEHAVIOR' + NBSP + 'CITED x\nR2' + IDSP + 'y EARNED z\n' + 'é' + NBSP + 'x',
  'CITED' + NBSP + 'x\nUNIT u\nCITED' + NBSP + 'y\n-A' + NBSP + 'z\n1A' + NBSP + 'q',
  // column-0 CITED attaches to the directive above; EARNED and ANCHOR stay directives
  'CITED orphan\nUNIT u\nCITED x\nCITED\nCITED y EARNED z\nEARNED e\nANCHOR a\nCITED w',
  'R1 a\nCITED: x\nCITED:\nCITED:: y\n  CITED: z\nEARNED: e CITED c',
  'CITED: top\nCITED\nR1 a\nCITED # c\nCITED x # d\nCITEDx y\ncited z',
  // ---- round 4 (#59 #60): a quote opens a span only at a token start; escape pair = backslash + any one code point
  'SIG pipe 12" wide # note "q\nPINNED regex Q = /"/ # c "x"\nNOTE a"b # c" # d\nNOTE x' + NBSP + '"a # b"',
  'NOTE f("a # b") # c\nNOTE [" # "] x # y\nNOTE {"k # v": 1} # d\nNOTE a,"b # c" # e',
  'NOTE k="v # w" # e\nNOTE k:"v # w" # f\nNOTE x;"a # b" # g\nNOTE x|"a # b" # h',
  'NOTE x-"a # b"\nNOTE x>"a # b"\nNOTE "a""b # c" # d\nNOTE """ # e',
  'UNIT u\n"a # b" at column 0 # c\n  "p # q" indented # r\n\t"t # u"',
  '"lead # quote" with no directive # z',
  'NOTE "a\\' + LS + '" # b "c"\nNOTE "a\\' + PS + '" # d\nNOTE "a\\' + ASTRAL + '" # e "f"\nNOTE "\\' + ASTRAL + ' # g',
  'NOTE "a # b\\\nNOTE "a" "open # c\nNOTE "x\\\\" # c "y\nNOTE "\\\\\\" # d" # e',
  'NOTE "' + LS + ' # x" # y\nNOTE "' + ASTRAL + '\\"' + ASTRAL + ' # z" # w\nNOTE (\'a # b\') # c',
  // ---- round 4 (#60): an attribute keyword inside a quoted span is data
  'R1 "a CITED b" null\nR2 x "CITED y" CITED z\nR3 "p EARNED q\nR4 ("x ANCHOR y") ANCHOR w',
  'R5 x=" CITED a" EARNED e\n  "c CITED d" more CITED f\nR6 a CITED "b EARNED c" EARNED "d\nR7 12" CITED x" y',
  'R8 a\n  CITED "x CITED y" CITED z\nquoted "p ANCHOR q" ANCHOR r\nR9 "a\\" CITED b" CITED c',
  // ---- round 4 (#61): glued() = a name followed by White_Space or Cf
  'UNIT​x\nUNIT u\nKIND⁠k\nSIG᠎s\nNOTE' + NEL + 'n\nR1' + '­' + 'x',
  'TABLE\u{E0001}t\nX\u{E007F}y\nAB؀c\nAB‏d\nAB‪e\nAB⁤f\nAB⁥g',
  'UNIT u\nAB⁦h\nAB￹i\nAB\u{110BD}j\nAB\u{1D173}k\nAB\u{13430}l\nAB\u{1BCA0}m\nAB\u{E0080}n\nAB﻿o',
  'X-1​z\nR12⁡q\nAB؜r\nAB۝s\nAB܏t\nAB࢐u\nAB࣢v\nAB‌w\nAB͏x',
  // ---- round 4 (#62): the colon fix applies only where it yields a directive
  'CITED: top\nR1 a\nCITED: x\nCITED: "x # y" # z\nCITED:\nEARNED: e\nANCHOR: a CITED b\nCITED:: y\nCITED:' + NBSP + 'w',
  // ---- round 5 (#75): every OPENER-PREV character opens; the other ASCII punctuation does not
  'NOTE a;"b # c" # d\nNOTE a|"b # c" # d\nNOTE a<"b # c" # d\nNOTE a>"b # c" # d\nNOTE a!"b # c" # d\nNOTE a&"b # c" # d\nNOTE a+"b # c" # d',
  'NOTE a-"b # c" # d\nNOTE a*"b # c" # d\nNOTE a~"b # c" # d\nNOTE a?"b # c" # d\nNOTE a/"b # c" # d\nNOTE a\\"b # c" # d\nNOTE a#"b # c" # d\nNOTE a."b # c" # d',
  'NOTE a)"b # c" # d\nNOTE a]"b # c" # d\nNOTE a}"b # c" # d\nNOTE a@"b # c" # d\nNOTE a\'"b # c" # d\nNOTE a`"b # c" # d\nNOTE a$"b # c" # d\nNOTE a%"b # c" # d\nNOTE a^"b # c" # d\nNOTE a_"b # c" # d',
  // adjacent literals: a quote right after a closing quote opens the next span
  'NOTE "a""b # c" # d\nNOTE "a"""\nNOTE "a""" # e "f # g"\nNOTE "a"b"c # d" # e\nNOTE "a"x"b # c"\nR1 "a""CITED b" CITED c\nR2 x"a""b CITED c"\nNOTE "a\\"""b # c" # d\nNOTE """"" # e',
  // ---- round 5 (#76): a BOM after the indent is dropped once; a BOM after a later space or tab stays
  'SIG a\n  ' + BOM + '"b # c"\n\t' + BOM + BOM + 'x CITED y\n  ' + BOM + '# indented comment\n  ' + BOM + '\n' + BOM + ' ' + BOM + 'z\n' + BOM + '\t' + BOM + '\n ' + BOM + ' ' + BOM + ' w',
  // ---- round 5 (#83): a glued NAME: ; CITED is "not an attribute"; the invisible lead before a directive name
  'R1 a\nR1:\u200Bx\nUNIT:' + NBSP + 'x\nCITED:\u2060x\nCITED' + NBSP + 'x\nCITED\u200By\nR1::\u200Bz\nAB-:' + IDSP + 'w\nX:\u{E0001}t\nKIND:' + VT + 'k',
  'UNIT u\n\u2060KIND k\n' + NBSP + 'UNIT u2\n\u200B\u200BR1 a\n\u{E0001}SIG s\n\u2060KIND:x\n\u2060CITED x\n\u2060KIND\n\u2060KIND # c\n\u2060Ab x',
  'UNIT u\n\u2060KIND\u200Bx\n\u2060kind x\n' + NBSP + NBSP + '\n' + IDSP + 'UNIT\n' + VT + 'UNIT x\n' + NEL + 'R1 a\n\u200B1A x\n\u200B' + BOM + 'KIND k\n\u2060KIND-\t x\n\u2060R12:\n\u2060A\n' + FF + 'B' + NBSP + 'x',
  '\u2060KIND k\nCITED' + NBSP + 'x\nR1:\u200Bx # c\n\u{E0020}UNIT\n' + LS + 'R1 a\nUNIT after',
  // ---- round 5b (rederive@6199e2cc8b75, FINDINGS #99): every BOM inside the leading run of spaces, tabs and BOMs is dropped
  'UNIT u\n ' + BOM + ' ' + BOM + 'x\n' + BOM + ' ' + BOM + '\t' + BOM + 'y CITED z\n' + BOM + BOM + ' ' + BOM + '\n ' + BOM + NBSP + BOM + 'w\n' + BOM + '\t' + BOM + '# c\n\t' + BOM + ' ' + BOM + '"a # b" # c\n' + BOM + ' ' + BOM + ' ' + BOM + ' ' + BOM,
  BOM + BOM + ' ' + BOM + 'orphan\n' + BOM + BOM + BOM + 'UNIT u\n' + BOM + 'KIND' + BOM + 'k\n' + BOM + WJ + BOM + 'KIND k',
  // ---- round 5b (#107): * + ? are not openers any more (regex quantifiers)
  'PINNED regex Q = /"(?:a|b)*"/ CITED R5\nPINNED regex P = /x+"a # b"/ # c\nR1 x?"p EARNED q" EARNED r\nNOTE a*"b # c" # d\nNOTE a+"CITED b" CITED c\nNOTE (?"x # y")\nNOTE *"a # b" # c',
  // ---- round 5b (#102 #105): the invisible lead before a glued name and before "#", and its message
  'UNIT u\n' + WJ + 'KIND' + NBSP + 'k\n' + WJ + 'R1' + ZWSP + 'a\n' + NBSP + 'CITED' + NBSP + 'x\n' + IDSP + 'UNIT:' + NBSP + 'y\n' + WJ + 'KIND' + WJ + '\n' + ZWSP + 'ANCHOR' + LS + 'a',
  'UNIT u\n' + WJ + '# hidden\n' + NBSP + '#\n' + ZWSP + ZWSP + '## x\n' + WJ + '#x\n' + WJ + '# a # b\n' + IDSP + '#' + NBSP + '\n' + TAG + '# tag\n  ' + WJ + '# indented\n' + WJ + ' # spaced',
  'UNIT u\n' + WJ + 'CITED x\n' + WJ + 'CITED:\n' + WJ + 'CITED\n' + NBSP + 'CITED:' + NBSP + 'v\n' + WJ + 'CITEDX y\n' + WJ + 'R12 x\n' + WJ + 'CITED-1 z\n' + WJ + 'cited x\n' + WJ + '-A x',
  WJ + '# top, no directive yet\n' + NBSP + 'CITED x',
  ZWSP + 'KIND' + NBSP + 'k before any directive',
];

const NAMES = ['UNIT', 'KIND', 'SIG', 'NOTE', 'R1', 'R2', 'R10', 'BEHAVIOR', 'TABLE', 'PINNED', 'EARNED', 'ANCHOR', 'CITED', 'FOO', 'X-Y', 'LET', 'MECHANISM', 'SIR', 'NOTES', 'R0'];
const WORDS = ['12"', '/"/', '("a # b")', '="v"', ':"', '"\\' + LS + '"', '"\\' + ASTRAL + '"', '"a CITED b"', '" EARNED "', '"open', 'UNIT\u200B', 'R1\u2060', 'AB\u180E', 'NOTE\u0085', 'X\u00AD', 'Y\u{E0001}', 'CITED:', '\\', 'x', '; ', '"a # b"', '"q', '\\"', '"', 'BEHAVIOR' + NBSP + 'x', 'UNIT' + IDSP, IDSP, VT, OGHAM, 'CITED', 'EARNED', 'ANCHOR', 'text', 'f(a: text) -> json', 'CITED', 'EARNED', 'ANCHOR', 'R1', '#', '##', '#b', 'a#', '—', 'é', 'ü', '日本', ASTRAL, NBSP, LS, PS, BOM, NEL, '\t', '"q # q"', '/^a$/', 'prose', 'round-1', 'heldout', 'v7', 'package', ':', 'UNIT:', 'value', ';"a # b"', '|"x"', '<"y # z"', '!"q"', '&"a CITED b"', '+"', '?"c # d"', '~"e"', '*"#"', '-"a"', '."a # b"', ')"a # b"', '"a""b # c"', '"a"b', '"a"""', 'R1:\u200B', 'UNIT:' + NBSP, 'CITED\u2060', '\u2060KIND', NBSP + 'R1', '\u{E0001}SIG', WJ + '#', WJ + '# x', NBSP + 'KIND' + NBSP, ZWSP + 'CITED', '*"a # b"', '?"', '+"x # y"', '/"(?:a)*"/'];
const SEPS = [' ', ' ', ' ', '  ', '\t', NBSP, ' ' + NBSP];
const BREAKS = ['\n', '\n', '\n', '\r\n', '\r'];
const INDENTS = ['', '', '', '  ', '  ', '\t', '    ', ' \t'];

function randomLine(rnd) {
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
  const r = rnd();
  if (r < 0.06) return pick(['', '   ', '\t', NBSP, IDSP, NBSP + ' ']);
  if (r < 0.14) return pick(INDENTS) + pick(['#', '##', '# ', '#\t']) + pick(WORDS);
  const head = r < 0.6 ? pick(NAMES) + (rnd() < 0.15 ? ':' : '') : pick(WORDS);
  let s = (rnd() < 0.04 ? BOM : '') + pick(INDENTS) + (rnd() < 0.08 ? BOM : '') + (rnd() < 0.05 ? pick(['\u2060', NBSP, '\u200B', IDSP]) : '') + head;
  const k = Math.floor(rnd() * 7);
  for (let i = 0; i < k; i++) s += pick(SEPS) + pick(WORDS);
  if (rnd() < 0.15) s += pick([' #', ' # c', ' #c', '\t# t', ' ' + LS, ' #' + NBSP + 'n', NBSP + '# x', ' "# q"']);
  if (rnd() < 0.15) s += pick([' ', '\t', '  \t']);
  return s;
}

// The stamp keeps 72 vectors; to leave room for the seeded fill, curated probes are PACKED: a probe that opens with a column-0
// directive line (which resets CURRENT, so its rules see the same state) is appended to the previous document with one LF,
// up to four probes per document. Whole-text probes (empty, blank, BOM, leading break) and orphan/no-directive probes stay alone.
const opensWithDirective = (t) => /^[A-Z][A-Z0-9-]*[ \t\n]/.test(t) && !t.startsWith('CITED');
function pack(xs) {
  const out = []; let k = 0;
  for (const t of xs) {
    const last = out.length - 1;
    if (last >= 0 && k < 4 && opensWithDirective(t) && !out[last].endsWith('\r') && opensWithDirective(out[last])) { out[last] += '\n' + t; k++; }
    else { out.push(t); k = 1; }
  }
  return out;
}

export function genInputs(n, rnd) {
  const out = pack(CURATED).map((t) => [t]);
  while (out.length < n) {
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    const lines = Array.from({ length: 1 + Math.floor(rnd() * 9) }, () => randomLine(rnd));
    let t = '';
    lines.forEach((l, i) => { t += (i ? pick(BREAKS) : '') + l; });
    if (rnd() < 0.3) t += pick(BREAKS);
    if (rnd() < 0.1) t = BOM + t;
    out.push([t]);
  }
  return out.slice(0, Math.max(n, out.length));
}
