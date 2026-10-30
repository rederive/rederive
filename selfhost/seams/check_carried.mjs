// The real function behind unit check_carried (REDERIVE_SELF_PLAN Tier 3): v05.checkCarried: a bound table vs its declaration (canonical hash + AUTHORITY assertions) -> status.
export const module = 'cli/sir/v05.mjs';
export const make = (m) => (decl, table) => m.checkCarried(decl, table);
