// The real function behind unit parse_type: the abstract type grammar (parseType) — every SIG type every driver marshals by.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (s) => m.parseType(s);
