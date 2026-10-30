# Rederive, re-derived

**Ask (Lane, 2026-10-26):** "146 tests seems low. I am feeling like we need to give rederive the rederive treatment. v0.5
should make that possible."

**Claim to test:** the verifier's own logic can go through the same loop as any npm package: a cold sighted decomposition
into a v0.5 contract, an oracle stamped from the real code, and blind re-emission in js, ts and rust graded by
verifier-owned drivers. If it can't, the pitch has a hole exactly where it matters most.

## What it buys

- **Tests that aren't hand-written.** Every unit gets a stamped oracle (frozen + held-out vectors from the real code) and
  a 2,000-input seeded cross-language differential. The 146 hand-written tests stay as the integration layer; the units
  underneath get thousands of checks from one authority.
- **Three independent re-derivations per unit.** js, ts and rust, each written blind from the contract. Where they
  disagree with each other or with the oracle, either the contract is ambiguous or the code has behavior nobody wrote
  down. Tier A and B found nine verifier bugs this way; this points the same loop at the verifier.
- **A Rust core.** A verified Rust SIR parser, canonical encoder and grader. ambo (Rust) audits SIR repos and needs exactly
  these.
- **Contracts for the trust kernel.** The rules rdv applies (what equality means, what a binding hashes) become SIRs a
  reader can audit, instead of code they have to trust.

## The circularity, and how to break it

The thing being re-derived is also the thing that grades. Three rules keep a belief from grading itself:

1. **The authority is pinned.** The oracle is stamped from a snapshot of rederive at a named commit (`git archive <sha>
   cli/` into `selfhost/authority/<sha>/`, hashed). Later edits to `cli/` can't move it. Where the snapshot has a bug, the
   oracle encodes the bug, and the unit surfaces it as a decision (fix the code and re-stamp as a new authority, or keep
   it as a declared deviation). It is never silently "corrected".
2. **The judge is pinned and never the candidate.** Grading runs through the lab at a pinned commit. A re-emission never
   replaces any judge code until it is verified, and a unit is never graded by a judge built from its own re-emission.
3. **The kernel gets an independent anchor.** The canonical encoding already has an independent implementation:
   `sir-lab/v05-lang/lib/canon.py`, written separately and checked 36/36. The canon units carry `ANCHOR ref(python:canon.py)`,
   so their oracle isn't only rederive agreeing with itself. That is `cross-lang-anchor`'s first real consumer, the one
   v0.5 feature still unimplemented.

## The units

About 6,300 lines in `cli/`. Not everything is a unit:

| Tier | What | Examples | Approx. units |
|---|---|---|---|
| **1. Trust kernel (pure, language-neutral)** | Decides verdicts and hashes | SIR canonical print, canonical-string, vector-set sha, f64 bits + NaN canonicalization, SIG/type parser, the grade tally, quorum, version compare, feature detection, spec version, tree hash | ~15 |
| **2. Pure, JS-envelope** | Pure, but over JS-native values | legacy `eq`/`enc` (Set/Map/-0/sparse arrays), reviveArg, the any-ban lint, SIG→TS type, wire-line/parse-wire | ~10 |
| **3. Pure, text in, structure out** | Parsers and lints | npm/pnpm lockfile parsers, the guard diff, the transcription and leak lints, directive table | ~10 |
| **4. Effectful** | Writes files, spawns processes | init, adopt, doctor, profile, the drivers' build steps | trace-mode units later, or stay integration-tested |
| **5. Orchestration** | The commands | cmdCheck, resynth | stay as integration tests |

Tier 1 goes first and to all three languages. Tier 2 is js/ts only (its envelope is JS values by definition). Tier 3 to
all three where the output type allows.

## Pilot (the experiment that settles whether this works)

Two Tier 1 units, chosen because each is central to trust and has a real Rust consumer:

- **`canonical_print(text) -> text`**: `print(parse(t).ast)` from `cli/sir/sir-parse.mjs`. What every `PRIMARY-SHA256`
  binds to. A Rust version is ambo's SIR parser.
- **`canonical_string(value: json) -> text`**: `canonicalString` from `cli/sir/canon.mjs`. What every oracle hash is computed
  over. Anchored to `canon.py`.

Per unit: one sighted decomposer, then 3 blind emitters per language (9), through `sir-lab-runner`. About 10 spawns per
unit per round, so ~20 for the pilot plus any harden rounds (cap 3).

**Pilot gate:** both units VERIFIED in js, ts and rust, cross-verified on 2,000 seeded inputs, with the oracle stamped
from the pinned snapshot; and every disagreement found is classified as a contract ambiguity (harden), a rederive bug
(decision), or a verifier fault (fixture + fix). A pilot that finds nothing is as informative as one that finds bugs, as
long as the planted faults are caught.

## New tooling (small)

- `selfhost/stamp.mjs <unitDir>`: import the unit's function from the pinned authority snapshot and run sir-factory's
  `stampOracle` with the decomposer's input generator. Then the lab's `prepare` encodes it canonically as for any unit.
- `selfhost/units/<unit>/`: out-of-tree lab units living in this repo; `STAGE.json` points at the snapshot.
- A CI job: every stamped oracle re-run against the LIVE code. That turns each oracle into a regression suite the day it
  is stamped, before any re-emission.

## After the pilot

All of Tier 1, then Tiers 2 and 3. Then the bootstrapping step: rederive ships `@rederive/rederive-core` as a v0.5 bundle,
verified by the previous released rdv. rdv N checks rdv N+1's core.

## Decisions for Lane

1. **Go on the pilot** (~20 spawns plus harden rounds).
2. **Where units live:** `rederive/selfhost/` (public, once rederive's public line takes it) or the private lab. Recommend
   `selfhost/` in rederive: the contracts for the verifier should be as public as the verifier.
3. **What a found bug means:** fix the code and re-stamp from a new pinned authority, or ship the current behavior as the
   contract and file the fix. Recommend fix-and-re-stamp for anything in Tier 1; the kernel should not carry a known bug.
