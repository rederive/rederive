// annotations_text input generator: genInputs(n, rnd) -> n argument lists, each [findings].
// Curated prefix first (every branch, boundary, injection attempt and throw path), then seeded fill (mostly in-domain).
const LEVELS = ['error', 'warning', 'notice', 'Error', 'WARNING', ' notice', 'warn', 'info', 'debug', '', 'error ', 'add-mask'];
const INJECT = [
  '::add-mask::secret', '::stop-commands::tok', '::set-output name=x::y', '%0A::add-mask::x', '%0D%0A', '%25', '%%', '%3A%2C',
  'a\n::error file=x::pwned', 'a\r::warning::pwned', 'a\r\n::notice::pwned', '\n', '\r', '\r\n', '\n\n', ',line=1', ',title=x',
  'title=evil', 'x,title=y::z', 'file=a,line=9', '::', ':', ',', '=', 'a:b,c=d', 'C:\\dir\\f.sir', 'units/x/sir/x.sir',
  'endtoken::', '\u2028::add-mask::ls', '\u2029', '\u0085', '\u000b\u000c', '\t', ' ', '', 'résumé ✓ 🧪', '%0A', '%0d', '%E2%80%A8'];
const LINES = [1, 2, 3, 7, 42, 1000, 2147483647, 4294967296, 9007199254740990, 9007199254740991, 9007199254740992, 9007199254740993, 9007199254740994, -9007199254740991,
  1e20, 123456789012345680000, 1e21, 1e22, 1.7976931348623157e308, 0, -0, -1, -42, 1.5, 0.5, 2.0000001, 1e-7,
  '3', '1', '', '0x10', true, false, null, [3], { n: 3 }, NaN, Infinity, -Infinity];
const NONTEXT = [null, true, false, 0, -0, 1, -1.5, 3.14, 1e21, 1e-7, 0.000001, 123456789012345680000, NaN, Infinity, -Infinity,
  [], [1, 2], ['a', null, 'b'], [[1, [2]], 3], [null], [true, 'x:y'], {}, { a: 1 }, { valueOf: 5 }, { __proto__x: 1 }, [{}, 'z']];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const ALPHA = 'abcXYZ019 _-./%:,=\r\n\t\u2028\u00e9\u{1F9EA}';
const randText = (rnd, max = 12) => { let s = ''; const k = Math.floor(rnd() * max); for (let i = 0; i < k; i++) s += [...ALPHA][Math.floor(rnd() * [...ALPHA].length)]; return s; };
const field = (rnd) => { const r = rnd(); return r < 0.45 ? randText(rnd) : r < 0.8 ? pick(rnd, INJECT) : r < 0.9 ? randText(rnd) + pick(rnd, INJECT) + randText(rnd, 4) : pick(rnd, NONTEXT); };
const finding = (rnd) => {
  const f = {};
  if (rnd() < 0.95) f.level = rnd() < 0.7 ? pick(rnd, ['error', 'warning', 'notice']) : rnd() < 0.8 ? pick(rnd, LEVELS) : pick(rnd, NONTEXT);
  if (rnd() < 0.95) f.path = field(rnd);
  if (rnd() < 0.7) f.line = rnd() < 0.6 ? 1 + Math.floor(rnd() * 500) : pick(rnd, LINES);
  if (rnd() < 0.95) f.title = field(rnd);
  if (rnd() < 0.95) f.message = field(rnd);
  return f;
};
const F = (level, path, line, title, message) => ({ level, path, line, title, message });

export function genInputs(n, rnd) {
  const out = [
    [[]],                                                                       // empty list -> empty text
    [[F('error', 'units/a/sir/a.sir', 1, 'a: new contract', 'The test file does not match.')]],
    [[F('warning', 'p', 12, 't', 'm'), F('notice', 'q', 3, 'u', 'n'), F('error', 'r', 1, 'v', 'o')]],
    [[{ level: 'warning', path: 'p', title: 't', message: 'no line key' }]],
    [[{}]],                                                                     // every field absent
    [[{ level: 'notice' }, { path: 'only path' }, { title: 'only title' }, { message: 'only message' }, { line: 5 }]],
    [LEVELS.map((level, i) => F(level, 'p' + i, i + 1, 't', 'm'))],             // every level spelling
    [NONTEXT.slice(0, 12).map((level) => F(level, 'p', 1, 't', 'm'))],          // non-text levels -> error
    [LINES.map((line, i) => F('notice', 'p', line, 't' + i, 'm'))],             // every line boundary
    [[F('error', 'a:b,c%d\r\ne', 3, 't=1,line=2', 'm::x%0A\r\n::add-mask::s')]],
    [[F('error', '::add-mask::secret', 1, '::stop-commands::tok', '::add-mask::secret')]],
    [[F('warning', 'x,line=99', 2, 'x,file=evil.sir', 'body\n::error file=evil::forged')]],
    [[F('notice', 'a\rb', 4, 'title=\r\ninner', '\r\n\r\n')]],
    [[F('error', '%0A%0D%25%3A%2C', 5, '%250A', '%0A::add-mask::x')]],
    [[F('error', '\u2028\u0085x', 6, '\u2029', '\u2028::add-mask::y\u2029')]],
    [INJECT.map((s, i) => F(pick(rnd, ['error', 'warning', 'notice']), s, i + 1, s, s))], // every injection string in every position
    [NONTEXT.map((v, i) => F('error', v, i + 1, v, v))],                        // text coercion of every non-text kind
    [[F('error', [1, [2, null], {}], 1, { valueOf: 1 }, -0)]],
    [[F('notice', 1e21, 1e21, 0.000001, 1e-7)]],
    [[F('notice', 123456789012345680000, 9007199254740994, -1.5, NaN)]],
    [[3, 'abc', [1, 2], true, false, 0]],                                       // only non-map elements: all skipped -> empty text
    [[null, F('error', 'a', 1, 'b', 'c'), 3, null, F('notice', 'd', 2, 'e', 'f'), [F('error', 'in', 1, 'a list', 'x')], 'str', null]], // skipped elements leave no line
    [[null]], [[null, null]], [[[]]], [[{}, null, {}]],
    [[F('error', null, 1, null, null), F('warning', [null], 2, [null, null], [null]), F('notice', 'null', 3, 'undefined', '')]], // none -> empty text at the top and nested
    [[F('error', undefined, 1, undefined, undefined), { level: undefined, line: undefined, path: 'p' }]], // undefined values (js extension)
    [[F('error', [undefined, 'a'], 1, 't', 'm'), undefined, F('notice', 'q', 2, 'u', 'v')]],            // undefined inside a list / as an element (js extension)
    [[F('notice', 'p', 9007199254740991, 'max safe', 'm'), F('notice', 'p', 9007199254740992, '2^53', 'm'), F('notice', 'p', 1e21, '1e21', 'm'), F('notice', 'p', 2 ** 60, '2^60', 'm')]],
    [[F('error', 'a', 1, 'b', 'c'), null]],                                     // a trailing none element is skipped
    [[F('error', { toString: 1 }, 1, 't', 'm')]],                               // a map with an own toString key -> throws
    [[F('error', 'p', 1, [{ toString: 'x' }], 'm')]],                           // ... at any depth inside a list
    [[F('error', 'p', 1, 't', { valueOf: 1, toString: 2 })]],
    [[null, F('warning', { toString: 1 }, 'x', 't', 'm')]],                     // a throw after a skipped element
    [[F('error', { toString: null }, 1, 't', 'm')]],                            // a none-valued toString key still throws
    [null],                                                                     // findings itself none -> throws (js extension)
    [{ level: 'error' }],                                                       // findings a map, not a list -> throws (js extension)
    [Array.from({ length: 60 }, (_, i) => F(['error', 'warning', 'notice', 'bogus'][i % 4], `units/u${i}/sir/u${i}.sir`, i % 7 === 0 ? 0 : i, `u${i}: title, with: colon`, `line ${i}\nnext %${i}`))],
  ];
  while (out.length < n) {
    const r = rnd(); const k = r < 0.08 ? 0 : r < 0.85 ? 1 + Math.floor(rnd() * 6) : 20 + Math.floor(rnd() * 40);
    const list = Array.from({ length: k }, () => finding(rnd));
    if (rnd() < 0.15 && list.length) list[Math.floor(rnd() * list.length)] = pick(rnd, [7, 'str', [1], false, null, [], 0, '', [{ level: 'error' }]]);
    out.push([list]);
  }
  return out;
}
