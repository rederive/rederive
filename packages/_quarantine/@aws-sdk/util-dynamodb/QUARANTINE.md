# QUARANTINED: @aws-sdk/util-dynamodb (marshall)

Moved out of the catalog on 2026-10-28 (v0.5 release prep). It is not published and not counted in the corpus
check. Three independent reasons, any one of which disqualifies it:

1. **It fails `rdv check`.** `marshall` passes only 38 of 60 held-out vectors (misses v44, v45, v52, v53, v58,
   v66, v69, v72, …); hashes match, so the shipped `src/` simply does not satisfy its own contract.
2. **Wrong license.** `LICENSE` says MIT ("originally licensed MIT by its authors"), but upstream
   `@aws-sdk/util-dynamodb` (aws/aws-sdk-js-v3) is **Apache-2.0**, as the manifest's own `provenance.license`
   records. A re-derived work must carry the upstream license and its notice.
3. **Invalid npm name.** `@rederive/@aws-sdk/util-dynamodb` is not a legal package name (one scope only).

## What a fix needs

- **Re-stamp the oracle from the real package** (`@aws-sdk/util-dynamodb@3.515.0`, or a current pinned version) by
  executing it, then re-emit `marshall` through the quorum and re-verify until `rdv check` is clean on every
  held-out vector. Do not edit expecteds to match the artifact.
- **Retain Apache-2.0**: replace `LICENSE` with the Apache-2.0 text plus upstream attribution (and any NOTICE),
  and set `package.json` `"license": "Apache-2.0"`.
- **A valid name**, e.g. `@rederive/aws-sdk__util-dynamodb`, in both `package.json` and `sir.manifest.json`
  (re-check: the manifest name is not content-hashed, but keep the two identical).
- Then move it back to `packages/aws-sdk__util-dynamodb/` (a single directory level, so the corpus loop picks it up)
  and confirm the corpus count rises by one.
