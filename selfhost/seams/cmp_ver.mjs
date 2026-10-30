// The real function behind unit cmp_ver: spec-version comparison (cmpVer) — the coarse gate rdv halts on.
export const module = 'cli/features.mjs';
export const make = (m) => (a, b) => m.cmpVer(a, b);
