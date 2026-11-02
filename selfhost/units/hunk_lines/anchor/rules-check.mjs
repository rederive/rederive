// Rules check: an implementation written from the primary's rules (a hand scanner, no regex) vs the pinned real code,
// on a large mulberry32 sample from the unit's own generator. Usage: node rules-check.mjs [N=50000] [seed=3].
import { join, dirname } from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const { hunkLines } = await import(join(HERE, '../../../.authority/9b9e5d24ca9d/cli/lsp/pr-review.mjs'));
const { genInputs } = await import(join(HERE, '../sir/hunk_lines.inputs.mjs'));
const TERM = new Set(['\n']);   // R2: LF only
function fromRules(d) {
  const out = new Set(); const dig = (i) => { let j = i; while (j < d.length && d[j] >= '0' && d[j] <= '9') j++; return j; };
  for (let p = 0; p <= d.length; p++) {
    if (!(p === 0 || TERM.has(d[p - 1]))) continue;
    if (!d.startsWith('@@ -', p)) continue; let i = p + 4, j = dig(i); if (j === i) continue; i = j;
    if (d[i] === ',') { j = dig(i + 1); if (j === i + 1) continue; i = j; }
    if (!d.startsWith(' +', i)) continue; i += 2; j = dig(i); if (j === i) continue; const C = BigInt(d.slice(i, j)); i = j;
    let N = 1n; if (d[i] === ',') { j = dig(i + 1); if (j === i + 1) continue; N = BigInt(d.slice(i + 1, j)); i = j; }
    if (!d.startsWith(' @@', i)) continue;
    const SAFE = 9007199254740991n, E = C + N - 1n;   // R5 at 65149601a522 / 55768a551a48
    if (N > 1000000n) continue;                          // MAX_HUNK
    const hi = E <= SAFE ? E : E === SAFE + 1n ? SAFE : null; if (hi === null) continue;   // TABLE RANGE
    for (let k = C < 1n ? 1n : C; k <= hi; k++) out.add(k);   // line 0 is never covered
  }
  return [...out].sort((a, b) => (a < b ? -1 : 1)).map(Number);
}
const N = Number(process.argv[2] ?? 50000), seed = Number(process.argv[3] ?? 3);
const rnd = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(seed);
let agree = 0, bad = []; for (const [d] of genInputs(N, rnd)) { const a = JSON.stringify(hunkLines(d)), b = JSON.stringify(fromRules(d)); if (a === b) agree++; else if (bad.length < 5) bad.push({ d, a, b }); }
console.log(JSON.stringify({ N, seed, agree, disagree: N - agree - 0, examples: bad }));
// exhaustive boundary sweep: C in 2^53-12 .. 2^53+4, N in 0..14 (with and without the count), and N at MAX_HUNK +-2
let sweep = 0, sweepBad = [];
for (let c = 9007199254740979n; c <= 9007199254740996n; c++) for (let n = -1; n <= 14; n++) {
  const d = '@@ -1 +' + c + (n < 0 ? '' : ',' + n) + ' @@'; sweep++;
  if (JSON.stringify(hunkLines(d)) !== JSON.stringify(fromRules(d)) && sweepBad.length < 5) sweepBad.push(d); }
for (const n of [999998, 999999, 1000000, 1000001, 1000002]) { const d = '@@ -1 +0,' + n + ' @@'; sweep++; if (JSON.stringify(hunkLines(d)) !== JSON.stringify(fromRules(d))) sweepBad.push(d); }
console.log(JSON.stringify({ boundarySweep: sweep, disagree: sweepBad.length, examples: sweepBad }));
