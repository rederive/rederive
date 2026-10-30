/**
 * boundedFilter(array, concurrency, gate) -> Promise<array>
 *
 * Filters `array` down to the elements for which the caller-supplied
 * `gate.open(element)` resolves truthy, preserving original input order.
 *
 * Gate invocations run concurrently but are bounded: at most
 * min(concurrency, array.length) calls to gate.open are in flight
 * (i.e. called but not yet resolved) at any instant. Each element is
 * tested exactly once. Results are collected by input position and the
 * output is assembled in original array order, not completion order.
 *
 * If the input array is empty, the output is an empty array and the
 * gate is never invoked.
 */
export default async function boundedFilter(array, concurrency, gate) {
  if (array.length === 0) {
    return [];
  }

  const limit = Math.min(concurrency, array.length);
  const passed = new Array(array.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < array.length) {
      const i = nextIndex;
      nextIndex += 1;
      const result = await gate.open(array[i]);
      passed[i] = Boolean(result);
    }
  }

  const workers = [];
  for (let w = 0; w < limit; w += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const output = [];
  for (let i = 0; i < array.length; i += 1) {
    if (passed[i]) {
      output.push(array[i]);
    }
  }
  return output;
}
