// The real function behind unit languages_of: the languages a bundle carries, from its structure (languagesOf) — the language gate.
export const module = 'cli/features.mjs';
export const make = (m) => (input) => [...m.languagesOf(input)];
