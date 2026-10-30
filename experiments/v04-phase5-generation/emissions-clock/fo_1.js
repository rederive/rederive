export default function fireOrder(events, clock) {
  return new Promise((resolve) => {
    if (events.length === 0) {
      resolve([]);
      return;
    }

    const result = [];
    let pending = events.length;

    for (const event of events) {
      clock.setTimer(() => {
        result.push(event.value);
        pending -= 1;
        if (pending === 0) {
          resolve(result);
        }
      }, event.delay);
    }
  });
}
