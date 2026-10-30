/**
 * boundedFilter(array, concurrency, gate) -> Promise<Array<number>>
 *
 * Filters an integer array to retain only even numbers, preserving their
 * original input order, subject to a concurrency bound on the number of
 * in-flight examinations.
 *
 * For each element, evenness is examined by awaiting gate.open(element).
 * gate.open is a harness-owned completion source: it resolves with the
 * element unchanged and performs no computation, transformation, or
 * filtering itself. All domain work (the evenness check and the filtering
 * decision) is performed by this unit.
 *
 * At most min(concurrency, array.length) gate.open() calls are in flight
 * (awaited but not yet resolved) at any instant. Each input element is
 * examined exactly once, regardless of the order in which the gate.open()
 * calls resolve. For an empty input array, the result is an empty array
 * and no gate.open() calls are made.
 */
export default async function boundedFilter(array, concurrency, gate) {
  const n = array.length;
  if (n === 0) {
    return [];
  }

  const limit = Math.min(concurrency, n);
  const isEven = new Array(n);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const i = nextIndex;
      nextIndex = nextIndex + 1;
      if (i >= n) {
        return;
      }
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
