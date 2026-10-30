export default function raceTimeout(gate, ms, clock) {
  return new Promise((resolve) => {
    let settled = false;

    const handle = clock.setTimer(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true });
    }, ms);

    Promise.resolve(gate.open("work")).then((value) => {
      if (settled) return;
      settled = true;
      clock.clearTimer(handle);
      resolve({ ok: value });
    });
  });
}
