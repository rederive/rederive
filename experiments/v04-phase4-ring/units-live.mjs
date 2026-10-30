// Ring units exercising the token explicitly — one correct, two broken in the
// exactly two ways a ring can break.

/** CORRECT: the token circulates and comes home. */
export async function ringSound(items, gate, token) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    i === 0 ? token.take(i) : token.pass(i - 1, i);
    out.push(await gate.open(items[i]));
  }
  token.release(items.length - 1);
  return out;
}

/** LOST: the last holder never releases — the permission never comes back. */
export async function ringLost(items, gate, token) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    i === 0 ? token.take(i) : token.pass(i - 1, i);
    out.push(await gate.open(items[i]));
  }
  return out;                                    // <-- no release
}

/** DUPLICATED: every actor takes the token instead of receiving it, so two hold
 *  it at once. The output can still look right — the determinism was luck. */
export async function ringDuplicated(items, gate, token) {
  const out = [];
  for (let i = 0; i < items.length; i++) {
    token.take(i);                               // <-- take, never pass
    out.push(await gate.open(items[i]));
  }
  for (let i = 0; i < items.length; i++) token.release(i);
  return out;
}
