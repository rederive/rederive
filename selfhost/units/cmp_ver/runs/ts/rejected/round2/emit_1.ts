const VERSION = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;

export default function cmpVer(a: string, b: string): number {
  if (typeof a !== "string" || !VERSION.test(a)) throw new Error("not a version: " + JSON.stringify(a));
  if (typeof b !== "string" || !VERSION.test(b)) throw new Error("not a version: " + JSON.stringify(b));
  const pa = a.split(".");
  const pb = b.split(".");
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const sa = pa[i];
    const sb = pb[i];
    const x = sa === undefined ? 0n : BigInt(sa);
    const y = sb === undefined ? 0n : BigInt(sb);
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
