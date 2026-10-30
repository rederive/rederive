# Phase 4 (§22) — `RING`: a refinement, and a checkable one

**Claim under test:** when a unit coordinates through a **single circulating
permission** — only the token-holder acts — the interleaving space collapses to
a deterministic schedule. The property that makes that sound is a refinement
relation: **R_ring ⊆ R_free**. A ring may *drop* outcomes; it may never *invent*
one.

**Result: PASS.** `node verify.mjs` (frozen in `RESULTS.txt`); the fixture bundle
here is what rdv verifies.

## The three cases, and why the third one matters

```
shared cursor (racy)
  R_free = 6 outcomes over 16 schedules   ["[1,2,3]","[1,3,2]","[2,1,3]",…]
  R_ring = 1 outcome                      ["[1,2,3]"]
  subset: YES — sound
  verdict: REFINEMENT — drops 5 outcomes, must be documented

independent slots (already order-insensitive)
  R_free = 1   R_ring = 1
  verdict: behavior-PRESERVING (recognition) — R_ring = R_free

a BROKEN "ring" (reverses + mangles values)
  R_ring = ["[101,102,103]"]
  subset: NO — CAUGHT: it invents an outcome the free unit cannot produce
```

The distinction §22 draws is between **recognizing** a ring that was already
there (behavior-preserving) and **imposing** one during normalization (a
deliberate narrowing). Both are legitimate. What is not legitimate is imposing
one *silently* — quietly shipping a unit that does less than the original did
is how a verifier lies politely, so `relation` and `drops` are recorded in the
oracle rather than left implicit.

The third case is the teeth: a "ring" that isn't a refinement at all is exactly
the mistake this check exists to catch, and it fails on the subset test.

## rdv verdicts

`@fixture/ring`, `specVersion 0.4`, features `vectors, ring`:

```
CORRECT ring (sound refinement)   ->  ✓ VERIFIED  2/2   exit 0
BROKEN "ring" (invents outcomes)  ->  ✗ FAILED    0/2   exit 1
```

Stamped relations — n=3: R_free 6 → R_ring 1 (`refinement`, drops 5);
n=4: R_free 24 → R_ring 1 (`refinement`, drops 23).

## Where R_free comes from

rdv cannot compute it — the free unit is not in the bundle. It is an **oracle
input**, stamped by the decomposer from the *retained original* at normalization
time, which is precisely the situation §22 describes ("recognize … or impose …
during normalization"). rdv explores the ring unit's own space and checks the
subset relation against that stamped set, so the claim being verified is
"this ring is a sound refinement of the original", not "this ring is
self-consistent".

## Liveness — the two ways a ring stops (Phase 4b)

The refinement check is a **safety** property: the ring invents nothing. It says
nothing about whether the ring keeps *moving*, and a ring has exactly two ways to
stop — both invisible to every other channel:

- **token LOST** — nobody holds the permission, so the unit halts. A halted run
  produces no outcome at all, which an outcome-set comparison reads as *"no
  outcomes"* rather than as a bug.
- **token DUPLICATED** — two actors hold it at once, so the ring silently
  degenerates into the free unit and its determinism was a coincidence of the
  schedule you happened to explore.

`node verify-live.mjs` (frozen in `RESULTS-LIVE.txt`) runs three units that
**all return the same correct output** `[1,2,3]`:

```
sound ring        held(0) passed(0->1) passed(1->2) released(2)   LIVE
token LOST        held(0) passed(0->1) passed(1->2)               NOT LIVE — still held by [2]
token DUPLICATED  held(0) held(1) held(2) released…               NOT LIVE — 3 simultaneous holders
```

The channel is the same shape as §21's: `armed → fired | cancelled` becomes
`held → passed | released`.

In rdv, the token lives on the gate (`gate.token.take/pass/release`) so units
that don't use one produce no channel and are unaffected. `runOneSchedule` also
gained **generic halt detection** — no work in flight and an unsettled call means
the unit is stuck, which is what a lost token looks like from outside, and which
would previously have hung the await.

`@fixture/ring-live`, `specVersion 0.4`:

```
SOUND ring        ->  ✓ VERIFIED  1/1   exit 0
token LOST        ->  ✗ FAILED    0/1   exit 1
token DUPLICATED  ->  ✗ FAILED    0/1   exit 1
```

Both failures are on units whose **output is correct**.

Re-stamp: `node stamp.mjs` / `node stamp-live.mjs` · verify: `rdv check .`
