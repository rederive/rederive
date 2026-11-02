// Check the primary's rules (written independently, no regex engine) against the pinned real gitLine on a seeded sample.
import { gitLine } from '../../../.authority/4c134cacd842/cli/lsp/pr-review.mjs';
const mulberry32 = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
// rules: scan left to right; a break is CR LF (taken together), CR, or LF; P = breaks + 1; G[k] = 1 + LF-bearing breaks before line k
function rules(text, lines) {
  const G = [1]; let lf = 1;
  for (let i = 0; i < text.length; i++) { const c = text[i];
    if (c === '\r' && text[i + 1] === '\n') { i++; lf++; G.push(lf); } else if (c === '\n') { lf++; G.push(lf); } else if (c === '\r') G.push(lf); }
  const P = G.length;
  return lines.map((x) => (x === 0 ? 0 : Number.isInteger(x) && x >= 1 && x <= P ? G[x - 1] : lf));
}
const rnd = mulberry32(20261102); const AL = ['a', 'b', '\r', '\n', '\r\n', '\u2028', '\u2029', '\u0085', '\f', '', ' '];
const SPECIAL = [0, -0, -1, 0.5, 1.5, NaN, Infinity, -Infinity, 1e21, 2 ** 32, 2 ** 53];
let N = 0, bad = 0;
for (let s = 0; s < 200000; s++) {
  let t = ''; const len = Math.floor(rnd() * 14); for (let i = 0; i < len; i++) t += AL[Math.floor(rnd() * AL.length)];
  const lines = []; for (let i = 0; i < 12; i++) lines.push(rnd() < 0.8 ? Math.floor(rnd() * 20) - 2 : SPECIAL[Math.floor(rnd() * SPECIAL.length)]);
  const real = lines.map(gitLine(t)), mine = rules(t, lines); N += lines.length;
  if (JSON.stringify(real) !== JSON.stringify(mine)) { bad++; if (bad < 5) console.log('DIFF', JSON.stringify(t), lines, real, mine); }
}
console.log(`texts 200000, line lookups ${N}, disagreements ${bad}`);
