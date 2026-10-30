// The real function behind unit parse_sig: the SIG parser (parseSig) — name, arguments (rest), result, from a primary or native SIG line.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (s) => m.parseSig(s);
