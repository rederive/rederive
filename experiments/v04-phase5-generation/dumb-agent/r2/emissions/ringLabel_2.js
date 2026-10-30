/**
 * ringLabel — coordinates a ring of actors who process items in sequence.
 *
 * Each actor i (0-based) formats the string "<i>:<items[i]>", takes part in
 * the token ring protocol, and contributes its formatted string to the
 * output array at position i.
 *
 * Token ring protocol:
 *   - Actor 0 obtains the token via gate.token.take(0).
 *   - Each subsequent actor i (i > 0) obtains the token from the previous
 *     actor via gate.token.pass(i - 1, i).
 *   - The final actor (index N - 1) releases the token via
 *     gate.token.release(N - 1).
 *   - For an empty input array, no take/pass/release calls are made and an
 *     empty array is returned.
 *
 * @param {Array} items - the items to label, one per actor.
 * @param {Object} gate - synchronization gate exposing a `token` object
 *   with take(idx), pass(fromIdx, toIdx), and release(idx) methods.
 * @returns {Promise<string[]>} an array of formatted "<i>:<items[i]>" strings,
 *   in input order.
 */
export default async function ringLabel(items, gate) {
  const n = items.length;
  const output = [];

  if (n === 0) {
    return output;
  }

  for (let i = 0; i < n; i++) {
    const formatted = `${i}:${items[i]}`;

    if (i === 0) {
      await gate.token.take(0);
    } else {
      await gate.token.pass(i - 1, i);
    }

    if (i === n - 1) {
      await gate.token.release(i);
    }

    output.push(formatted);
  }

  return output;
}
