// The real function behind unit f64_canonical_bits: a RAW 64-bit pattern read as an f64 and re-encoded — what NaN
// canonicalization does to it (encode(f64fromBits(raw), f64).bits). The companion f64_bits cannot test the NaN rule: its input
// codec stores every NaN as one tag, so payload and sign never reach it (selfhost FINDINGS #1). Raw patterns do.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (raw) => m.encode(m.f64fromBits(raw), { k: 'f64' }).bits;
