// DUPLICATED: every actor takes instead of receiving.
export default async function ringToken(items, gate) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    gate.token.take(i);                               // <-- take, never pass
    out.push(await gate.open(items[i]));
  }
  for (let i = 0; i < items.length; i++) gate.token.release(i);
  return out;
}
