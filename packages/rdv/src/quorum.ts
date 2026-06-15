// @rederive/rdv — verified-recompose of quorum (rederive cli/verdict.mts (rdv verdict core)). ZERO-DEP.
// Rebuilt locally by 'rdv resynth': reconstructed from sir/ + oracles/ with the original deleted;
// quorum 3/3, 7/7 held-out. Trust your own build, not the publisher's.
export function quorum(
  graded: { full: boolean }[],
  need: number = 2
): { fullCount: number; hasQuorum: boolean; winnerIdx: number } {
  let fullCount = 0;
  let winnerIdx = -1;

  for (let i = 0; i < graded.length; i++) {
    if (graded[i].full) {
      fullCount++;
      if (winnerIdx === -1) {
        winnerIdx = i;
      }
    }
  }

  const hasQuorum = fullCount >= need;

  return {
    fullCount,
    hasQuorum,
    winnerIdx: hasQuorum ? winnerIdx : -1,
  };
}
