// PHASE 4b (§22 liveness) — a ring may only fail two ways; catch both.
//
// The refinement check proves the ring invents nothing. This proves it keeps
// moving: the token is never duplicated (mutual exclusion) and never lost
// (it comes home). Plus the generic halt detector: a unit with no work in
// flight that has not settled is STUCK, which is what a lost token looks like
// from outside — and which an outcome-set comparison reads as "no outcomes"
// rather than as a bug.
import { makeToken } from './token.mjs';
import * as U from './units-live.mjs';

const J = (x) => JSON.stringify(x);
const fails = [];

/** Drive one schedule, watching for a halt as well as an outcome. */
async function run(unit, items) {
  const pending = new Map();
  let nextId = 1, settledCall = false;
  const gate = { open(v) { const id = nextId++; return new Promise((r) => pending.set(id, () => r(v))); } };
  const token = makeToken();
  const call = Promise.resolve(unit(items, gate, token.api))
    .then((v) => { settledCall = true; return { ok: v }; },
          (e) => { settledCall = true; return { err: String(e.message) }; });

  for (;;) {
    await new Promise((r) => setImmediate(r));
    const c = [...pending.keys()];
    if (!c.length) {
      // NO work in flight. Either the unit finished, or it is waiting on
      // something nobody will ever deliver — a deadlock, which is exactly the
      // shape of a lost token.
      if (settledCall) break;
      return { halted: true, token: token.channel() };
    }
    const f = pending.get(c[0]); pending.delete(c[0]); f();
  }
  return { halted: false, value: await call, token: token.channel() };
}

console.log('§22 liveness — the two ways a ring can break\n');

for (const [label, unit, expect] of [
  ['sound ring',        U.ringSound,      { live: true }],
  ['token LOST',        U.ringLost,       { lost: true }],
  ['token DUPLICATED',  U.ringDuplicated, { dup: true }],
]) {
  const r = await run(unit, [1, 2, 3]);
  const t = r.token;
  const live = t.mutualExclusion && t.returned && !r.halted;
  console.log(`  ${label}`);
  console.log(`    events            ${J(t.events)}`);
  console.log(`    mutual exclusion  ${t.mutualExclusion ? 'held (max 1 holder)' : `VIOLATED — ${t.maxConcurrentHolders} simultaneous holders`}`);
  console.log(`    token returned    ${t.returned ? 'yes' : `NO — still held by ${J(t.stillHeld)}`}`);
  console.log(`    verdict           ${live ? 'LIVE' : 'NOT LIVE'}${r.halted ? ' (HALTED — no work in flight, call never settled)' : ''}`);
  console.log(`    output            ${r.halted ? '(none — the unit is stuck)' : J(r.value)}`);
  console.log('');

  if (expect.live && !live) fails.push(`${label}: a sound ring was reported not-live`);
  if (expect.lost && t.returned) fails.push(`${label}: a lost token was not detected`);
  if (expect.dup && t.mutualExclusion) fails.push(`${label}: duplicate holders were not detected`);
  // the point of the whole file: the broken rings still LOOK fine on output
  if ((expect.lost || expect.dup) && !r.halted && r.value?.ok) {
    console.log(`    ^ note: the output above is CORRECT. Only the token channel sees the fault.\n`);
  }
}

if (fails.length) { for (const f of fails) console.log(`FAIL: ${f}`); process.exit(1); }
console.log('PHASE 4b (§22 liveness): PASS — loss and duplication both caught, on units whose output looks right.');
