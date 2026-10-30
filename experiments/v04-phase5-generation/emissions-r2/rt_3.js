export default async function ringToken(items, gate) {
  const n = items.length;
  if (n === 0) {
    return [];
  }

  const result = [];

  // Actor 0 is the only actor that ever calls take(); every actor after it
  // receives the permission via the previous actor's pass(from, to) call.
  await gate.token.take(0);

  for (let i = 0; i < n; i++) {
    // While holding the token, actor i performs its work: appending its
    // item via the gate, which resolves the append.
    result.push(await gate.open(items[i]));

    if (i === n - 1) {
      // Last actor: no one left to pass to, so release the permission
      // exactly once so nothing still holds it when the unit returns.
      await gate.token.release(i);
    } else {
      // Hand the permission to the next actor in ring (index) order.
      await gate.token.pass(i, i + 1);
    }
  }

  return result;
}
