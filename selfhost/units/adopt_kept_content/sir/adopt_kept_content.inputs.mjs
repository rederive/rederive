// genInputs(n, rnd) for adopt_kept_content: [unmanaged, managed] text pairs.
// Curated prefix (every class of item extraction, both marker cuts on both sides, CRLF and the double CR strip, the
// one-line / tilde / nested / CommonMark-closing / unclosed fence edges, the uncut raw branch, the sentence splitter, in-order
// representation (contiguous), code-span boundaries, the raw NUL / U+0001 key, the 5c drop cases (frozen), the wrapped begin marker, the BLANK and NOTDOT edges),
// then a seeded fill of realistic rule files paired with a managed section that copies, rewords, splits or omits items.
const CURATED = [
  // degenerate, and the two non-text probes (js only: the package throws)
  ['', ''],
  ['   \n\t\n', 'Only prose here.'],
  [42, 'x'],
  ['x', null],
  // round 5d (#144) — the cases that DROPPED giver content in 5c, now in the frozen slice
  ['~~~md\n```bash\nrm -rf build\n```\n~~~', '```sh\nrm -rf build\n```'],
  ['~~~\n```\nrm x\n```\n~~~\n\n``````\nq\n```\n``````', '~~~\nrm x\n~~~\n\n```\nq\n```'],
  ['```\nv\n``` x\n# H\n```', '```\nv\n# H\n```'],
  ['Skip **/node_modules/** always.\n\nUse x**2** y.\n\nGlob *.log* here.\n\nUse **bold** here.', 'Skip /node_modules/ always.\n\nUse x2 y.\n\nGlob .log here.\n\nUse bold here.'],
  ['x\u0000 Run `ls -S. Then` now.\n\n\u0001ls\u0001 -S.', 'x\u0000 run `ls -s. Then` NOW.\n\n`ls` -S.'],
  ['Never deploy. Ask first.\n\nA. B.\n\nC. D.', 'Never deploy. Except today. Ask first.\n\nX. A. B. Y.\n\nD. C.'],
  // round 5e (#146) — 5d's DL1 (a lone unclosed opener) and DL2 (the info string), frozen
  ['Rule.\n\n```bash', 'Other.\n```bash'],
  ['```bash\nls\n```\n\n```\nq\n```\n\n```x```\n\n```\n```', '```py\nls\n```\n\n~~~\nq\n~~~\n\n~~~\n```x```\n~~~\n\n```\n\n```'],
  // round 5d: the raw key, the fence key bounds, contiguity, empty headings
  ['x\u0000 Run.\n\nA \u0001b\u0001 C.\n\nQ\u0000  r.', 'x\u0000 Run.\n\nA \u0001b\u0001 C.\n\nq\u0000 r.'],
  ['\u0002x\u0000 y.\n\n\u0002Abc.', '\u0002x\u0000 y.\n\n\u0002abc.'],
  ['```x```\n\n~~~\n```x```\n~~~\n\n```bash\n```', '~~~\n  ```x```\n~~~\n\n```x```\n\n```bash'],
  ['a\n```\n\nb\n```bash', 'c\n```bash'],
  ['```\nq\n```````\nafter.\n\n````\nr\n```\n```````', '```\nq\n```\n\n~~~\nr\n```\n~~~'],
  ['#  \n\n- A. A.\n\n- B. B.', '#  \n\nA. A.\n\nB. X. B.'],
  // ONE managed item must say all of it, its sentences IN ORDER (round 5c); headings are items
  ['## Rules\n\n1. Never push to main. Ask Lane first.\n2. Run tests.\n', '<!-- rederive:begin x -->\n- Ask Lane first.\n- Run tests.\n<!-- rederive:end -->'],
  ['- Never deploy on Friday. Ask Lane first.\n\nA. B.\n\nC. D.\n\nE. E.\n\nF.', '- Ask Lane first.\n- Never deploy on Friday.\n\nB. A.\n\nC. X. D.\n\nE.\n\nY. F. Z.'],
  ['A. A.\n\nA.\n\n- B. A.\n- A. B.', 'X. A. Y. A.\n\n- A. B. A.'],
  ['### Never deploy on Fridays\n- Run tests.\n# A. B.\n## A.\n# Rules\nRules\n#  ', 'Run tests.\n\nA.\n## Rules'],
  ['# A. B.\n\n- Keep `src/` clean.\n* Use **bold** rules.\n10. Ten.\n007. Seven.\n', 'A.\nB.\n\nkeep `src/` clean.\n\nUSE BOLD RULES.\n\nTen.\n\n7. Seven.'],
  // fences (round 5c): close only on the opener's character, at least its run, nothing else on the line
  ['~~~\n```\nrm x\n```\n~~~\n\n~~~\n```\n~~~', '~~~\nrm x\n~~~'],
  ['``````\nq\n```\n``````\n\n````\n```\nr\n```\n````\nafter.', '```\nq\n```\n\n````\nr\n````'],
  ['```\nq\n````\nafter.\n\n```\nq\n~~~\nr\n```sh\ns\n```  \nafter two.', '```\nq\n```\n\n```\nq\nr\ns\n```'],
  ['~~~\nq\n~~~~\nafter.\n~~~~\nr\n~~~\n~~~~~\n\n```\nz\n  ```\t\nend.', '~~~\nq\n~~~\n\n```\nz\n```'],
  ['```bash\nls\n```\n\n```\nv\n``` x\n# H\n```\n\n```\nk\n```x```\n```', '```py\nls\n```\n\n# H\n\n```\nk\n```'],
  ['```bash\nmake test\n\n# not a heading\n- not a list. Two parts\n```\nafter.', '~~~\nmake test\n# not a heading\n\n- not a list. Two parts\n```'],
  ['```\nmake test\n```\n\n```\nMake test\n```\n\nmake test\n\n```\nstep 2\nstep 1\n```', '```\nMake test\n```\n\n```\nmake test\n```\n\n```\nstep 1\nstep 2\n```'],
  ['```\nmake   test\n\n```\n```\n\n```\n```\n   ```\n', '```\n  make test  \n```\n```\n```'],
  ['a\n```\nopen\n## h\n- l', '```\nopen\n## h\n- l'],
  ['```x```\n\n``````\nq', '```\n```x```\n```'],
  ['```x```\n\n```   ```\n```` ```\n  ```x```  \nq\n```x``` y\n\n```a\rb```\nr\n```a b```', '```x```'],
  ['```make deploy```\nfoo\nbar', 'foo bar'],
  // normalization: a code span keeps its boundary; asterisks are never stripped (round 5d)
  ['Run `ls` -S.\n\nRun ` ls ` now.\n\nRun `ls -S`.\n\nRun `ls -s` NOW.', 'Run `ls -S`.\n\nRun `ls` now.\n\nRun `ls` -S.\n\nRUN `ls -s` now.'],
  ['**a ***\n\n*a**b*\n\n_*a*_\n\né*a*\n\n**a**b\n\n* a*\n\n*a *\n\n****\n\n*****\n\n**x**y**z**', 'a *\n\nab\n\n_a_\n\néa\n\nab\n\n a\n\na \n\n**\n\n*\n\nxyz'],
  ['\u0001ls\u0001 -S.\n\n`a`*b* `c`.\n\nX `a` b `c\n\nx `` y\n\na ` b', '`ls` -S.\n\n`a`b `c`.\n\nx `a` B `c\n\nx  y\n\nA ` B'],
  ['ΑΣ `Σ` ΑΣ.\n\nNever commit .env files\n\nRun   the\ttests  now.\n\nCafé rules apply. ÉCOLE matters.', 'ας `Σ` ας.\n\nNever commit .env files.\n\nrun the tests now.\n\ncafé rules apply. école matters.'],
  ['***\n\n* * *', '**'],
  // a body with its own NUL or U+0001 is not cut and is compared raw (round 5d)
  ['Use `x`, not \u00000\u0000.\n\nA \u00001`x` b.\n\nC. \u0000d. `e`. `f` G.', 'Use `x`, not `x`.\n\nA undefined0\u0000 b.\n\nc. \u0000d. `e`. `f` g.'],
  // continuation lines, paragraphs, blank-line flush, list edges
  ['- First rule wraps\n  onto a second line. Second sentence\nkeeps going.\n\nA paragraph\nthat wraps.', 'First rule wraps onto a second line. Second sentence keeps going. Extra.'],
  ['Para line one\n- item starts\ncontinues item\n# Head\ntail para\n\n- \nfoo\n\n- foo  \nbar\n\n-  x\n- x \n- x', 'tail para'],
  ['-\n-- not a list\n+ plus\n1) paren\n1.no-space\n*emph* text\n\n1. one\n   2. two\n10.ten', 'one'],
  // headings: levels, 7 hashes, no space, indented, empty, NOTDOT placement
  ['   # Indented\n#NoSpace\n####### Seven\n# Trail (x)  \n  # Indented later\n# One\n###### Six\n#  \n## Never deploy on Fridays (rule)\nbody.', 'One'],
  ['x\n#  \n#\rx\n#\r\n#  x\n# x ', 'q'],
  ['x\n#  ', '```\nq\n```'],
  // sentence splitter: closers, starts, non-starts, code spans, the BLANK set
  ["e.g. Foo. 'x.' Bar.) (Baz ! `q` Ok? \"Quoted.\" Next.] Then... Done!! Yes.)) No", 'e.g. Zz. Foo. \'x.\' Zz. Bar.) Zz. (Baz ! Zz. `q` Ok? "Quoted." Zz. Next.] Zz. Then... Zz. Done!! Zz. Yes.)) No'],
  ['Ends with dot. lower start. Écrit. 1. digit. A', 'Ends with dot. lower start.'],
  ['A. B c.\u0085D e.﻿F g.　H i. J k.\u000bL m. N', 'A. Zz. B c.\u0085D e. Zz. F g. Zz. H i. Zz. J k. Zz. L m. Zz. N'],
  ['Run `a.` Then `b`. Next `c. D`.', 'Next `c. D`. Zz. Run `a.` Then `b`.'],
  // CRLF and the double CR strip
  ['## Rules\r\n- a thing.\r\n- Other thing.\r\n', '- a thing.\n- Other thing.'],
  ['- a thing.\n- Other thing.\n', '## Rules\r\n- a thing.\r\n- Other thing.\r\n'],
  ['# x\r\r\n# y\r\r\r\n- z\r\r\r\n```\r\r\nq\r\r\n```\r\r\na\r\r\nb\r\r\r\nc', 'w'],
  // the begin marker may wrap lines but never runs into another comment (round 5c, #123); markers in the managed text only
  ['Q.\n\nR.', '<!--\n rederive:begin\n x\n -->Q.\n\nR.'],
  ['Q.', '<!-- rederive:begin <!-- x --> -->Q.'],
  ['Q.\n\nP.', '<!-- rederive:begin <!-- rederive:begin -->Q.'],
  ['Q.', '<!--  rederive:begin\n\n-->\nQ.'],
  ['Q.', '<!-- rederive:begin x<!-->Q.'],
  ['Q. R.\n\nS.', '<!-- rederive:begin profile\nQ. R.\n\nS.'],
  ['Q.\n\nR.', '<!-- rederive:begin a\nR.\n<!-- rederive:begin b -->\nQ.'],
  ['Keep me. Drop me.', '<!-- rederive:begin p -->\nDrop me. Keep me.\n<!-- rederive:end -->\nIgnored.'],
  ['Before. After.', 'Before.\n<!-- a comment -->\nAfter.'],
  ['P.\n\nQ.\n\nR.\n\nS.', '<!-- rederive:beginner -->P.\n<!-- rederive:begin_x -->Q.\n<!-- rederive:begin-x -->R.'],
  ['Q. R.\n\nZ.', 'R.\n<!-- rederive:end -->\nQ.\n\n<!-- rederive:end -->\n<!-- rederive:begin -->Z.'],
  ['Joined text.', '<!-- rederive:begin -->Joined<!--  rederive:end  --> text.'],
  ['Joined text.', '<!-- rederive:begin -->Joined text.<!--\trederive:end\n-->'],
  // markers in the GIVER's text are ordinary text; duplicates are each kept
  ['Keep me.\n<!-- rederive:end -->\nAlso keep me.\n\n<!-- rederive:begin -->\n- Ask first.', 'Keep me.\n\n- Ask first.'],
  ['  # Head\nbody\n\n- Same. Same.\n- Same.\n\nSame.', 'Other.'],
  ['body', '  # Head\nbody'],
];

const WORDS = ['tests', 'main', 'the giver', 'Lane', 'the design doc', '§11', 'deploy', 'prod', 'the oracle', 'a seam',
  'every vector', 'the gate', '`src/**/*.ts`', 'the GDD', 'migrations', 'Fridays', 'café', '`rdv check`', '*.env'];
const VERBS = ['Never push to', 'Always run', 'Ask before touching', 'Do not edit', 'Cite', 'Review', 'Keep', 'Verify', '`make`'];
const ENDS = ['.', '.', '.', '!', '?', '.)', '."', ".'", '.]', '', ':'];
const CODE = ['```x```', 'make test', 'rdv check --strict', 'npm run build', 'architect: rules in Lane\'s words', '  indented -> row',
  'git push -S', 'rm -rf dist/*', 'a -> b -> c'];
const pick = (rnd, a) => a[Math.floor(rnd() * a.length)];

function sentence(rnd) {
  let s = `${pick(rnd, VERBS)} ${pick(rnd, WORDS)}`;
  const r = rnd();
  if (r < 0.1) s = s.replace(/ (\S+)$/, ' **$1**');
  else if (r < 0.17) s = '(' + s;
  else if (r < 0.23) s = s.toLowerCase();
  return s + pick(rnd, ENDS);
}

function sents(rnd) { const k = 1 + Math.floor(rnd() * 3); const a = []; for (let i = 0; i < k; i++) a.push(sentence(rnd)); return a; }

function wrap(rnd, ss, eol) {
  const text = ss.join(pick(rnd, [' ', ' ', '  ', ' ', '\t']));
  if (rnd() < 0.3 && text.length > 20) { const cut = text.indexOf(' ', 12); if (cut > 0) return text.slice(0, cut) + eol + pick(rnd, ['   ', '', '\t']) + text.slice(cut + 1); }
  return text;
}

// one unmanaged document: a list of blocks, each recorded as {kind, sents | lines, text}
function doc(rnd, eol) {
  const items = []; const blocks = [];
  const nb = 1 + Math.floor(rnd() * 5);
  for (let b = 0; b < nb; b++) {
    const r = rnd();
    if (r < 0.18) {
      const s = rnd() < 0.7 ? [pick(rnd, ['Hard rules', 'Process (v2)', 'Gates', 'Never deploy on Fridays', 'Ask Lane first.'])] : sents(rnd);
      const h = rnd() < 0.08 ? '#######' : '#'.repeat(1 + Math.floor(rnd() * 3));
      items.push({ kind: 'h', sents: s }); blocks.push(`${h}${rnd() < 0.05 ? '' : ' '}${s.join(' ')}`);
    } else if (r < 0.55) {
      const numbered = rnd() < 0.5; const k = 1 + Math.floor(rnd() * 3); const lines = [];
      for (let i = 0; i < k; i++) { const s = sents(rnd); items.push({ kind: 'l', sents: s }); lines.push(`${numbered ? (i + 1) + '.' : pick(rnd, ['-', '*'])} ${wrap(rnd, s, eol)}`); }
      blocks.push(lines.join(eol));
    } else if (r < 0.75) { const s = sents(rnd); items.push({ kind: 'p', sents: s }); blocks.push(wrap(rnd, s, eol)); }
    else if (r < 0.79) {
      const inner = pick(rnd, CODE); const lines = ['```' + pick(rnd, ['', 'bash']), inner, '```'];
      items.push({ kind: 'f', lines: rnd() < 0.5 ? [inner] : lines, info: '' });
      blocks.push([pick(rnd, ['~~~', '````']), ...lines, pick(rnd, ['~~~', '````', '~~~~', '`````'])].join(eol));
    }
    else if (r < 0.93) {
      const k = 1 + Math.floor(rnd() * 3); const lines = []; for (let i = 0; i < k; i++) lines.push(rnd() < 0.15 ? '' : pick(rnd, CODE));
      const info = pick(rnd, ['', '', 'bash', 'text']); const close = rnd() < 0.08 ? null : pick(rnd, ['```', '```', '  ```', '```sh']);
      items.push({ kind: 'f', lines, info });
      const t = rnd() < 0.2 ? '~~~' : '```';
      blocks.push([t + info, ...lines, ...(close ? [rnd() < 0.15 ? '~~~' : close] : [])].join(eol));
      if (!close) break;   // an unclosed fence swallows the rest
    } else { const c = pick(rnd, CODE).trim(); items.push({ kind: 'o', lines: [c] }); blocks.push('```' + c + '```'); }
  }
  let text = blocks.join(eol + eol) + (rnd() < 0.5 ? eol : '');
  if (rnd() < 0.04) text = text + eol + '<!-- rederive:end -->' + eol + sentence(rnd);
  return { text, items };
}

function vary(rnd, s) {
  const r = rnd();
  if (r < 0.55) return s;
  if (r < 0.65) return s.replace(/\*/g, '');
  if (r < 0.75) return s.toUpperCase();
  if (r < 0.85) return s.replace(/the giver|Lane/g, 'the requirement-giver');
  return s.replace(/`/g, '');
}

// a managed section derived from the unmanaged items: copied whole, reworded, split across items, partial, or omitted
function managed(rnd, items) {
  const out = []; const fences = [];
  for (const it of items) {
    const r = rnd();
    if (r < 0.2) continue;
    if (it.kind === 'f' || it.kind === 'o') {
      if (r < 0.55) fences.push(it.lines.slice());
      else if (r < 0.7) fences.push(it.lines.slice().reverse());
      else if (r < 0.85) for (const l of it.lines) if (l.trim()) out.push(vary(rnd, l.trim()));
      else fences.push(it.lines.slice(0, 1));
      if (it.kind === 'o' && rnd() < 0.5) out.push('```' + it.lines[0] + '```');
      continue;
    }
    const ss = it.sents.map((s) => vary(rnd, s));
    if (r < 0.65) out.push(ss.join(' '));
    else if (r < 0.75) out.push(ss.slice().reverse().join(' ') + (rnd() < 0.5 ? ' ' + sentence(rnd) : ''));
    else if (r < 0.9) for (const s of ss) out.push(s);
    else out.push(ss.slice(0, Math.max(1, ss.length - 1)).join(' '));
  }
  if (rnd() < 0.4) out.push(sentence(rnd));
  const lines = out.map((s) => pick(rnd, ['- ', '1. ', '', '* ', '## ']) + s);
  for (const f of fences) lines.push(['```' + pick(rnd, ['', 'bash']), ...f, '```'].join('\n'));
  let m = lines.join(rnd() < 0.5 ? '\n' : '\n\n');
  const w = rnd();
  if (w < 0.5) m = `<!-- rederive:begin profile -->\n## Rules\n\n${m}\n<!-- rederive:end -->\n`;
  else if (w < 0.6) m = `## Rules\n${m}\n<!-- note -->\n${sentence(rnd)}`;
  if (rnd() < 0.08) m = m.replace(/\n/g, '\r\n');
  return m;
}

export function genInputs(n, rnd) {
  const out = CURATED.map((a) => a.slice());
  while (out.length < n) {
    const d = doc(rnd, rnd() < 0.1 ? '\r\n' : '\n');
    out.push([d.text, managed(rnd, d.items)]);
  }
  return out;
}
