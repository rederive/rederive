// The real function behind unit adopt_find_duplicate (REDERIVE_SELF_PLAN Tier 3): adopt.findUnmanagedDuplicate: where an existing CLAUDE.md holds an unmanaged copy of a profile section (rdv init --adopt).
export const module = 'cli/lib/adopt.mts';
export const make = (m) => (existing, section) => m.findUnmanagedDuplicate(existing, section);
