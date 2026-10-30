export default async function ringLabel(items, gate) {
  const n = items.length;

  if (n === 0) {
    return [];
  }

  const output = [];

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      await gate.token.take(0);
    } else {
      await gate.token.pass(i - 1, i);
      await gate.token.take(i);
    }

    output.push(`${i}:${items[i]}`);
  }

  await gate.token.release(n - 1);

  return output;
}
