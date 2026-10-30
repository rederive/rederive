// Input generator for adopt_find_duplicate = findUnmanagedDuplicate(existing, section) (cli/lib/adopt.mts, rederive@7b348e351c9f).
// genInputs(n, rnd) -> n argument lists [existing, section]; a curated prefix that reaches every rule, then a seeded fill
// built from the same parts (copies of the section, reworded headings, giver sections, fences, whitespace and line-ending
// variants). Both arguments are always well-formed text (no lone surrogates).
const BEGIN = '<!-- rederive:begin (managed by `rdv init` — edits between markers are overwritten on re-init) -->';
const END = '<!-- rederive:end -->';
const L1 = 'Run `rdv check units/foo` before every commit.';
const L2 = 'node tools/sir-validate.mjs <unitDir> must exit 0';
const L3 = 'Never edit files under the protected paths by hand.';
const L4 = 'cargo test --release -p verified-core';
const SEC = ['## Hard rules', '', L1, L2, '', '### Commands', '', '```bash', L4, '```', L3].join('\n');
const wrap = (s) => `${BEGIN}\n${s}\n${END}\n`;
const S2 = '## Hard rules\n' + L1 + '\n' + L2;           // a two-line section without markers
const crlf = (s) => s.replace(/\n/g, '\r\n');

const curated = [
  // the plain adopt: a pasted copy between giver text; the run stops at the giver's next heading
  ['# My project\n\nIntro text that is mine alone.\n\n' + SEC + '\n\n## Later\nmy own later notes here\n', wrap(SEC)],
  // round 5c guard: ANY "<!--" WHITESPACE* "rederive:begin" (word boundary) -> none, closed or not (LF, a bare mention, EOF)
  ['<!--\nrederive:begin\n' + S2 + '\n', S2],
  ['see `<!-- rederive:begin` in the docs\n' + S2 + '\n', S2],
  [S2 + '\n<!--rederive:begin', S2],
  ['<!-- rederive:beginning\n' + S2 + '\n', S2],
  // round 5c section begin marker: may wrap lines (cut after its first "-->"), never across another "<!--", any WHITESPACE after "<!--"
  ['## Intro\n' + L3 + '\n' + L4 + '\n', '<!-- rederive:begin\n## Intro\n' + L3 + '\n' + L4 + '\n-->\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Intro\n' + L3 + '\n' + L4 + '\n', '<!-- rederive:begin\n## Intro\n' + L3 + '\n' + L4 + '\n<!-- note -->\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Intro\n' + L3 + '\n' + L4 + '\n', '## Intro\n' + L3 + '\n' + L4 + '\n<!-- rederive:begin -->\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Intro\n' + L3 + '\n' + L4 + '\n', '<!-- rederive:begin\n## Intro\n' + L3 + '\nA --> B flows here always\n' + L4 + '\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Intro\n' + L3 + '\n' + L4 + '\n', '<!-- rederive:begin x<!-->\n## Intro\n' + L3 + '\n' + L4 + '\n## Hard rules\n' + L1],
  // round 5c fences: a fence closes only on the SAME character, a run at least the opener's, nothing but WHITESPACE after it
  ['## Hard rules\n' + L1 + '\n~~~\n```\n## Mine\n```\n~~~\n' + L2 + '\n## After\nx\n', S2],
  ['## Hard rules\n' + L1 + '\n````md\n```\n## Mine\n```\n````\n' + L2 + '\n## After\nx\n', S2],
  ['## Hard rules\n' + L1 + '\n```\n## Mine\n`````\n## After\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n```\n## Mine\n```bash\n## After\n```\n' + L2 + '\n## End\n', S2],
  ['## Hard rules\n' + L1 + '\n~~~~\n~~~\n## Mine\n~~~~ \t\n## After\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n```\n# c\n\t ```　\n## Mine\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n```\n```x```\n## Mine\n```\n' + L2 + '\n## End\n', S2],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n```markdown\n    ```\n# Hard rules\nexample\n```\n## Mine\nmine\n', S2],
  ['## Hard rules\n' + L1 + '\n````\n' + L2 + '\n```\n## Mine\nmine\n', S2],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n## Deploy the stack with care\n', '## Hard rules\n' + L1 + '\n~~~\n```\n## Deploy the stack with care\n```\n~~~\n## Mine\n'],
  ['## Hard rules\n' + L1 + '\n````````````````\n', '## Hard rules\n' + L1 + '\n```\n````````````````\n'],
  // R6 guard: existing already holds a begin marker (any wording) -> none
  [wrap(SEC), wrap(SEC)],
  ['<!--\trederive:begin-->\n' + S2 + '\n', S2],
  // an unclosed begin is still a marker (round 5c); "begin" followed by a word character is not; an end marker alone is not
  ['<!-- rederive:begin\n' + S2 + '\n', S2],
  ['<!-- rederive:begin_x -->\n' + S2 + '\n', S2],
  ['<!-- rederive:end -->\n' + S2 + '\n', S2],
  // signature none: no heading, or only headings with an empty key
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', L1 + '\n' + L2 + '\n'],
  ['## (draft)\n' + L1 + '\n' + L2 + '\n', '## (draft)\n' + L1 + '\n' + L2],
  // a heading with an empty key interrupts a run in existing
  ['## Hard rules\n' + L1 + '\n## ---\n' + L2 + '\n', '## Hard rules\n' + L1 + '\n' + L2],
  // fewer than two confirming lines; one pool line repeated in the section counts once
  ['## Hard rules\n' + L1 + '\nshort\n', wrap(SEC)],
  ['## Hard rules\n' + L1 + '\n' + L1 + '\n', '## Hard rules\n' + L1 + '\n' + L1 + '\n'],
  // confirming lines OUTSIDE the run do not count
  ['## Hard rules\nmy own very different words here\n## Elsewhere\n' + L1 + '\n# Top\n' + L2 + '\n', wrap(SEC)],
  // first run fails, a later run qualifies; a run of two matched sections (any levels) confirmed across both
  ['## Hard rules\nmine\n## Mine\nx\n## Hard rules\n' + L1 + '\n' + L2 + '\n## After\nkeep\n', wrap(SEC)],
  ['# T\n## Hard rules\n' + L1 + '\n### Commands\n' + L2 + '\n#### deep\n### sib\n## Mine\nkeep\n', wrap(SEC)],
  ['## Hard rules\n' + L1 + '\n## Giver only section\n' + L2 + '\n## Commands\n' + L3 + '\n## After\n', wrap(SEC)],
  ['# Commands\n' + L3 + '\n# Hard rules\n' + L1 + '\n' + L2 + '\n', wrap(SEC)],
  // a level-1 match ends at the next heading of any level; the last run reaches the end of the file
  ['# Hard rules\n' + L1 + '\n' + L2 + '\n## Mine\nmine\n', '# Hard rules\n' + L1 + '\n' + L2],
  ['intro\n## Hard rules\n' + L1 + '\n' + L2 + '\nmy trailing words with no heading\n', S2],
  // heading normalization: case, punctuation, trailing parenthetical on both sides, level change
  ['### HARD -- Rules!! (v2)\n' + L1 + '\n' + L2 + '\n## Next\nx\n', '# hard rules (draft)\n' + L1 + '\n' + L2],
  ['## Hard rules (a) (b)\n' + L1 + '\n' + L2 + '\n', '## Hard rules (a)\n' + L1 + '\n' + L2],
  ['## Hard rules (a (b)\n' + L1 + '\n' + L2 + '\n', S2],
  ['## Keep İt\n' + L1 + '\n' + L2 + '\n', '## keep i t\n' + L1 + '\n' + L2],
  // heading syntax edges: 7 hashes, no space, "#  " (a heading, empty key), U+2028 placement
  ['####### Hard rules\n#Hard rules\n## Hard rules\n' + L1 + '\n' + L2 + '\n', '####### x\n#nospace\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Hard rules\n' + L1 + '\n#  \n' + L2 + '\n', S2],
  ['## Hard rules\n## Hard rules x\n' + L1 + '\n' + L2 + '\n', '## Hard rules x\n' + L1 + '\n' + L2],
  // fences: "#" lines inside fenced code are not headings in either text; fence lines may be pool lines' neighbours
  ['```bash\n# install deps\nnpm ci --ignore-scripts now\n```\n' + L1 + '\n## Other\n', '## Setup\n```bash\n# install deps\nnpm ci --ignore-scripts now\n```\n' + L1],
  ['## Hard rules\n' + L1 + '\n```sh\n# Other\n' + L2 + '\n```\n## Mine\nx\n', S2],
  // tilde fences; a "~~~" line does NOT close a "```" fence (round 5c); one-line backtick fences (trim length > 6, no break char) flip nothing
  ['## Hard rules\n' + L1 + '\n~~~\n## Mine\n~~~\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n```\n~~~\n## Mine\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n  ~~~x~~~\n## Mine\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n``````\n## Mine\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n```````\n## Mine\n' + L2 + '\n```````\n', S2],
  ['## Hard rules\n' + L1 + '\n```x``` is inline\n## Mine\n' + L2 + '\n', S2],
  // a one-line fence is a pool line (length > 15) and confirms; a section "~~~" fence hides its "#" line from the keys
  ['## Hard rules\n' + L1 + '\n\t```npm ci --ignore-scripts```  \n', '## Hard rules\n' + L1 + '\n```npm ci --ignore-scripts```'],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', '~~~\n## Mine\n~~~\n## Hard rules\n' + L1 + '\n' + L2],
  // the NBSP after "<!--" makes a marker too (round 5c) -> none
  ['<!-- rederive:begin -->\n' + S2 + '\n', S2],
  // pool exclusions and the length boundary 15 vs 16 (UTF-16 units, astral = 2)
  ['## A\n```javascript lang\n123456789012345\n1234567890123456\n', '## A\n```javascript lang\n123456789012345\n1234567890123456\n  ```javascript lang'],
  ['## A\n123456789012345\u{1F600}\nabcdefghijklmn\u{1F600}\n', '## A\n123456789012345\u{1F600}\nabcdefghijklmn\u{1F600}'],
  // whitespace normalization: tabs, NBSP, BOM, U+3000 collapse; NEL (U+0085) is NOT whitespace
  ['## Hard rules\n\t' + L1.replace(/ /g, ' ') + '  \n' + L2.replace(/ /g, '\t　') + '﻿\n', wrap(SEC)],
  ['## Hard rules\n' + L1.replace(/ /g, '\u0085') + '\n' + L2 + '\n', S2],
  // CRLF and CR: one trailing CR per line is dropped (both texts); a second CR stays
  [crlf('## Hard rules\n' + L1 + '\n' + L2 + '\n## Tail\nmine\n'), wrap(SEC)],
  ['## Hard rules\r\r\n' + L1 + '\n' + L2 + '\n', S2],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', '## Hard rules\r\r\n' + L1 + '\n' + L2],
  // section markers exactly: text before the begin marker and after the end marker goes; an unrelated comment stays
  ['## Intro\n' + L1 + '\n' + L2 + '\n', '## Intro\n<!-- a note -->\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Intro\n' + L1 + '\n' + L2 + '\n', '## Intro\n' + L1 + '\n' + BEGIN + '\n## Hard rules\n' + L2],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', BEGIN + '\n## Hard rules\n' + L1 + '\n' + END + '\n## Tail\n' + L2],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', '## Hard rules\n' + L1 + '\n' + L2 + '\n<!--   rederive:end\n -->\n'],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', '<!-- rederive:end -->\n## Hard rules\n' + L1 + '\n' + L2],
  ['## Hard rules\n' + L1 + '\n' + L2 + '\n', '<!-- rederive:begin -->' + L1 + '\n## Hard rules\n' + L2],
  // the heading field is the line trimmed; startLine counts from 0
  ['\n\n## Hard rules  \t\n' + L1 + '\n' + L2, S2],
  // degenerate texts
  ['', wrap(SEC)], ['\n\n\n', '#  x\n\n'],
];

const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];
const HEADS = ['Hard rules', 'Commands', 'Testing', 'Notes', 'The loop', 'Project rules', 'Setup', 'Release (v1)', 'Q&A', 'Overview'];
const LINES = [L1, L2, L3, L4, 'Every catch becomes a negative control and a gate.', 'docs/GDD-v0.5.md section 14.4 wins on conflict',
  'make test && make lint && make verify', 'export SIR_LAB=~/sir-lab/v05-lang', 'Ask before deleting anything in vendor/.'];
const MINE = ['my own rule that only this repo has', 'Lane wants the deploy role minted fresh', 'short', 'ok', '- a bullet of mine that is long enough',
  '| col | col | col | col |', 'TODO: wire the staging bucket later', '```', '# a shell comment in my notes'];
const SEPS = [' ', '\t', '  ', ' ', '　'];
function variantHeading(rnd, h, level) {
  let t = h;
  const r = rnd();
  if (r < 0.2) t = t.toUpperCase(); else if (r < 0.35) t = t.replace(/ /g, ' - '); else if (r < 0.45) t = t + ' (draft)'; else if (r < 0.5) t = t + '!';
  const lv = rnd() < 0.3 ? Math.max(1, Math.min(6, level + (rnd() < 0.5 ? -1 : 1))) : level;
  return '#'.repeat(lv) + pick(rnd, [' ', ' ', '\t', '  ']) + t;
}
function variantLine(rnd, l) {
  const r = rnd();
  if (r < 0.15) return '  ' + l + ' ';
  if (r < 0.25) return l.replace(/ /g, pick(rnd, SEPS));
  if (r < 0.3) return l.slice(0, -1);
  return l;
}
// an opener and a closer: mostly a proper close, sometimes a nested other delimiter, a shorter run or an info string (no close)
const FENCE_OPEN = ['```', '```bash', '~~~', '````', '~~~~ md', '  ```'];
function fencePair(rnd) {
  const o = pick(rnd, FENCE_OPEN); const ch = o.trim()[0]; const len = o.trim().match(/^(`+|~+)/)[1].length;
  const r = rnd();
  if (r < 0.6) return [o, ch.repeat(len + (rnd() < 0.2 ? 1 : 0)) + (rnd() < 0.1 ? ' ' : '')];
  if (r < 0.75) return [o + '\n' + (ch === '`' ? '~~~' : '```'), ch.repeat(len)];
  if (r < 0.9) return [o, ch.repeat(Math.max(3, len - 1)) + (len > 3 ? '' : 'x')];
  return [o, ch.repeat(len) + 'sh'];
}
function randomCase(rnd) {
  const nh = 1 + Math.floor(rnd() * 3);
  const parts = []; const used = []; const own = [];
  for (let i = 0; i < nh; i++) {
    const h = pick(rnd, HEADS); const level = 1 + Math.floor(rnd() * 3); used.push([h, level]);
    parts.push('#'.repeat(level) + ' ' + h);
    const nl = 1 + Math.floor(rnd() * 3);
    for (let j = 0; j < nl; j++) { if (rnd() < 0.1) parts.push(''); else { const l = pick(rnd, LINES); own.push(l); parts.push(l); } }
    if (rnd() < 0.25) { const l = pick(rnd, LINES); own.push(l); const [o, c] = fencePair(rnd); parts.push(o, rnd() < 0.3 ? '# ' + pick(rnd, HEADS) : l, c); }
  }
  const body = parts.join('\n');
  const section = rnd() < 0.6 ? wrap(body) : body;
  const ex = [];
  if (rnd() < 0.6) ex.push('# ' + pick(rnd, ['My repo', 'CLAUDE.md', 'Project']), pick(rnd, MINE));
  const nb = 1 + Math.floor(rnd() * 5);
  for (let b = 0; b < nb; b++) {
    if (rnd() < 0.6) {
      const [h, level] = pick(rnd, used); ex.push(variantHeading(rnd, h, level));
      const nl = Math.floor(rnd() * 4);
      for (let j = 0; j < nl; j++) ex.push(rnd() < 0.75 ? variantLine(rnd, pick(rnd, own.length && rnd() < 0.9 ? own : LINES)) : pick(rnd, MINE));
    } else {
      ex.push('#'.repeat(1 + Math.floor(rnd() * 3)) + ' ' + pick(rnd, ['Mine', 'Deploy', 'Notes', 'Glossary', '---']));
      ex.push(pick(rnd, MINE));
      if (rnd() < 0.3) ex.push(pick(rnd, LINES));
      if (rnd() < 0.25) { const [o, c] = fencePair(rnd); ex.push(o, '# ' + pick(rnd, HEADS), pick(rnd, LINES), c); }
    }
  }
  let existing = ex.join('\n') + (rnd() < 0.7 ? '\n' : '');
  if (rnd() < 0.08) existing = crlf(existing);
  if (rnd() < 0.04) existing = BEGIN + '\n' + existing;
  return [existing, section];
}

export function genInputs(n, rnd) {
  const out = curated.map((a) => a.slice());
  while (out.length < n) out.push(randomCase(rnd));
  return out;
}
