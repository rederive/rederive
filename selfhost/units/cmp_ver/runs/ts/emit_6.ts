const VERSION = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;

function check(t: string): void {
  if (typeof t !== "string" || !VERSION.test(t)) {
    throw new Error("not a version: " + JSON.stringify(t));
  }
}

export function cmpVer(a: string, b: string): number {
  check(a);
  check(b);
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = i < pa.length ? BigInt(pa[i]) : BigInt(0);
    const y = i < pb.length ? BigInt(pb[i]) : BigInt(0);
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
