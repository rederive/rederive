// @rederive/rdv — verified-recompose of eq (rederive cli/verdict.mts (rdv verdict core)). ZERO-DEP.
// Rebuilt locally by 'rdv resynth': reconstructed from sir/ + oracles/ with the original deleted;
// quorum 3/3, 9/9 held-out. Trust your own build, not the publisher's.
export function eq(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
