// §20 — the SCHEDULER as a control effect: timers AND microtasks on virtual time.
//
// §21 took the timer half (arm/cancel/fire). This adds the other half: deferred
// work. A clock READ is a point value you can inject like any input; SCHEDULING
// is different — it decides *when deferred work runs relative to everything
// else*, which is what makes a timer race a race.
//
// Draining rule, matching real event-loop semantics but deterministically:
// microtasks run to exhaustion BEFORE each timer callback and again AFTER it, so
// "the reply's .then chain settles before the timeout fires" is a fact about the
// timeline the harness scripted — not about how busy the machine was.
export function makeScheduler() {
  const events = [];                       // lifecycle channel (§21)
  const live = new Map();                  // id -> { due, fn }
  const micro = [];                        // the microtask queue
  let now = 0, nextId = 1, drained = 0;

  const api = {
    setTimer(fn, ms) { const id = nextId++; live.set(id, { due: now + ms, fn }); events.push({ op: 'armed', id, ms }); return id; },
    clearTimer(id) { if (!live.has(id)) return false; live.delete(id); events.push({ op: 'cancelled', id }); return true; },
    schedule(fn) { micro.push(fn); },      // the microtask half
    now: () => now,
  };

  /** Run queued microtasks to exhaustion (work queued while draining also runs). */
  function drain(cap = 10000) {
    let n = 0;
    while (micro.length) {
      if (++n > cap) throw new Error('microtask queue did not settle — a scheduling loop');
      micro.shift()();
      drained++;
    }
  }

  function advance(ms) {
    const target = now + ms;
    for (;;) {
      drain();                                                   // settle before deciding
      const due = [...live.entries()].filter(([, t]) => t.due <= target)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      if (!due.length) { now = target; drain(); return; }
      const [id, t] = due[0];
      now = t.due;
      live.delete(id);
      events.push({ op: 'fired', id });
      t.fn();
      drain();                                                   // and settle after
    }
  }

  const channel = () => ({
    events: events.map((e) => (e.op === 'armed' ? `armed(${e.ms}ms)` : e.op)),
    leaked: live.size,
  });
  return { api, advance, drain, channel, stats: () => ({ drained }) };
}
