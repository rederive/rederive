export default async function boundedMap(input, concurrency, gate) {
  const length = input.length;
  const result = new Array(length);

  if (length === 0) {
    return result;
  }

  const limit = Math.min(concurrency, length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < length) {
      const i = nextIndex;
      nextIndex = nextIndex + 1;
      result[i] = await gate.open(input[i]);
    }
  }

  const workers = [];
  for (let w = 0; w < limit; w++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return result;
}
