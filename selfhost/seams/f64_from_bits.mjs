// The real function behind unit f64_from_bits: the f64 a 16-hex bit pattern denotes (f64fromBits) — how every driver decodes an oracle f64.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (bits) => m.f64fromBits(bits);
