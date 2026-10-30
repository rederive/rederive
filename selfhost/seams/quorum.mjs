// The real function behind unit quorum: the quorum decision (verdict.quorum) — which emission wins.
export const module = 'cli/verdict.mts';
export const make = (m) => (fulls, need) => m.quorum(fulls.map((full) => ({ full })), need);
