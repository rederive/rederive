// The real function behind unit carried_canonical: the canonical form a carried table hashes to (v05 canonical) — what CARRIED CANONICAL-SHA256 declares.
export const module = 'cli/sir/v05.mjs';
export const make = (m) => (table) => m.canonical(table);
