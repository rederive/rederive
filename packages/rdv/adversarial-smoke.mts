/**
 * Adversarial smoke test: prove the held-out oracles have TEETH.
 *
 * `rdv check` passing only shows the shipped src matches its contract. This runs deliberately BROKEN
 * verdict-core implementations against the held-out oracles and asserts each is CAUGHT (fails ≥1
 * held-out vector). An oracle that can't fail a wrong impl is theater. Re-runnable: `tsx adversarial-smoke.mts`.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const heldout = (u: string) => JSON.parse(readFileSync(resolve(DIR, `oracles/${u}.json`), 'utf-8')).heldout;
const eqj = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const threw = (x: any) => x && typeof x === 'object' && '__throw' in x;

function gradeAgainst(fn: any, held: any[]) {
  let pass = 0; const miss: string[] = [];
  for (const v of held) {
    let got: any; try { got = fn(...v.args); } catch (e: any) { got = { __throw: String(e?.message ?? e) }; }
    if ((threw(got) && threw(v.expected)) || eqj(got, v.expected)) pass++; else miss.push(v.name);
  }
  return { pass, total: held.length, full: pass === held.length, miss };
}

// Each broken impl embodies a plausible verifier bug the oracle MUST catch.
const BROKEN: [string, string, any][] = [
  ['grade', 'always-full (rubber-stamp)', (_g: any, v: any[]) => ({ pass: v.length, total: v.length, full: true, miss: [] })],
  ['grade', 'first-vector-only (no saturation)', (g: any[], v: any[]) => {
    const ok = v.length === 0 || eqj(g[0], v[0].expected); return { pass: ok ? v.length : 0, total: v.length, full: ok, miss: [] };
  }],
  ['quorum', 'winner-always-0', (g: any[], need = 2) => { const fc = g.filter((x) => x.full).length; return { fullCount: fc, hasQuorum: fc >= need, winnerIdx: fc >= need ? 0 : -1 }; }],
  ['quorum', 'blesses-lone-pass (need=1)', (g: any[], need = 2) => { const fc = g.filter((x) => x.full).length; return { fullCount: fc, hasQuorum: fc >= 1, winnerIdx: fc >= 1 ? g.findIndex((x) => x.full) : -1 }; }],
  ['eq', 'set-equal (order-blind)', (a: any, b: any) => Array.isArray(a) && Array.isArray(b) ? eqj([...a].sort(), [...b].sort()) : eqj(a, b)],
  ['hashOk', 'accepts-any (always true)', (_b: any, _w?: string) => true],
];

let allCaught = true;
for (const [unit, label, fn] of BROKEN) {
  const r = gradeAgainst(fn, heldout(unit));
  const caught = !r.full;
  allCaught = allCaught && caught;
  console.log(`${caught ? '\x1b[32m✓ CAUGHT \x1b[39m' : '\x1b[31m✗ MISSED \x1b[39m'} ${unit} / ${label}: ${r.pass}/${r.total} held-out` +
    (caught ? `  \x1b[90mfails: ${r.miss.join(', ')}\x1b[39m` : '  \x1b[31m— ORACLE BLIND\x1b[39m'));
}
console.log(allCaught ? '\n\x1b[32mAll broken impls caught — the held-out oracles discriminate.\x1b[39m'
                      : '\n\x1b[31mWARNING: an oracle failed to catch a broken impl.\x1b[39m');
process.exit(allCaught ? 0 : 1);
