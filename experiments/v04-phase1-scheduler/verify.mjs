// PHASE 1 (§20) — the scheduler is a control effect; races verify on virtual time.
//
// The claim: a timer race ("does the timeout fire before the awaited reply
// settles?") is nondeterministic on the wall clock, so it is verified on virtual
// time — the event loop injected as a scheduler the harness drives, making
// resolution order a deterministic, replayable function of the timeline.
//
// The danger this addresses is NOT flakiness. It is worse and quieter: on a real
// clock your machine picks a winner, picks the SAME winner every run, and the
// other branch of your code is never executed. You ship a verified unit with an
// unverified branch and no test ever goes red.
import { makeScheduler } from './sched.mjs';

const J = (x) => JSON.stringify(x);
const fails = [];

// The unit: races a reply against a timeout, deferring the settle through the
// injected microtask scheduler (as a real promise chain would).
function fetchWithTimeout(ms, replyAt, caps) {
  return new Promise((resolve, reject) => {
    let settled = false;
    caps.emit('start');
    const id = caps.setTimer(() => {
      if (settled) return; settled = true;
      caps.emit('timeout'); reject(new Error('timeout'));
    }, ms);
    // the reply arrives on its own timer; its handler defers through microtasks,
    // which is exactly where real code hides ordering assumptions
    caps.setTimer(() => {
      caps.schedule(() => {
        caps.schedule(() => {
          if (settled) return; settled = true;
          caps.clearTimer(id);
          caps.emit('reply'); resolve('body');
        });
      });
    }, replyAt);
  });
}

async function run({ ms, replyAt }) {
  const s = makeScheduler();
  const emitted = [];
  const caps = { ...s.api, emit: (e) => emitted.push(e) };
  const p = fetchWithTimeout(ms, replyAt, caps).then((v) => ({ ok: v }), (e) => ({ err: e.message }));
  s.advance(Math.max(ms, replyAt) + 1);
  return { value: await p, trace: emitted, lifecycle: s.channel(), micro: s.stats().drained };
}

console.log('§20 — both branches of a race, on demand\n');

// 1. BOTH outcomes reachable by moving only the timeline
const replyFirst = await run({ ms: 100, replyAt: 40 });
const timeoutFirst = await run({ ms: 40, replyAt: 100 });
console.log(`  reply wins    trace=${J(replyFirst.trace)}  value=${J(replyFirst.value)}  lifecycle=${J(replyFirst.lifecycle.events)}`);
console.log(`  timeout wins  trace=${J(timeoutFirst.trace)}  value=${J(timeoutFirst.value)}  lifecycle=${J(timeoutFirst.lifecycle.events)}`);
if (!replyFirst.value.ok) fails.push('reply-first did not resolve');
if (!timeoutFirst.value.err) fails.push('timeout-first did not reject');
if (J(replyFirst.trace) === J(timeoutFirst.trace)) fails.push('both branches produced the same trace — the timeline is not in control');

// 2. THE TIE — the case a real clock decides for you
console.log('\n  the tie (reply and timeout due at the same instant):');
const tie = await run({ ms: 50, replyAt: 50 });
console.log(`    ${J(tie.trace)} -> ${J(tie.value)}   (deterministic: earlier-armed timer wins)`);

// 3. REPLAYABILITY — same script, same answer, every time
console.log('\n  replayability: 50 runs of each scenario');
for (const [label, cfg, want] of [['reply wins', { ms: 100, replyAt: 40 }, replyFirst],
                                  ['timeout wins', { ms: 40, replyAt: 100 }, timeoutFirst],
                                  ['the tie', { ms: 50, replyAt: 50 }, tie]]) {
  const seen = new Set();
  for (let i = 0; i < 50; i++) { const r = await run(cfg); seen.add(J([r.value, r.trace, r.lifecycle])); }
  const stable = seen.size === 1 && seen.has(J([want.value, want.trace, want.lifecycle]));
  console.log(`    ${label.padEnd(13)} ${seen.size} distinct outcome(s) in 50 runs  ${stable ? 'STABLE' : 'UNSTABLE'}`);
  if (!stable) fails.push(`${label}: ${seen.size} distinct outcomes across replays`);
}

// 4. MICROTASK ORDERING — deferred work settles before the next timer, deterministically
console.log('\n  microtask ordering: the reply deferred through 2 nested microtasks');
console.log(`    drained ${replyFirst.micro} microtask(s); the timeout at 100ms never fired,`);
console.log(`    and the timer was cancelled -> ${J(replyFirst.lifecycle.events)}`);
if (replyFirst.micro < 2) fails.push('the microtask queue was not exercised');
if (replyFirst.lifecycle.leaked !== 0) fails.push('reply-first leaked a timer');

// 5. WHAT THE WALL CLOCK GIVES YOU INSTEAD — the quiet failure
console.log('\n  the same race on the REAL clock, 20 runs:');
async function realClock() {
  return new Promise((resolve) => {
    let settled = false;
    const id = setTimeout(() => { if (!settled) { settled = true; resolve('timeout'); } }, 5);
    setTimeout(() => { queueMicrotask(() => queueMicrotask(() => {
      if (!settled) { settled = true; clearTimeout(id); resolve('reply'); } })); }, 5);
  });
}
const winners = {};
for (let i = 0; i < 20; i++) { const w = await realClock(); winners[w] = (winners[w] || 0) + 1; }
console.log(`    winners: ${J(winners)}`);
console.log(`    -> the machine picks, and it picks the same way every run. The other branch`);
console.log(`       of this unit was never executed, and nothing went red to tell you.`);

console.log('');
if (fails.length) { for (const f of fails) console.log(`FAIL: ${f}`); process.exit(1); }
console.log('PHASE 1 (§20): PASS — both race branches reachable, each replayable, microtask order deterministic.');
