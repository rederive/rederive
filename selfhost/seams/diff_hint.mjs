// The real function behind unit diff_hint (REDERIVE_SELF_PLAN Tier 3): profile.diffHint: the one-line 'what differs' hint init --refresh prints (both sides passed as UTF-8 text).
export const module = 'cli/lib/profile.mts';
export const make = (m) => (existing, profile) => m.diffHint(Buffer.from(existing, 'utf8'), Buffer.from(profile, 'utf8'));
