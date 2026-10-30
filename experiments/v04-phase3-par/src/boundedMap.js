// A p-map-shaped unit: map over inputs with a concurrency bound, results keyed by
// INPUT position. Concurrent completions arrive through the injected gate, so the
// harness — not the runtime — decides the order.
export default async function boundedMap(input, concurrency, gate) {
  const results = new Array(input.length);
  let next = 0;
  async function runner() {
    for (;;) {
      const i = next++;
      if (i >= input.length) return;
      results[i] = await gate.open(input[i] * 2);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, runner));
  return results;
}
