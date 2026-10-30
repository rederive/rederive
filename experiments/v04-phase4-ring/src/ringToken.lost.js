// LOST: the last holder never releases.
export default async function ringToken(items, gate) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    i === 0 ? gate.token.take(i) : gate.token.pass(i - 1, i);
    out.push(await gate.open(items[i]));
  }
  return out;                                    // <-- no release
}
