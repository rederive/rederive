// @rederive/rdv — verified-recompose of rdv's quorum decision (verdict core). ZERO-DEP.
// Quorum holds when at least `need` (default 2) emissions pass the FULL held-out set. The winner is
// the FIRST such emission in input order; with no quorum, winnerIdx is -1. One pass is luck; two agree.
export function quorum(graded: { full: boolean }[], need = 2) {
  const fullIdx = graded.map((g, i) => (g.full ? i : -1)).filter((i) => i >= 0);
  return {
    fullCount: fullIdx.length,
    hasQuorum: fullIdx.length >= need,
    winnerIdx: fullIdx.length >= need ? fullIdx[0] : -1,
  };
}
