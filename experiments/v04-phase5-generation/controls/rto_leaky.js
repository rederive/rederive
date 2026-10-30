// ADVERSARIAL CONTROL: returns exactly the right value on both paths and never
// clears the timeout timer. This is the canonical lifecycle leak — invisible to
// any check that only looks at what came back.
export default async function raceTimeout(gate, ms, clock) {
  let fire;
  const timeout = new Promise((r) => { fire = r; });
  clock.setTimer(() => fire({ timedOut: true }), ms);
  const won = await Promise.race([gate.open('work').then((v) => ({ ok: v })), timeout]);
  return won;
}
