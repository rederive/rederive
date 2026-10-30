// The real function behind unit f64_bits: the normative 16-hex bit pattern of an f64, NaN canonicalized — what every f64 comparison in every oracle runs on (encode(x, f64).bits).
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (x) => m.encode(x, { k: 'f64' }).bits;
