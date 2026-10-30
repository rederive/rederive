export default async function ringToken(items, gate) {
  if (items.length === 0) {
    return [];
  }

  const result = [];
  const token = gate.token;

  await token.take(0);
  result.push(await gate.open(items[0]));

  for (let i = 1; i < items.length; i++) {
    await token.pass(i - 1, i);
    result.push(await gate.open(items[i]));
  }

  await token.release(items.length - 1);

  return result;
}
