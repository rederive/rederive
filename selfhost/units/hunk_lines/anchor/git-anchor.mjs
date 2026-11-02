// Independent anchor for hunk_lines: git itself. Random before/after pairs -> `git diff -U0 --no-index`; the truth is the
// set of new-side line numbers git's own '+' lines occupy (numbered by walking each hunk body, then CHECKED against the
// after file: every '+' line's text must equal after[n-1], and the after lines NOT in the set, in order, must equal the
// before lines git did not delete). Usage: node git-anchor.mjs [N=2000] [seed=7]. Writes only under this directory.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const W = join(HERE, 'scratch'); rmSync(W, { recursive: true, force: true }); mkdirSync(W, { recursive: true });
const { hunkLines } = await import(join(HERE, '../../../.authority/9b9e5d24ca9d/cli/lsp/pr-review.mjs'));
const N = Number(process.argv[2] ?? 2000), seed = Number(process.argv[3] ?? 7);
const rnd = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(seed);
const ri = (k) => Math.floor(rnd() * k);
// line vocabulary: mostly ordinary, plus HOSTILE lines (a CR or U+2028/U+2029 then a header-shaped text) when mode says so
const plain = ['a', 'b', 'c', 'd', 'e', 'foo', 'bar', '', '  x', '@@ -1 +1 @@', '+@@ -1 +2 @@'];
const hostile = ['q\r@@ -1 +900 @@', 'q\u2028@@ -1 +901,2 @@', 'q\u2029@@ -1 +903 @@', 'q\u0085@@ -1 +904 @@'];
const mkLines = (k, hos) => Array.from({ length: k }, () => (hos && rnd() < 0.15 ? hostile[ri(hostile.length)] : plain[ri(plain.length)]));
function mutate(lines, hos) { const out = [...lines]; const ops = 1 + ri(6);
  for (let o = 0; o < ops; o++) { const p = ri(out.length + 1), r = rnd();
    if (r < 0.35) out.splice(p, 0, ...mkLines(1 + ri(4), hos)); else if (r < 0.7) out.splice(p, 1 + ri(3)); else out.splice(p, 1, ...mkLines(1 + ri(3), hos)); }
  return out; }
const join_ = (ls, eol, finalNl) => ls.join(eol) + (finalNl && ls.length ? eol : '');
function truth(diff, before, after) {
  // walk hunks; numbering from the header START only, counts derived from the body; the before/after checks validate it
  const added = new Set(), deleted = new Set(); let nl = null, ol = null;
  for (const line of diff.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (h) { ol = +h[1]; nl = +h[2]; continue; }
    if (nl === null) continue;
    if (line.startsWith('+')) { added.add(nl); nl++; } else if (line.startsWith('-')) { deleted.add(ol); ol++; }
  }
  return { added, deleted };
}
let agree = 0, disagree = 0, checkFail = 0; const byCause = { benign: 0, cr: 0, ls: 0, ps: 0 }; const examples = []; const stats = { hostileCases: 0, crlf: 0, noFinalNl: 0, empty: 0 };
for (let k = 0; k < N; k++) {
  const hos = rnd() < 0.25, crlf = rnd() < 0.15, finalNl = rnd() < 0.85;
  const before = mkLines(ri(14), hos); let after = mutate(before, hos); if (rnd() < 0.05) after = [];
  const A = join(W, 'before.txt'), B = join(W, 'after.txt'); const eol = crlf ? '\r\n' : '\n';
  writeFileSync(A, join_(before, eol, finalNl)); writeFileSync(B, join_(after, eol, finalNl));
  const g = spawnSync('git', ['diff', '-U0', '--no-index', '--no-color', '--text', A, B], { encoding: 'utf8' });
  const diff = g.stdout;
  // the files' LINES as git numbers them (split on \n only; a CR is content)
  const fileLines = (s) => { const ls = s.split('\n'); if (ls.length && ls[ls.length - 1] === '') ls.pop(); return ls; };
  const bl = fileLines(join_(before, eol, finalNl)), al = fileLines(join_(after, eol, finalNl));
  // git's '+' lines carry the file line text verbatim (they may contain \r, U+2028 — split on \n only)
  const { added, deleted } = truth(diff, bl, al);
  const keptAfter = al.filter((_, i) => !added.has(i + 1)), keptBefore = bl.filter((_, i) => !deleted.has(i + 1));
  const plusTexts = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1));
  const ok = JSON.stringify(keptAfter) === JSON.stringify(keptBefore) && [...added].every((n, i) => al[n - 1] === plusTexts[i]);
  if (!ok) { checkFail++; continue; }
  const want = [...added].sort((a, b) => a - b), got = hunkLines(diff);
  if (hos) stats.hostileCases++; if (crlf) stats.crlf++; if (!finalNl) stats.noFinalNl++; if (!diff) stats.empty++;
  if (JSON.stringify(want) === JSON.stringify(got)) agree++; else { disagree++; const extra = got.filter((x) => !want.includes(x)); for (const x of new Set(extra.map((x) => x >= 903 ? 'ps' : x >= 901 ? 'ls' : x === 900 ? 'cr' : 'benign'))) byCause[x]++; if (!hos) byCause.benign++; if (examples.length < 6) examples.push({ hostile: hos, crlf, want, got, diff }); }
}
console.log(JSON.stringify({ N, seed, agree, disagree, disagreeByInjectedHeader: byCause, anchorSelfCheckFailures: checkFail, stats }, null, 1));
for (const e of examples) console.log(JSON.stringify(e));
rmSync(W, { recursive: true, force: true });
