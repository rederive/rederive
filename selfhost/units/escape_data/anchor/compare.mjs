// Compare the pinned escapeData with @actions/core@3.0.1's message escaping, observed through core.error(message).
import * as core from './node_modules/@actions/core/lib/core.js';
import { escapeData } from '../../../.authority/c509956a8f8a/cli/lsp/pr-review.mjs';
import { genInputs } from '../sir/escape_data.inputs.mjs';
import { encodeLegacy, decodeLegacy } from '../../../../../sir-lab/v05-lang/lib/legacy.mjs';
const mul = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function anchor(args) {
  let buf = ''; const w = process.stdout.write; process.stdout.write = (s) => { buf += s; return true; };
  try { core.error(...args.slice(0, 1)); } catch (e) { process.stdout.write = w; return { __throw: String(e.message) }; }
  process.stdout.write = w;
  const line = buf.replace(/\n$/, ''); if (!line.startsWith('::error::')) return { __raw: line };
  return line.slice('::error::'.length);
}
function real(args) { try { return escapeData(...args); } catch (e) { return { __throw: String(e.message) }; } }
const N = Number(process.argv[2] ?? 20000);
const inputs = [...genInputs(N, mul(7)), ...genInputs(N, mul(99)).slice(70)];
let same = 0, textSame = 0, textN = 0; const diffs = [];
for (const a0 of inputs) {
  const a = decodeLegacy(encodeLegacy(a0));
  const r = real(a), k = anchor(a); const eq = JSON.stringify(r) === JSON.stringify(k);
  if (typeof a[0] === 'string' && a.length >= 1) { textN++; if (eq) textSame++; }
  if (eq) same++; else diffs.push({ args: JSON.stringify(encodeLegacy(a)), real: JSON.stringify(r), anchor: JSON.stringify(k) });
}
console.log(`compared ${inputs.length}: agree ${same}; text-argument cases ${textN}, agree ${textSame}`);
for (const d of diffs) console.log('DIFF', d.args, ' real', d.real, ' anchor', d.anchor);
