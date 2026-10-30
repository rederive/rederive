---
description: Where every unit stands — sir-factory unit status, pending typikon rulings, and install drift.
---

Run, in order, and report each section's output (don't summarize away the tables — they're the evidence):

1. `tools/lab status` (or `sir-factory status-v05 units` if this repo has no `tools/lab` wrapper) — every
   unit's current step, emissions landed per language, what's next.
2. `tools/typikon rulings --spec typikon.yaml` — the pending-ruling queue: questions a decomposer filed that
   the requirement-giver hasn't frozen yet. A long queue blocks nothing by itself, but a unit resting on a
   pending ruling can still be re-decided once it's frozen.
3. `tools/install --check` — every installed unit: byte-exact + current, or DRIFT (installed bytes don't
   match `INSTALLED.json`) / STALE (the contract's primary changed since install). Either failure means
   re-emit and reinstall, never hand-patch the installed tree.

If any of these commands don't exist in this repo, say so and stop there rather than guessing at a
substitute — a profile that wasn't scaffolded with `/rederive:init` may not have all three.
