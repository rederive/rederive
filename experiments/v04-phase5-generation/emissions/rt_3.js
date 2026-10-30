export default async function ringToken(items, gate) {
  const result = [];
  const n = items.length;

  if (n === 0) {
    return result;
  }

  await gate.token.take(0);

  for (let i = 0; i < n; i++) {
    await gate.open(items[i]);
    result.push(items[i]);

    if (i < n - 1) {
      await gate.token.pass(i, i + 1);
    } else {
      await gate.token.release(i);
    }
  }

  return result;
}
