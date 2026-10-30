// A BROKEN "ring": deterministic, but it invents an outcome the free unit cannot produce.
export default async function ringAppend(items, gate) {
  const out = [];
  for (const it of [...items].reverse()) out.push(await gate.open(it));
  return out.reverse().map((v) => v + 100);        // and mangles the values
}
