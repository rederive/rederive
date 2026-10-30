// The real function behind unit lint_leak: the language-leak lint (leakLint) — the firewall between a primary and its language files.
export const module = 'cli/sir/v05.mjs';
export const make = (m) => (text, isPrimary) => m.leakLint(text, { isPrimary });
