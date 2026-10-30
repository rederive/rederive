// PHASE 4 (§22) — RING is a refinement, and that is a checkable claim.
//
// The claim: token-coordinated concurrency collapses the interleaving space to a
// deterministic schedule, and a ring is a behavior REFINEMENT — R_ring ⊆ R_free
// always. The decomposer may RECOGNIZE a ring (R_ring = R_free: behavior-
// preserving) or IMPOSE one (R_ring ⊂ R_free: a deliberate, documented
// narrowing). What it must never do is impose one silently, or impose one that
// isn't a refinement at all.
import { explore } from '../v04-phase0-pmap/schedule.mjs';
import * as U from './units.mjs';

const J = (x) => JSON.stringify(x);
const fails = [];

/** Outcome SET of a unit over every reachable interleaving (Phase 0's explorer,
 *  adapted to the gate shape). */
async function outcomes(unit, items) {
  const seen = new Set();
  let count = 0;
  async function walk(prefix) {
    const pending = new Map();
    let nextId = 1, step = 0, maxInFlight = 0;
    const gate = { open(v) { const id = nextId++; return new Promise((r) => { pending.set(id, () => r(v)); if (pending.size > maxInFlight) maxInFlight = pending.size; }); } };
    const call = Promise.resolve(unit(items, gate));
    const branches = [];
    for (;;) {
      await new Promise((r) => setImmediate(r));
      const c = [...pending.keys()];
      if (!c.length) break;
      branches.push(c.length);
      const pick = c[Math.min(prefix[step] ?? 0, c.length - 1)];
      step++; const f = pending.get(pick); pending.delete(pick); f();
    }
    const result = await call;
    count++;
    if (prefix.length >= branches.length) { seen.add(J(result)); return; }
    for (let i = 0; i < branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  return { set: seen, schedules: count };
}

const items = [1, 2, 3];
const subset = (a, b) => [...a].every((x) => b.has(x));

console.log('§22 — a ring may DROP outcomes, never INVENT one\n');

// 1. IMPOSED ring on a racy unit — a proper refinement
{
  const free = await outcomes(U.sharedAppendFree, items);
  const ring = await outcomes(U.sharedAppendRing, items);
  const isSubset = subset(ring.set, free.set);
  const equal = isSubset && free.set.size === ring.set.size;
  console.log('  shared cursor (racy)');
  console.log(`    R_free = ${free.set.size} outcome(s) over ${free.schedules} schedules  ${J([...free.set])}`);
  console.log(`    R_ring = ${ring.set.size} outcome(s)  ${J([...ring.set])}`);
  console.log(`    R_ring subset of R_free: ${isSubset ? 'YES — sound' : 'NO — NOT A REFINEMENT'}`);
  console.log(`    verdict: ${equal ? 'behavior-PRESERVING (recognition)' : `REFINEMENT — drops ${free.set.size - ring.set.size} outcome(s), must be documented`}`);
  if (!isSubset) fails.push('imposed ring produced an outcome the free unit cannot');
  if (equal) fails.push('the racy unit should NOT be preserved by a ring — the space should shrink');
}

// 2. RECOGNIZED ring on an already-independent unit — behavior-preserving
{
  const free = await outcomes(U.ownSlotFree, items);
  const ring = await outcomes(U.ownSlotRing, items);
  const isSubset = subset(ring.set, free.set);
  const equal = isSubset && free.set.size === ring.set.size;
  console.log('\n  independent slots (already order-insensitive)');
  console.log(`    R_free = ${free.set.size} outcome(s) over ${free.schedules} schedules`);
  console.log(`    R_ring = ${ring.set.size} outcome(s)`);
  console.log(`    verdict: ${equal ? 'behavior-PRESERVING (recognition) — R_ring = R_free' : 'refinement'}`);
  if (!equal) fails.push('an independent unit should be PRESERVED by a ring, not narrowed');
}

// 3. THE ADVERSARIAL CASE — a "ring" that is not a refinement
{
  const free = await outcomes(U.sharedAppendFree, items);
  const bad = await outcomes(U.sharedAppendRingBroken, items);
  const isSubset = subset(bad.set, free.set);
  console.log('\n  a BROKEN "ring" (reverses + mangles values)');
  console.log(`    R_ring = ${J([...bad.set])}`);
  console.log(`    R_ring subset of R_free: ${isSubset ? 'YES' : 'NO — CAUGHT: it invents an outcome the free unit cannot produce'}`);
  if (isSubset) fails.push('the broken ring passed the subset check — §22 has no teeth');
}

console.log('');
if (fails.length) { for (const f of fails) console.log(`FAIL: ${f}`); process.exit(1); }
console.log('PHASE 4 (§22): PASS — refinement checked, recognition distinguished, a fake ring caught.');
