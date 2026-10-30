---
description: Check the live toolchain (sir-factory, typikon, rdv, plugin) against this repo's rederive.lock.
---

Run `rdv doctor`.

It prints one line per judge component — sir-factory (version + commit), typikon (commit), rdv (version), this
plugin (version), toolchain (node/cargo) — comparing the live version to what `rederive.lock` recorded, as
`OK` or `DRIFT` (`LEGACY-LOCK` for a lock written before sir-factory replaced the retired lab — re-run
`rdv init`). It also lists the commands available (`tools/lab`, `tools/typikon`, `tools/install`, `tools/emit`,
`rdv`, or their absence) and whether the roles this repo's `CLAUDE.md` names are registered
under `.claude/agents/`. Exits 0 always unless `--strict` is passed, in which case any `DRIFT` exits 1 — use
`--strict` in CI, plain `doctor` (or the `--brief` one-liner the plugin's `SessionStart` hook runs) day to day.

A `DRIFT` line means a grade or install under this repo may not reproduce the same verdict as one made under
a different judge version — report it, don't silently re-run against the new judge and call it the same
result.
