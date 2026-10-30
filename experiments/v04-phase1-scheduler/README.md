# Phase 1 (§20) — the scheduler is a control effect

**Claim under test:** a clock *read* is a point value you can inject like any
input, but *scheduling* is different — timers and the microtask queue decide
**when deferred work runs relative to everything else**. A timer race is
nondeterministic on the wall clock, so it is verified on **virtual time**: the
event loop injected as a scheduler the harness drives, making resolution order a
deterministic, replayable function of the timeline.

**Result: PASS.** `node verify.mjs` (frozen in `RESULTS.txt`).

## The danger is not flakiness — it is the branch you never run

The headline finding, from the control at the bottom of the run. The same race
on the **real** clock, 20 times:

```
winners: {"timeout": 20}
```

Not flaky. *Consistent* — and consistently wrong about coverage. The machine
picks a winner, picks the same winner every run, and the reply branch of the
unit is **never executed**. You ship a verified unit with an unverified branch
and no test ever goes red. Flaky tests at least announce themselves; this
doesn't.

On virtual time, both branches are one parameter apart:

| timeline | trace | value | lifecycle |
|---|---|---|---|
| reply at 40ms, timeout at 100ms | `start, reply` | resolved | `armed, armed, fired, cancelled` |
| reply at 100ms, timeout at 40ms | `start, timeout` | rejected | `armed, armed, fired, fired` |
| **both due at 50ms** (the tie) | `start, timeout` | rejected | deterministic: earlier-armed wins |

Each replayed 50 times: **1 distinct outcome each, stable**.

## The microtask half

The reply in the fixture settles through two *nested* microtasks — where real
code hides its ordering assumptions. The rule the harness enforces, matching
real event-loop semantics but deterministically: **microtasks run to exhaustion
before each timer callback and again after it.** So "the reply's `.then` chain
settled before the timeout fired" becomes a fact about the scripted timeline
rather than about how busy the machine was.

A queue that will not settle raises rather than hanging — a scheduling loop is
a finding, not a timeout.

## Wired into rdv

`makeFakeTimers()` gained `schedule(fn)` and the drain discipline, completing
§20 (the timer half landed with §21). `scheduler` is now `implemented: true`.

Additive as before: units that never schedule anything are unaffected —
regression-checked against `@rederive/colors`, `@rederive/bcryptjs`, the
trace-mode `@rederive/request`, and the v0.4 `@fixture/lifecycle` bundle.

Re-run: `node verify.mjs`.
