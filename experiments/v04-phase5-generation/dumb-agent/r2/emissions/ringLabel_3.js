// ringLabel — ring-based token relay coordinator.
//
// A ring of N actors (one per input item) pass a single token around in
// sequence. Actor 0 takes the token first (gate.token.take(0)); each
// subsequent actor i receives it from actor i-1 via gate.token.pass(i-1, i);
// the final actor releases it via gate.token.release(N-1). Each actor i
// formats "<i>:<items[i]>" and contributes it to the output array at
// position i. For empty input, no token calls are made and an empty array
// is returned immediately.

export default async function ringLabel(items, gate) {
  const n = items.length;

  if (n === 0) {
    return [];
  }

  const output = new Array(n);

  for (let i = 0; i < n; i++) {
    if (i === 0) {
      await gate.token.take(0);
    } else {
      await gate.token.pass(i - 1, i);
    }

    output[i] = `${i}:${items[i]}`;

    if (i === n - 1) {
      await gate.token.release(i);
    }
  }

  return output;
}
