// The real function behind unit adopt_replace_block (REDERIVE_SELF_PLAN Tier 3): adopt.replaceUnmanagedBlock: swap that block for the managed section, keeping everything around it and any kept rules.
export const module = 'cli/lib/adopt.mts';
export const make = (m) => (existing, block, managed, kept) => m.replaceUnmanagedBlock(existing, block, managed, kept);
