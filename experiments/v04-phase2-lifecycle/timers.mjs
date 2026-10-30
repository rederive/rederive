// The injectable TIMER BOUNDARY — §20's timer half, which §21 needs in order to
// see anything at all.
//
// A unit that arms a cancellable resource cannot be audited from outside: once
// `setTimeout` is the runtime's, nobody can tell whether the handle was ever
// cleared. So the harness OWNS the timer API and records every transition:
//
//     armed(id, ms) -> fired(id) | cancelled(id)
//
// Time does not pass by itself here. `advance(ms)` fires what is due, which is
// what makes a timer race a deterministic, replayable function of the timeline
// rather than a wall-clock coin flip.
export function makeTimers() {
  const events = [];                       // the LIFECYCLE CHANNEL, in order
  const live = new Map();                  // id -> { due, fn }
  let now = 0, nextId = 1;

  const api = {
    setTimer(fn, ms) {
      const id = nextId++;
      live.set(id, { due: now + ms, fn });
      events.push({ op: 'armed', id, ms });
      return id;
    },
    clearTimer(id) {
      if (!live.has(id)) return false;     // clearing a dead timer is a no-op, not a lie
      live.delete(id);
      events.push({ op: 'cancelled', id });
      return true;
    },
    now: () => now,
  };

  /** Advance virtual time, firing everything due in order. */
  function advance(ms) {
    const target = now + ms;
    for (;;) {
      const due = [...live.entries()].filter(([, t]) => t.due <= target)
        .sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      if (!due.length) { now = target; return; }
      const [id, t] = due[0];
      now = t.due;
      live.delete(id);
      events.push({ op: 'fired', id });
      t.fn();
    }
  }

  /** What the unit left behind: any timer still armed is a LEAK. */
  const leaked = () => [...live.keys()];

  return { api, advance, events, leaked };
}

/** The lifecycle summary a contract asserts against. */
export function lifecycle({ events, leaked }) {
  return {
    events: events.map((e) => (e.op === 'armed' ? `armed(${e.ms}ms)` : `${e.op}`)),
    armed: events.filter((e) => e.op === 'armed').length,
    fired: events.filter((e) => e.op === 'fired').length,
    cancelled: events.filter((e) => e.op === 'cancelled').length,
    leaked: leaked().length,
  };
}
