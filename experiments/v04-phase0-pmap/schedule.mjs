// The §19 core: OWN the completion order, then explore the space of interleavings.
//
// A concurrency unit's mappers settle in an order the wall clock picks. To verify
// over interleavings we have to take that choice away from the runtime: every
// mapper returns a deferred WE resolve, so a "schedule" is just the sequence of
// decisions about which in-flight item settles next. A run is then a replayable
// function of a decision list — which is what makes exhaustive exploration and
// partial-order reduction possible at all.
const settle = () => new Promise((r) => setImmediate(r));

/**
 * Drive `pMap` once, following `decisions` (index into the candidate list at each
 * step; missing/overflow entries take candidate 0). Returns the observed result,
 * the max in-flight count, the completion order, and the BRANCHING FACTOR at each
 * step — the branch counts are what the explorer enumerates over.
 */
export async function runSchedule(pMap, { input, concurrency, decisions = [] }) {
  const pending = new Map();              // index -> resolve
  const order = [], branches = [];
  let maxInFlight = 0, started = 0;

  const mapper = (item, index) => new Promise((resolve) => {
    pending.set(index, () => resolve(item * 2));
    started++;
    if (pending.size > maxInFlight) maxInFlight = pending.size;
  });

  const done = pMap(input, mapper, { concurrency });
  let step = 0;
  while (true) {
    await settle();                        // let pMap start whatever it will
    const candidates = [...pending.keys()];
    if (!candidates.length) break;
    branches.push(candidates.length);      // the decision point
    const pick = candidates[Math.min(decisions[step] ?? 0, candidates.length - 1)];
    step++;
    const resolve = pending.get(pick);
    pending.delete(pick);
    order.push(pick);
    resolve();
  }
  return { result: await done, maxInFlight, order, branches, started };
}

/**
 * Enumerate EVERY reachable completion order by DFS over the decision tree,
 * discovering each step's branching factor by replay. Bounded by `cap`: when the
 * space is larger, exploration stops and the caller reports `exhaustive: false`
 * — a truthful partial claim, never a silent one.
 */
export async function explore(pMap, { input, concurrency, cap = 5000 }) {
  const seen = [];
  let truncated = false;

  async function walk(prefix) {
    if (seen.length >= cap) { truncated = true; return; }
    const run = await runSchedule(pMap, { input, concurrency, decisions: prefix });
    if (prefix.length >= run.branches.length) { seen.push(run); return; }
    const width = run.branches[prefix.length];
    for (let i = 0; i < width; i++) await walk([...prefix, i]);
  }
  await walk([]);
  return { runs: seen, exhaustive: !truncated, count: seen.length };
}

/** Size of the interleaving space, without enumerating it (product of branch factors). */
export function spaceSize(input, concurrency) {
  const n = input.length, c = Math.min(concurrency, n);
  let size = 1n;
  for (let settled = 0; settled < n; settled++) {
    const inFlight = Math.min(c, n - settled);
    size *= BigInt(inFlight);
  }
  return size;
}
