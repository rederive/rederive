// The real function behind unit divergence_of (REDERIVE_SELF_PLAN Tier 3): v05.divergenceOf: one language's divergence verdict for a round (quorum, held-out disagreements, frozen misses).
export const module = 'cli/sir/v05.mjs';
export const make = (m) => (round, artifacts) => m.divergenceOf(round, artifacts);
