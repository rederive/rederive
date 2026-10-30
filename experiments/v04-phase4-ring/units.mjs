// §22 fixtures — the same work, coordinated three ways.
//
// A RING is a single circulating permission: only the token-holder acts. That
// collapses the interleaving space to one schedule per token order (a fixed
// rotation is ONE schedule, verified in O(1)).
//
// The property that makes it sound is a refinement relation: R_ring ⊆ R_free.
// Every ring run must be a run the free unit could also have produced — a ring
// may DROP outcomes, never INVENT one.

/** FREE, shared cursor: writers append in completion order. Genuinely racy. */
export async function sharedAppendFree(items, gate) {
  const out = [];
  await Promise.all(items.map(async (it) => { out.push(await gate.open(it)); }));
  return out;
}

/** RING, shared cursor: the token circulates in index order — one outcome. */
export async function sharedAppendRing(items, gate) {
  const out = [];
  for (const it of items) out.push(await gate.open(it));   // token passes 0,1,2,…
  return out;
}

/** FREE, independent slots: each writer owns its index — already deterministic. */
export async function ownSlotFree(items, gate) {
  const out = new Array(items.length);
  await Promise.all(items.map(async (it, i) => { out[i] = await gate.open(it); }));
  return out;
}

/** RING, independent slots: same work, token-ordered. Should PRESERVE behavior. */
export async function ownSlotRing(items, gate) {
  const out = new Array(items.length);
  for (let i = 0; i < items.length; i++) out[i] = await gate.open(items[i]);
  return out;
}

/** A BROKEN "ring" — it reverses. Deterministic, but it produces an outcome the
 *  free unit cannot: NOT a refinement, and the subset check must catch it. */
export async function sharedAppendRingBroken(items, gate) {
  const out = [];
  for (const it of [...items].reverse()) out.push(await gate.open(it));
  return out.reverse().map((v) => v + 100);        // and mangles the values
}
