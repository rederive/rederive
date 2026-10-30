/**
 * boundedFilter(array, concurrency, gate) -> Promise<Array<number>>
 *
 * Filters an integer array to retain only even numbers in their original
 * input order, subject to a concurrency bound on in-flight examinations.
 *
 * For each element, this unit awaits gate.open(element) — a harness-owned
 * completion source that resolves with the element unchanged and performs
 * no computation, transformation, or filtering of its own. All domain work
 * (deciding evenness, building the filtered result) is done here.
 *
 * At most min(concurrency, array.length) gate.open() calls may be in
 * flight (awaited but not yet resolved) at any instant. Each element is
 * examined exactly once, regardless of the order in which the gate calls
 * resolve, and the result preserves original relative order of the
 * retained elements.
 */
export default async function boundedFilter(array, concurrency, gate) {
  const n = array.length;

  if (n === 0) {
    return [];
  }

  const limit = Math.min(concurrency, n);
  const isEven = new Array(n);

  // Shared cursor over pending indices. Reading and incrementing it is a
  // single synchronous step (no await in between), so concurrent workers
  // never claim the same index twice even though they interleave via
  // their own awaits on gate.open().
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex;
      if (i >= n) {
        return;
      }
      nextIndex = i + 1;

      const element = array[i];
      const resolved = await gate.open(element);
      isEven[i] = (resolved % 2 === 0);
    }
  }

  const workers = [];
  for (let w = 0; w < limit; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const result = [];
  for (let i = 0; i < n; i++) {
    if (isEven[i]) {
      result.push(array[i]);
    }
  }
  return result;
}
