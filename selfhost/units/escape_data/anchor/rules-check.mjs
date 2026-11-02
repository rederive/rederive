// R1-R5 restated as a per-code-unit map, checked against the pinned code on a seeded mulberry32 sample.
import { escapeData } from '../../../.authority/c509956a8f8a/cli/lsp/pr-review.mjs';
const mul = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rnd = mul(2026); const MAP = { '%': '%25', '\r': '%0D', '\n': '%0A' };
const rule = (s) => { let o = ''; for (let i = 0; i < s.length; i++) o += MAP[s[i]] ?? s[i]; return o; };
const HOT = ['%', '\r', '\n', ':', ',', '=', '0', 'A', 'D', '2', '5'];
let n = 0, bad = 0;
for (let k = 0; k < 200000; k++) {
  const len = Math.floor(rnd() * 40); let s = '';
  for (let i = 0; i < len; i++) s += rnd() < 0.5 ? HOT[Math.floor(rnd() * HOT.length)] : String.fromCharCode(Math.floor(rnd() * 65536));
  n++; const r = escapeData(s); if (r !== rule(s) || r.length !== s.length + 2 * [...s].filter((c) => c in MAP).length || /[\r\n]/.test(r)) { bad++; if (bad < 5) console.log('BAD', JSON.stringify(s)); }
}
for (let c = 0; c < 65536; c++) { const s = String.fromCharCode(c); n++; if (escapeData(s) !== rule(s)) bad++; }
console.log(`rules check: ${n} inputs, ${bad} disagreements`);
