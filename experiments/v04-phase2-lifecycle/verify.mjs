// PHASE 2 (§21) — prove the resource-lifecycle channel earns its existence.
//
// The claim (SIR_SCHEMA §21): cancellation is INVISIBLE to the value and trace
// channels — a leaked timer still fires, but its effect is a no-op on already-
// settled state, so the emit/reply sequence is byte-identical while a real
// resource leak goes uncaught. A unit that arms cancellable resources therefore
// needs a THIRD channel: armed / fired / cancelled.
//
// The test is adversarial, not illustrative: two units that differ by exactly
// one line (`clearTimer`), graded on all three channels. If value or trace can
// tell them apart, §21 is unnecessary and this file should say so.
import { fetchWithTimeout, fetchWithTimeoutLeaky } from './units.mjs';
import { makeTimers, lifecycle } from './timers.mjs';

const J = (x) => JSON.stringify(x);
const fails = [];

/** Drive one unit over the injected boundary, collecting all three channels. */
async function observe(unit, { url, ms, replyAfter }) {
  const timers = makeTimers();
  const emitted = [];                                  // the TRACE channel
  const caps = {
    timers: timers.api,
    emit: (e) => emitted.push(e),
    request(u, cb) { timers.pending = () => cb(null, `body:${u}`); },
  };

  const p = unit(url, ms, caps).then(
    (v) => ({ ok: v }), (e) => ({ err: String(e.message) }));

  // the race, on virtual time: the reply lands at `replyAfter`, the timeout at `ms`
  if (replyAfter <= ms) { timers.advance(replyAfter); timers.pending?.(); await Promise.resolve(); timers.advance(ms - replyAfter + 10); }
  else { timers.advance(ms); await Promise.resolve(); timers.advance(replyAfter - ms); timers.pending?.(); }

  return { value: await p, trace: emitted, lifecycle: lifecycle(timers) };
}

const SCENARIOS = [
  { name: 'request wins the race (the happy path)', url: 'https://x/a', ms: 100, replyAfter: 10 },
  { name: 'request wins, slow but in time',         url: 'https://x/b', ms: 100, replyAfter: 99 },
  { name: 'timeout wins',                           url: 'https://x/c', ms: 50,  replyAfter: 999 },
];

console.log('§21 — can value or trace see a dropped clearTimer?\n');
for (const s of SCENARIOS) {
  const good = await observe(fetchWithTimeout, s);
  const leak = await observe(fetchWithTimeoutLeaky, s);

  const sameValue = J(good.value) === J(leak.value);
  const sameTrace = J(good.trace) === J(leak.trace);
  const sameLife  = J(good.lifecycle) === J(leak.lifecycle);

  console.log(`  ${s.name}`);
  console.log(`    value channel      ${sameValue ? 'IDENTICAL — blind to the leak' : 'differs'}   ${J(good.value)}`);
  console.log(`    trace channel      ${sameTrace ? 'IDENTICAL — blind to the leak' : 'differs'}   ${J(good.trace.map((e) => e.op))}`);
  console.log(`    lifecycle channel  ${sameLife ? 'identical (no leak here)' : 'DIFFERS — the leak is caught'}`);
  console.log(`        correct: ${J(good.lifecycle.events)}  leaked=${good.lifecycle.leaked}`);
  console.log(`        leaky:   ${J(leak.lifecycle.events)}  leaked=${leak.lifecycle.leaked}`);
  console.log('');

  // On the happy path the leak MUST be invisible to value+trace and visible to lifecycle.
  if (s.replyAfter <= s.ms) {
    if (!sameValue) fails.push(`${s.name}: value channel differed — §21's premise is wrong`);
    if (!sameTrace) fails.push(`${s.name}: trace channel differed — §21's premise is wrong`);
    if (sameLife)   fails.push(`${s.name}: lifecycle channel did NOT catch the leak`);
    if (good.lifecycle.leaked !== 0) fails.push(`${s.name}: the CORRECT unit leaked a timer`);
    if (leak.lifecycle.leaked !== 0 && leak.lifecycle.fired === 0) { /* leak visible as still-armed */ }
  } else {
    // timeout wins: nothing to cancel, so all three channels agree — the channel
    // must not manufacture a difference where there is none
    if (!sameLife) fails.push(`${s.name}: lifecycle differed when it should not (false positive)`);
  }
}

if (fails.length) { for (const f of fails) console.log(`FAIL: ${f}`); process.exit(1); }
console.log('PHASE 2 (§21): PASS — the leak is invisible to value and trace, and caught only on lifecycle.');
