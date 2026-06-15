# quorum — independent-agreement decision (rdv verdict core)

    quorum(graded: {full: boolean}[], need = 2): {fullCount, hasQuorum, winnerIdx}

Decide whether a set of independent re-derivations agree, and which one wins. Reconstruct EXACTLY:

- Consider only each emission's `full` flag (did it pass the entire held-out set).
- `fullCount` = how many emissions are `full`.
- `hasQuorum` = `fullCount >= need` (default `need` is **2** — one passing emission is luck, two
  independent agreements are evidence).
- `winnerIdx` = the index of the **FIRST** `full` emission in input order when quorum holds, else `-1`.
  It must be the first *full* one — not index 0 blindly, not the last — so `[partial, full, full]`
  yields `winnerIdx: 1`. (This is the discriminating case against a naive implementation.)
- No quorum ⇒ `winnerIdx: -1` and the lone passing emission is **not** blessed.

ZERO dependencies.
