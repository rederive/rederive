// Input generator for detect_features, round 5d (rederive@69b68b4a1c39 cli/features.mjs detectFeatures: directive-backed
// detection through the SIR reader, prose tokens per physical line, every ref( of an ANCHOR, a fail-closed language gate).
// Curated coverage prefix first (every feature's directive and structural trigger, the reader's line/attribute/comment/quote
// rules, every languagesOf refusal), then a seeded fill of mostly in-domain bundles assembled from directive-line pools.
// Every value is plain JSON.

const curated = [
  // ---- the frozen (teaching) slice: mostly in-domain, one probe per main throw family, the round-5 rules among them
  {},
  { sirText: 'UNIT a\nKIND EFFECT\nPAR {\n  x\n}\nEFFECT a*"microtask" b?"q"\n' },   // * + ? open nothing (r5b)
  { sirText: 'UNIT a\nENVELOPE text only\nRING token\nCARRIED-DATA "sbox.json"\n\uFEFF\t\uFEFF# setTimer\n' },   // r5c (#129): a quoted literal declares carried data; every lead FEFF goes
  { sirText: 'UNIT a\nLIFECYCLE timer armed\nDESCRIPTION uses schedule(fn) on virtual time\nCARRIED-DATA none\n  EARNED sbox.json' },   // r5d (#139): a wrapped attribute counts
  { sirText: 'UNIT a\nEFFECT time.timer\nDESCRIPTION arm setTimer(5)' },
  { sirText: 'UNIT a\nANCHOR ref(python:botocore.auth.SigV4Auth)\n' },
  { sirText: 'UNIT a\nANCHOR ref(lodash:x) ref(js:y)\nCARRIED-DATA ANCHOR sbox.json' },   // every ref( is judged; r5d (#139): an attribute value declares carried data
  { carriedData: [{ name: 't' }], mode: 'trace' },
  { carriedData: [], envelope: ' \t ', mode: 'vectors', sirFiles: ['u.ts.ſir', 'u.rust.SiR'] },   // long s is no s; ASCII case folds
  { envelope: '　', mode: 'par' },                                             // U+3000 is content: an envelope
  { mode: 'ring', sirFiles: ['sir/a.sir', 'sir/a.ts.sir', 'sir/a.inputs.mjs'] },
  { variants: { 'lang:rust': {}, package: { lang: 'js' } } },
  { sirFiles: ['a.go.sir'] },                                                      // throw: id outside the registry
  { sirText: 'UNIT a\n  PAR indented\nPARALLEL x\nPAR-X y\nDESCRIPTION RING and LIFECYCLE in prose\n  ENVELOPE in prose\n PAR\n# PAR in a comment\nNOTE x # setTimer in a trailing comment' },
  { sirText: 'NOTE we never call "setTimer"\nNOTE x CITED virtual time\nNOTE y EARNED schedule(z)\nNOTE w ANCHOR timers.x\nANCHOR setTimer\nANCHOR see "ref(js:x)"' },   // literals and citations are no tokens
  { sirText: 'NOTE a;"setTimer" b|"schedule(" c-"timers.x" "x""virtual time"' },   // ; | - and a closer open a literal
  null,                                                                            // throw: none input
  { sirText: 'UNIT a\nFIDELITY spec ANCHOR ref(ts:x)\nNOTE x CITED ANCHOR ref(js:y)' },
  { sirText: 'CARRIED-DATA \u00A0none\nEFFECT 12" wide # microtask "q' },          // NBSP none is data; an inch mark opens nothing
  { sirText: 'EFFECT "a\\ " # " microtask\nFIDELITY spec ANCHOR "a CITED b" ref(ts:x)' },   // escape pair = any code point; a quoted keyword is text
  { sirText: 'setTimer(1) schedule(x)\n  PAR\nUNIT a' },                         // prose before the first directive is read
  { sirFiles: ['x y.ts.sir'] },                                                    // throw: a unit name is [A-Za-z0-9_][A-Za-z0-9_-]*
  { carriedData: ['x'], envelope: 'e', mode: 'trace', sirText: 'PAR\nRING\nLIFECYCLE\nDESCRIPTION schedule(\nANCHOR x\n  ref(rust:y)', sirFiles: ['u.php.sir'], variants: { 'lang:ts': {} } },
  { variants: { ' lang:ts': { sir: 'u.ts.sir' } } },                              // throw: a variant key is package or lang:<id>

  // ---- the held-out slice (48 slots: the stamp keeps 24 + 48; negatives of one feature share an input)
  { sirText: 'DESCRIPTION on virtual\n  time\nNOTE virtual\ttime, virtual  time, virtual timeout\nNOTE x\n  virtual CITED time\nDESCRIPTION a virtual CITED time' },
  { sirText: 'PAR:\nR1: RING\rUNIT a\r\nTRACE-SEAM http' },
  { sirText: '﻿PAR\n﻿﻿RING\n﻿# setTimer\n  # schedule(x)\n\t﻿# timers.x' },
  { sirText: 'NOTE x\n ﻿"setTimer"\n﻿ ﻿"schedule("\n\t﻿"a # b" microtask' },     // every FEFF in the leading run goes (r5b)
  { sirText: ' # setTimer\nUNIT a PAR\nCARRIED t = x' },                       // only a leading space/tab run before # makes a comment line
  { sirText: 'CARRIED-DATA none\nCARRIED-DATA\nCARRIED-DATA none CITED none\nCARRIED-DATA CITED\nCARRIED-DATA\n  none\nCARRIED-DATA\t none \t\nCARRIED-DATA # none\nCARRIED-DATA none # x\nCARRIED-DATA none CITED none EARNED\nCARRIED-DATA\n  ANCHOR none' },   // all negatives (empty and none attribute values)
  { sirText: 'CARRIED-DATA none　\nORACLE-CLASS trace x' },                // U+3000 is never trimmed; NBSP is not WORD
  { sirText: 'CARRIED-DATA "none"\nORACLE-CLASS\n trace' },                   // r5c: a quoted none is data (never unquoted)
  { sirText: 'CARRIED-DATA ""\nORACLE-CLASS "trace"\nVARIANT v ANCHOR\n  ANCHOR ref(rust:y)' },   // r5c: the empty literal is data; ORACLE-CLASS as written
  { sirText: 'ORACLE-CLASS tracer\nORACLE-CLASS deterministic (trace)\nORACLE-CLASS CITED trace\nORACLE-CLASS  trace\nCARRIED-DATA none\n  more' },
  { sirText: 'CARRIED-DATA none CITED x\nEFFECT x CITED time.timer\nEFFECT timeXtimer\nEFFECT CITED microtask\nEFFECT microtasks\nEFFECT x # microtask\nEFFECT "a\\ b # microtask' },
  { sirText: 'EFFECT "a \\" # b" microtask' },                                     // an escaped quote stays inside
  { sirText: 'EFFECT x "a CITED b" microtask' },                                   // a quoted keyword is not an attribute
  { sirText: 'EFFECT x " microtask"\nEFFECT y="time.timer"\nEFFECT f("microtask")\nEFFECT "a""microtask"\nEFFECT z!"microtask"' },
  { sirText: 'EFFECT x-" # microtask"\nEFFECT "a""b # c" microtask\nEFFECT "\\\u{1F600}" # microtask\nEFFECT  " # microtask"' },
  { sirText: 'EFFECT x/"microtask"\nNOTE 12"setTimer"' },                         // / and a digit open nothing: the tokens stand
  { sirText: 'EFFECT "a\n  microtask"\nANCHOR "a\n  ref(js:x) b"' },               // EFFECT FULL is one text; ANCHOR pieces are one by one
  { sirText: 'EFFECT "a" "b # c" microtask\nNOTE /(?:a|b)+"/ CITED R5 "q" setTimer' },   // a quote after + opens nothing: CITED stands                                     // a quote after a space opens again
  { sirText: 'ANCHOR "x # y" ref(js:z)\nNOTE /["]/ CITED a "b" setTimer' },   // a quote after [ still opens: CITED hidden
  { sirText: 'FIDELITY spec ANCHOR "a\n  ANCHOR ref(js:x) b"' },                   // JOINED-ANCHOR is unquoted as one text
  { sirText: 'FIDELITY spec ANCHOR "ref(ts:x)"\nEFFECT "a # microtask \\' },      // a quoted ref is no anchor; an unclosed literal protects nothing
  { sirText: 'ANCHOR "a" # ref(ts:b)\nNOTE x CITED ANCHOR ref(js:y)\nUNIT u\n  prose ANCHOR ref(rust:x)\nANCHORS ref(js:x)\nFIDELITY spec CITED ref(js:x)\nFIDELITY spec ANCHOR\nVARIANT x ANCHOR ref(go:y) ANCHOR\nANCHOR xref(js:y) _ref(ts:y) ref(JS:y) ref(js :y) ref(js2:y) ref(js) ref(　js:y) ref( ts:y)\nANCHOR a\n  EARNED ref(js:x)\nANCHOR b\nCITED ref(csharp:y)\nFIDELITY spec "x ANCHOR ref(js:y)"\nNOTE a\n  ANCHOR ref(js:q)' },
  { sirText: 'ANCHOR x\nCITED: ref(php:y)' },                                      // CITED: is no directive and no attribute
  { sirText: 'ANCHOR ANCHOR ref(js:x)' },
  { sirText: 'ANCHOR ref( \tjs:y)' },
  { sirText: 'FIDELITY spec\n  ANCHOR ref(ts:x)' },
  { sirText: 'ANCHOR éref(js:y)\nNOTE timers.advance and _setTimer' },
  { sirText: 'ANCHOR: ref(js:y)\nNOTE éschedule( setTimer_\nNOTE x # see CITED setTimer' },
  { sirText: '  orphan setTimer\nCITED virtual time' },
  { envelope: null, carriedData: null, mode: null, sirFiles: null, variants: null },
  { carriedData: [null], extra: 1 },
  'PAR',
  { sirText: null },                                                               // throw
  { carriedData: {} },                                                             // throw
  { envelope: [] },                                                                // throw
  { sirFiles: 'a.ts.sir' },                                                        // throw
  { sirFiles: ['a.TS.sir'] },                                                      // throw: case-blind .sir, case-kept id
  { sirFiles: ['a.b.ts.sir'] },                                                    // throw: three segments
  { sirFiles: ['é.sir'] },                                                    // throw: a primary's unit name is checked too
  { sirFiles: ['a.sir', '.sir', 'a.ts.sir/', 'a.ts', 'x.sir.bak', 'a.sir​x', 'a.ts.ſir­', 'a.json', 'a.sir~', 'é.sir~', 'a-b_9.sir'] },
  { sirFiles: ['u.ts.sir', 'x/ a.js.sir', 'd\\b.rust.sir ', 'p.python.sir\t', '.ts.sir'], variants: { 'lang:ts': {}, package: { lang: 'csharp', sir: 'u.csharp.sir' }, 'lang:js': { sir: 'w/u.js.SIR' } } },
  { variants: { package: { sir: 'u.txt' } } },                                     // throw: a variant sir names a .sir file
  { variants: { 'lang:ts': { sir: 'sir/' } } },                                    // throw: no file name
  { variants: { package: { sir: '-u.ts.sir' } } },                                 // throw: the sir's own name is malformed
  { variants: { 'lang:go': {} } },                                                 // throw: well-shaped key, unregistered id
  { variants: { package: { lang: 'ts', sir: 'u.sir' } } },                         // throw: a lang field whose sir names none
  { variants: { package: { lang: null } } },                                       // throw: lang must be text
  { variants: { package: { lang: 'ts' }, 'lang:ts': { sir: 'u.ts.sir' } } },       // throw: two variants claim ts
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const LINES = [
  'UNIT u', 'KIND FUNCTIONAL', 'PAR {', 'PAR', 'PARALLEL', '  PAR inside prose', 'RING', 'RINGS', 'LIFECYCLE', 'ENVELOPE text',
  'ENVELOPE', 'ENVELOPE: a', 'TRACE-SEAM http', 'ORACLE-CLASS trace', 'ORACLE-CLASS deterministic', 'ORACLE-CLASS CITED trace',
  'CARRIED t = x', 'CARRIED-DATA none', 'CARRIED-DATA tables', 'CARRIED-DATA CITED x', 'EFFECT time.timer', 'EFFECT microtask',
  'EFFECT io', 'EFFECT "x # y" microtask', 'EFFECT x # microtask', 'DESCRIPTION call setTimer(1)', 'NOTE resetTimer',
  'NOTE schedule(x)', 'NOTE reschedule(x)', 'DESCRIPTION on virtual time', 'DESCRIPTION virtual CITED time', 'NOTE virtual timeout',
  '  timers.advance', '  time', 'ANCHOR ref(rust:x)', 'ANCHOR ref(pkg@1)', 'ANCHOR ref(go:a) ref(ts:b)', 'ANCHOR x', '  ref(js:y)',
  'CITED ref(php:z)', 'FIDELITY spec ANCHOR ref(ts:y)', 'FIDELITY spec', '  ANCHOR ref(js:w)', 'VARIANT v ANCHOR ref(rust:q)',
  'NOTE x CITED ANCHOR ref(js:y)', 'ANCHOR ref(go:z)', '# PAR', '# setTimer', 'NOTE x # setTimer', 'R1 rule CITED schedule(',
  'prose at column zero', ' setTimer', '﻿RING', 'NOTE "a # b" virtual time',
  'CARRIED-DATA "none"', 'CARRIED-DATA "tables"', 'CARRIED-DATA CITED none', 'CARRIED-DATA none EARNED', '  CITED x', 'CARRIED-DATA ""', 'CARRIED-DATA # none', 'CARRIED-DATA\n  "none"', 'CARRIED-DATA ("none")', 'CARRIED-DATA x"none"', 'EFFECT a+"microtask"',
  '\uFEFF \uFEFFNOTE setTimer', '\uFEFF\uFEFFPAR', 'NOTE /["]/ CITED a "b" setTimer',
];
const BREAKS = ['\n', '\n', '\n', '\r\n', '\r'];
const FILES = ['u.sir', 'u.js.sir', 'u.ts.sir', 'sir/u.rust.sir', 'u.python.SIR', 'u.carried.json', 'sir\\u.php.sir', 'u.inputs.mjs', 'u.csharp.sir '];
const VKEYS = ['lang:js', 'lang:ts', 'lang:rust', 'lang:csharp', 'package', 'package', 'lang:python', 'Lang:ts'];
const VVALS = [{}, {}, { sir: 'u.ts.sir' }, { lang: 'rust' }, { lang: 'js', sir: 'u.js.sir' }, { sir: 'u.sir' }, { lang: 'python' }];

function randomInput(rnd) {
  const o = {};
  if (rnd() < 0.9) { const k = 1 + Math.floor(rnd() * 6); let s = ''; for (let i = 0; i < k; i++) s += (i ? pick(rnd, BREAKS) : '') + pick(rnd, LINES); o.sirText = s; }
  if (rnd() < 0.35) o.carriedData = pick(rnd, [[], [{ n: 1 }], ['a', 'b'], null]);
  if (rnd() < 0.35) o.envelope = pick(rnd, ['', 'scope', '  ', null]);
  if (rnd() < 0.5) o.mode = pick(rnd, ['vectors', 'trace', 'par', 'ring', 'Trace', '']);
  if (rnd() < 0.4) { const n = Math.floor(rnd() * 3); o.sirFiles = Array.from({ length: n }, () => pick(rnd, FILES)); }
  if (rnd() < 0.3) { const v = {}; const n = Math.floor(rnd() * 3); for (let i = 0; i < n; i++) v[pick(rnd, VKEYS)] = pick(rnd, VVALS); o.variants = v; }
  return o;
}

export function genInputs(n, rnd) {
  const out = curated.map((x) => [x]);
  while (out.length < n) out.push([randomInput(rnd)]);
  return out;
}
