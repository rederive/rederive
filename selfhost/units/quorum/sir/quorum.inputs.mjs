// quorum input generator: curated boundary prefix (incl. throw probes), then seeded random fill with need in 1..len+2.
const L = (s) => [...s].map((c) => c === '1');
export function genInputs(n, rnd) {
  const MAX = 9007199254740991;
  const curated = [
    // R1 throw probes: zero, negative, huge negative, non-integer (js-only), and a throw with full entries present
    [[], 0], [[], -1], [L('111'), 0], [L('011'), -3], [[], -MAX], [L('11'), 1.5], [L('1'), 0.5],
    // only boolean true is full (js-only widening)
    [[1, 'true', true, {}], 1],
    // in-domain boundaries
    [[], 1], [[], 2], [[], MAX], [L('0'), 1], [L('000'), 1], [L('000'), 3],
    [L('1'), 1], [L('1'), 2], [L('111'), 2], [L('111'), 3], [L('111'), 4],
    [L('011'), 2], [L('0011'), 1], [L('0101'), 2], [L('0101'), 3], [L('10'), 1], [L('00001'), 1],
    [L('110'), MAX], [L('01'), 2], [L('001'), 1],
  ];
  const out = curated.slice();
  while (out.length < n) {
    const len = Math.floor(rnd() * 9);
    const p = rnd();
    const fulls = Array.from({ length: len }, () => rnd() < p);
    const need = 1 + Math.floor(rnd() * (len + 2));
    out.push([fulls, need]);
  }
  return out;
}
