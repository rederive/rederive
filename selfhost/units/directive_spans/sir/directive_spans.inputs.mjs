// Input generator for directive_spans: real SIR texts (seeded from rederive's own .sir files and the lab's get_rgb unit),
// mutations of them, synthetic texts built line by line from every line class the parser distinguishes, and degenerate texts.
// Every argument list is [text]; text is well-formed Unicode (no lone surrogates).
const SEEDS = [
  "# EXEMPLAR (minimal register) \u2014 a \u226410-line pure function earns a ~35-line SIR.\n# This exact contract is PROVEN: blind quorum 3/3 at 29/29 (16 frozen + 13 held-out) \u2014 condensed 68% from a\n# 116-line original with no convergence loss. The EARNED block below was added after an observed round-1\n# divergence (2/3 emissions syntax-dead) \u2014 defensive lines are earned by failures, never written cold.\nUNIT min-indent\nKIND FUNCTIONAL\nFIDELITY package        # reproduce min-indent@1.0.1 exactly\nORACLE-CLASS deterministic\nSIG minIndent(string: string) -> number   # default export; pure; no options\nDEPENDS-ON none\n\n# The smallest count of leading space/tab characters among the string's CONTENT lines (lines whose next\n# character after the leading run is non-whitespace). No content lines -> 0.\n\n# BEHAVIOR \u2014 the whole computation is one regex scan (pinned verbatim, load-bearing):\n#     RE = /^[ \\t]*(?=\\S)/gm\n#   match = string.match(RE)\n#   if (!match) return 0\n#   return match.reduce((r, a) => Math.min(r, a.length), Infinity)\n#\n# Three class distinctions carry all the behavior \u2014 get these exactly right:\n#   1. The leading class is EXACTLY [ \\t] (ASCII space + tab, each counting 1) \u2014 NOT \\s. A \\f, \\v, or\n#      no-break space in the leading run makes the lookahead fail: that line is NOT a content line.\n#   2. The content test (?=\\S) uses full-Unicode \\S.\n#   3. Line starts come from the multiline `^`, which fires at string start and after each JS line\n#      terminator (\\n, \\r, U+2028, U+2029) \u2014 NOT after \\f or \\v. Do not split on '\\n'; CRLF, lone \\r,\n#      and LS/PS all work only because `^` defines the boundaries.\n#\n# EARNED (round-1 divergence: 2/3 emissions were syntax-dead from raw LS/PS in comments): when your source\n# mentions U+2028/U+2029, write them ONLY as escapes (\\u2028) \u2014 the raw characters are line terminators and\n# will truncate a // comment into live code.\n#\n# Discriminators (kill the plausible-wrong implementations; the oracle carries the full set):\n#   \" \\fa\"        -> 0   (a \\s-based leading class would return 1)\n#   \"    a\\r  b\"  -> 2   (a split('\\n') line model would miss the lone-\\r boundary)\n#   \"  a\\n\\t\\n b\" -> 1   (whitespace-only lines are ignored, not counted as indent 0)\n\nORACLE value -> oracle.json\n\nENVELOPE minIndent(string) only; non-string args are out (real code calls String.prototype.match).\nPROVENANCE min-indent@1.0.1, github.com/thejameskyle/min-indent, MIT, index.js (single default export).\n",
  "UNIT ringToken\nKIND FUNCTIONAL\nFIDELITY spec\nSIG ringToken(items, gate) -> Promise<Array>\n# A ring whose single circulating permission is EXPLICIT on the boundary.\nRING the token is taken once, passed hand to hand, and released at the end\nINVARIANT SAFETY: R_ring subset of R_free \u2014 the ring invents no outcome\nINVARIANT LIVENESS (mutual exclusion): at most ONE holder at any instant\nINVARIANT LIVENESS (no loss): every token taken is eventually released\n",
  "UNIT get_rgb\nLANG js\nPRIMARY-SHA256 b0378dc3a8ba5eb040db7f4ad96183c769e6a688cb76770da16da9ab5a6f6d65\nSIG get_rgb(input: string): [number, number, number, number] | null\nNOTE default export\nABI text=string (UTF-16); num=number (f64); tuple=Array; none=null. \"Empty text\" (R1) is the falsy string \"\".\n  The real package is driven as default.get.rgb(input); the reconstruction exports a plain function.\nMECHANISM RE flavor ECMAScript with the i flag; \"whole text\" (R2) = ^ and $ anchors; \"lowercased\" (R8) =\n  String.prototype.toLowerCase; \"round halves toward +infinity\" (R6) = Math.round; word characters (R8) = \\w.\nMECHANISM numeric parse (R5, R6) = parseFloat on the captured text; hex byte (R3, R4) = parseInt(pair, 16).\nCARRIED colorNames = ../carried-color-names.js (default export: a plain object; membership (R8) = own-property lookup)\nDEPENDS-ON none\nPINNED regex HEX6    = /^#([a-f\\d]{6})([a-f\\d]{2})?$/i CITED R3 \u2014 the accept-set rides on it\nPINNED regex ABBR    = /^#([a-f\\d]{3,4})$/i CITED R4\nPINNED regex NUMERIC = /^rgba?\\(\\s*([+-]?(?:\\d*\\.)?\\d+(?:e\\d+)?)(?=[\\s,])\\s*(?:,\\s*)?([+-]?(?:\\d*\\.)?\\d+(?:e\\d+)?)(?=[\\s,])\\s*(?:,\\s*)?([+-]?(?:\\d*\\.)?\\d+(?:e\\d+)?)\\s*(?:[\\s,|/]\\s*([+-]?(?:\\d*\\.)?\\d+(?:e\\d+)?)(%?)\\s*)?\\)$/i CITED R5 \u2014 the (?=[\\s,]) lookaheads after channels 1 and 2 ARE the \"must be followed by whitespace or comma\" rule; EARNED the transcription-register SIR established these lookaheads as load-bearing (percent-channel and 2-channel rejects)\nPINNED regex PERCENT = /^rgba?\\(\\s*([+-]?[\\d.]+)%\\s*,?\\s*([+-]?[\\d.]+)%\\s*,?\\s*([+-]?[\\d.]+)%\\s*(?:[\\s,|/]\\s*([+-]?[\\d.]+)(%?)\\s*)?\\)$/i CITED R6\nPINNED regex KEYWORD = /^(\\w+)$/ CITED R8 \u2014 applied to the lowercased text\nPROVENANCE verified JS reconstruction: sir-lab/color-string-rederive/runs/emit_1.mjs (3/3 blind quorum;\n  5000/5000 differential vs index.corrected.js). This file was split out of the transcription-register SIR 2026-09-22.\n",
  "UNIT get_rgb\nKIND FUNCTIONAL\nFIDELITY spec\nANCHOR index.corrected.js \u2014 color-string@2.1.4 cs.get.rgb with ONE deliberate correction (R7)\nORACLE-CLASS deterministic\nSIG get_rgb(input: text) -> tuple[f64, f64, f64, f64] | none\nENVELOPE text only. Accepted forms: hex (#rgb, #rgba, #rrggbb, #rrggbbaa; case-insensitive); rgb()/rgba() with\n  three numeric channels and an optional alpha; rgb()/rgba() with three percent channels and an optional alpha;\n  the literal \"transparent\"; a named color from the carried table. Anything else -> none. Non-text input is out\n  of the envelope.\nDEPENDS-ON none\nCARRIED colorNames FROM color-name (npm) \u2014 the CSS Color Module Level 4 \u00a76.1 named-color table, extracted byte-exact by the toolchain\n  SHAPE map text -> tuple[u8, u8, u8]; 148 entries; keys are lowercase names; \"transparent\" is NOT a key (R8 handles it)\n  CANONICAL-SHA256 678d5ab9a75b5a1af87bf3d5108e951a98f3800b5ecf1d6123b0e7345a882d55\n  AUTHORITY { expr: \"count\", equals: 148 }\n  AUTHORITY { expr: \"rebeccapurple\", equals: [102, 51, 153] }\n  AUTHORITY { expr: \"aliceblue\", equals: [240, 248, 255] }\n  AUTHORITY { expr: \"papayawhip\", equals: [255, 239, 213] }\n  AUTHORITY { expr: \"grey\", equals: [128, 128, 128] }\n  AUTHORITY { expr: \"gray\", equals: [128, 128, 128] }\nDESCRIPTION Parse a CSS-style color string into [r, g, b, a] \u2014 channels in [0, 255], alpha in [0, 1] (default 1)\n  \u2014 or none when the text is not one of the accepted forms.\nBEHAVIOR\nR1 Empty text -> none.\nR2 Forms are tried in this order and the FIRST that accepts wins: HEX6, ABBR, NUMERIC, PERCENT, KEYWORD.\n  If none accepts -> none. A form must account for the WHOLE text: any leading or trailing character\n  outside the form means that form does not accept (\" rgb(...)\", \"x red\", \"rgb(255,0,0)x\" -> none).\nR3 HEX6 \u2014 \"#\" then six hex digits, optionally followed by two more hex digits (alpha); case-insensitive.\n  Each pair of hex digits is one channel byte. Alpha, when present, is its byte divided by 255.\nR4 ABBR \u2014 \"#\" then three or four hex digits; case-insensitive. Each digit is DOUBLED to make the byte\n",
];

const BREAKS = ['\n', '\r\n', '\r'];
// one entry per line class (the SIR's R2-R6): directive lines, near-misses, comments, continuations, blanks, marks, glue
const LINES = [
  'UNIT u', 'KIND FUNCTIONAL', 'SIG f(x: text) -> i64', 'BEHAVIOR', 'R1 Empty -> none.', 'R12 rule', 'ORACLE value -> o.json',
  'EARNED round 1', 'ANCHOR x', 'PINNED regex X = /a/ CITED R1', 'FOO bar', 'X', 'A', 'I think so', 'A-B', 'Q9-', 'R1', 'ZZ-TOP:',
  'UNIT: hashSync', 'R1: colon rule', 'KIND:', 'A::', 'UNIT:x', 'CITED x', 'CITED: x', 'CITED', 'CITEDX y', 'unit u', 'Unit u',
  'r1 x', '1A x', '-A x', '\u00c9 x', '_A x', 'UNIT\tx', 'UNIT\t\tx', 'UNIT  x', 'UNIT # c', 'UNIT#', 'UNIT #x', 'UNIT "a # b"',
  '# comment', '#', '## two', '#UNIT x', '  # indented comment', '\t# tab comment', '  continuation', '\tcontinuation',
  '    four', '  UNIT inner', '', ' ', '\t', '  \t ', 'plain prose', 'lower case line', '"quoted" line',
  '\ufeffUNIT bom', '\ufeff\ufeffKIND k', '\ufeff', '\ufeff ', ' \ufeffUNIT x', '\ufeff\tUNIT x', '\ufeff# c', '\t\ufeff# c',
  'UNIT\ufeff x', 'UNIT\u00a0x', 'BEHAVIOR\u3000x', 'R1\u200bx', 'R1:\u200bx', 'KIND\fx', 'KIND\vx', 'UNIT\u2028x', 'NOTE\u2029y',
  'UNIT\u0085x', '\u2060KIND k', '\u00a0UNIT x', '\u3000# c', 'SIG\u2028', '\u2028', '\u0085', '\f', '\v',
  'UNIT x   ', 'NOTE trailing tab\t', 'DESCRIPTION \ud83d\ude00 emoji', '\ud83d\ude00', 'R99999999999 big',
];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const splitAny = (t) => t.split(/\r\n|\r|\n/);
function synth(rnd) {
  const k = 1 + Math.floor(rnd() * 14); const br = rnd() < 0.7 ? pick(rnd, BREAKS) : null; let s = '';
  for (let i = 0; i < k; i++) { s += pick(rnd, LINES); if (i < k - 1) s += br ?? pick(rnd, BREAKS); }
  const end = rnd(); if (end < 0.4) s += br ?? pick(rnd, BREAKS); else if (end < 0.5) s += (br ?? '\n') + (br ?? '\n');
  return s;
}
function mutate(rnd, t) {
  let ls = splitAny(t); const ops = 1 + Math.floor(rnd() * 4);
  for (let o = 0; o < ops; o++) {
    const r = rnd(), i = Math.floor(rnd() * ls.length); if (!ls.length) ls.push("");
    if (i >= ls.length) ls.push("");
    if (r < 0.25) ls.splice(i, 0, pick(rnd, LINES));          // insert a line of some class
    else if (r < 0.4) ls.splice(i, 1);                        // delete a line
    else if (r < 0.55) ls[i] = '  ' + ls[i];                  // indent (directive -> continuation)
    else if (r < 0.7) ls[i] = ls[i].replace(/^[ \t]+/, '');  // dedent (continuation -> maybe a directive)
    else if (r < 0.8) ls[i] = '# ' + ls[i];                   // comment out
    else if (r < 0.88) ls[i] = '\ufeff' + ls[i];              // a leading mark
    else ls[i] = ls[i].replace(' ', pick(rnd, ['\u00a0', '\t', '\u200b', ':', '  ']));   // change the first separator
  }
  const br = pick(rnd, BREAKS); const tail = rnd();
  return ls.join(br) + (tail < 0.3 ? br : tail < 0.45 ? pick(rnd, BREAKS) : '');
}
const CURATED = [
  '', '\n', '\r\n', '\r\r\n', '\n\r', '\t', '# only a comment', '\uFEFF', 'UNIT', 'UNIT\n', 'UNIT\r',
  'UNIT u\n\n\n', 'UNIT u\r\nKIND k\r\n', 'UNIT u\rKIND k', 'UNIT u\n  cont\n\tcont\nKIND k\n  cont',
  '# head\n# head\nUNIT u\n# between\nKIND k', '  orphan\nprose before\nUNIT u\nprose at column 0\nKIND k',
  'DESCRIPTION wraps\nA line that starts with A\nI think this is prose\nKIND k', 'UNIT u\nCITED wrapped attribute\nEARNED at column 0\nANCHOR at column 0',
  'UNIT: hashSync\nR1: a\nCITED: x\nA:: x\nUNIT:x\nKIND:', 'FOO unknown\nX\nA-B\nR99999999999 big\nunit u\nKind k\n1A x\n-A x\n',
  '\uFEFFUNIT u\n\uFEFF\uFEFFKIND k\n \uFEFFSIG s\n\uFEFF NOTE n\n\uFEFF# c\n\uFEFF\tR1 r\nR2 r',
  'UNIT u\nKIND\u00a0k\nBEHAVIOR\u3000x\nR1\u200bx\nR2:\u200bx\nNOTE\fk\nSIG\vs\n\u2060KIND k\nUNIT\uFEFF x\nR3 r',
  'UNIT u\u2028KIND k\u2029SIG s\u0085NOTE n\fR1 r\vR2 r\nR3 r', 'UNIT u\n \nKIND k\n\t\n  \t \n', 'UNIT u   \nKIND k\t\nSIG s\t \r\n',
  'UNIT u\n#UNIT v\n  # x\nKIND k # trailing\nSIG # x\nNOTE#', 'R1 a\r\n  b\r\nR2 c\r\n\r\n', 'A\n\nB\r\n\r\nC\r\rD',
  'UNIT u\rKIND k\rSIG s\n', 'UNIT u\rKIND k\n  kcont\rSIG s\n  scont\nNOTE n', 'UNIT u\rKIND k\r', 'UNIT u\n\r', 'UNIT u\n\n\r\r',
  'UNIT u\r\nKIND k\rSIG s\nNOTE n\r\n\r\n', 'A\rB\r\nC\nD\r\rE', '\r\r\rUNIT u', '# c\rUNIT u\r# d\nKIND k\r', 'R1 a\r  b\rR2 c\n  d\r\nR3 e',
  SEEDS[1].split('\n').map((l, i) => l + ['\r', '\n', '\r\n'][i % 3]).join(''),
  ...SEEDS, SEEDS[0].replace(/\n/g, '\r\n'), SEEDS[1].replace(/\n/g, '\r'), SEEDS[2].replace(/\n$/, ''), '\uFEFF' + SEEDS[3],
];
export function genInputs(n, rnd) {
  const out = CURATED.map((t) => [t]);
  while (out.length < n) {
    const r = rnd();
    if (r < 0.45) out.push([synth(rnd)]);
    else if (r < 0.9) out.push([mutate(rnd, pick(rnd, SEEDS))]);
    else out.push([mutate(rnd, synth(rnd))]);
  }
  return out;
}
