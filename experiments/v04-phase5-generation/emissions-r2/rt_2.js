export default async function ringToken(items, gate) {
  const result = [];

  if (items.length === 0) {
    return result;
  }

  // Actor 0 is the only actor that TAKES the token; every subsequent
  // actor receives it via pass(from, to) — never take().
  await gate.token.take(0);

  for (let i = 0; i < items.length; i++) {
    // Actor `i` holds the token here — perform its append while
    // holding the single circulating permission.
    await gate.open(items[i]);
    result.push(items[i]);

    if (i < items.length - 1) {
      // Hand the token to the next actor in the ring.
      await gate.token.pass(i, i + 1);
    } else {
      // Last actor: release exactly once so no one holds it on return.
      await gate.token.release(i);
    }
  }

  return result;
}
