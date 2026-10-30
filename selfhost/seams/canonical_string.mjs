// The real function behind unit canonical_string: the canonical string of a value, which every oracle hash (vectorSetSha) and
// every typed-value equality (eqCanonical) is computed over (cli/sir/canon.mjs).
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (value) => m.canonicalString(value);
