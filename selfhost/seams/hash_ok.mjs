// The real function behind unit hash_ok (REDERIVE_SELF_PLAN Tier 3): verdict.hashOk: does a pinned sha-256 match (an absent pin (none) means "not pinned"; any other non-pin throws (round 5)).
export const module = 'cli/verdict.mts';
export const make = (m) => (text, want) => m.hashOk(text, want);
