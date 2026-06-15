# @rederive/rdv

The **verdict core of the `rdv` verifier**, re-derived as verified units — the verifier, in its own catalog.

`rdv` is the CLI of [rederive](https://rederive.ai), the trust-nothing package manager. The trust-critical
logic that decides VERIFIED vs FAILED lives here as four units, each behavior-locked to an **adversarial
held-out oracle**:

- `eq` — order-sensitive structural equality (the comparison primitive)
- `grade` — the verdict (composed on the verified `eq`; throw-matches-throw; vacuous-empty; miss capped at 8)
- `quorum` — independent-agreement decision (≥2 must agree; winner = the first full emission)
- `hashOk` — content-hash check (control logic; the SHA-256 algorithm is host-delegated)

Every expected value was **stamped by executing the unit**, never hand-authored. The oracles are
*adversarial*: a `grade` that always rubber-stamps VERIFIED, a `quorum` that blesses a lone pass, an `eq`
that ignores order — each is caught by the held-out set.

Verify it, or re-derive it yourself:

    npm i -g rederive
    rdv check   <path-to-this-package>
    rdv resynth <path-to-this-package>   # rebuild src/ locally from the contract, quorum-verified

Apache-2.0. Part of [The rederive Promise](https://rederive.ai/promise.html): the tools that verify trust
are open, forever.
