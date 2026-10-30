/**
 * boundedFilter(array, concurrency, gate) -> Promise<Array<number>>
 *
 * Filters an integer array to retain only even numbers, in original input
 * order, subject to a concurrency bound.
 *
 * For each element, the unit "examines" it by awaiting gate.open(element).
 * gate.open is a harness-owned completion source: it resolves with the
 * element unchanged and performs no computation, transformation, or
 * filtering of its own. All domain work (deciding evenness, building the
 * filtered result in original order) is done by this unit.
 *
 * At most min(concurrency, array.length) gate.open() calls may be in
 * flight (awaited but not yet resolved) at any instant. Examinations are
 * independent and may resolve in any order; the harness interleaves them.
 */
export default async function boundedFilter(array, concurrency, gate) {
  const n = array.length;

  if (n === 0) {
    return [];
  }

  // The invariant requires at most min(concurrency, array.length) gate
  // calls in flight simultaneously. Guard against non-positive concurrency
  // so the pool can still make progress (a degenerate cap of 0 or less
  // would never resolve any examination and could never satisfy "each
  // input element is examined exactly once").
  const limit = Math.min(Math.max(concurrency, 1), n);

  const included = new Array(n).fill(false);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex;
      if (i >= n) {
        return;
      }
      nextIndex += 1;

      const element = array[i];
      // The examination is in flight from the instant this is awaited
      // until it resolves. gate.open performs no computation itself; the
      // unit determines evenness below.
      await gate.open(element);
      included[i] = element % 2 === 0;
    }
  }

  const workers = [];
  for (let w = 0; w < limit; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const result = [];
  for (let i = 0; i < n; i++) {
    if (included[i]) {
      result.push(array[i]);
    }
  }
  return result;
}
