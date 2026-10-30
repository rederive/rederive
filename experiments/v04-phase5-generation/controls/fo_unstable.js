// ADVERSARIAL CONTROL: arms real timers, but breaks ties by reverse arm order.
// Correct whenever no two delays are equal — which is most inputs.
export default function fireOrder(events, clock) {
  return new Promise((resolve) => {
    const out = []; let left = events.length;
    if (!left) return resolve(out);
    [...events].reverse().forEach((e) => {
      clock.setTimer(() => { out.push(e.value); if (--left === 0) resolve(out); }, e.delay);
    });
  });
}
