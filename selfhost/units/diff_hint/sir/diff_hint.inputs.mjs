// diff_hint input generator: genInputs(n, rnd) -> list of [existing, profile] text pairs.
// Curated coverage prefix first (every branch, window boundary and escape class of diffHint), then a seeded fill.
// The first 24 are the frozen (teaching) slice, so they carry one case per rule; the rest of the prefix lands in held-out.
// Every arg is well-formed Unicode text (no lone surrogate: the seam's UTF-8 encode would turn it into U+FFFD).

const X = (k, c = 'x') => c.repeat(k);
const cp = (...ns) => String.fromCodePoint(...ns);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// every C0 control except LF (LF splits lines), plus DEL (raw)
const C0 = cp(...range(0x00, 0x09), ...range(0x0b, 0x1f), 0x7f);
// the escaped invisible set (round 5b: GLUE + extras, u flag), split so each window stays under 80 code points
const INV1 = cp(...range(0x7f, 0xa0), 0xad, 0x34f, ...range(0x600, 0x605), 0x61c, 0x6dd, 0x70f, 0x890, 0x891, 0x8e2, 0x115f,
  0x1160, 0x1680, ...range(0x180b, 0x180e));
const INV2 = cp(...range(0x2000, 0x200f), ...range(0x2028, 0x202f), ...range(0x205f, 0x2064), ...range(0x2066, 0x206f), 0x2800,
  0x3000, 0x3164, ...range(0xfe00, 0xfe0f), 0xfeff, 0xffa0, ...range(0xfff9, 0xfffb));
// supplementary members: escaped in the braced \u{hex} form
const INV3 = cp(0x110bd, 0x110cd, ...range(0x13430, 0x1343f), ...range(0x1bca0, 0x1bca3), ...range(0x1d173, 0x1d17a), 0xe0001,
  ...range(0xe0020, 0xe003f));
const INV4 = cp(...range(0xe0040, 0xe007f));
const VS = (a) => cp(...range(a, Math.min(a + 78, 0xe01ef)));   // variation selectors supplement, in 79-wide chunks
// the neighbours of each escaped range, and the default-ignorables left out of the set: all stay raw
const NEAR = cp(0x7e, 0xa1, 0xac, 0xae, 0x34e, 0x350, 0x5ff, 0x606, 0x61b, 0x61d, 0x6dc, 0x6de, 0x70e, 0x710, 0x88f, 0x892,
  0x8e1, 0x8e3, 0x115e, 0x1161, 0x167f, 0x1681, 0x180a, 0x180f, 0x17b4, 0x17b5, 0x1fff, 0x2010, 0x2026, 0x2027, 0x2030,
  0x205e, 0x2065, 0x2070, 0x27ff, 0x2801, 0x2fff, 0x3001, 0x3163, 0x3165, 0xfdff, 0xfe10, 0xfefe, 0xff00, 0xff9f, 0xffa1,
  0xfff0, 0xfff8, 0xfffc, 0xfffd, 0xe9, 0x4e2d, 0x2f);
const NEAR2 = cp(0x110bc, 0x110be, 0x110cc, 0x110ce, 0x1342f, 0x13440, 0x1bc9f, 0x1bca4, 0x1d172, 0x1d17b, 0xe0000, 0xe0002,
  0xe001f, 0xe0080, 0xe00ff, 0xe00ff, 0xe01f0, 0xe0fff, 0x10ffff, 0x1f600);

const CURATED = [
  // ---- frozen slice (24): one case per rule ----
  ['', ''],                                    // identical -> the sentence
  ['a\n', 'a'],                                // profile lacks line 2
  ['one\ntwo', 'one\ntwo\nthree'],             // existing lacks line 3
  ['abc', 'xbc'],                              // col 1
  ['one\ntwo\nthree', 'one\ntwo\nthr3e'],      // later line, later col
  ['abc', 'abcd'],                             // prefix pair: shorter window is the ellipsis alone
  ['a', ''],                                   // col 1, empty window
  [X(81), X(81, 'y')],                         // suffix ellipsis
  [X(10) + 'A' + X(80), X(10) + 'B' + X(79)],  // 81 vs 80 code points from col
  ['a\r\nb\r\n', 'a\nb\n'],                    // CR escaped as \r
  ['x"\\/q', 'y"\\/q'],                        // quote and backslash escaped, solidus raw
  ['x' + C0, 'y' + C0],                        // every C0 control (short and \u00xx forms), DEL raw
  ['x' + INV1, 'y' + INV1],                    // invisible set, part 1
  ['x' + INV2, 'y' + INV2],                    // invisible set, part 2
  ['x' + NEAR, 'y' + NEAR],                    // neighbours stay raw
  ['\u{1F600}a', '\u{1F600}b'],                // a supplementary character counts 1 toward col
  ['\u{1F600}', '\u{1F601}'],                  // shared high surrogate: still col 1, whole character shown
  [X(79) + '\u{1F600}z', 'y'],                 // the 80th code point is the emoji: kept whole
  [X(200) + 'A' + X(200), X(200) + 'B'],       // both ellipses vs prefix only
  ['x' + INV3, 'y' + INV3],                    // supplementary members: braced escapes
  ['a', 'a\n\n\n'],                            // existing lacks line 2; the present line is empty
  ['x\n' + X(100), 'x'],                       // missing line: first 80 code points, suffix only
  ['x', 'x\n"\t ' + X(90)],               // missing line with escapes
  ['é', 'é'],                       // NFD vs NFC: code points differ, the windows look alike
  // ---- held-out curated ----
  ['same\nlines\n', 'same\nlines\n'],
  ['x' + INV4, 'y' + INV4],
  ['x' + NEAR2, 'y' + NEAR2],
  ['x' + VS(0xe0100), 'y' + VS(0xe0100)],
  ['x' + VS(0xe014f), 'y' + VS(0xe014f)],
  ['x' + VS(0xe019e), 'y' + VS(0xe019e)],
  ['x' + VS(0xe01ed), 'y'],
  [X(79) + cp(0xe0041) + 'z', X(79)],          // an escaped supplementary as the 80th window code point
  [X(5) + cp(0xfe0f), X(5) + cp(0xfe0e)],
  ['line\r', 'line'],
  ['a\rb', 'a\nb'],
  [' sep', ' sep'],
  ['café x', 'café y'],
  ['中文a', '中文b'],
  ['﻿abc', 'abc'],
  ['abc', '﻿abc'],
  [X(80), X(79) + 'y'],                        // col 80
  [X(80), X(80, 'y')],                         // exactly 80: no suffix
  ['a' + X(80), 'b' + X(80)],                  // 81: suffix
  [X(300), X(300) + 'z'],
  ['abcd', 'abc'],
  ['  x', '  x   '],
  ['a b', 'a\tb'],
  ['a\nb', 'a'],
  ['l1\n\nl3', 'l1\nX\nl3'],
  ['\n', ''],
  ['', 'b'],
  ['', '\n'],
  ['a\nb\nc', 'a\nB'],                         // an earlier difference wins over a missing line
  ['a', 'a\u{E0041}'],                         // a supplementary format character stays raw
  ['❤', '❤️'],                  // a variation selector stays raw
  ['\u{1F1FA}\u{1F1F8}', '\u{1F1FA}\u{1F1E6}'], // flag: cut between regional indicators
  ['\u{1F468}‍\u{1F469}', '\u{1F468}‍\u{1F467}'], // ZWJ sequence: col 3
  ['\u{1F468}‍\u{1F469}', '\u{1F468}'],   // the remainder starts with an escaped ZWJ
  [X(10) + 'A' + X(85, '\u0001'), X(10) + 'B' + X(85, '\u0001')], // 80 code points, 480 characters of escapes
  ['x\\u00a0', 'y\\u00a0'],                    // a literal backslash-u stays distinguishable
  ['…abc', '…abd'],                  // content ellipsis
  [X(80) + '\u{1F600}', X(80) + '\u{1F601}'],  // col 81
  [X(79) + '\u{1F600}\u{1F600}', X(79) + '\u{1F600}\u{1F601}'],
  ['\u0000', ''],
  ['­', '-'],
  ['ok\n' + X(80, '　'), 'ok'],
  [Array.from({ length: 1000 }, (_, i) => 'r' + i).join('\n'), Array.from({ length: 1000 }, (_, i) => (i === 999 ? 'R' : 'r') + i).join('\n')],
  [Array.from({ length: 300 }, (_, i) => 'r' + i).join('\n'), Array.from({ length: 300 }, (_, i) => 'r' + i).join('\n') + '\n'],
];

const ALPHA = ['a', 'b', 'c', 'x', 'y', ' ', '\t', '\r', '"', '\\', '/', 'é', '中', '\u{1F600}', '\u{1F601}', '…', '0',
  '\u0001', '\u001f', '\u007f', '\u0085', ' ', '­', '​', '‍', ' ', '‮', '⁠', '　',
  '﻿', '‐', '\u{E0041}', '́', '�'];

// round 5b members and near-misses for the seeded fill
ALPHA.push(...[0x34f, 0x600, 0x2065, 0x180f, 0x2800, 0x3164, 0xfe0f, 0xffa0, 0xfffb, 0x110bd, 0xe0001, 0xe007f, 0xe0080, 0xe0100,
  0xe01ef, 0xe01f0, 0x1d173].map((c) => cp(c)));

function line(rnd) {
  const r = rnd();
  const len = r < 0.15 ? 0 : r < 0.6 ? 1 + Math.floor(rnd() * 12) : r < 0.85 ? 60 + Math.floor(rnd() * 50) : 120 + Math.floor(rnd() * 200);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHA[Math.floor(rnd() * ALPHA.length)];
  return s;
}

function mutate(lines, rnd) {
  const out = lines.slice();
  const k = Math.floor(rnd() * 7);
  const i = Math.floor(rnd() * out.length);
  const s = out[i];
  const cps = Array.from(s);
  const p = Math.floor(rnd() * (cps.length + 1));
  const ch = ALPHA[Math.floor(rnd() * ALPHA.length)];
  if (k === 0) cps.splice(p, 0, ch);                    // insert
  else if (k === 1 && cps.length) cps.splice(Math.min(p, cps.length - 1), 1);   // delete
  else if (k === 2 && cps.length) cps[Math.min(p, cps.length - 1)] = ch;         // replace
  else if (k === 3) { out.push(line(rnd)); return out; } // extra line
  else if (k === 4 && out.length > 1) { out.pop(); return out; }
  else if (k === 5) { out.push(''); return out; }        // trailing empty line (now a difference)
  else { out[i] = s + '\r'; return out; }               // CRLF-ify one line
  out[i] = cps.join('');
  return out;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((p) => p.slice());
  while (out.length < n) {
    const nl = 1 + Math.floor(rnd() * 6);
    const base = Array.from({ length: nl }, () => line(rnd));
    const other = rnd() < 0.08 ? base.slice() : mutate(base, rnd);
    const pair = [base.join('\n'), other.join('\n')];
    out.push(rnd() < 0.5 ? pair : [pair[1], pair[0]]);
  }
  return out;
}
