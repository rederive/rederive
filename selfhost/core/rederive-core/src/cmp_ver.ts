const VERSION = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;

function check(t: string): void {
  if (typeof t !== "string" || !VERSION.test(t)) {
    throw new Error("not a version: " + JSON.stringify(t));
  }
}

export default function cmpVer(a: string, b: string): number {
  check(a);
  check(b);
  const x = a.split(".");
  const y = b.split(".");
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = i < x.length ? BigInt(x[i]) : 0n;
    const q = i < y.length ? BigInt(y[i]) : 0n;
    if (p < q) return -1;
    if (p > q) return 1;
  }
  return 0;
}

export { cmpVer };
