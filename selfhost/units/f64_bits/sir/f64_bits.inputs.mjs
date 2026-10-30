// genInputs(n, rnd) for unit f64_bits — curated boundary prefix first (it fills the 24 frozen vectors), then seeded fill.
// Every value is a finite JSON number or one of NaN / -0 / +-Infinity (carried by the legacy num tag). NaN payload and sign
// cannot survive the oracle codec (every NaN encodes as the tag 'NaN'), so one NaN vector is all the oracle can hold.
const fromBits = (hi, lo) => { const d = new DataView(new ArrayBuffer(8)); d.setUint32(0, hi >>> 0); d.setUint32(4, lo >>> 0); return d.getFloat64(0); };
const CURATED = [
  0, -0, Infinity, -Infinity, NaN,
  1, -1, 2, 0.5, 0.1,
  1e308, 5e-324, -5e-324,
  2.2250738585072014e-308,        // min normal 2^-1022
  2.225073858507201e-308,         // max subnormal
  1.7976931348623157e308, -1.7976931348623157e308,
  0.30000000000000004,            // 17 significant digits to round-trip
  9007199254740992, 9007199254740994,   // 2^53, 2^53+2
  2.220446049250313e-16,          // epsilon 2^-52
  0.9999999999999999,             // largest double below 1
  1 / 3, -255,
  // ---- beyond the frozen 24
  2 ** 1023, 2 ** -1022, 2 ** -1074, 2 ** -1073, 2 ** -1023, 2 ** 52, 2 ** 31, 2 ** 32, 2 ** 63, 2 ** 64, 2 ** -1,
  -2, -0.1, 0.2, 0.7, 1.1, 1e-7, 1e21, 1e-300, -1e-300, 1e300, 123456789.12345679, 4.35, 100, 65535,
  9007199254740991, -9007199254740991, 1.0000000000000002, 3.141592653589793, 2.718281828459045,
  4.9406564584124654e-322, 1.5e-323, 8.98846567431158e307, -2.2250738585072014e-308, 7, 1e-323,
];
function randomValue(rnd) {
  const pick = rnd();
  const u32 = () => Math.floor(rnd() * 4294967296);
  if (pick < 0.35) { // arbitrary bit pattern (NaN patterns kept: they canonicalize)
    return fromBits(u32(), u32());
  }
  if (pick < 0.5) { // subnormal or near-subnormal: exponent field 0 or 1
    const sign = rnd() < 0.5 ? 0x80000000 : 0; const e = rnd() < 0.7 ? 0 : 0x00100000;
    return fromBits(sign | e | (u32() & 0x000fffff), u32());
  }
  if (pick < 0.6) { // huge: exponent field near the top (never 0x7ff)
    const sign = rnd() < 0.5 ? 0x80000000 : 0; const e = (0x7f0 + Math.floor(rnd() * 15)) << 20;
    return fromBits(sign | e | (u32() & 0x000fffff), u32());
  }
  if (pick < 0.7) { // signed power of two across the full exponent range
    const k = -1074 + Math.floor(rnd() * 2098); const v = 2 ** k; return rnd() < 0.5 ? -v : v;
  }
  if (pick < 0.85) { // short decimal with a few digits — the 0.1-class values
    const digits = 1 + Math.floor(rnd() * 6); const m = Math.floor(rnd() * 10 ** digits); const sc = Math.floor(rnd() * 8);
    const v = Number(`${m}e-${sc}`); return rnd() < 0.3 ? -v : v;
  }
  // integer, possibly beyond 2^53
  const v = Math.floor(rnd() * 2 ** (1 + Math.floor(rnd() * 70))); return rnd() < 0.3 ? -v : v;
}
export function genInputs(n, rnd) {
  const out = CURATED.map((x) => [x]);
  while (out.length < n) out.push([randomValue(rnd)]);
  return out;
}
