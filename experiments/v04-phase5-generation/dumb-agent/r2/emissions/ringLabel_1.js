/**
 * ringLabel(items, gate) -> Promise<array of strings>
 *
 * Coordinates a ring of actors who process items in sequence. Each actor i
 * holds a single shared token in turn:
 *   1. formats a string as "<i>:<items[i]>"
 *   2. engages gate.token to obtain and relinquish the token
 *   3. contributes the formatted string to the output array
 *
 * Token protocol (RING):
 *   - actor 0 obtains the token via gate.token.take(0)
 *   - each subsequent actor i (i > 0) receives it from actor i-1 via
 *     gate.token.pass(i - 1, i)
 *   - the final actor N-1 releases it via gate.token.release(N - 1)
 *
 * Invariants preserved:
 *   - output has exactly N entries, position i is "<i>:<items[i]>"
 *   - mutual exclusion: at most one actor holds the token at any instant
 *   - exactly one take (actor 0), exactly N-1 pass calls (one per adjacent
 *     pair), exactly one release (actor N-1); no duplication, no loss
 *   - upon return, no actor holds the token
 *   - empty input returns an empty array and calls neither take, pass, nor
 *     release
 */
export default async function ringLabel(items, gate) {
  const n = items.length;
  const out = [];

  if (n === 0) {
    return out;
  }

  await gate.token.take(0);
  out.push(`0:${items[0]}`);

  for (let i = 1; i < n; i++) {
    await gate.token.pass(i - 1, i);
    out.push(`${i}:${items[i]}`);
  }

  await gate.token.release(n - 1);

  return out;
}
