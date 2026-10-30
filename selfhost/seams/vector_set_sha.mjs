// The real function behind unit vector_set_sha: the oracle hash (vectorSetSha) — what every canonicalSha256 and every ORACLE CANONICAL-SHA256 declares.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (oracle) => m.vectorSetSha(oracle);
