// @rederive/rdv — verified-recompose of quorum (rederive cli/verdict.mts). ZERO-DEP.
// Verified by rdv check (held-out) + quorum 3/3 (rdv resynth, original deleted).
// hasQuorum = fullCount >= need (default 2); winnerIdx = FIRST full emission, else -1.
export function quorum(graded, need = 2) {
  let fullCount = 0;
  let winnerIdx = -1;
  for (let i = 0; i < graded.length; i++) {
    if (graded[i].full) {
      fullCount++;
      if (winnerIdx === -1) winnerIdx = i;
    }
  }
  const hasQuorum = fullCount >= need;
  return { fullCount, hasQuorum, winnerIdx: hasQuorum ? winnerIdx : -1 };
}
