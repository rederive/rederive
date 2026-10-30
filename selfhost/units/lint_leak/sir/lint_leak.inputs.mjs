// Input generator for lint_leak(text, is_primary). Round 5b delta (rederive@6199e2cc8b75, FINDINGS #99 #107): every U+FEFF of
// the leading run of spaces, tabs and marks is dropped; "+" "*" "?" no longer open a literal; a register-P name after an
// invisible GLUE lead is a language-file hit. Round 5 (rederive@bb8ded84fa50: the opener set is space, tab and
// ( [ { , = : ; | < > ! & + - * ~ ? and a quote right after a closed literal opens the next, FINDINGS #75; U+FEFF after the
// indent is dropped, #76; the language-file glue set is the parser's PINNED one and a glued `NAME:` is caught, #83).
// Round 4 (rederive@978444f3baf3: quoted literals open only at a token
// start and an escape pair is a backslash and any one code point, FINDINGS #59 #60; a column-0 CITED is a citation, #62;
// the language-file glue set is White_Space or Cf, #61). Round 3 (31803f408bef, #42) cases are kept.
// A curated coverage prefix — every DIALECT row and its near misses, the per-line reading (names, colons, attribute marks,
// comments and the quoted "#", continuations, text before the first directive), quote blanking (escape pairs, unclosed and
// failed quotes), the line cutting, the 96-code-point display cut (including cuts that fall INSIDE a character above
// U+FFFF in UTF-16 terms), the one-hit-per-line-and-label rule and the language-file rule (register P, colon form, glued
// names) — then a seeded random fill of SIR-shaped texts. Every text is well-formed (no lone surrogate).
const E = '\u{1F600}', F = '\u{1F680}';   // characters above U+FFFF: one code point, two UTF-16 units
const LS = ' ', PS = ' ', NB = ' ';
const CURATED = [
  // ---- round 5b first: + * ? are not openers (#107), a quantifier quote does not hide a CITED
  ['R1 x+"null"\nR2 x*"null"\nR3 x?"null"\nR4 x-"null"\nR5 x~"null"\nR6 x&"null"\nR7 /"(?:a|b)*" CITED null\nR8 a+"b # null"\nR9 a*"x CITED y" undefined\nR10 a?"#" # null', true],
  ['R1 a+"b"+"c # d" null\nR2 (?"null")\nR3 x*"a"*"undefined"\nR4 x""+"null"\nR5 x "a"+"null"', true],
  // ---- round 5b: every U+FEFF of the leading run of spaces, tabs and marks (#99)
  ['UNIT x\n \uFEFF \uFEFF"null"\n\uFEFF \uFEFFnull\n\t\uFEFF\t\uFEFF\uFEFFundefined\n \uFEFF x\uFEFFnull\n\uFEFF\t\uFEFF\n\uFEFF \uFEFF# null\nR1\uFEFF null \uFEFF\n \uFEFF\u200b\uFEFFnull', true],
  ['\uFEFF \uFEFFBEHAVIOR x\n\uFEFF\uFEFF \tR1 x\n\uFEFF\u200bBEHAVIOR x\n\u200b\uFEFFR1 x\n\uFEFF\t\uFEFF', false],
  // ---- round 5b: a register-P name after an invisible GLUE lead (#107, INVISIBLE_LEAD)
  ['\u200bBEHAVIOR x\n\u2060R1\n\u200bR1:x\n\u200bR1::\n\u00a0TABLE:\u200bx\n\u200b\u2060INVARIANT\tx\n\u{E0001}R2\u3000x\n\u200bUNIT x\n\u200bCITED x\n\u200bR1x\n\u200bR1-\n\u200b# BEHAVIOR\n\u200b BEHAVIOR\n\u200bR\n\u200bR01 x\n\u000bKIND:\n\u0085SCOPE x\n\u200bBEHAVIORS x\n\u200bLANG x\n\u200bR1#', false],
  ['\u200bBEHAVIOR null\n\u2060R1 undefined\n\u200b# null', true],
  // ---- round 5 first, so the frozen slice teaches it: every opener, every near miss, adjacent literals (#75)
  ['R1 x;"null"\nR2 x|"null"\nR3 x<"null">\nR4 x>"null"\nR5 x!"null"\nR6 x&"null"\nR7 x+"null"\nR8 x-"null"\nR9 x*"null"\nR10 x~"null"\nR11 x?"null"', true],
  ['R1 x/"null"\nR2 x."null"\nR3 x1"null"\nR4 x#"null"\nR5 x\\"null"\nR6 x`"null"\nR7 x@"null"\nR8 x%"null"\nR9 x^"null"\nR10 x)"null"\nR11 x]"null"\nR12 x}"null"\nR13 x$"null"', true],
  ['R1 "a""null"\nR2 "a""b""undefined"\nR3 "a"""null\nR4 "a"" null\nR5 "a"x"null"\nR6 "a"" CITED b" null\nR7 "a""# null" x\nR8 """"null', true],
  ['R1 a|"b # null"\nR2 a;"x # undefined" y\nR3 -"a # b" null\nR4 x|"a CITED b" null\nR5 x-"CITED" undefined\nR6 a+"b"+"c # d" null\nR7 a<"x"> # null', true],
  // ---- round 5: U+FEFF after the indent (#76), once
  ['UNIT x\n  \uFEFF"null"\n\t\uFEFF\uFEFF"undefined"\n \uFEFF \uFEFF"null"\n\uFEFF \uFEFF"null"\n  \uFEFF# null\n  \uFEFF\t\uFEFF"b # null"\n\uFEFF\uFEFF\tnull\n x\uFEFF"null"', true],
  ['\uFEFF BEHAVIOR x\n  \uFEFFR1 rule\n\uFEFF\uFEFFTABLE t\n\uFEFF \uFEFFR2 x\n \uFEFF', false],
  // ---- round 5: a glued NAME: (#83), invisible leads, double colons
  ['R1:\u200bx\nBEHAVIOR:\u00a0x\nTABLE:\u2060x\nR1::\u200bx\nUNIT:\u200bx\nCITED:\u200bx\n\u2060BEHAVIOR x\n\u200bR1 rule\nR2:\u{E0001}x\nKIND:\u000bx\nSCOPE:\uFEFFx\nR3:x\nR4:\nINVARIANT:\u3000', false],
  ['R1:\u200bnull\nBEHAVIOR:\u00a0undefined\n\u2060R1 null\nR1:: null', true],
  // ---- primary: the rows (each line is read on its own, so one text packs several probes, one per line)
  ['R1 /^a$/ \\d \\p{L} Math.floor JSON.parse Vec<u8> lineterminator null\nNOTE uses UTF-8, UTF-16, U+00A0 and SHA-256; IEEE-754 NaN and -0', true],
  ['R1 Number() String(x) Boolean( BigInt(1)\nR2 x.toLowerCase() toUpperCase( charCodeAt( codePointAt( localeCompare( normalize( padStart( padEnd(\nR3 xtoLowerCase( and _normalize( and parseInteger and BigInt64', true],
  ['R1 Object.keys Array.isArray Reflect.get Symbol.iterator Intl.collator\nR2 Object.Keys Number.isFinite String.fromCharCode Date.now RegExp.Escape Promise.all Boolean.x BigInt.asUintN\nR3 JSON. xJSON.parse Array a String. Date.1 Math.', true],
  ['R1 String::new Vec::new char::from str::len i64::MAX u64:: usize:: Box::new HashMap::new BTreeMap::new f64:: u8::\nR2 Option<T> or Vec<T>\nR3 take &str\nR4 s&str and x&strs\nR5 (&str) and Option<&str>\nR6 fancy_regex\nR7 fancy-regex or to_lowercase()\nR8 xfancy_regex to_lowercases', true],
  ['R1 newline terminator\nR2 the LINE TERMINATOR set\nR3 Line-Terminator and NewLineTerminator\nR4 line_terminator xline terminator anewline terminator newnewline terminator\nR5 line  terminator', true],
  ['R1 nullable NULL non-null\nR2 \\word \\section \\B.\nR3 /^abc/ and /abc$/\nR4 /^$/\nR5 /^a' + LS + 'b$/ and /^a' + PS + '$/', true],
  // ---- quote blanking: only the BLANKED segment is tested; the hit text is always the original line
  ['R1 The result is "null" or "undefined"; "\\d" and "/^x$/" and "Math.floor" are quoted data\nR2 single \'null\' and `undefined` are not exempt', true],
  ['R1 "a\\"b" null', true],
  ['R1 /^a b$/ and /^" "$/', true],
  ['R1 /^a' + LS + 'b$/ and /^"' + LS + '"$/', true],
  ['R1 "a\\"b null"\nR2 "a\\" null\nR3 say "null\nR4 "a\\\\" null "b"\nR5 "a\\' + LS + '" null "b"\nR6 "/^" x "$/"\nR7 /^" x "$/', true],
  // ---- round 4: a literal opens only at a token start (start of the text read, or after space, tab, ( [ { , = :)
  ['R1 a 12" wide null "x"\nR2 a/"/ null\nR3 a"null" and b"undefined"\nR4 ("null") ["null"] {"null"} ,"null" ="null" :"null"\nR5 x;"null" x."null" x-"null" x\'"null"', true],
  ['R1 "a""null"\nR2 "a"null"\nR3 "a" "null"\nR4 "null"x"undefined"\n"null" at column 0\n  "null" first in a continuation', true],
  // escape pairs: a backslash and ANY one code point (U+2028, U+2029, a no-break space, a character above U+FFFF)
  ['R1 "a\\' + LS + '" # null "c"\nR2 "a\\' + PS + '" null\nR3 "a\\' + E + '" null\nR4 "a\\' + NB + '" undefined\nR5 "\\\\" null\nR6 "a\\" null\nR7 x "\\', true],
  ['R1 x "a # null\nR2 x a" # null\nR3 x "a # b" undefined\nR4 x ("a # b") null\nR5 x "a\\' + LS + '" # undefined', true],
  // a mark inside a literal is data; a mark outside ends the body; a mark after a non-opening quote is a mark
  ['R1 "x CITED" CITED null\nR2 a" CITED null"\nR3 ("a ANCHOR b") null\nR4 "a EARNED" null EARNED undefined\nR5 x"CITED" null', true],
  // a column-0 CITED is a citation: not stripped as a name, so its own mark empties the body (the comment is still read)
  ['CITED null\nCITED\tundefined\nCITED\nCITED: null\nCITED:\tundefined\nCITED null # undefined\nCITEDX null\nEARNED: null\nANCHOR: undefined', true],
  // ---- comments and the quoted "#"
  ['R1 clean # null\nR2 clean #null\nR3 clean\t#\tnull\nR4 clean' + NB + '# null\nR5 clean #', true],
  ['R1 "x # null" is quoted\nR2 "x # y" null\nX a" # "b" null\nR4 say "a # null\nR5 a # b # null\nR6 a # x CITED null', true],
  ['R1 null # /^a$/\nR2 Vec<T> # Math.max null \\d\nR3 /^a$/ # null', true],
  ['# null at the top\nUNIT x\n# null in a full-line comment\n  ## undefined\n\t#\tnull\n#null', true],
  // ---- attribute marks: citations are never read; a mark at the start of the content is a mark
  ['R1 clean CITED null EARNED undefined ANCHOR /^x$/\nR2 CITED null\nR3\tCITED\tnull\nR4 null CITED\nR5 xCITED null\nR6 a CITEDx null\nR7 a cited null\nR8 a\tEARNED\tnull', true],
  ['R1 "a CITED b" null\n  CITED null\nCITED null\nEARNED null\nANCHOR undefined', true],
  ['PINNED charset X = a CITED ECMA-262 LineTerminator\n  null in a continuation CITED undefined', true],
  // ---- names, continuations, text before the first directive
  ['the null value\n  indented null orphan\nlowercase null\nUNIT x\n  null continues\n\tundefined on a tab line\nnull at column 0', true],
  ['FOO null\nR01 undefined\nR null\nr1 null\nR1: null\nTABLE: undefined\nR1:null\nFOO:: null\nR1' + NB + 'null\nNULL null\n\u0085null', true],
  // ---- line cutting
  ['UNIT x\r\nR1 null\r\n\r\nR2 undefined\r\n', true],
  ['UNIT x\rR1 null\rR2 undefined\n\rR3 null', true],
  ['\uFEFFR1 null\n\uFEFF\uFEFFR2 null  \t\n\uFEFF  R3 null\n  \uFEFFnull\n\n   \n \nR9 null', true],
  ['R1 null' + NB + NB + '\n' + NB + 'null\nR3 a' + LS + 'null' + PS + 'b', true],
  // ---- the display: 96 code points, never half a character (a cut by UTF-16 units would fall inside a pair here)
  ['R1 null ' + 'x'.repeat(87) + E + 'tail', true],
  ['R1 null ' + 'x'.repeat(86) + E + F + 'tail\n  R2 null ' + E.repeat(45) + 'abcdef', true],
  ['R1 null ' + E.repeat(100) + '\n  R2 null ' + 'é'.repeat(50) + F.repeat(50), true],
  ['R1 ' + 'x'.repeat(120) + ' null\n  ' + 'y'.repeat(100) + ' undefined', true],
  ['', true],
  ['\n', true],
  // ---- mode isolation
  ['BEHAVIOR\nR1 rule\nTABLE x', true],
  ['UNIT x\nMECHANISM /^a$/ \\d null UTF-8 Math.floor\n  # undefined', false],
  ['BEHAVIOR\u0085x\nTABLE\u00adx\nR1\u061cx\nSCOPE\u180ex\nKIND\u200bx\nR2\u2060x\nINVARIANT\u200fx\nR3\u202ax\nORACLE\ufff9x\nR4\u{110BD}x\nSTATE\u{E0001}x\nEMIT\u{E007F}x\nR5\u{1D173}x\nBRANCH\u{13430}x', false],
  // ---- language file: the register rule
  ['UNIT x\nLANG js\nPRIMARY-SHA256 00\nSIG f(x: string): string\nABI text=string\nMECHANISM uses BEHAVIOR words\nDEPENDS-ON none\nPINNED regex A = /x/ CITED R1\nDESCRIPTION y\nNOTE z\nRATIONALE r\nPROVENANCE p\nENVELOPE e\nCARRIED t = m\nEARNED round-1\nCITED src', false],
  ['UNIT x\nBEHAVIOR\nR1 one space\nR12  two\nTABLE foo\nINVARIANT x\nKIND FUNCTIONAL\nANCHOR a\nSCOPE s\nORACLE value -> o.json', false],
  ['R1 rule CITED src EARNED r1\nR2: colon\nTABLE: x\nOUT-OF-DOMAIN y\nSTATE mutates a\nBRANCH b\nGUARD-PINNED g\nNOTES n\nSIR 0.1', false],
  ['UNIT x\rBEHAVIOR\rR1 cr only\r\nR2 crlf\r\n', false],
  ['\uFEFFBEHAVIOR\n  BEHAVIOR indented\n\tR1 tab\nbehavior lower\n# BEHAVIOR\nR\nR-1 x\nFOO y\nR01 z\nR1#\nBEHAVIOR::', false],
  ['BEHAVIOR' + NB + 'x\nR1\u3000rule\nTABLE\uFEFFx\nKIND\u000bx\nSCOPE\u000cx\nORACLE\u2003x\nR7' + LS + 'x', false],
  ['BEHAVIOR\u0085x\nTABLE\u180ex\nUNIT' + NB + 'x\nR1-' + NB + 'x\nBEHAVIORS' + NB + 'x\nR1' + NB, false],
  ['VARIANT v\nSRC s\nTRIGGER t\nREACH r\nORACLE-CLASS d\nTRACE-SEAM h\nSEAM i\nUNGUARDED-PRECONDITION p\nSHAPE s\nCANONICAL-SHA256 c\nAUTHORITY a\nCARRIED-DATA d\nEMIT e\nREQUEST q\nON-ERROR o\nPAR p\nRING r\nLIFECYCLE l\nEFFECT e\nSURFACE s', false],
  ['R7 ' + 'w'.repeat(120) + '\nTABLE ' + E.repeat(100), false],
  ['TABLE ' + 'x'.repeat(89) + E + F + 'tail', false],
  ['R1  # only a comment\nR2 "a # b"', false],
  // ---- round 4: the glue set is White_Space or Cf (U+0085, U+00AD, U+061C, U+180E, U+200B, U+2060, U+FEFF, U+FFF9, astral Cf)
  ['BEHAVIOR\u034fx\nTABLE\u115fx\nR1\u3164x\nKIND\u2800x\nUNIT\u200bx\nCITED\u200bx\nR1-\u200bx\nBEHAVIOR:\u00a0x\nR1:\u200bx\nANCHOR\u2061x\nDESCRIPTION\u0085x', false],
  ['CITED null\nCITED: null\nCITED\nR1 "a CITED b"\n  R1 indented', false],
  ['', false],
];

const NAMES = ['UNIT', 'BEHAVIOR', 'R1', 'R2', 'R10', 'TABLE', 'INVARIANT', 'DESCRIPTION', 'NOTE', 'PINNED', 'MECHANISM', 'ABI', 'SIG',
  'ENVELOPE', 'KIND', 'SCOPE', 'ORACLE', 'PROVENANCE', 'ANCHOR', 'EARNED', 'CITED', 'FOO', 'R1:', 'TABLE:', 'R', 'r1', 'behavior',
  'BEHAVIOR' + NB, 'R3　', 'TABLE﻿', 'KIND\u0085', 'TABLE\u200b', 'R2\u180e', 'SCOPE\u2060', 'R4\u00ad', 'KIND\u{E0001}', 'BEHAVIOR\u034f',
  'CITED:', 'CITEDX', 'ANCHOR:', 'R1:\u200b', 'TABLE:\u00a0', 'BEHAVIOR:\u2060', 'R2::', '\u2060KIND', 'UNIT:\u200b',
  '\u200bBEHAVIOR', '\u2060R1:', '\u200bR2::', '\u00a0TABLE', '\u200bUNIT', '\u{E0001}R1x', '\u200b\uFEFFSCOPE', '\u200b#'];
const TOK = [
  'null', 'undefined', '"null"', "'null'", 'NULL', 'nullable', 'non-null', 'the', 'value', 'is', 'none', 'text', 'rule', 'é', '日本', E, F + E,
  '/^x$/', '/^', '$/', '"/^x$/"', '\\d', '\\w', '\\b', '\\S', '\\dd', '\\n', '\\p{L}', '\\p', '"\\d"', '\\', '\\\\', '\\"', LS, NB,
  'Math.floor', 'Math.', 'String.prototype', 'parseInt', 'parseInteger', 'BigInt', 'Number(x)', 'Number()', 'String(', 'Boolean(',
  'x.toLowerCase()', 'toUpperCase(', 'normalize(', 'xnormalize(', 'JSON.parse', 'Object.keys', 'Object.Keys', 'Intl.x', 'Date.now', 'a String.',
  'fancy-regex', 'fancy_regex', 'f64::MAX', 'String::new', 'Vec<u8>', 'Vec::new', 'char::from', 'Option<T>', '&str', 'x&str', '(&str)', 'to_lowercase',
  'UTF-8', 'U+0041', 'line terminator', 'lineterminator', 'newline terminator', 'Line-Terminator', 'xline terminator',
  'CITED', 'EARNED', 'ANCHOR', 'xCITED', '#', '#x', '"', "'", ',', '.', '(', ')', ':',
  '12"', 'a"b', '("null")', '="x"', ':"null', '["a #"]', '"a CITED b"', '"x\\' + LS + '"', '"\\' + E + '"', '"\\"', '"a""b"', 'x"null"', '"#"', '" # "',
  ';"null"', '|"a # b"', '-"null"', '+"x"', '<"null">', '!"a CITED b"', '&"#"', '*"x"', '~"null"', '?"null"', '/"null"', '."null"', '"a""null"', '"a"""', '"a"x"null"',
];
const WS = [' ', ' ', ' ', '  ', '\t', ' ', '　', NB, '\u0085', '', '\u200b', '(', ',', '=', '"', ';', '|', '-', '+', '?', '/', '.'];

export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  // interleave the language-file cases into the primary ones so the frozen (first) slice teaches both modes
  const Pq = CURATED.filter((x) => x[1]), Lq = CURATED.filter((x) => !x[1]); const out = [];
  while (Pq.length || Lq.length) { for (let k = 0; k < 4 && Pq.length; k++) out.push([...Pq.shift()]); if (Lq.length) out.push([...Lq.shift()]); }
  while (out.length < n) {
    const lines = []; const nl = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < nl; i++) {
      const r = rnd(); let l;
      if (r < 0.12) l = pick(['  ', '\t', '']) + '#' + pick([' ', '']);
      else if (r < 0.32) l = pick(['  ', '    ', '\t', '  \uFEFF', '\t\uFEFF\uFEFF', ' \uFEFF \uFEFF', '\uFEFF \uFEFF', '\uFEFF\t']);
      else l = pick(['', '', '', '﻿']) + pick(NAMES) + pick([' ', ' ', '\t', '']);
      const nt = Math.floor(rnd() * 6);
      for (let j = 0; j < nt; j++) l += pick(TOK) + pick(WS);
      if (rnd() < 0.15) l += ' ' + pick(['CITED', 'EARNED', 'ANCHOR']) + ' ' + pick(TOK);
      if (rnd() < 0.12) l += ' # ' + pick(TOK);
      if (rnd() < 0.08) l += ' ' + pick(['x'.repeat(80), E.repeat(60), 'y'.repeat(85) + E + F + E]);   // long lines: the display cut
      if (rnd() < 0.1) l += pick([' ', '\t', '  ']);
      lines.push(l);
    }
    const sep = pick(['\n', '\n', '\r\n', '\r']);
    let text = lines.join(sep); if (rnd() < 0.3) text += sep;
    out.push([text, rnd() < 0.55]);
  }
  return out;
}
