// §22 LIVENESS — the two failure modes a ring introduces, made observable.
//
// The refinement check (R_ring ⊆ R_free) is a SAFETY property: the ring invents
// no outcome the original couldn't produce. It says nothing about whether the
// ring keeps moving. A ring has exactly two ways to fail, and neither is visible
// to an outcome-set comparison:
//
//   TOKEN LOST       nobody holds the permission -> the unit halts. A halted run
//                    produces no outcome at all, so comparing outcome SETS sees
//                    an empty set, not a bug.
//   TOKEN DUPLICATED two actors hold it at once -> the ring silently degenerates
//                    into the free unit, and its determinism was a coincidence
//                    of the schedule you happened to explore.
//
// Same shape as §21's resource lifecycle: `armed -> fired | cancelled` becomes
// `held -> passed | released`.
export function makeToken() {
  const events = [];
  const holders = new Set();
  let maxConcurrent = 0;

  const api = {
    take(who) {
      holders.add(who);
      if (holders.size > maxConcurrent) maxConcurrent = holders.size;
      events.push({ op: 'held', who });
    },
    pass(from, to) {
      holders.delete(from); holders.add(to);
      if (holders.size > maxConcurrent) maxConcurrent = holders.size;
      events.push({ op: 'passed', from, to });
    },
    release(who) { holders.delete(who); events.push({ op: 'released', who }); },
  };

  const channel = () => ({
    events: events.map((e) => (e.op === 'passed' ? `passed(${e.from}->${e.to})` : `${e.op}(${e.who})`)),
    maxConcurrentHolders: maxConcurrent,     // > 1 == DUPLICATED
    stillHeld: [...holders],                 // non-empty == LOST (or never returned)
    mutualExclusion: maxConcurrent <= 1,
    returned: holders.size === 0,
  });
  return { api, channel };
}
