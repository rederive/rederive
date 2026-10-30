// The real function behind unit directive: directive lookup by name (v05 directive) — how SIG, ORACLE, STATE are read from a primary.
export const module = 'cli/sir/v05.mjs';
export const make = (m) => (text, name) => m.directive(text, name) ?? null;
