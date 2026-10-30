export default async function boundedMap(input, concurrency, gate) {
  const result = new Array(input.length);

  if (input.length === 0) {
    return result;
  }

  const limit = Math.max(1, Math.min(concurrency, input.length));
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex;
      if (i >= input.length) {
        return;
      }
      nextIndex = i + 1;

      const value = await gate.open(input[i]);
      result[i] = value * 2;
    }
  }

  const workers = [];
  for (let w = 0; w < limit; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return result;
}
