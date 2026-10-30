// Input generator for lint_transcription(text) — the transcription lint over a v0.5 PRIMARY text.
// Curated prefix (every SHAPES row, its near-misses, quoting, whitespace sets, line splitting, truncation, the 10% boundary),
// then seeded random primary-shaped documents. Round 5b: every FEFF of the leading space/tab/mark run dropped (#99); + * ? no
// longer openers (#107). Round 5: the 19 openers and their non-opener neighbours, a quote right after a
// closed span (#75), a FEFF run after the indent (#76). Round 4: quoted spans open only at a token start and escape any one code
// point (quotedSpans, #59 #60); the indexed-assignment row's compound operators and "=>" (#68). Round 3: the indexed-assignment row's end-of-line and "==" cases. All texts are well-formed Unicode; astral characters sit
// across the old 96-unit point (the cut now counts code points).

const HEAD = ['UNIT demo_unit', 'KIND FUNCTIONAL', 'FIDELITY package', 'ANCHOR demo@1.0.0 index.js', 'ORACLE-CLASS deterministic',
  'SIG demo(input: text) -> u64', 'ENVELOPE text only.', 'DEPENDS-ON none', 'DESCRIPTION Count the things in a text.', 'BEHAVIOR'];
const TAIL = ['ORACLE value -> oracles/demo.json', 'SCOPE IN: R1-R3. OUT: nothing else.', 'PROVENANCE demo@1.0.0 (MIT), index.js'];
const prose = (k) => `R${k} The count of the content lines is the result; an empty text yields 0.`;
const doc = (lines) => lines.join('\n');
// n non-empty lines of which `hits` are code-shaped (one shape each), the rest clean contract prose
const densityDoc = (n, hits, sep = '\n') => {
  const L = []; for (let i = 0; i < n; i++) L.push(i < hits ? `R${i + 1} when x is set, return none` : prose(i + 1));
  return L.join(sep);
};

const POS = [
  'R1 typeof input is checked first', 'R2 a => b maps each entry', 'R3 the key is s.split(",") applied once',
  'R4 xs.map(f) then .filter(g)', 'R5 m.reduce(add) and t.slice(1)', 'R6 re.test(s) or re.exec(s) or s.match(re)',
  'R7 Math.floor(x) rounds down', 'R8 parseInt(s, 10) and parseFloat(s)', 'R9 Number(s) or String (n)', 'R10 the value is a Number.',
  'R11 if (x > 0) the count grows', 'R12 if(x) it stops', 'R13 the result holds if (and only if) both match',
  'R14 return the count', 'R15 the return-value is a list', 'R16 for k in keys the map is read', 'R17 for (each key) we look',
  'R18 while (more) the scan goes on', 'STEP 1 parse the header', '  # NODE alpha', 'branch x when empty', 'Gate -keeper opens',
  'R19 out[i] = 1 for each slot', 'R20 m[k]=v writes', 'R20b a[i]=', 'R20c a[i] =', 'R21 the pattern /^a+$/i is used', 'R22 a value /^x$/ appears',
  'R23 the result is null', 'R24 an undefined slot', 'x = 1;', 'R25 count = n + 1;   ', 'R26 a1 = b;', 'R27 x =;;',
  'R28 group1 holds the key', 'R29 see group9.', 'R30 a =>b;', "R31 the text 'null' is returned",
];
const NEAR = [
  'R1 typeofx is a word', 'R2 the type of x', 'R3 "typeof" is a quoted word', 'R4 a -> b maps', 'R5 a >= b holds', 'R6 a = > b',
  'R7 "=>" in quotes', 'R8 s.split (",") with a space', 'R9 split(s) without a dot', 'R10 s.replace(a, b) and xs.join(",")',
  'R11 xs.Map(f) capital', 'R12 "s.map(f)" quoted', 'R13 Numbers. are counted', 'R14 a number. lower', 'R15 MathML(x) and toString(x)',
  'R16 xNumber(s) inside a word', 'R17 iff (x) holds', 'R18 elif (x) branch', 'R19 If (x) capital', 'R20 if x then y',
  'R21 returns none', 'R22 Return none', 'R23 for in order', 'R24 for x inside y', 'R25 form x in y', 'R26 while x holds',
  'STEPS 1 then 2', 'STEP', 'R27 STEP x mid-line', 'BRANCHING x', 'R28 a[i] == 1', 'R29 a[i] ==', 'R30 [k] = v', 'R31 a[i].x = 1',
  'R32 the pattern /^abc/ unanchored', 'R33 ^abc$ bare', 'R34 "/^a$/" quoted', 'R35 nullable values', 'R36 "null" and "undefined" quoted',
  'R37 NULL in caps', 'R38 x = 1', 'R39 x == 1;', 'R40 x += 1;', 'R41 1 = 2;', 'R42 x = ;', 'R43 x =1; y', 'R44 group10 is two digits',
  'R45 subgroup1 inside', 'R46 group 1 spaced', 'R47 group1_ trailing underscore', 'R48 the arrow "->" and "if (" quoted',
];
const CURATED = [
  [''], ['\n\n\n'], [' \t \n 　﻿\n'], ['\u0085'], ['᠎\n​'], ['typeof'],
  [doc(POS)], [doc(NEAR)],
  // quoted spans (r4): token-start openers, non-openers, escape pairs over LS/PS/astral/quote/backslash, unclosed quotes
  [doc(['"return x" first char', 'R1 ("if (x)")', 'R2 a["return"]', 'R3 {"null"}', 'R4 f(a,"null")', 'R5 x="return";', 'R6 k:"typeof"',
    'R7 a\t"null" tab', 'R8 x"null" glued', 'R9 12" wide null', 'R10 a\u00a0"null"', 'R11 ""null"" doubled', 'R12 "a""null" adjacent',
    'R13 "a\\\u2028" return "b"', 'R14 "a\\" null', 'R15 "a\\\\" null "b"', 'R16 "\\\u{1F600}" null', 'R17 "\\\u{1F600}null" x',
    'R18 "a\u2028b" if (x)', 'R19 "unclosed return', 'R20 "a" x "unclosed null', 'R21 "a\\', 'R22 /"/ null "x"', 'R23 \'"\' null', 'R24 `"` null "`"',
    'R25 x = "a;" ', 'R26 "x = 1;"', 'R27 =" if (" ', 'R28 :"=>"', 'R29 ["a[i]=1"]'])],
  // quoted spans (r5, #75): every opener, the non-openers beside them, side-by-side literals, a quote after a quote that closed nothing
  [doc(['R1 a;"null"', 'R2 a|"null"', 'R3 a<"null"', 'R4 a>"null"', 'R5 !"null"', 'R6 a&"null"', 'R7 a+"null"', 'R8 a-"null"',
    'R9 a*"null"', 'R10 ~"null"', 'R11 ?"null"', 'R12 a/"null"', 'R13 f(a)"null"', 'R14 a]"null"', 'R15 a}"null"', 'R16 a."null"',
    'R17 a#"null"', 'R18 a%"null"', 'R19 a^"null"', 'R20 a\'"null"', 'R21 a\ufeff"null"', 'R22 a@"null"', 'R23 a$"null"',
    'R24 "a""null"', 'R25 "a""b""return"', 'R26 """"null', 'R27 x""null""', 'R28 "a"b"null"', 'R29 "a" "b""if (x)"', 'R30 ;"a\\"""null"',
    'R31 ";",}"">" "#', 'R32 a;"x""unclosed null', 'R33 "a\\\\""null"', 'R34 x"a""null"', 'R35 ("a")"null"', 'R36 -"=>"', 'R37 a?"x[0] = 1;"'])],
  // FEFF after the indent (r5, #76), the second run kept, a FEFF trailing, FEFF before a quote mid-line
  ['  \ufeffSTEP 1 a\n\t\ufeff\ufeff"return" x\n \ufeff \ufeffreturn y\n  \ufeff\n\ufeff  \ufeffR1 null\nR2 a \ufeff\nR3 x\ufeff"null"\n \ufeff# c\n\t \ufeff"if (" x'],
  // round 5b (#99): FEFFs interleaved anywhere in the leading space/tab/mark run all drop; a FEFF after content stays
  ['\ufeff \ufeff\treturn a\n \ufeff\ufeff \t\ufeff# c\n\t\ufeff \ufeff"null" x\n \ufeffR1 a \ufeff null \ufeff\n\ufeff\t\ufeff\n\ufeff \ufeff \ufeff\u00a0\ufeffreturn b\n \ufeff \u3000\ufeff"if (" y'],
  // round 5b (#107): a quote after + * ? opens nothing, so the code inside it is seen; the openers beside them still open
  [doc(['R1 /"(?:a|b)*"/ CITED R5', 'R2 a+"return"', 'R3 a*"null"', 'R4 a?"if (x)"', 'R5 x+"a" "null"', 'R6 a-"null"+"null"',
    'R7 a~"null"*"x" null', 'R8 ?"a""null"', 'R9 +"x[0] = 1;"', 'R10 *"=>"', 'R11 a&"x"?"typeof"', 'R12 a!"null"'])],
  // indexed assignment (r4, #68): every compound operator, the refused neighbours, and "=>"
  [doc(['R1 a[i] += 1', 'R2 a[i]-=1', 'R3 a[i] *= 2', 'R4 a[i] /= 2', 'R5 a[i] %= 2', 'R6 a[i] **= 2', 'R7 a[i] <<= 1', 'R8 a[i] >>= 1',
    'R9 a[i] >>>= 1', 'R10 a[i] &= m', 'R11 a[i] |= m', 'R12 a[i] ^= m', 'R13 a[i] &&= y', 'R14 a[i] ||= y', 'R15 a[i] ??= y',
    'R16 x[0] => y', 'R17 a[i] <= b', 'R18 a[i] >= b', 'R19 a[i] != b', 'R20 a[i] !== b', 'R21 a[i] ?= b', 'R22 a[i] += > b',
    'R23 a[i] +=> b', 'R24 a[i] *== b', 'R25 a[i] ***= b', 'R26 a[i] <<<= b', 'R27 a[i] >>>>= b', 'R28 a[i] >>== b', 'R29 a[i] + = b',
    'R30 a[i] ||=', 'R31 a[i]\t??=\t', 'R32 a[i] =>', 'R33 a[i] ==> b', 'R34 a[i] =>= b', 'R35 a[i] &&== b', 'R36 a[i]>>>=>', 'R37 a[i] ?? = b'])],
  ['R1 a[i] +=\r\nR2 x[0] =>\rR3 "q\\\u2029" null\u2028"z"\nR4 a[i] ^=\u3000'],
  [doc([...HEAD, 'R1 The result is the count of lines.', 'R2 An empty text yields 0.', ...TAIL])],
  [densityDoc(10, 1)], [densityDoc(9, 1)], [densityDoc(11, 1)], [densityDoc(30, 3)], [densityDoc(20, 2)], [densityDoc(29, 3)],
  [densityDoc(10, 1, '\r\n')], [densityDoc(7, 3) + '\n\n\n'],
  // quoting: code inside double quotes is invisible; an unterminated or broken quote is not stripped
  [doc(['R1 "if (x) return y;"', 'R2 "a \\" if (" if (', 'R3 "if (x', 'R4 "a\\', 'R5 "x" return "y"', 'R6 "\\"" => ""', 'R7 `null` in backticks'])],
  // line reader: CR LF, lone CR and LF break; LS / PS / NEL stay inside a line
  ['R1 x = 1;\r\nR2 y = 2;\rR3 return z R4 if (q)'], ['x = 1\r;\nx = 1;\r\ny = 1 ;\nz = 2; '],
  ['R1 return a\r\r\nR2 x = 1;\r\rR3 if (b)\n\r'], ['\ufeff\ufeffSTEP 1 a\n \ufeffreturn x\nR2 \ufeffreturn y\n\ufeff\n\ufeff# c\nx\u0085return'],
  [doc(['R1 a[i] = ', 'R2 a[i] =\t \t', 'R3 a[i] =\u00a0', 'R4 a[i] =\u3000 ', 'R5 x = 1; \t', 'R6 x = 1;\u00a0', 'R7 m[k] =\ufeff', 'R8 x = 1\u2028;'])],
  // indexed assignment (FINDINGS #50, r3): an equals sign not followed by a second one; end of line qualifies, "==" does not
  [doc(['R1 a[i]=', 'R2 a[i] ==', 'R3 a[i] = =', 'R4 a[i]\t=', 'R5 a[i]  ==x', 'R6 a[i] =\u2028', 'R7 a[i] =\u2028=', 'R8 m[k]  =  "x"',
    'R9 a[i]==b[j]=c', 'R10 a[i]===b', 'R11 x[0] = \t ', 'R12 "a[i] =" quoted', 'R13 a[i] "=" b', 'R14 a[ i ] = 1', 'R15 é[i] = 1', 'R16 a[i]\u3000='])],
  ['R1 a[i] =\r\nR2 a[i] ==\rR3 b[k] =  \nR4 c[0]='], ['R1 return a\u2028return b'], ['R1 a[i] =\u2029R2 if (x)\u2028R3 x = 1;'],
  // ASCII word boundaries next to non-ASCII letters; whitespace classes inside shapes
  [doc(['R1 éreturn here', 'R2 naïtypeof and xtypeof', 'R3 Ωif (x)', 'R4 Math (x)', 'R5 if　(x)', 'R6 for k in m', 'R7 returné', 'R8 group1é'])],
  // comment lines (counted in lines and commentLines), indented directives, truncation of long hit lines
  [doc(['# a comment', '   #indented comment', ' # nbsp comment', 'R1 # not a comment', '#', ' # return x'])],
  [doc(['      R1 ' + 'if (x) '.repeat(20), 'R2 return ' + 'abcdefghij'.repeat(8) + 'abcde' + '\u{1F600}\u{1F601}' + 'zz', 'R3 return \u{1F600}' + 'k'.repeat(120),
    '\t\tR4 x = ' + 'y'.repeat(100) + ';'])],
  [doc(['NODE-1 x', 'gate x', 'step\tx-y', '#STEP a', ' #  branch _', 'STEP a', 'STEP -', 'STEP .'])],
];

const QUO = ['R20 a+"null"', 'R21 a*"return"', 'R22 a?"if ("', ' \ufeff \ufeffreturn w', '\t\ufeff\t\ufeff"null" v', 'R14 a;"null"', 'R15 "a""null"', 'R16 x""null""', 'R17 a)"null"', 'R18 a|"x" "return"', '  \ufeffreturn z', 'R19 a~"if ("',
  'R1 ("if (x)")', 'R2 x"null" glued', 'R3 "a\\" null', 'R4 "unclosed return', 'R5 :"=>"', 'R6 12" wide null',
  'R7 "a\\\u2028" return "b"', 'R8 a[i] ||= y', 'R9 x[0] => y', 'R10 a[i] >>>= 1', 'R11 a[i] <= b', 'R12 a[i] ??= b', 'R13 a[i] *== b'];
const FRAGS = [...POS, ...NEAR, ...QUO, ...HEAD, ...TAIL, 'R5 The first line wins; later lines are ignored.', '  continued prose under a rule',
  'NOTE the oracle pins the rest', '', '   ', '# stray comment', 'PINNED charset WS = the members listed CITED probe',
  'TABLE SHAPES — first row wins', 'INVARIANT the count is never negative.'];
const WRAP = [(s) => s, (s) => s, (s) => s, (s) => '  ' + s, (s) => s + '  ', (s) => '"' + s + '"', (s) => '\t' + s, (s) => s + '\r'];

export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const out = CURATED.map((a) => a.slice());
  while (out.length < n) {
    const k = 1 + Math.floor(rnd() * 25); const L = [];
    if (rnd() < 0.5) L.push(...HEAD);
    for (let i = 0; i < k; i++) L.push(pick(WRAP)(pick(FRAGS)));
    if (rnd() < 0.4) L.push(...TAIL);
    const sep = rnd() < 0.15 ? '\r\n' : '\n';
    out.push([L.join(sep) + (rnd() < 0.3 ? '\n' : '')]);
  }
  return out;
}
