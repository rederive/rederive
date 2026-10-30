// The unit under test, in two versions — an analogue of `request`'s redirect
// timeout, which is §21's cited evidence.
//
// `fetchWithTimeout(url, ms, caps)` races a request against a timeout:
//   - the request settles first  -> resolve with the body, CANCEL the timer
//   - the timeout fires first    -> reject with a timeout error
//
// Both versions below are CORRECT on value and CORRECT on order. They differ by
// one line: whether the armed timer is cleared on the happy path.

/** CORRECT — clears the timer once the request wins the race. */
export function fetchWithTimeout(url, ms, caps) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const id = caps.timers.setTimer(() => {
      if (settled) return;
      settled = true;
      caps.emit({ op: 'timeout', url });
      reject(new Error(`timeout after ${ms}ms`));
    }, ms);

    caps.emit({ op: 'request', url });
    caps.request(url, (err, body) => {
      if (settled) return;
      settled = true;
      caps.timers.clearTimer(id);              // <-- THE LINE
      caps.emit({ op: 'response', url });
      err ? reject(err) : resolve(body);
    });
  });
}

/** LEAKY — identical, minus the clearTimer. A real, common bug. */
export function fetchWithTimeoutLeaky(url, ms, caps) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const id = caps.timers.setTimer(() => {
      if (settled) return;                     // the leaked timer still fires —
      settled = true;                          // and is a NO-OP on settled state,
      caps.emit({ op: 'timeout', url });       // which is exactly why value+trace
      reject(new Error(`timeout after ${ms}ms`)); // cannot see it
    }, ms);

    caps.emit({ op: 'request', url });
    caps.request(url, (err, body) => {
      if (settled) return;
      settled = true;
                                               // <-- the missing clearTimer
      caps.emit({ op: 'response', url });
      err ? reject(err) : resolve(body);
    });
  });
}
