// BROKEN: keys results by COMPLETION order instead of input position. Correct on
// any single schedule where completions happen to arrive in order — wrong the
// moment the interleaving differs. Exactly the bug one sampled run misses.
export default async function boundedMap(input, concurrency, gate) {
  const results = [];
  let next = 0;
  async function runner() {
    for (;;) {
      const i = next++;
      if (i >= input.length) return;
      results.push(await gate.open(input[i] * 2));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, input.length) }, runner));
  return results;
}
