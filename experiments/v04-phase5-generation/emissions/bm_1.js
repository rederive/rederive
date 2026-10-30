export default async function boundedMap(input, concurrency, gate) {
  const length = input.length;
  const result = new Array(length);

  if (length === 0) {
    return result;
  }

  const effectiveConcurrency = Math.min(concurrency, length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < length) {
      const index = nextIndex;
      nextIndex += 1;
      const mapped = await gate.open(input[index]);
      result[index] = mapped;
    }
  }

  const workers = [];
  for (let i = 0; i < effectiveConcurrency; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return result;
}
