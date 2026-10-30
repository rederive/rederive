// ringToken — single circulating-permission ("token") ring coordinator.
//
// Appends each item of `items` to a result array, coordinating access
// through one circulating token so that only one actor acts at a time.
// Actors are identified by their index in `items` (0, 1, 2, ...).
//
// Ring protocol:
//   - actor 0 acquires the token via gate.token.take(0)
//   - every later actor i receives the token via the previous actor's
//     gate.token.pass(i - 1, i) call — later actors never call take()
//   - the last actor releases the token via gate.token.release(lastIndex)
//     instead of passing it on, so the permission is released exactly
//     once, at the end, and is not held when the unit returns
//
// Each actor performs its append while holding the token by awaiting
// gate.open(item); the resolved value is what gets appended to the
// result array, preserving index order.
//
// An empty items array returns [] and touches neither gate.open nor
// gate.token at all.
export default async function ringToken(items, gate) {
  if (items.length === 0) {
    return [];
  }

  const result = [];
  const lastIndex = items.length - 1;

  // Actor 0 is the only actor that ever calls take().
  await gate.token.take(0);

  for (let i = 0; i <= lastIndex; i++) {
    // Actor i currently holds the token (either via take(0) above, or
    // via the previous iteration's pass(i - 1, i)). Act while holding it.
    const opened = await gate.open(items[i]);
    result.push(opened);

    if (i < lastIndex) {
      // Hand the token to the next actor in ring order.
      await gate.token.pass(i, i + 1);
    } else {
      // Last actor: release, never pass. No actor holds the token after this.
      await gate.token.release(i);
    }
  }

  return result;
}
