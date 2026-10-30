# SIR v0.4 — the plan

**Status:** plan · 2026-08-10 · spans `rederive` (rdv), `sir-factory` (pack),
`sir-toolkit` (schema + prompts). Parent: `sir-toolkit/plugins/sir/docs/SIR_SCHEMA.md`
§§19–22.

## Where we actually are

The schema published **v0.4** (the concurrency layer) on 2026-07-01 and states
"generation now targets v0.4." The toolchain does not:

| component | state | verdict |
|---|---|---|
| `rdv` (`cli/rdv.mts`) | `SUPPORTED_SPEC = '0.3'`; halts on anything newer | correct, and correctly reasoned in-comment |
| `sir-factory` (`lib/pack.mjs`) | `specVersionFor` emits only `0.2` / `0.3`; refuses 0.4 by comment | correct |
| shipped catalog | **215 bundles unstamped (legacy v0.1), 3 at v0.2, none at 0.3** | see W.0 |
| toolkit prompts | the decomposer has **no** v0.4 guidance at all; `sir-verify` carries a v0.3-compatible async-control recipe | no drift to clean up |

**Nothing anywhere is at 0.4, and nothing is broken.** Both guards are doing
their jobs. So the cost of the gap is not correctness — it is **addressable
surface**: any unit with a timer race, a concurrency bound, a pool, or a
cancellation path cannot be produced or verified at full strength. `p-map`,
`q`'s timer core, `request`'s redirect machine — the schema's own evidence base
— are exactly what the factory cannot emit.

## The two design moves

### 1. Feature flags, not a version cliff (PRIORITY)

`specVersion` is a scalar, so 0.4 support is all-or-nothing: today you must
build all four sections before any bundle can move. But §§19–22 are independent
semantics and the bundle contract already says "absence means none apply."

**A bundle declares the features it uses; rdv declares the features it
implements.** rdv accepts what it can check and halts naming the *missing
feature*, not a version number. This follows the principle rdv's own comment
already states — *the version must track what rdv can actually check, not what
the schema has published* — and generalizes it from a scalar to a set.

`specVersion` **stays** as the coarse gate (an old rdv must still halt on a
0.4 bundle it cannot reason about); `features` refines it for rdv versions that
understand the field. See Assumption A6.

### 2. Extend the coverage ladder down one rung

§19 already reports verification strength honestly:
`exhaustive → sampled → partial-order reduction`. Add **`differential-sampled`**
at the bottom — the recipe `sir-verify` already prescribes for async-control
units (differential vs the real unit with instrumented probe mappers; assert
results + observable order + the concurrency bound).

Then a concurrency unit is **always shippable**, and the bundle records which
rung it earned. Feature flags stop gating *whether you can ship* and start
gating *which claims you may make*. `p-map` can be re-derived today at
`differential-sampled`; when §19 lands it is re-verified up to `exhaustive`/`POR`
and the manifest records a stronger claim — no republish, no cliff.

## Assumptions (write these down; check them as you go)

**A1 — the v0.4 semantics are correct as written.** *Status: **TESTED
2026-08-10 — semantics CONFIRMED, evidence base CORRECTED**
(`experiments/v04-phase0-pmap/`).* The p-map claim reproduces against this
build: interleaving-invariant output and the concurrency bound hold on every
reachable schedule (exhaustive, 7 configurations), POR's one-outcome-class
prediction is confirmed before being relied on, and the scaled leg lands on
§19's own number (n=20/c=5 = 3.66e12, plus 3.19e33 and 3.62e60). **The
correction:** the prior artifact on disk is a saturation *differential* whose
header says it avoids scheduling-dependent observations — no exhaustive or POR
harness existed anywhere. The semantics were sound; the evidence was one rung
weaker than the schema described, and §19's strongest claim had no artifact
behind it until now.

**A2 — concurrency units are a material share of the remaining backlog.** Not
measured. Cheap to test: scan the catalog backlog for async-control shapes
(timers, pools, cancellation). If the share is small, this whole plan drops in
priority behind breadth work.

**A3 — blind-quorum convergence is a valid proxy for "the SIR is
comprehensible."** Strongly evidenced for v0.1–0.3 (15/15 independent blind
re-emissions across two experiments on 2026-08-03, with no schema access).
*Extrapolation to v0.4 constructs is an assumption*: `PAR`/`RING` carry
semantics that are not inferable from their syntax, unlike every construct
before them. Mitigation is design, not hope — see "Definition hints" below.

**A4 — a feature-gated halt is a good experience, not a bug report.** "This
bundle needs `par-interleaving`; your rdv implements
`scheduler,lifecycle`" must read as actionable. If early users read it as
breakage, the messaging is wrong and the field is still right.

**A5 — `differential-sampled` is genuine verification, not theater.** It is
what `sir-verify` already prescribes and what several shipped units effectively
have. The claim it licenses is narrower ("verified on sampled schedules"), and
the manifest must say exactly that.

**A6 — adding `features` is backward-compatible.** An rdv that predates the
field ignores it and falls back to the `specVersion` scalar, which still halts
on 0.4. *Verify this explicitly with a fixture before shipping* — a silently
ignored field that should have halted is a soundness hole, the same class as
under-stamping (W.0).

**A7 — features are mechanically derivable from the SIR.** `specVersionFor`
already does this for v0.3 (carried data / envelope / trace mode). Concurrency
features must be equally mechanical — a construct in the SIR, not a judgment
call. If a feature needs judgment to detect, it is specified wrong.

**A8 — bootstrap by best guess is the accepted method for every mapping in
this plan.** The feature→section map, the feature→verifier-capability map, and
the action-style tables are first-cut guesses, hardened by use. This is the
same chicken-and-egg the project has always run on (*"I need valid IR to build
the IR-constructing agent"*): take the shot, iterate, then find the nasty edge
cases by using it on a real project. **The rule that makes it safe is not
foresight, it is that a downstream oracle catches the error and the miss gets
recorded rather than papered over** — the pattern already proven by rolemint's
coverage verdict and rdv's held-out grading.

## Phases

Dependency order. Each ships independently, each has a pilot, each is accepted
by a gate rather than by review.

### W.0 — warm-up: fix the under-stamp (do first, it is one line)

`@rederive/bcryptjs` ships carried data with **no `specVersion`**. Our rdv still
checks it (the carried-data gate keys off bundle content, not version), so it is
a labeling defect rather than an active hole — but it is exactly the
under-stamping `pack.mjs`'s own comment warns about, and a stricter consumer
would skip the authority check. Re-stamp; add a pack-time assertion that a
bundle using a versioned feature cannot ship unstamped.

### F.1 — the capability model (PRIORITY) — **SHIPPED 2026-08-10**

> `sir-toolkit/plugins/sir/capabilities.json` (`bc8e9b4`) · rdv's fine gate
> (`6db65e1`) · `featuresFor` in pack (`464750f`) · W.0 bcryptjs re-stamped.
> Fixture-verified, all four behaviors: v0.3-featured verifies; **a v0.4 bundle
> using only implemented features VERIFIES** (the ramp); a bundle needing
> `par-interleaving` halts naming it *and* what rdv does implement; and a v0.4
> bundle with no `features` field still halts on the scalar (A6 holds).
> Consumer 3 (prompt injection) **SHIPPED in Phase 5** as
> `plugins/sir/scripts/payload.mjs` (`c8dbb26`): derives a role's payload from a
> SIR's declared features and gates the fragment on `generable`, not merely
> `implemented`. F.1 is now complete on all three consumers.

*Original scope:*

One file is the source of truth — `plugins/sir/capabilities.json`: implemented
features, the ladder rungs each unlocks, and the schema sections each maps to.
**Three consumers read it; none duplicate it:**

1. **rdv** — replaces `SUPPORTED_SPEC` with a capability set; halts naming the
   missing feature; records the rung achieved per unit.
2. **`sir-factory` pack** — replaces `specVersionFor`'s ternary; stamps
   `specVersion` + `features` from what the SIR actually uses (A7).
3. **the prompts** — injected at invoke time, never copy-pasted into `SKILL.md`,
   so an unimplemented section cannot reach the decomposer's context.

**The enforcement is a validator, not the prompt.** A SIR construct whose
feature is unimplemented is rejected at pack time. A skill can be ignored; a
gate cannot. The prompt gets the capability list only so it does not waste a
round-trip proposing something unbuildable.

*Gate:* a v0.4-featured fixture bundle halts on today's rdv naming the feature;
a v0.3 bundle verifies unchanged; an old-rdv fixture still halts on the scalar
(A6).

### Phase 0 — reproduce one piece of evidence (gate on A1)

Re-run `p-map`'s concurrency contract against **this** build: interleaving-
invariant output + max-concurrency bound, exhaustive for small inputs. Artifact
lands in the repo this time, not a temp directory. Success also yields the v0.4
pilot bundle for free; failure rewrites the plan, cheaply and early.

### Phase 1 — §20 scheduler / virtual time — **SHIPPED 2026-08-10** (`349c32b`)

> Timer half landed with §21; the microtask half (`schedule(fn)` + drain
> discipline: microtasks to exhaustion before each timer callback and again
> after) completes it. **The finding is the control, not the feature**: the same
> race on the real clock ran 20/20 the same way — not flaky, *consistent*, and
> the other branch never executed with nothing going red. On virtual time both
> branches are one parameter apart, each replayed 50× to exactly one stable
> outcome. `experiments/v04-phase1-scheduler/`.

*Original scope:*

The foundation: the event loop injected as a seam the harness drives
(`schedule`, `setTimer`, `clearTimer`, `advance`), making resolution order a
deterministic function of the timeline. Unlocks the whole `delay`/`timeout`
class on its own. *Pilot:* `q`'s `delay`/`timeout`. *Feature:* `scheduler`.

### Phase 2 — §21 resource-lifecycle channel — **SHIPPED 2026-08-10** (`e2e972f`)

> Proven adversarially (`experiments/v04-phase2-lifecycle/`): two units differing
> by exactly one line, graded on all three channels. Value **identical**, trace
> **identical**, lifecycle catches it (`cancelled` vs `fired`) — and when the
> timeout legitimately wins, all three agree, so the channel manufactures no
> false positive. Wired into rdv as `makeFakeTimers()` (§20's timer half, which
> §21 needs to see anything); **additive** — a unit that arms nothing emits no
> lifecycle events and its expectation is omitted, so existing trace oracles
> grade byte-identically (regression-checked on colors, bcryptjs, request).
> `@fixture/lifecycle` at `specVersion 0.4`: correct src VERIFIED 2/2 exit 0,
> leaky src FAILED 0/2 exit 1 on the lifecycle field **alone**. `lifecycle` is
> now `implemented` — the first v0.4 feature to verify, and the ramp's first
> real passenger.

*Original scope:*

A third oracle channel — `armed/fired/cancelled`, `subscribed/torn-down` —
cheap on top of Phase 1 and independently valuable: it catches a bug class
invisible to both existing channels (a dropped `clearTimer` passes value *and*
order). *Pilot:* `request`'s redirect timeout, where the leak is caught **only**
here. *Feature:* `lifecycle`. **This is the most demonstrable win in the set —
consider leading with it publicly.**

### Phase 3 — §19 `PAR` + the coverage ladder — **SHIPPED 2026-08-10** (`85c3926`)

> `makeGate()` + `runPar` + oracle mode `par` in rdv; the ladder is reported,
> never assumed (POR's collapse is *checked* before a representative is
> trusted; truncation says so). `@fixture/par` at `specVersion 0.4`: correct
> VERIFIED 2/2, completion-order-keyed FAILED 0/2 — and a single sampled
> schedule would have passed the broken unit, which is the whole argument.
> Stamped coverage matches Phase 0's standalone explorer exactly (8 and 54
> schedules, exhaustive). `experiments/v04-phase3-par/`.

*Original scope:*

The real work: message-delivery order as an injected boundary, an interleaving
explorer, outcome-set-plus-invariants comparison, partial-order reduction, and
honest rung reporting. *Pilot:* `p-map` (from Phase 0), promoted
`differential-sampled → exhaustive/POR` with no republish. *Feature:*
`par-interleaving`.

### Phase 4 — §22 `RING` — **SHIPPED 2026-08-10** (`7519b29`)

> rdv mode `ring`: explore the ring unit's space, check **R_ring ⊆ R_free**, and
> record which legitimate act occurred — `preserving` (a recognized ring) or
> `refinement` (an imposed one, with `drops` counted). R_free is an **oracle
> input** stamped from the retained original at normalization time, so the claim
> verified is "a sound refinement of the original", not "self-consistent".
> Proof: racy cursor → R_free 6 / R_ring 1, subset sound, refinement drops 5;
> independent slots → R_free = R_ring = 1, preserving; a "ring" that reverses and
> mangles values produces an outcome not in R_free and is **caught**.
> `@fixture/ring` at v0.4: correct VERIFIED 2/2, broken FAILED 0/2.
> **All four v0.4 features now verify.**
>
> **Phase 4b — liveness** (`5615351`): safety says the ring invents nothing;
> liveness says it keeps moving. The token channel (`held → passed | released`,
> the same shape as §21) asserts mutual exclusion and return, plus generic halt
> detection in the explorer (no work in flight + unsettled call = stuck, which
> is what a lost token looks like from outside). Three units returning the
> **same correct output**: sound VERIFIED 1/1, token-lost FAILED 0/1,
> token-duplicated FAILED 0/1.

*Original scope:*

Mostly Phase 3's machinery plus recognition: verify `R_ring = R_free` for a
recognized ring; *imposing* one is a normalization act, not a verifier feature.
*Pilot:* `ringbuf.js`. *Feature:* `ring`.

### Phase 5 — generation

Only once a feature verifies can the decomposer emit it. Teach the decomposer
the constructs (via injected payload, F.1), and require **definition hints**:

> `PAR`/`RING` are *hints*; the contract lives in `INVARIANT` and `DESCRIPTION`
> lines, as it does for every other construct — "output is invariant under
> interleaving", "at most N in flight", "every armed timer is cleared."

This preserves the property that makes blind quorum work at all: a SIR explains
itself without the schema. *Acceptance gate per construct:* **a cold re-emitter
builds it correctly from the SIR alone.** Quorum divergence means the construct
needs a footnote to be understood, which means it is specified wrong (A3).

**RAN 2026-08-10 — all four v0.4 features pass.** Four cleanroom SIRs, three
blind `sir-reemitter-cr` emitters each, no schema and no fragments. `ring`,
`scheduler`, `lifecycle` passed 3/3 on the first round; `par-interleaving`
needed one harden. Full numbers in `experiments/v04-phase5-generation/RESULTS.txt`.

Two things the gate taught that the plan did not anticipate:

1. **The divergence was not about concurrency.** All three round-1 `boundedMap`
   emitters produced structurally identical worker pools with correct
   position-keying and a correct bound — and split 2–1 on whether the *gate* or
   the *unit* computed the mapping. The v0.4 construct was unanimous; the
   ordinary sentence beside it was not. So the rule added to `sir-decomposer.md`
   leads with the **collaboration boundary**: when a unit is handed a
   harness-owned gate or clock, say which side does the work. That is where
   these contracts actually fail.

2. **`implemented` and `generable` are different claims.** A feature rdv can
   *check* is not automatically one a decomposer may *write*. `capabilities.json`
   now carries both, and `payload.mjs` gates the injected fragment on
   `generable`, so a verifiable-but-not-yet-writable construct cannot leak into
   a decomposer's context. This is the same discipline as A6 (the version tracks
   what rdv can check, not what the schema published), applied one layer up.

## Derived agent context (bigger than this plan; captured here)

The same verb, pointed at the agents. A SIR declares its features; the harness
**computes** the minimal spec payload that unit requires and injects exactly
that. An emitter reconstructing `strip` never sees a word about concurrency; an
emitter on `p-map` gets §19 and §20 and nothing else. The prompt stops being a
maintained document and becomes a derived artifact with provenance.

**What is not novel:** context selection generally (RAG by similarity, prompt
compression, on-demand skill loading).

**What appears to be:** deriving the payload from a **formal declaration**
rather than a similarity score — deterministic, auditable, diffable — and
having a **falsifier**. Everyone pruning context is guessing whether they cut
too much. Blind quorum answers it: if the derived payload is insufficient,
independent emitters diverge, and the decomposer's own contract already reads
divergence as *"the definition was inadequate."* Context minimization becomes an
empirical question with a hard verdict.

**The asymmetry to design around:** the **blind re-emitter** is the clean case
(the contract exists, so its context is fully derivable). The **sighted
decomposer** is not — it is the role *deciding* which features to use, so it
cannot derive its context from a SIR that does not exist yet. Give it a compact
feature index and let it pull sections progressively as it commits to a shape.

**Shape:** `prompt = invariant core + derived payload`. The core is judgment
that is not feature-specific (fidelity anchor, "the oracle beats your prior",
the harden loop) and must not be minimized away. The payload is reference
material keyed to declared features, and cutting unused reference is free.

**Risk:** implicit coupling — a unit declares one feature but needs semantics
from another. Quorum catches it, but only after a failed round; the
feature→section map then gets *fixed*, never widened "just in case" (A8).

## Out of scope

- Transactions / compensation, multi-process effects, the `ui` domain verbs,
  cross-language `spec`-variant anchors — all carried forward as deferred in the
  schema's own list.
- Retro-stamping the 215 legacy bundles. They are valid unstamped (absent =
  v0.1) and re-packing them is churn without a claim change — *except* where a
  bundle uses a versioned feature (W.0).
- Raising `SUPPORTED_SPEC` to `0.4` wholesale. Under F.1 that scalar stops
  being the interesting number.
