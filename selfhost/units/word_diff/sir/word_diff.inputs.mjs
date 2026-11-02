// word_diff input generator: genInputs(n, rnd) -> list of [a, b] argument lists. Curated coverage first, then seeded fill.
const WS = [' ', '  ', '\t', '\n', ' \n ', '\r\n', ' ', ' ', ' ', '　', '﻿', '\u000b', '\u000c', ' ', ' ', ' ', ' ', ' '];
const NOT_WS = ['\u0085', '​', '᠎', '⁠'];   // NEL, ZWSP, MVS, WJ: NOT whitespace under the pinned set
const WORDS = ['a', 'b', 'c', 'the', 'rule', 'R1', 'x', 'foo', 'bar', 'é', '日本', '😀', 'a.b', '-', 'none'];

const CURATED = [
  ['', ''],                                   // empty both
  ['', 'abc'],                                // pure insertion from empty
  ['abc', ''],                                // pure deletion to empty
  ['same text here', 'same text here'],       // identical
  ['   ', '   '],                            // all-whitespace identical
  [' ', '\t'],                                // all-whitespace differing
  ['', ' '],                                  // empty vs whitespace
  [' a', ' b'],                               // leading whitespace both
  ['a ', 'b '],                               // trailing whitespace after a change: stays one = entry
  ['a  ', 'b \t'],                            // trailing ws differing; the empty boundary token is dropped
  [' \ta', '  b'],                            // leading empty boundary token dropped, then differing ws
  ['one two', 'one two three'],               // pure insertion at end
  ['one two three', 'one three'],             // pure deletion in middle
  ['x y', 'y x'],                             // tie: two equally long alignments
  ['a b', 'b a'],                             // tie
  ['a b c', 'c b a'],                         // tie, longer
  ['the cat sat', 'the dog sat'],             // single substitution between shared words
  ['a x b y c', 'a p b q c'],                 // two changes glued by one shared word
  ['a x b c y d', 'a p b c q d'],             // two shared words glue
  ['a x b c e y d', 'a p b c e q d'],         // three shared words: no glue
  ['x b', 'y b'],                             // shared word at the end (no lookahead): not glue
  ['x b c', 'y b c'],                         // two shared words at the end
  ['p x q', 'p y q'],                         // change between whitespace
  ['a b c d', 'w b x d'],                     // change, one word, change, word
  ['alpha beta', 'gamma delta'],              // whole replace with ws glue in middle
  ['a b', 'a b'],                        // NBSP vs space
  ['a b', 'a c'],                   // LINE SEPARATOR as whitespace
  ['a　b c', 'a　d c'],               // IDEOGRAPHIC SPACE
  ['﻿a b', '﻿a c'],                 // BOM at start is whitespace
  ['a\u0085b', 'a\u0085c'],                   // NEL is NOT whitespace: one token
  ['a​b c', 'a​b d'],               // ZWSP is NOT whitespace
  ['x\r\ny', 'x\ny'],                         // CRLF vs LF
  ['a b a b', 'b a b a'],                     // repeated tokens
  ['insert here', 'insert new words here'],   // middle insertion
  ['keep drop1 drop2 keep', 'keep keep'],     // middle deletion
  ['a x y b', 'a b x y'],                     // move
  ['😀 日本 é', '😀 é 日本'],                  // non-ASCII tokens
  ['old one middle old two', 'new one middle new two'],
  ['a b c d e f', 'a X c Y e Z'],             // alternating changes glued by single words
  ['a b c d e f', 'a b X d e Y'],
  ['x b c ', 'y b c '],                      // two shared words then trailing ws at the end
  ['x  ', 'y  '],                             // whitespace-only last entry after a change
];
// one probe per throw path: a non-text first argument, a non-text second argument
const PROBES = [[null, 'x'], ['x', 5]];

export function genInputs(n, rnd) {
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const words = (k) => { const out = []; for (let i = 0; i < k; i++) { if (i) out.push(rnd() < 0.85 ? ' ' : pick(rnd() < 0.15 ? NOT_WS : WS)); out.push(rnd() < 0.05 ? pick(NOT_WS) + pick(WORDS) : pick(WORDS)); } let s = out.join(''); if (rnd() < 0.15) s = pick(WS) + s; if (rnd() < 0.15) s += pick(WS); return s; };
  const mutate = (s) => {
    const t = s.split(' '); const k = 1 + Math.floor(rnd() * 3);
    for (let e = 0; e < k; e++) { const r = rnd(), i = Math.floor(rnd() * (t.length + 1));
      if (r < 0.35) t.splice(i, 0, pick(WORDS)); else if (r < 0.65 && t.length > 1) t.splice(Math.min(i, t.length - 1), 1); else t[Math.min(i, t.length - 1)] = pick(WORDS); }
    return t.join(rnd() < 0.9 ? ' ' : pick(WS));
  };
  const out = [...CURATED, ...PROBES];
  while (out.length < n) {
    const a = words(Math.floor(rnd() * (rnd() < 0.1 ? 30 : 9)));
    const b = rnd() < 0.8 ? mutate(a) : words(Math.floor(rnd() * 9));
    out.push(rnd() < 0.5 ? [a, b] : [b, a]);
  }
  return out;
}
