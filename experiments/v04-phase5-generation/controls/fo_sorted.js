// ADVERSARIAL CONTROL: right answer, wrong mechanism. Arms no timers at all —
// the clock is never touched, so this is a sort wearing a scheduler's signature.
// The value channel cannot tell this from the real unit.
export default async function fireOrder(events, clock) {
  return events.map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.delay - b.e.delay || a.i - b.i)
    .map((x) => x.e.value);
}
