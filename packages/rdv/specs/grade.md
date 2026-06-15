# grade — the verdict (rdv verdict core)

    grade(gots: any[], vectors: {name, expected}[]): {pass, total, full, miss}

Decide how a set of already-computed results scores against its vectors. This is the single most
trust-critical function in rederive: if it is wrong, every "VERIFIED" is hollow. Reconstruct EXACTLY:

- For each `i`, the result `gots[i]` passes vector `i` iff: both are captured throws
  (`{__throw}` objects — the **message is NOT compared**), OR they are structurally equal (see `eq`).
- `pass` = number of passing vectors; `total` = `vectors.length`.
- `full` = `pass === total`. **Vacuous case (must reproduce): empty `vectors` ⇒ `full: true`** — this
  is precisely why a held-out set must be non-empty; an empty oracle "passes" anything.
- `miss` = the names of failing vectors, **capped at the first 8** (further failures are not recorded).
- It must NOT short-circuit on the first vector: a result that is correct only at index 0 must still
  fail if any later vector mismatches (the coverage-saturation discriminator).

ZERO dependencies.
