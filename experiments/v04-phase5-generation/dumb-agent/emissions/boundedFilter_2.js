/**
 * boundedFilter(array, concurrency, gate) -> Promise<array>
 *
 * Returns only the elements from `array` for which the caller-supplied
 * `gate.open(element)` resolves to a truthy value, preserving the original
 * input order. Each element is examined exactly once. At most
 * min(concurrency, array.length) gate.open calls are in flight at any
 * instant; the gate function itself decides pass/fail, this unit only
 * schedules the concurrent examinations and reassembles the result in
 * input order.
 */
export default async function boundedFilter(array, concurrency, gate) {
  const n = array.length;
  if (n === 0) {
    return [];
  }

  const limit = Math.min(concurrency, n);
  const passed = new Array(n);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex;
      if (i >= n) {
        break;
      }
      nextIndex = i + 1;
      passed[i] = await gate.open(array[i]);
    }
  }

  const workers = [];
  for (let w = 0; w < limit; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const output = [];
  for (let i = 0; i < n; i++) {
    if (passed[i]) {
      output.push(array[i]);
    }
  }
  return output;
}
