# rederive — agent setup & first verified re-derivation

You are setting up rederive (a trust-nothing package manager: packages ship a verifiable contract — a spec and a
held-out oracle — not bytes to trust) and running its loop for me. Follow these steps in order.

0. Install the CLIs (Node ≥ 18): `npm i -g rederive sir-factory`. Verify with `rdv --help`.

1. If you are Claude Code, install the plugin: `/plugin marketplace add rederive/sir-toolkit`, then
   `/plugin install sir@sir-toolkit` (adds the `sir-verify` and `preflight` skills plus the role agents).
   Other agents: the CLIs are enough — the methodology docs live at https://github.com/rederive/sir-toolkit
   and the spec at https://github.com/rederive/sir-spec.

2. Ask me which of these I want:
   a. VERIFY — re-prove a verified package against its contract: `rdv check <dir>`. Deterministic, offline,
      no tokens; safe in CI as `rdv check <dir> && deploy`.
   b. RE-DERIVE — get a dependency out of my trust tree: decompose it into a contract + oracle, rebuild it
      blind, and accept it only on quorum (the `sir-verify` skill drives `sir-factory`:
      install → decompose → stamp → re-emit → grade → pack).
   c. DE-DEPENDENCY A PROJECT — the whole-tree version of (b): run the project's test suite for a baseline,
      enumerate its runtime dependencies, re-derive each one (leaves first), vendor the verified sources with
      provenance headers, rewire the imports, remove the dependencies from package.json, and prove the
      project's own test suite still passes. Keep the verification bundles in the repo so CI can re-prove
      every vendored unit with `rdv check`. Quarantine (and report) anything you cannot soundly verify —
      an ambient-effect unit, an RNG core, a licensing gap — rather than shipping it unverified.
   d. PREFLIGHT — my code has no tests: build a measured-strength characterization oracle first
      (coverage inputs → adversarial review → mutation testing → chaos pass), then use it as the
      source of truth for (b) or for a migration.
   If I name a project and say it has too many dependencies, that means (c). If I'm not sure, propose (b) on
   my smallest pure dependency and estimate the time before starting.

3. Run the loop. The discipline is non-negotiable: expected values are NEVER hand-authored — they are stamped
   by executing the original. Held-out cases stay hidden from whoever implements. If a gate fails, report the
   failure precisely; do not tune inputs or retry your way past it — a miss is a finding.

4. When it is green, give me three things: the `rdv check` output, where the verified bundle lives, and one
   sentence stating exactly what was proven (quorum, held-out count, verified envelope).

The toolkit is immutable from your seat: never edit `rdv` or `sir-factory` to make a check pass — if you hit a
real tool bug, report it (github.com/rederive/sir-factory/issues) or quarantine the unit.
