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
      const i = nextIndex++;
      const value = input[i];
      await gate.open(value);
      result[i] = value * 2;
    }
  }

  const workers = [];
  for (let k = 0; k < limit; k++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return result;
}
