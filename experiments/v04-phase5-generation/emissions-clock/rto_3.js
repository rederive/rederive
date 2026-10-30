export default function raceTimeout(gate, ms, clock) {
  return new Promise((resolve) => {
    let settled = false;

    // Arm the single timer before anything else happens.
    const handle = clock.setTimer(() => {
      if (settled) return;
      settled = true;
      // Timer fired first: nothing to clear, do not wait for the gate.
      resolve({ timedOut: true });
    }, ms);

    // Start waiting on the gate. The harness controls when/how this
    // resolves; we only react to it, we never resolve it ourselves.
    gate.open("work").then((value) => {
      if (settled) return;
      settled = true;
      // Gate won: disarm the timer before returning to avoid a leak.
      clock.clearTimer(handle);
      resolve({ ok: value });
    });
  });
}
