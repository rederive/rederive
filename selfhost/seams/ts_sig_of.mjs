// The real function behind unit ts_sig_of (REDERIVE_SELF_PLAN Tier 3): lang-ts.sigOf: a ts language file's SIG line -> the export it names and the function type the conformance check compiles.
export const module = 'cli/lang-ts.mts';
export const make = (m) => (sig) => m.sigOf(sig);
