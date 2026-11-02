// Input generator for review_summary: summary({ units, stops }) driven as (units, stops).
// Curated coverage prefix first (every branch, plural boundary, the stops line, hostile Markdown values, the js-only chaos
// probes), then a seeded fill of realistic report rows. Deterministic from rnd().
const NAMES = ['get_rgb', 'minimist', 'review_summary', 'strip', 'slugify', 'kind_of', 'tree_sha'];
const CHANGES = ['new contract', 'formatting only', 'prose only', 'tests only', 'Rule 2, CODE (grammar)', 'Rule 1, Rule 3',
  'SIG, ENVELOPE', 'Rule 7', 'PINNED HEX6, Rule 4'];
const TESTS = ['✓ 72 from rederive@c509956a8f8a', '✓ 72', '✗ fingerprint mismatch', '– none', '✓ unchanged', '✗ unchanged',
  '✗ 1 answer rewritten', '✗ 3 answers rewritten', '✓ 2 added, 1 removed', '✓ re-hashed', '✓ 4 added'];
const BINDINGS = ['js ✓ ts ✓ rust ✓', 'js ✓ ts ✗', '–', '✓', '✗ rust stale', '✗ js, ts stale'];
const CITATIONS = ['✓', '✗ contradicted'];

const row = (unit, status, change, tests, bindings, citations) => ({ unit, status, change, tests, bindings, citations });
const pass = (unit, change = 'Rule 2, CODE (grammar)') => row(unit, 'pass', change, '✓ 2 added, 1 removed', 'js ✓ ts ✓', '✓');
const fail = (unit, change = 'Rule 1') => row(unit, 'fail', change, '✗ 1 answer rewritten', '✗ rust stale', '✗ contradicted');

export function genInputs(n, rnd) {
  const out = [
    // the empty-units branch, with and without Stops
    [[], 0], [[], 3], [[], 1], [[], -2],
    // one unit: pass / fail, with stops 0, 1, n
    [[pass('get_rgb')], 0], [[pass('get_rgb')], 1], [[fail('minimist')], 1], [[fail('minimist')], 0], [[fail('strip')], 2],
    // many units: all pass, some fail, all fail; the plural boundaries
    [[pass('a'), pass('b')], 0], [[pass('a'), fail('b')], 1], [[fail('a'), fail('b')], 2], [[fail('a'), pass('b'), pass('c')], 5],
    [[pass('a'), pass('b'), pass('c'), fail('d'), fail('e'), pass('f')], 3],
    [[row('new_one', 'pass', 'new contract', '✓ 72 from rederive@c509956a8f8a', 'js ✓ ts ✓ rust ✗', '✓'),
      row('fmt', 'pass', 'formatting only', '✓ unchanged', '✓', '✓'), row('bad_fp', 'fail', 'new contract', '✗ fingerprint mismatch', '–', '✓'),
      row('none', 'pass', 'new contract', '– none', '–', '✓')], 1],
    // status: only the exact text "pass" passes; everything else fails closed
    [[row('x', 'PASS', 'Rule 1', '✓', '✓', '✓')], 0], [[row('x', 'Pass', 'Rule 1', '✓', '✓', '✓')], 0],
    [[row('x', '', 'Rule 1', '✓', '✓', '✓')], 0], [[row('x', 'error', 'Rule 1', '✓', '✓', '✓'), row('y', 'skipped', 'Rule 1', '✓', '✓', '✓')], 1],
    [[row('x', 'pass ', 'Rule 1', '✓', '✓', '✓'), row('y', 'pass', 'Rule 1', '✓', '✓', '✓')], 1],
    [[row('x', ' pass', 'Rule 1', '✓', '✓', '✓'), row('y', 'fail', 'Rule 1', '✓', '✓', '✓'), row('z', 'pass', 'Rule 1', '✓', '✓', '✓')], 2],
    // stops: negative, large (past 2^53, crosses as a bigint), i64 max; stops with every unit passing
    [[pass('a')], -1], [[fail('a')], -5], [[fail('a')], 9007199254740993n], [[fail('a')], 9223372036854775807n], [[pass('a'), pass('b')], 4],
    [[fail('a')], 1000000], [[pass('a')], -9223372036854775808n],
    // hostile cells: each escape, its order, every line break form
    [[row('a|b', 'pass', 'Rule 2 | Rule 3', '✓ 1 | 2', 'js ✓|ts ✗', '✓|✗')], 0],
    [[row('multi', 'fail', 'Rule 2\n## injected heading', 'a\rb', 'c\r\nd', 'e\u2028f\u2029g')], 1],
    [[row('crs', 'pass', '\r\r\n', '\n\r', '\r\n\r\n', '\n\n')], 0],
    [[row('we`ird', 'pass', '`code` in a label', '``', '```js', '&#96;')], 0],
    [[row('x', 'fail', '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<b>bold</b>', '&amp; &lt; & <&>')], 1],
    [[row('&lt;', 'pass', '&&', '\\|', '\\', '|`<>&')], 0],
    [[row('x', 'pass', '**bold** [link](https://example.com) ![i](https://example.com/i.png)', '\\|', '# not a heading', '- item')], 0],
    [[row('__init__', 'pass', '_x_ *y* ~~z~~', '<https://example.com>', 'https://example.com', '[x]: https://e.com')], 0],
    [[row('x', 'pass', 'tab\there', '\u0085nel \u000bvt \u000cff', '\u00a0nbsp', '😀 emoji')], 0],
    [[row('', 'pass', '', '', '', '')], 0], [[row('', '', '', '', '', '')], 2],
    [[row('<u>', 'pass', '<!-- sir-review -->', '-->', '<details>', '</table>')], 0],
    [[row('  spaced  ', 'pass', '   ', ' a ', '\t', '| |')], 1],
    // code-span fences: backtick runs at the edges and inside, the pad rule, all-space values, the trim set
    [[row('`', 'pass', '``', '`a', 'a`', '`a`')], 0],
    [[row('a``b', 'pass', '``` x', 'x ```', 'a`b``c```d', '````')], 0],
    [[row(' ', 'pass', '  ', '   x', 'x   ', ' x ')], 0],
    [[row(' \t ', 'pass', ' \u00a0 ', ' \u3000 ', ' \u0085 ', ' \ufeff ')], 0],
    [[row(' ` ', 'pass', '| `|` |', '`|`', ' | ', '\n x \n')], 1],
    [[row('__init__', 'pass', '![i](https://example.com/i.png)', '[l](https://example.com)', 'https://example.com', '<https://example.com>')], 0],
    [[row('*x*', 'fail', '~~z~~ _y_', '&amp; &#96; &lt;', '\\', 'a\\')], 2],
  ];
  // js-only chaos (values outside the abstract SIG; recorded through the js extension)
  out.push(
    [{}, 2],                                                       // units without a length -> the empty-units text
    [null, 0],                                                     // units absent -> throws
    [[null], 0],                                                   // a row that is not a map -> throws
    [[{ unit: 'm', status: 'pass' }], 1],                          // missing fields render as empty cells
    [[{ change: 'Rule 1' }], 0],                                   // missing unit and status -> empty cell, fails
    [[{ unit: 7, status: 'pass', change: null, tests: true, bindings: ['js|x', 'ts'], citations: 2.5 }], 0],
    [[{ unit: 'n', status: null, change: '<', tests: false, bindings: 0, citations: { a: 1 } }], 0],
    [[pass('a')], null], [[pass('a'), pass('b')], '2'], [[pass('a')], '1'], [[pass('a')], 1.5], [[pass('a')], 0.5],
    [[pass('a')], '0'], [[pass('a')], true],
  );
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const STATUS = ['pass', 'fail', 'pass', 'fail', 'pass', 'stop', ''];
  const HOSTILE = ['|', '`', '``', '```', '<', '>', '&', '\n', '\r', '\r\n', '\u2028', '\u2029', '\\', '*', '_', '[', ']', '![i](https://e.com/i.png)', 'Rule 2, CODE (grammar)', ' ', '  ', '\t', '\u00a0', '✓'];
  const hostile = () => { let t = ''; const k = 1 + Math.floor(rnd() * 6); for (let i = 0; i < k; i++) t += pick(HOSTILE); return t; };
  const FIELDS = ['unit', 'change', 'tests', 'bindings', 'citations'];
  while (out.length < n) {
    const k = rnd() < 0.15 ? 0 : 1 + Math.floor(rnd() * 7);
    const units = Array.from({ length: k }, () => { const r = row(pick(NAMES), pick(STATUS), pick(CHANGES), pick(TESTS), pick(BINDINGS), pick(CITATIONS));
      if (rnd() < 0.3) r[pick(FIELDS)] = hostile(); return r; });
    const r = rnd(); const stops = r < 0.35 ? 0 : r < 0.65 ? 1 : r < 0.72 ? -1 - Math.floor(rnd() * 5) : 2 + Math.floor(rnd() * 12);
    out.push([units, stops]);
  }
  return out;
}
