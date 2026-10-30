// ADVERSARIAL CONTROL: clears correctly, but arms the timer only AFTER awaiting
// the gate — so the timeout is not actually racing anything.
export default async function raceTimeout(gate, ms, clock) {
  const v = await gate.open('work');
  const h = clock.setTimer(() => {}, ms);
  clock.clearTimer(h);
  return { ok: v };
}
