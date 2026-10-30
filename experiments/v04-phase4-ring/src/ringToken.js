// SOUND: the token circulates and comes home.
export default async function ringToken(items, gate) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    i === 0 ? gate.token.take(i) : gate.token.pass(i - 1, i);
    out.push(await gate.open(items[i]));
  }
  gate.token.release(items.length - 1);
  return out;
}
