// PHASE 0 — reproduce §19's p-map claim against THIS build.
//
// The claim under test (SIR_SCHEMA §19): p-map's concurrency contract —
// interleaving-invariant output + a max-concurrency bound — verified
// EXHAUSTIVELY for small inputs, and partial-order-reduction-scaled past the
// point where exhaustive is possible.
//
// Two invariants, asserted on EVERY explored schedule:
//   I1  output is keyed by INPUT position, whatever order mappers settle in
//   I2  in-flight count never exceeds min(concurrency, n)
//
// POR: p-map's mappers here touch no shared state, so every schedule is
// independent — the equivalence classes collapse to ONE. That prediction is
// not assumed; it is CHECKED against the exhaustive runs (all outcomes
// identical) before being used to justify a single representative at sizes
// where exhaustive is impossible.
import { explore, runSchedule, spaceSize } from './schedule.mjs';
import { pathToFileURL } from 'node:url';

const REAL = process.env.PMAP ??
  `${process.env.HOME}/sir-lab/boxen/node_modules/p-map/index.js`;
const { default: pMap } = await import(pathToFileURL(REAL).href);

const expected = (input) => input.map((x) => x * 2);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fails = [];
const line = (s) => console.log(s);
// BigInt has no toExponential — render the space size in scientific notation by
// its digit count, since the whole point is that it is astronomically large
const sci = (b) => { const d = b.toString(); return d.length <= 6 ? d : `${d[0]}.${d.slice(1, 3)}e${d.length - 1}`; };

line(`p-map under test: ${REAL.replace(process.env.HOME, '~')}`);
line('');
line('== EXHAUSTIVE — every reachable completion order ==');
line('  n  conc   space   explored  exhaustive  I1 order-invariant  I2 bound');

for (const [n, concurrency] of [[3, 1], [3, 2], [4, 2], [4, 3], [5, 2], [5, 3], [6, 3]]) {
  const input = Array.from({ length: n }, (_, i) => i + 1);
  const { runs, exhaustive, count } = await explore(pMap, { input, concurrency });
  const bound = Math.min(concurrency, n);
  const badOrder = runs.filter((r) => !eq(r.result, expected(input)));
  const badBound = runs.filter((r) => r.maxInFlight > bound);
  const distinctOrders = new Set(runs.map((r) => r.order.join(','))).size;
  line(`  ${n}  ${String(concurrency).padEnd(4)} ${String(spaceSize(input, concurrency)).padStart(6)}` +
       `   ${String(count).padStart(6)}   ${String(exhaustive).padEnd(10)}  ` +
       `${badOrder.length === 0 ? 'PASS' : 'FAIL ' + badOrder.length}` +
       `              ${badBound.length === 0 ? `PASS (max ${Math.max(...runs.map((r) => r.maxInFlight))} <= ${bound})` : 'FAIL'}`);
  if (badOrder.length) fails.push(`n=${n} c=${concurrency}: ${badOrder.length} schedules broke input-order`);
  if (badBound.length) fails.push(`n=${n} c=${concurrency}: ${badBound.length} schedules exceeded the bound`);
  if (distinctOrders !== count) fails.push(`n=${n} c=${concurrency}: explorer replayed a duplicate schedule`);
}

line('');
line('== POR — is the independence claim true? ==');
{
  const input = [1, 2, 3, 4, 5];
  const { runs, count } = await explore(pMap, { input, concurrency: 2 });
  const classes = new Set(runs.map((r) => JSON.stringify(r.result) + '|' + r.maxInFlight));
  line(`  ${count} schedules explored -> ${classes.size} distinct (result, maxInFlight) outcome(s)`);
  line(`  POR prediction for independent mappers: 1 class. ${classes.size === 1 ? 'CONFIRMED' : 'REFUTED'}`);
  if (classes.size !== 1) fails.push(`POR: expected 1 outcome class, saw ${classes.size}`);
}

line('');
line('== POR-SCALED — sizes where exhaustive is impossible ==');
for (const [n, concurrency] of [[20, 5], [40, 8], [64, 10]]) {
  const input = Array.from({ length: n }, (_, i) => i + 1);
  const size = spaceSize(input, concurrency);
  const rep = await runSchedule(pMap, { input, concurrency });           // POR representative
  const samples = [];
  for (let s = 0; s < 25; s++) {                                          // random schedules
    const decisions = Array.from({ length: n }, () => Math.floor(Math.random() * concurrency));
    samples.push(await runSchedule(pMap, { input, concurrency, decisions }));
  }
  const all = [rep, ...samples];
  const ok = all.every((r) => eq(r.result, expected(input)) && r.maxInFlight <= Math.min(concurrency, n));
  line(`  n=${String(n).padEnd(3)} conc=${String(concurrency).padEnd(3)} space=${sci(size)}` +
       `  1 POR representative + 25 random: ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) fails.push(`n=${n} c=${concurrency}: POR representative or a sample violated an invariant`);
}

line('');
if (fails.length) { for (const f of fails) line(`FAIL: ${f}`); process.exit(1); }
line('PHASE 0: PASS — §19\'s p-map claim reproduces against this build.');
