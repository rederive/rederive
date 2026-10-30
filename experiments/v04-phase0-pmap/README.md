# Phase 0 — reproduce §19's p-map evidence against this build

Gate on **Assumption A1** (`docs/SIR_V04_PLAN.md`): the schema marks §§19–22
VALIDATED, but the cited artifacts were produced in temp directories during
earlier work. Before building a verifier on those semantics, reproduce one.

**Result: PASS.** `node verify.mjs` (output frozen in `RESULTS.txt`).

## What reproduced

| claim (§19) | result |
|---|---|
| interleaving-invariant output | **PASS** — every schedule, every size |
| max-concurrency bound | **PASS** — `maxInFlight <= min(concurrency, n)` throughout |
| verified **exhaustively** for small inputs | **PASS** — 7 configurations, up to 162 schedules, all reachable orders |
| **POR** collapses independent mappers to one class | **CONFIRMED** — 16 schedules → 1 outcome class |
| POR-scaled **past 10¹²** interleavings | **PASS** — n=20/c=5 is 3.66e12; also 3.19e33 and 3.62e60 |

## What did NOT reproduce (the finding)

The prior p-map work on disk
(`~/sir-lab/del/.sir-factory/custom/p-map/`) is a **saturation differential** —
randomized scenarios compared against the real package — and its own header
says it deliberately avoids scheduling-dependent observations:

> *"Determinism constraints (avoid impl-scheduling-dependent observations)"*

That leg still passes (15/15 held-out on this build), and it is exactly the
`differential-sampled` rung the plan proposes adding to the ladder. But **no
exhaustive-interleaving or POR harness existed** — the strongest claim in §19
had no artifact behind it. This directory is that artifact.

So A1 is **partly refuted and now repaired**: the semantics are sound (they
reproduce), but the evidence base was one rung weaker than the schema
described. Recording it that way is the point — a validation label nobody can
re-run is a claim, not evidence.

## How it works

`schedule.mjs` takes the completion order away from the runtime: every mapper
returns a deferred the harness resolves, so a *schedule* is a list of decisions
about which in-flight item settles next, and a run becomes a replayable
function of that list. `explore()` then DFS-walks the decision tree, learning
each step's branching factor by replay, and stops at a cap it reports honestly
rather than silently truncating.

`verify.mjs` asserts two invariants on **every** explored schedule — output
keyed by input position (I1) and the in-flight bound (I2) — then checks the POR
prediction (independent mappers ⇒ one outcome class) *before* using it to
justify a single representative at sizes where exhaustive is impossible.

## Why this is the §19 core

The explorer is not p-map-specific. Any unit whose nondeterminism enters
through an injectable boundary can be driven this way; p-map is simply the
first unit pointed at it. Phase 3 generalizes this into the verifier, with the
coverage ladder reporting which rung a given run earned:
`differential-sampled → sampled → POR → exhaustive`.

Re-run: `node verify.mjs` (set `PMAP=` to test a different copy).
