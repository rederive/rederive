// adopt_replace_block input generator: [existing, block, managed, kept] tuples.
// block = { heading, startLine, endLine } with integer lines inside ±(2^53-1) (the js driver's safe-number range).
const SAFE = 9007199254740991;
const B = (heading, startLine, endLine) => ({ heading, startLine, endLine });

// LF file, 11 lines (final empty line after the last LF)
const DOC = '# Project\n\nIntro line.\n\n## Hard rules\n- rule one is long enough\n- rule two is long enough\n\n## Other\ntail text\n';
const DOC_NO_EOL = '# Project\n\n## Hard rules\nbody\n## Other\ntail';
const CRLF = '# Project\r\n\r\n## Hard rules\r\nbody\r\n\r\n## Other\r\ntail\r\n';
const MIXED = '# Top\nlf line\r\n\r\n## B\nbody\r\n\n## C\nend';
const CRLF_INSIDE = 'A\n\n## B\r\nx\r\n\n## C\nD\n';
const SEAMS = '# Top  \t\n \t\r\n\t\n## Block\nx\n \n\n    indented code after\n  - nested item\n';
const MANAGED = '<!-- rederive:begin profile -->\n## Hard rules\n- managed rule\n<!-- rederive:end -->';

const curated = [
  // ordinary adopt, kept rules (an empty and a whitespace-only kept entry are dropped)
  [DOC, B('## Hard rules', 4, 8), MANAGED, []],
  [DOC, B('## Hard rules', 4, 8), MANAGED, ['- kept project rule', 'Cite §11 of the GDD.']],
  [DOC, B('## Hard rules', 4, 8), '\n\n  ' + MANAGED + '  \n\n', ['', ' \t', ' ', '　﻿']],
  [DOC, B('## Hard rules', 4, 8), MANAGED, ['  padded kept  ', 'multi\nline\n\nkept', 'ends with lf\n', 'crlf\r\nkept\rlone cr', '\u0085']],
  // block at the edges / whole file / file without a final LF
  [DOC, B('# Project', 0, 4), MANAGED, []],
  [DOC, B('## Other', 8, 11), MANAGED, ['k']],
  [DOC, B('## Other', 8, 10), MANAGED, []],
  [DOC, B('x', 0, 11), MANAGED, []],
  [DOC, B('x', 0, 11), MANAGED, ['k']],
  [DOC_NO_EOL, B('## Hard rules', 2, 4), MANAGED, []],
  [DOC_NO_EOL, B('## Hard rules', 2, 6), MANAGED, []],
  [DOC_NO_EOL, B('## Other', 4, 5), 'M', []],
  // the range check: empty, inverted, beyond, negative, huge
  [DOC, B('h', 4, 4), MANAGED, []],
  [DOC, B('h', 6, 3), MANAGED, []],
  [DOC, B('h', 4, 12), MANAGED, []],
  [DOC, B('h', 0, 0), MANAGED, []],
  [DOC, B('h', -1, 3), MANAGED, []],
  [DOC, B('h', -SAFE, SAFE), MANAGED, []],
  [DOC, B('h', SAFE - 1, SAFE), '', []],
  // the managed check (after the range check): empty, whitespace-only incl. NBSP/U+3000; U+0085 is content, U+200B (Cf) is not
  [DOC, B('h', 4, 8), '', ['k']],
  [DOC, B('h', 4, 8), ' \t\r\n 　﻿ ', []],
  [DOC, B('h', 4, 8), '\u0085', []],
  [DOC, B('h', 4, 8), '​', []],
  // degenerate existing
  ['', B('', 0, 1), MANAGED, []],
  ['', B('', 0, 1), '', []],
  ['\n', B('', 0, 1), 'M', []],
  ['\n', B('', 1, 2), 'M', []],
  ['\n\n\n', B('', 1, 2), 'M', []],
  ['only one line', B('', 0, 1), 'M', ['k']],
  // CRLF file: joins, managed and kept converted to CRLF; the last line before keeps an extra CR of its own
  [CRLF, B('## Hard rules', 2, 5), MANAGED, ['kept\nrule']],
  [CRLF, B('## Hard rules', 2, 4), '\r\nM\r\n\nN\r\r\n', []],
  [CRLF, B('## Other', 5, 8), 'M', []],
  ['x\r\r\n## B\r\nb\r\n\r\ny\r', B('## B', 1, 3), 'M', []],
  // mixed endings: a CRLF in the giver's lines outside the block makes the joins CRLF; one only inside the block does not
  [MIXED, B('## B', 3, 6), 'M', ['k']],
  [CRLF_INSIDE, B('## B', 2, 5), 'M\nN', []],
  // the giver's whitespace at the seams: only space/tab/CR-only lines are blank
  [SEAMS, B('## Block', 3, 5), 'M', []],
  [SEAMS, B('## Block', 3, 4), 'M', []],
  ['a\n \n## B\nx\n\u000c\nb', B('## B', 2, 4), 'M', []],
  ['a\n　\t\n## B\nx\n\u0085\n \t \nb   \n', B('## B', 2, 4), 'M', []],
  ['  lead\n## B\nx\n\t\ttail  ', B('## B', 1, 3), '  M  ', []],
  // r5b #111 — the ending comes from the giver's lines OUTSIDE the range only
  ['a\nb\r\n## B\r\nx\r\n\ny\nz', B('## B', 2, 4), 'M', ['k']],
  ['a\n## B\r\nx\r\n', B('## B', 1, 4), 'M', []],
  ['x\r\n## B\nb', B('## B', 1, 2), 'M', []],
  ['x\r\n\r\n## B\nb', B('## B', 2, 3), 'M', []],
  ['x\r\n## B\nb\ny\r', B('## B', 1, 3), 'M', []],
  ['x\r\n## B\nb\ny\r\nz', B('## B', 1, 3), 'M', []],
  ['## B\r\nb\r\n', B('## B', 0, 3), 'M\nN', ['k']],
  // r5b #111 — one visibility rule: CF characters (soft hyphen, ZWSP, BOM, tag characters) are not content
  [DOC, B('h', 4, 8), '​', []],
  [DOC, B('h', 4, 8), ' ­⁠﻿\u{e0001}\u{e0041} \n', []],
  [DOC, B('h', 4, 8), '​M​', ['​', '­ \u{e0020}', '᠎؜', '​k​']],
  [DOC, B('h', 4, 8), '\u{110bd}x', ['\u{1d173}', '\u{13430}y', '\u0085']],
  // r5b #111 — kept entries lose a trailing CR/LF run; CR, CR LF and LF all convert
  [DOC, B('## Hard rules', 4, 8), 'a\rb\r\r\nc\n\rd', ['k1\r\n', 'k2\n\n\r', 'k3\r', 'k4 \n', 'k5\n ', 'k6\n\t\r\n', 'in\rner\r\nx\n\ny']],
  [CRLF, B('## Hard rules', 2, 5), 'a\rb\nc\r\nd', ['k1\r', 'r\rs\nt\r\nu\r\n']],
  [DOC, B('## Hard rules', 4, 8), MANAGED, ['\r\n\n\r', '\n']],
  // non-ASCII content passes through
  ['# Prøject — 日本語 🎮\n## B\nx\n## C\n🎮 tail', B('## B', 1, 3), 'Managé 🎮', ['règle ✓']],
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const WS = [' ', '\t', '\r', '', '', '', ' ', '　', ' ', '  ', '\u0085', '\u000c', '\u200b', '\u00ad', '\ufeff', '\u{e0020}', '\n', '\r\n'];
const WORDS = ['alpha', 'Beta', 'gamma rule', '- item', '```', 'cmd --flag', '§11', 'é', '🎮', ''];
function line(rnd) {
  const r = rnd();
  if (r < 0.15) return '';
  if (r < 0.25) return pick(rnd, [' ', '\t', ' \t', '\r', '  \r']);
  if (r < 0.35) return pick(rnd, ['#', '##', '###']) + ' ' + pick(rnd, WORDS);
  let s = pick(rnd, WS) + pick(rnd, WORDS);
  if (rnd() < 0.5) s += ' ' + pick(rnd, WORDS);
  return s + pick(rnd, WS);
}
function randomCase(rnd) {
  const L = 1 + Math.floor(rnd() * 9);
  const eols = rnd() < 0.4 ? ['\n'] : rnd() < 0.5 ? ['\r\n'] : ['\n', '\r\n', '\r\n', '\r\r\n', '\r'];
  let existing = '';
  for (let i = 0; i < L; i++) existing += (i ? pick(rnd, eols) : '') + line(rnd);
  if (rnd() < 0.5) existing += pick(rnd, eols);
  const n = existing.split('\n').length;
  let s, e;
  const r = rnd();
  if (r < 0.88) { s = Math.floor(rnd() * n); e = s + 1 + Math.floor(rnd() * (n - s)); }   // a valid range
  else if (r < 0.92) { s = Math.floor(rnd() * (n + 1)); e = s; }
  else if (r < 0.96) { s = -1 - Math.floor(rnd() * 3); e = Math.floor(rnd() * n); }
  else { s = Math.floor(rnd() * n); e = n + 1 + Math.floor(rnd() * 3); }
  const managed = rnd() < 0.05 ? pick(rnd, ['', ' ', ' \n', '\u200b', ' \u00ad\ufeff '])
    : pick(rnd, WS) + pick(rnd, ['M', MANAGED, '## Managed\nbody', '## M\r\nbody\r\n', 'a\rb']) + pick(rnd, WS) + (rnd() < 0.4 ? pick(rnd, ['\n', '\r\n']) : '');
  const k = Math.floor(rnd() * 3); const kept = [];
  for (let i = 0; i < k; i++) kept.push(pick(rnd, WS) + pick(rnd, [...WORDS, 'two\nlines', 'two\r\nlines', 'cr\ronly', '\u200b', '\u{e0041}']) + pick(rnd, WS));
  return [existing, B(pick(rnd, ['', '## X', 'h']), s, e), managed, kept];
}

export function genInputs(n, rnd) {
  const out = curated.map((a) => structuredClone(a));
  while (out.length < n) out.push(randomCase(rnd));
  return out;
}
