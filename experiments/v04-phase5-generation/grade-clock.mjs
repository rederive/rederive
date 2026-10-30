// PHASE 5 acceptance gate, clock half: scheduler (§20) and lifecycle (§21).
//
// Same question as grade.mjs — can a COLD re-emitter build the construct from the
// SIR alone? — against the two v0.4 features whose defects hide on a channel the
// return value cannot show you:
//   fireOrder    a correct-looking result computed by SORTING, arming no timers
//   raceTimeout  a correct result that leaves its timeout timer armed forever
// Both are graded on the lifecycle channel (armed / fired / cleared), not the value.
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const J = (x) => JSON.stringify(x);
const drain = () => new Promise((r) => setImmediate(r));

// Virtual time. Nothing here consults the real clock, so ties are resolved by arm
// order rather than by whatever the machine happened to do.
function makeClock() {
  const timers = new Map();
  let now = 0, seq = 0;
  const log = [];
  const api = {
    setTimer(fn, ms) {
      const h = ++seq;
      timers.set(h, { fn, at: now + (Number(ms) || 0), seq: h });
      log.push(`armed(${h}@${now + (Number(ms) || 0)})`);
      return h;
    },
    clearTimer(h) {
      if (timers.delete(h)) log.push(`cleared(${h})`);
    },
  };
  // Fire the next due timer: earliest `at`, ties broken by arm order.
  const fireNext = () => {
    let pick = null;
    for (const [h, t] of timers) {
      if (!pick || t.at < pick.t.at || (t.at === pick.t.at && t.seq < pick.t.seq)) pick = { h, t };
    }
    if (!pick) return false;
    timers.delete(pick.h);
    now = pick.t.at;
    log.push(`fired(${pick.h}@${now})`);
    pick.t.fn();
    return true;
  };
  return { api, fireNext, pending: () => [...timers.keys()], log, now: () => now };
}

function makeGate() {
  const pending = new Map();
  let seq = 0;
  const api = { open(v) { const id = ++seq; return new Promise((r) => pending.set(id, () => r(v))); } };
  const settleFirst = () => {
    const [id] = pending.keys();
    if (id === undefined) return false;
    const f = pending.get(id); pending.delete(id); f(); return true;
  };
  return { api, settleFirst, pending: () => [...pending.keys()] };
}

const CHECKS = {
  async fo(fn) {
    const fails = [];
    const cases = [
      [{ a: 1, d: 30 }, { a: 2, d: 10 }, { a: 3, d: 20 }],                 // distinct
      [{ a: 1, d: 10 }, { a: 2, d: 10 }, { a: 3, d: 5 }],                  // a tie
      [{ a: 1, d: 7 }, { a: 2, d: 7 }, { a: 3, d: 7 }],                    // all tied
      [{ a: 1, d: 0 }, { a: 2, d: 5 }, { a: 3, d: 0 }],                    // zero delays, tied
    ];
    for (const c of cases) {
      const events = c.map((e) => ({ value: e.a, delay: e.d }));
      const clock = makeClock();
      let done = false, out;
      Promise.resolve(fn(events, clock.api)).then((v) => { done = true; out = v; },
                                                  (e) => { done = true; out = { __throw: e.message }; });
      await drain();
      const armedUpFront = clock.pending().length;
      // Advance virtual time to exhaustion.
      for (let guard = 0; guard < 200 && clock.pending().length; guard++) { clock.fireNext(); await drain(); }
      await drain();

      // Stable sort by delay, ties by array position — the contract's ordering.
      const want = J(events.map((e, i) => ({ e, i }))
        .sort((x, y) => x.e.delay - y.e.delay || x.i - y.i).map((x) => x.e.value));
      const label = `delays=${J(c.map((e) => e.d))}`;
      if (!done) { fails.push(`${label}: never resolved (timers exhausted, promise still pending)`); continue; }
      if (J(out) !== want) {
        const tie = new Set(c.map((e) => e.d)).size < c.length;
        fails.push(`${label}: got ${J(out)}, want ${want}`
          + (tie ? ' — TIE BROKEN WRONG: equal delays must fire in array order' : ''));
      }
      const armed = clock.log.filter((l) => l.startsWith('armed')).length;
      const fired = clock.log.filter((l) => l.startsWith('fired')).length;
      const cleared = clock.log.filter((l) => l.startsWith('cleared')).length;
      if (armed !== events.length) {
        fails.push(`${label}: armed ${armed} timer(s) for ${events.length} event(s)`
          + (armed === 0 ? ' — SORTED INSTEAD OF SCHEDULING: the result is right and the unit is not this unit' : ''));
      }
      if (armedUpFront !== events.length && armed === events.length) {
        fails.push(`${label}: armed lazily (${armedUpFront} up front) — delays are relative to the call, not to each other`);
      }
      if (fired !== armed) fails.push(`${label}: ${armed} armed but ${fired} fired`);
      if (cleared) fails.push(`${label}: cleared ${cleared} timer(s) — this unit clears none`);
    }
    const clock = makeClock();
    const empty = await fn([], clock.api);
    if (J(empty) !== '[]') fails.push(`empty events -> ${J(empty)}, want []`);
    if (clock.log.length) fails.push(`empty events touched the clock: ${J(clock.log)}`);
    return fails;
  },

  async rto(fn) {
    const fails = [];

    // Path 1 — the gate wins. This is where the leak lives: the value is right
    // either way, so only the lifecycle channel can tell the two apart.
    {
      const clock = makeClock(), gate = makeGate();
      let out, done = false;
      Promise.resolve(fn(gate.api, 50, clock.api)).then((v) => { done = true; out = v; },
                                                        (e) => { done = true; out = { __throw: e.message }; });
      await drain();
      const armed = clock.log.filter((l) => l.startsWith('armed')).length;
      if (armed !== 1) fails.push(`gate-wins: armed ${armed} timer(s) before awaiting, want exactly 1`);
      if (!gate.pending().length) fails.push('gate-wins: never called gate.open');
      gate.settleFirst();
      await drain(); await drain();
      if (!done) fails.push('gate-wins: did not resolve after the gate settled');
      if (J(out) !== J({ ok: 'work' })) fails.push(`gate-wins: got ${J(out)}, want ${J({ ok: 'work' })}`);
      if (clock.pending().length) {
        fails.push(`gate-wins: TIMER LEAKED — still armed at return (${J(clock.log)}). `
          + 'Invisible in the return value; the resource outlives the work it guarded.');
      }
    }

    // Path 2 — the timer wins.
    {
      const clock = makeClock(), gate = makeGate();
      let out, done = false;
      Promise.resolve(fn(gate.api, 50, clock.api)).then((v) => { done = true; out = v; },
                                                        (e) => { done = true; out = { __throw: e.message }; });
      await drain();
      if (!clock.pending().length) { fails.push('timeout: no timer armed to fire'); return fails; }
      clock.fireNext();
      await drain(); await drain();
      if (!done) fails.push('timeout: did not resolve when the timer fired');
      if (J(out) !== J({ timedOut: true })) fails.push(`timeout: got ${J(out)}, want ${J({ timedOut: true })}`);
      if (clock.now() !== 50) fails.push(`timeout: fired at virtual t=${clock.now()}, want 50`);
      // Must not still be waiting on the gate.
      const before = done;
      gate.settleFirst(); await drain();
      if (!before) fails.push('timeout: waited for the gate after timing out');
      if (out && 'ok' in out && 'timedOut' in out) fails.push(`timeout: result carries BOTH keys: ${J(out)}`);
    }
    return fails;
  },
};

const DIR = process.argv[2] ?? 'emissions-clock';
console.log(`\n  grading ${DIR}/ — cold emitters, SIR only, no schema and no fragments\n`);
const files = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const results = { fo: [], rto: [] };
for (const f of files) {
  const kind = f.startsWith('fo') ? 'fo' : 'rto';
  let fails;
  try {
    const m = await import(pathToFileURL(`${DIR}/${f}`).href);
    const fn = m.default ?? Object.values(m).find((x) => typeof x === 'function');
    fails = typeof fn === 'function' ? await CHECKS[kind](fn) : ['no callable default export'];
  } catch (e) { fails = [`load/run error: ${e.message}`]; }
  results[kind].push({ f, fails });
  console.log(`  ${f.padEnd(10)} ${fails.length ? 'FAIL' : 'PASS'}${fails.map((x) => `\n      - ${x}`).join('')}`);
}

console.log('');
let allOk = true;
for (const [kind, label] of [['fo', 'fireOrder (scheduler)'], ['rto', 'raceTimeout (lifecycle)']]) {
  const rs = results[kind];
  if (!rs.length) continue;
  const passed = rs.filter((r) => !r.fails.length).length;
  const quorum = passed >= 2;
  console.log(`  ${label.padEnd(24)} quorum ${passed}/${rs.length}  ${quorum ? 'REACHED' : 'NOT REACHED'}`);
  if (!quorum) allOk = false;
}
console.log('');
console.log(allOk
  ? 'PHASE 5 GATE (clock): PASS — cold emitters built scheduler + lifecycle from the SIR alone.'
  : 'PHASE 5 GATE (clock): FAIL — divergence means the CONSTRUCT is under-specified, not that the emitter is weak.');
process.exit(allOk ? 0 : 1);
