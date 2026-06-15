// @rederive/rdv — verified-recompose of eq (rederive cli/verdict.mts). ZERO-DEP.
// Verified by rdv check (held-out) + quorum 3/3 (rdv resynth, original deleted).
// Value-based, order-sensitive structural equality via canonical JSON.
export function eq(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
