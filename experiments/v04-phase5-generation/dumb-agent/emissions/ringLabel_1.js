// ringLabel — token-ring formatting unit.
//
// Formats each element of `items` as "<index>:<item>", one actor per index.
// The token starts with actor 0, circulates in strict index order via
// gate.token.pass(from, to), and is released by the final actor. Only
// actor 0 calls gate.token.take; the final actor calls gate.token.release.
// If `items` is empty, returns [] without touching the gate at all.
export default async function ringLabel(items, gate) {
  const n = items.length;

  if (n === 0) {
    return [];
  }

  const output = new Array(n);

  // Actor 0 acquires the token first.
  await gate.token.take(0);

  for (let i = 0; i < n; i++) {
    // Each actor formats its own item while holding the token.
    output[i] = `${i}:${items[i]}`;

    if (i < n - 1) {
      // Hand the token off to the next actor in the ring.
      await gate.token.pass(i, i + 1);
    } else {
      // Final actor releases the token instead of passing it on.
      await gate.token.release(i);
    }
  }

  return output;
}
