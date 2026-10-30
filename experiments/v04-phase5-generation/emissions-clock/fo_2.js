export default function fireOrder(events, clock) {
  return new Promise((resolve) => {
    if (!events || events.length === 0) {
      resolve([]);
      return;
    }

    const results = [];
    let remaining = events.length;

    for (const event of events) {
      clock.setTimer(() => {
        results.push(event.value);
        remaining -= 1;
        if (remaining === 0) {
          resolve(results);
        }
      }, event.delay);
    }
  });
}
