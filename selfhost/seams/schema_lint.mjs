// The real function behind unit schema_lint (REDERIVE_SELF_PLAN Tier 3): v05.schemaLint: lint 4, carried data declared under DEPENDS-ON instead of CARRIED.
export const module = 'cli/sir/v05.mjs';
export const make = (m) => (text, carriedName) => m.schemaLint(text, carriedName);
