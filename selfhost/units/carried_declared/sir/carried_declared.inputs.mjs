// Input generator for carried_declared (selfhost, round 5b re-cut): genInputs(n, rnd) -> n argument lists [[text], ...].
// Curated prefix first (every branch the sighted read of the parser-based reader found), then seeded random primaries.
// Inside the envelope: well-formed text; no \u escape that denotes a lone surrogate; json nests shallow. Non-ASCII characters are written as \u escapes only.
const H = (c) => c.repeat(64);
const A = H('a'), B = H('b'), C = '0123456789abcdef'.repeat(4), D = 'deadbeef'.repeat(8);
const P2_200 = (2n ** 200n).toString();
const au = (e, q) => '  AUTHORITY { expr: ' + e + ', equals: ' + q + ' }';
const T = (...lines) => 'UNIT u\nCARRIED t FROM x\n' + lines.join('\n');

const CURATED = [
  // presence: none, one, several, indented, glued, BOM (in any mix with the indent), colon, CARRIED-DATA
  '',
  'CARRIED t FROM x',
  'UNIT get_rgb\nKIND FUNCTIONAL\nSIG get_rgb(input: text) -> tuple[f64, f64, f64, f64] | none\nDEPENDS-ON none\nCARRIED colorNames FROM color-name@2.0.0 index.json\n  SHAPE map text -> tuple[u64, u64, u64]; 148 entries\n  CANONICAL-SHA256 ' + C + '\n  AUTHORITY { expr: "count", equals: 148 }\n  AUTHORITY { expr: "rebeccapurple", equals: [102, 51, 153] }\nBEHAVIOR\nR1 Empty text -> none.\nORACLE value -> oracles/get_rgb.json CANONICAL-SHA256 ' + A + '\n',
  'CARRIED t FROM x\n  SHAPE s\nORACLE value -> oracles/u.json\n  CANONICAL-SHA256 ' + B + '\n  AUTHORITY { expr: "o", equals: 1 }',
  'CARRIED t FROM x\n  SHAPE a\nCARRIED v FROM y\n  SHAPE b',
  'CARRIED-DATA old FROM z\n  SHAPE q\nCARRIED t FROM x\n  SHAPE s',
  'UNIT u\nCARRIED: t FROM x\n  SHAPE s',
  'UNIT u\n  CARRIED t FROM x\n  SHAPE s',
  '﻿CARRIED t FROM x\n ﻿ ﻿\tSHAPE s\n﻿﻿  CANONICAL-SHA256 ' + A,
  'UNIT u\nKIND FUNCTIONAL\nCARRIED t FROM x\n  SHAPE s\nCITED: t\n⁠CARRIED t FROM x',
  // a sub-field keyword at column 0 is its own directive: refused wherever it is (only when a CARRIED exists)
  'SHAPE early\nCARRIED t FROM x',
  'UNIT u\nSHAPE: s\nCARRIED t FROM x',
  'NOTE n\nCANONICAL-SHA256 ' + A + '\nCARRIED t FROM x',
  'CARRIED t FROM x\n  SHAPE s\nNOTE n\nAUTHORITY { expr: "col0", equals: 1 }',
  'UNIT u\nSHAPE s\nAUTHORITY x',
  // head refusals and the source text
  'CARRIED t = mod.js (default export)',
  'CARRIED t\n  FROM x',
  'CARRIED a b FROM x',
  'CARRIED ét FROM x',
  'CARRIED FROM\tFROM\t\tpkg@1.0.0 a.json CITED upstream ANCHOR x',
  'CARRIED t FROM "a # b CITED c" # trailing',
  'CARRIED t FROM  ',
  'CARRIED t FROM 　src \u000b ',
  'CARRIED t FROM a b',
  'CARRIED CITED t FROM x',
  // CANONICAL-SHA256
  T('  CANONICAL-SHA256 ' + A.toUpperCase()),
  T('  CANONICAL-SHA256 ' + A.slice(1)),
  T('  CANONICAL-SHA256 ' + A, '  CANONICAL-SHA256 ' + B),
  'CARRIED t FROM x\r\n  CANONICAL-SHA256 ' + D + ' CITED pin # c\r  SHAPE s\r\n  CANONICAL-SHA2560 prose\r\n',
  T('  CANONICAL-SHA256\t\t' + C + ' '),
  T('  CANONICAL-SHA256'),
  // SHAPE
  T('  SHAPE # just a comment'),
  T('  SHAPE  '),
  T('  SHAPE map text -> text; 3 entries # note', '  # a comment line', '# another', '', '   ', 'prose at column 0', '  more prose', '  SHAPES b', '  shape c', '  SHAPE-X d'),
  T('  SHAPE  a b  CITED x'),
  T('  SHAPE a', '  SHAPE b'),
  T('  SHAPE "q # r EARNED s" 12" # t'),
  T('  SHAPE m*"a # b" +"c # d"'),
  T('  SHAPE m("a # b") ~"c EARNED d"'),
  // a keyword in another spelling is a malformed sub-field, never prose
  T('  SHAPE: d'),
  T('  SHAPE d'),
  T('SHAPE　e'),
  T('  SHAPEx'),
  T('  CANONICAL-SHA256_' + A),
  T('  AUTHORITY{ expr: "glued", equals: 1 }'),
  // AUTHORITY: forms that read
  T(au('"count"', '738'), au('"red"', '[255, 0, 0]'), au('"name"', '"x y"'), au('"ok"', 'true'), au('"no"', 'null'), au('"\\u0085"', '" "'), au('"z"', '[0e-400, -0.0e-999, 5e-324]')),
  T('\tAUTHORITY\t{expr:"a",equals:{"k": {"j": [1, false]}, "b": "}"}}', '  AUTHORITY {  expr:  "b" ,  equals:  -0  }'),
  T(au('"a\\"b\\u00e9\\\\ "', '"x # y CITED z"') + ' CITED src # c'),
  T(au('"k"', '{"b": 1, "a": 2, "1": 3, "a": 4, "__proto__": 5}')),
  T(au('"n"', '[1.0, 1E3, -2.5e-3, 9007199254740993.0, 9007199254740992, -9007199254740992, 9.007199254740993e15, "9007199254740993"]'), au('"t"', '[1,\t2 ]')),
  // AUTHORITY: refusals
  T('  AUTHORITY { equals: 1, expr: "a" }'),
  T(au('" \\u200b"', '1')),
  T(au('"\\u00ad\\u3000"', '1')),
  T(au('"a\tb"', '1')),
  T(au('"a"', '1, note: 2')),
  T('  AUTHORITY'),
  T(au('"a"', '1') + ' trailing'),
  T(au('"a"', '  1')),
  T(au('"a"', '01')),
  T(au('"a"', '9007199254740993')),
  T(au('"a"', '[1, 9007199254740994.0]')),
  T(au('"a"', '1e16')),
  T(au('"a"', P2_200)),
  T(au('"a"', '1e400')),
  T(au('"a"', '{"k": 1e-400}')),
  T(au('"a"', '-0.5e-330')),
];

const WORDS = ['t', 'tbl', 'colorNames', 'CHARMAP', 'x_1', 'FROM', '_'];
const FROMS = ['x', 'pkg@1.2.3 index.js', 'unicode 15.1 EastAsianWidth.txt', 'src/table.json', 'é ü', 'a CITED b', 'a # b'];
const SHAPES = ['map text -> text; 738 entries', 'map text -> f64', 'list[u64]', 'tuple[u64, u64] # note', 'm CITED x'];
const JSONS = ['1', '0', '-0', '3.25', '-17', '1e15', '2E-7', '9007199254740992', 'true', 'false', 'null', '"x"', '""', '"a b"',
  '"\\u00e9"', '"tab\\tq"', '5e-324', '0e-400', '-9007199254740992', '[]', '[1, 2, 3]', '["a", [null]]', '{"k": 1}', '{}', '{"z": [1], "a": {"b": null}}'];
const BAD = ['01', '[1,]', ' ', '9007199254740993', '1e999', '{"k":1', 'x', '1e16', '1e21', '1e-400'];
const NLS = ['\n', '\n', '\n', '\r\n', '\r'];
const INDENTS = ['  ', '  ', '\t', '    ', ' \t'];
const HEXES = [A, B, C, D, D, C, A.toUpperCase(), C.slice(2)];
const pick = (rnd, xs) => xs[Math.floor(rnd() * xs.length)];

function randomPrimary(rnd) {
  const lines = [];
  if (rnd() < 0.8) lines.push('UNIT u' + Math.floor(rnd() * 100));
  if (rnd() < 0.3) lines.push('KIND FUNCTIONAL');
  if (rnd() < 0.03) lines.push('CANONICAL-SHA256 ' + pick(rnd, HEXES));
  const r = rnd();
  lines.push(r < 0.05 ? 'CARRIED-DATA t FROM x' : r < 0.1 ? 'CARRIED ' + pick(rnd, WORDS) + ' = m.js' : 'CARRIED ' + pick(rnd, WORDS) + (rnd() < 0.2 ? '\t' : ' ') + 'FROM ' + pick(rnd, FROMS));
  const used = new Set(); const subs = 1 + Math.floor(rnd() * 5);
  for (let i = 0; i < subs; i++) {
    const k = rnd(), ind = pick(rnd, INDENTS);
    if (k < 0.2 && (!used.has('s') || rnd() < 0.1)) { used.add('s'); lines.push(ind + 'SHAPE ' + pick(rnd, SHAPES)); }
    else if (k < 0.4 && (!used.has('h') || rnd() < 0.1)) { used.add('h'); lines.push(ind + 'CANONICAL-SHA256 ' + (rnd() < 0.9 ? pick(rnd, HEXES.slice(0, 6)) : pick(rnd, HEXES))); }
    else if (k < 0.8) {
      const eq = rnd() < 0.93 ? pick(rnd, JSONS) : pick(rnd, BAD);
      lines.push(ind + 'AUTHORITY { expr: "' + pick(rnd, ['count', 'red', 'k}', 'a b', 'x # y']) + '", equals: ' + eq + ' }' + (rnd() < 0.15 ? ' CITED src' : ''));
    } else if (k < 0.9) lines.push(ind + pick(rnd, ['prose line', '# comment', 'see SHAPE x']));
    else if (k < 0.97) lines.push(pick(rnd, ['NOTE later', 'ORACLE value -> oracles/u.json']) + (rnd() < 0.5 ? '\n  CANONICAL-SHA256 ' + A : '\n  SHAPE late'));
    else lines.push(ind + pick(rnd, ['SHAPE: x', 'AUTHORITY{ }', 'SHAPEx']));
  }
  if (rnd() < 0.05) lines.push('CARRIED second FROM y');
  const nl = pick(rnd, NLS);
  return lines.join(nl) + (rnd() < 0.3 ? nl : '');
}

export function genInputs(n, rnd) {
  const out = CURATED.map((t) => [t]);
  while (out.length < n) out.push([randomPrimary(rnd)]);
  return out;
}
