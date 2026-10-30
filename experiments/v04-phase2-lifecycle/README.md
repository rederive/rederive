# Phase 2 (§21) — the resource-lifecycle channel

**Claim under test:** cancellation is *invisible* to the value and trace
channels — a leaked timer still fires, but its effect is a no-op on
already-settled state, so the emit/reply sequence is byte-identical while a real
resource leak goes uncaught. A unit that arms cancellable resources therefore
needs a **third** oracle channel: `armed / fired / cancelled`.

**Result: PASS.** `node verify.mjs` (frozen in `RESULTS.txt`).

## The experiment is adversarial, not illustrative

Two units differing by **exactly one line** (`clearTimer`), graded on all three
channels. If value or trace could tell them apart, §21 would be unnecessary and
this directory would say so.

| scenario | value | trace | lifecycle |
|---|---|---|---|
| response wins the race | **identical** | **identical** | `cancelled` vs `fired` — **caught** |
| response wins, slow but in time | **identical** | **identical** | **caught** |
| timeout wins | identical | identical | identical — *correctly* no difference |

The third row is the control that matters: when the timeout legitimately wins
there is nothing to cancel, and the channel must not manufacture a difference.
It doesn't.

## Wired into rdv

`makeFakeTimers()` in `cli/rdv.mts` is the injectable timer boundary — the
harness owns `setTimer`/`clearTimer` and time only moves when the oracle's
script says `advance`, which is what makes a timer race a deterministic,
replayable function of the timeline instead of a wall-clock coin flip. It
records every transition and reports what was left armed (`leaked`).

The channel is **additive**: a unit that never touches `http.timers` produces no
lifecycle events, and its expectation is omitted entirely — so every existing
trace oracle grades byte-identically to before (verified against
`@rederive/colors`, `@rederive/bcryptjs`, and the trace-mode `@rederive/request`).

`lifecycle` is now `implemented: true` in `capabilities.json`, which means a
bundle declaring it **verifies on a v0.4 stamp** — the ramp working as designed.

## The fixture that proves rdv catches it

A hand-built `@fixture/lifecycle` bundle (`specVersion 0.4`, features
`vectors, trace-seam, lifecycle`), oracle stamped by executing the correct unit:

```
CORRECT src  ->  ✓ VERIFIED   held-out 2/2                    exit 0
LEAKY src    ->  ✗ FAILED     held-out 0/2 miss=[both]         exit 1
```

The leaky run's trace (`request, end`) and result (`"hello"`) are **identical**
to the correct run's. It fails on one field:

```
expected  lifecycle: {"events": ["armed(100ms)", "cancelled"], "leaked": 0}
got       lifecycle: {"events": ["armed(100ms)", "fired"],     "leaked": 0}
```

Re-run: `node verify.mjs`.
