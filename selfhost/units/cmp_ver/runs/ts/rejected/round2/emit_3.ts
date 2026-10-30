const VERSION = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;

function parse(t: string): bigint[] {
  if (typeof t !== 'string' || !VERSION.test(t)) {
    throw new Error('not a version: ' + JSON.stringify(t));
  }
  return t.split('.').map((s) => BigInt(s));
}

export default function cmpVer(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = i < x.length ? x[i] : 0n;
    const q = i < y.length ? y[i] : 0n;
    if (p < q) return -1;
    if (p > q) return 1;
  }
  return 0;
}
