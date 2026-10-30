# Phase 3 (§19) — `PAR`: verification over the space of interleavings

**Claim under test:** a concurrent unit is verified not on *a* schedule but over
the **space** of them, with the coverage rung reported honestly — `exhaustive`
when the whole space was walked, `partial-order-reduction` when independence
collapsed it, `sampled` when neither was possible.

**Result: PASS.** This directory is the fixture bundle rdv verifies.

## Why one schedule is not enough — the three lines that make the case

A `boundedMap` that keys results by **completion order** instead of input
position, run under three different interleavings of the *same* input:

```
in-order completions   -> [2,4,6,8]   <- LOOKS CORRECT
second-item-first      -> [4,2,6,8]   <- wrong
another interleaving   -> [4,6,2,8]   <- wrong
```

A single sampled run that happened to take the first schedule **passes this
unit**. That is the bug class §19 exists for, and it is not exotic — keying by
arrival order is one of the most common concurrency mistakes there is.

## rdv verdicts

`@fixture/par`, `specVersion 0.4`, features `vectors, par-interleaving`:

```
CORRECT src (keyed by input position)   ->  ✓ VERIFIED  2/2   exit 0
BROKEN src (keyed by completion order)  ->  ✗ FAILED    0/2   exit 1
```

The oracle's expecteds were stamped by *executing* the correct unit, and record
the coverage achieved:

| vector | schedules | outcome classes | rung | maxInFlight |
|---|---|---|---|---|
| n=4 c=2 | 8 | 1 | `exhaustive` | 2 |
| n=5 c=3 | 54 | 1 | `exhaustive` | 3 |

Those counts match Phase 0's standalone explorer exactly — the embedded and
standalone implementations agree.

## How it works in rdv

`makeGate()` takes completion order away from the runtime: the unit awaits
`gate.open(value)` for each concurrent slot, so a **schedule** is a list of
decisions about which in-flight slot settles next, and a run is a replayable
function of that list. `runPar` DFS-walks the decision tree, learning each
step's branching factor by replay.

**The ladder is reported, never assumed.** Exploration stops at a cap and says
so; POR's "independent sub-traces collapse to one class" is *checked* (the
outcome-class count) before it is used to justify a representative. Silently
checking 500 of 10¹² schedules and printing a checkmark is precisely the failure
this channel exists to prevent.

Re-stamp: `node stamp.mjs` · verify: `rdv check .`
