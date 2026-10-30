const VERSION = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;

const check = (v) => {
  if (typeof v !== 'string' || !VERSION.test(v)) throw new Error('not a version');
};

export const cmpVer = (a, b) => {
  check(a);
  check(b);
  const x = a.split('.');
  const y = b.split('.');
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const p = i < x.length ? BigInt(x[i]) : 0n;
    const q = i < y.length ? BigInt(y[i]) : 0n;
    if (p !== q) return p > q ? 1 : -1;
  }
  return 0;
};

export default cmpVer;
