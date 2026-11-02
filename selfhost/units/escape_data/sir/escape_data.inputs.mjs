// escape_data input generator: genInputs(n, rnd) -> n argument lists, deterministic from rnd() (seeded, [0,1)).
// The stamp takes the first 24 distinct lists as FROZEN and the next 48 as HELD-OUT. Layout (architect's ruling on F7,
// 2026-11-02): the frozen slice carries a few neutral basics plus most of the js-only probes (non-text values, arity,
// lone surrogates); the held-out slice is mostly language-neutral text — the remaining neutral probes interleaved with
// seeded text — and carries only the js-only probes that do not fit in the frozen slice. Every curated probe is emitted.

// neutral text basics shown in the frozen slice
const FROZEN_NEUTRAL = [[''], ['%'], ['\r\n'], ['%0A']];

// js-only probes (outside the abstract envelope): the String(v) widening, its throw path, arity, unpaired surrogates
const JS_FROZEN = [
  [42], [null], [['a%', 'b\n']], [{ toString: null }],    // String(v) of a number, none, a list; the throw path
  [undefined], [], ['two', 'args%'],                      // undefined, a missing argument, an ignored second argument
  [-0], [NaN], [123n], [true],
  [[1, [2, 3]]], [[null, undefined, 'x']], [[]],
  [{ a: '%' }],
  [Buffer.from('buf%\n', 'utf8')], [Uint8Array.from([37, 10, 13])],
  [new Map([['k', '%']])], [/a%\n/g], [new String('boxed%\n')],
];
const JS_HELDOUT = [
  ['\ud800'], ['lone \udfff low'], ['\ud83d%\n'],         // unpaired surrogate halves pass through
  [0], [-3.5], [1e21], [Infinity], [-Infinity],
  [false], [{}],
  [Buffer.from([0xff, 0x25, 0x0a])], [new Set(['%'])],
  [new Number(7)], [new Boolean(false)],
  [[{ toString: 1 }]],                                     // the throw path, reached through the array join
];

// remaining neutral text probes
const NEUTRAL = [
  ['plain message'], ['\r'], ['\n'], ['\n\r'],
  ['%%'], ['\r\r\n\n'],
  ['100% done'],
  ['line one\nline two'],
  ['windows\r\nline'],
  ['%0D'], ['%25'], ['%0A\n%'],                            // literal escape sequences: the % is escaped again (not idempotent)
  ['::'], ['::error::injected'], ['a\n::error file=x::injected'], // workflow-command injection attempts
  [':'], [','], ['='], ['a:b,c=d'],                        // NOT escaped in data (the sibling escape_property escapes : and ,)
  ['\t tab'], ['\v\f'], ['\u0000nul'], ['\u0085nel'], [' ls ps'], // other line-ish characters pass through
  ['café ü 中文'], ['😀 emoji'],
  ['  leading and trailing  '], ['%\r%\n%'],
  ['x'.repeat(200) + '%\n'],
];

// seeded text: well-formed Unicode only (no lone surrogate), so every seeded vector is language-neutral
const POOL = ['a', 'b', 'Z', '0', ' ', '%', '%', '\r', '\n', '\r\n', ':', ',', '=', '::', '%0A', '%25', '\t', 'é', '中', '😀', '"', "'", '\\', '$&', '<', '>', '#'];
const seeded = (rnd) => { const len = Math.floor(rnd() * 24); let s = ''; for (let i = 0; i < len; i++) s += POOL[Math.floor(rnd() * POOL.length)]; return [s]; };

export function genInputs(n, rnd) {
  const out = [...FROZEN_NEUTRAL, ...JS_FROZEN].map((a) => a.slice());
  // held-out region (48 slots): every 3rd slot a js-only probe (15), one slot in twelve seeded text (4), the rest the
  // neutral probes (29) — so all 68 curated probes land inside the 72-vector oracle
  const js = JS_HELDOUT.slice(), neu = NEUTRAL.slice();
  for (let k = 0; js.length || neu.length; k++) {
    if (k % 3 === 2 && js.length) out.push(js.shift());
    else if (k % 12 === 1) out.push(seeded(rnd));
    else if (neu.length) out.push(neu.shift());
    else out.push(js.shift());
  }
  while (out.length < n) out.push(seeded(rnd));
  return out;
}
