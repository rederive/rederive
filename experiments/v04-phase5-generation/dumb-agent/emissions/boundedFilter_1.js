// boundedFilter(array, concurrency, gate) -> Promise<array>
//
// Filters `array` down to the elements for which the caller-supplied
// `gate.open(element)` resolves truthy, preserving the original input
// order in the output. Each element is tested exactly once. At most
// min(concurrency, array.length) gate.open calls are in flight
// (awaiting resolution) at any instant; the gate itself decides
// pass/fail, this function only schedules and collects.

export default async function boundedFilter(array, concurrency, gate) {
  if (!array || array.length === 0) {
    return [];
  }

  const limit = Math.min(concurrency, array.length);
  const passed = new Array(array.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= array.length) {
        return;
      }
      const element = array[index];
      const result = await gate.open(element);
      passed[index] = Boolean(result);
    }
  }

  const workers = [];
  for (let i = 0; i < limit; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const output = [];
  for (let i = 0; i < array.length; i++) {
    if (passed[i]) {
      output.push(array[i]);
    }
  }
  return output;
}
