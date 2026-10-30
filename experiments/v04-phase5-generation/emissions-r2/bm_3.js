export default async function boundedMap(input, concurrency, gate) {
  const result = new Array(input.length);

  const workerCount = Math.min(concurrency, input.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < input.length) {
      const i = nextIndex;
      nextIndex += 1;

      // gate.open is purely a completion source: it hands back the exact
      // value it was given, unchanged. The doubling below is this unit's
      // own work, not the gate's.
      const value = await gate.open(input[i]);
      result[i] = value * 2;
    }
  }

  const workers = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return result;
}
