/**
 * ringLabel — token-ring formatter.
 *
 * Takes an array of items and produces an array of formatted strings, one
 * per item. Conceptually, n actors (indexed 0..n-1) circulate a token:
 * actor 0 takes it first, formats its own item as "<index>:<item>", and
 * passes the token to actor 1; actor i (0 < i < n-1) receives the token
 * from actor i-1, formats its item, and passes to actor i+1; actor n-1
 * receives the token, formats its item, and releases it.
 *
 * The gate supplies mutual exclusion only — gate.token.take(who) to
 * acquire, gate.token.pass(from, to) to hand off, gate.token.release(who)
 * to release. The unit itself computes the "<index>:<item>" formatting.
 *
 * Actors acquire the token in strict index order: actor i+1 must not call
 * gate.token.take until actor i has called gate.token.pass(i, i+1). This
 * is enforced structurally here by running the ring as a sequential
 * await-chain (one actor's full take -> format -> pass/release cycle
 * completes before the next actor's take is ever invoked), so at most one
 * actor ever holds the token and the acquisition order is guaranteed by
 * construction rather than by racing on the gate.
 *
 * If items is empty, returns an empty array without touching gate.token
 * at all (no take/pass/release calls).
 *
 * @param {Array} items
 * @param {{ token: { take: Function, pass: Function, release: Function } }} gate
 * @returns {Promise<string[]>} output[i] === "<i>:<items[i]>" for all i
 */
export default async function ringLabel(items, gate) {
  const n = items.length;

  if (n === 0) {
    return [];
  }

  const output = new Array(n);

  for (let i = 0; i < n; i++) {
    await gate.token.take(i);

    output[i] = `${i}:${items[i]}`;

    if (i === n - 1) {
      await gate.token.release(i);
    } else {
      await gate.token.pass(i, i + 1);
    }
  }

  return output;
}
