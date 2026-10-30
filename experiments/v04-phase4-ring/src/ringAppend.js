// RING: the token circulates in index order — one schedule, one outcome.
export default async function ringAppend(items, gate) {
  const out = [];
  for (const it of items) out.push(await gate.open(it));   // token passes 0,1,2,…
  return out;
}
