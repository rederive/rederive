// INDEPENDENT ANCHOR: git itself. For each text, `git diff --no-index -U0 <empty> <file>` lists git's lines; check that every
// parser line k (1..P) lands, via the real gitLine, on the git line that holds k's text at its position, and record what the
// past-the-end / trailing-empty parser line maps to relative to git's line count.
import { gitLine } from '../../../.authority/4c134cacd842/cli/lsp/pr-review.mjs';
import { genInputs } from '../sir/git_line.inputs.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'; import { spawnSync } from 'node:child_process'; import { join } from 'node:path';
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const W = join(import.meta.dirname, 'work'); rmSync(W, { recursive: true, force: true }); mkdirSync(W); writeFileSync(join(W, 'empty'), '');
function gitLines(t) {
  writeFileSync(join(W, 'f'), t);
  const r = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', 'diff', '--no-index', '--no-color', '-U0', '--text', 'empty', 'f'], { cwd: W });
  const out = r.stdout.toString('utf8').split('\n'); const h = out.findIndex((l) => l.startsWith('@@')); if (h < 0) return [];
  return out.slice(h + 1).filter((l) => l.startsWith('+')).map((l) => l.slice(1));
}
function parser(t) { const P = [], B = []; let cur = '';   // parser lines and the break that ends each
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (c === '\r' && t[i + 1] === '\n') { P.push(cur); B.push('\r\n'); cur = ''; i++; } else if (c === '\r' || c === '\n') { P.push(cur); B.push(c); cur = ''; } else cur += c; }
  P.push(cur); B.push(''); return { P, B }; }
const rnd = mulberry32(7); const AL = ['a', 'bc', '\r', '\n', '\r\n', '\u2028', '\u2029', '\u0085', ' ', 'x\ty'];
const texts = genInputs(72, mulberry32(1)).map((a) => a[0]).filter((t) => typeof t === 'string');
for (let s = 0; s < 1500; s++) { let t = ''; const len = Math.floor(rnd() * 12); for (let i = 0; i < len; i++) t += AL[Math.floor(rnd() * AL.length)]; texts.push(t); }
let n = 0, lines = 0, bad = 0; const tail = {};
for (const t of texts) { n++; const G = gitLines(t), { P, B } = parser(t), g = gitLine(t);
  const want = new Map(); P.forEach((p, i) => { const k = g(i + 1); want.set(k, (want.get(k) ?? '') + p + (B[i] === '\n' ? '' : B[i] === '' ? '' : '\r')); });
  for (const [k, w] of want) { lines++; const have = k <= G.length ? G[k - 1] : undefined;
    if (have === undefined) { if (w !== '') { bad++; console.log('MISS', JSON.stringify(t), k, JSON.stringify(w)); } }
    else if (have !== w) { bad++; if (bad < 10) console.log('DIFF', JSON.stringify(t), k, JSON.stringify(have), JSON.stringify(w)); } }
  const end = t === '' ? 'empty' : t.endsWith('\r\n') ? 'CRLF' : t.endsWith('\n') ? 'LF' : t.endsWith('\r') ? 'CR' : 'other';
  const rel = g(P.length + 5) - G.length; (tail[end] ??= {})[rel] = ((tail[end] ??= {})[rel] ?? 0) + 1; }
console.log(`texts ${n}, git lines checked ${lines}, disagreements ${bad}`);
console.log('past-the-end value minus git line count, by ending:', JSON.stringify(tail));
rmSync(W, { recursive: true, force: true });
