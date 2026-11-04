<!-- rederive:begin (managed by `rdv init` — edits between markers are overwritten on re-init) -->
## The loop (per named rule of the sim)
Every rule of the sim with a name worth saying and a number in the design doc is a UNIT: `units/<unit>/` holds
its contract (`sir/<unit>.sir` primary + `sir/<unit>.rust.sir`, and a `.js.sir` when a differential is wanted),
its oracle generator (`oracle/gen.mjs`, computing expecteds FROM the design doc's ruling — never typed) and
the encoded oracle (`oracles/`).
```
architect:   decide the unit + which design-doc lines it owns         (contracts/*.contract.yaml names it, in the giver's words)
decomposer:  Agent rederive:sir-decomposer, GREENFIELD mode           → sir/ + oracle/gen.mjs + oracles/<unit>.json ; report
architect:   read the report's quoted lines; accept/reject            (a misread ruling here converges N/N on the wrong thing)
runner:      Agent rederive:sir-unit-runner (tools/lab prepare → N × sir-reemitter-cr → tools/lab grade → decision.json)
architect:   read runs/decision.json — accept | harden (spawn decomposer in PROPOSE mode) | quarantine
install:     copy the accepted emission byte-exact to crates/<unit>/ ; sim depends on it by path
```
Deterministic steps are ONE command (`tools/lab prepare|grade|void|checkpoint|validate|status`, a wrapper that
drives sir-factory — `npm i -D sir-factory@^0.5.0`). Roles are the plugin's agents (`rederive:sir-decomposer`,
`rederive:sir-reemitter-cr`, `rederive:sir-unit-runner`). Judgment is the main agent's, and its report to the
giver is a DECISIONS list, never a narrative of glue. Status lives on disk: `units/<unit>/runs/STATUS.json` and
`observer/events.jsonl` (`tools/lab status --watch 30`).

## Hard rules
1. **Never type an expected value.** Oracles are computed by `oracle/gen.mjs` from the design doc's numbers
   and rules. If the generator cannot compute it, the rule is ambiguous → a DECISION for the giver, recorded
   in `RULINGS.md`.
2. **The judged never writes the judge.** Emitters write only their emit path. `sir/`, `oracles/`,
   `contracts/`, `typikon.yaml`, and the design doc are written by the decomposer role or the architect, with
   the reason in the commit.
3. **The sim crate is pure.** No clock, no I/O, no randomness it did not receive, no rendering. Seams (RNG,
   transport, signer, bot policy) are traits injected at the edge, never inside the sim crate itself.
4. **A verified unit is installed byte-exact.** `crates/<unit>/` is the accepted emission; edit the CONTRACT
   and re-emit, never the crate. A crate that drifts from its emission is a finding (`tools/install --check`).
5. **The harness is editable here — with a fixture.** When sir-factory, a role definition, typikon, or rdv gets
   in the way, fix it at the source, land the scar as a fixture/test, note it in `HARNESS-FEEDBACK.md`, and
   commit there with the reason. Never weaken a gate to pass your own work.
6. **Numbers come from the design doc by dial name**; a SIR cites the dial, the generator uses it. Dials are
   tuned in playtests; changing one is a contract change (re-encode, re-grade), never a silent edit.

## What is enforced vs advisory
Two profile hooks (`.rederive/guard-contracts.mjs` PreToolUse, `.rederive/verify-changed.mjs` Stop hook +
pre-commit) are STRUCTURAL, not this file's word: they know the real v0.5 layout (`units/<u>/{sir,oracle,
oracles,runs}/`, installed `crates/<u>/INSTALLED.json`), not the generic frame's npm-era one.
- **Hook-denied (a hand Edit/Write is refused, exit 2):** an EXISTING file under `units/<u>/oracles/**` (the
  oracle is computed by `oracle/gen.mjs` via Bash, never hand-edited); an EXISTING file under
  `units/<u>/runs/**/emit_*/**` (a landed emission is evidence, never rewritten). This is a PER-FILE rule, not
  per-directory: a Rust emitter writing `emit_7/Cargo.toml` then `emit_7/src/lib.rs` as two separate Write
  calls gets both allowed (neither file existed yet) — only a later Edit/Write of one of those same paths, now
  that it exists, is denied. Also denied: anything under `crates/<u>/**` once `crates/<u>/INSTALLED.json`
  exists (installed only via `tools/install`). The maintainer window (`SIR_ALLOW_TOOLKIT_EDITS=1` or
  `~/.sir-allow-toolkit-edits`) opens all three for a human-authorized session.
- **Advisory only (reported, not blocked — typikon.yaml's `integrity.protected`, the Tier-1 ruling):**
  `sir/**`, `oracle/gen.mjs`, `contracts/**`, `typikon.yaml`. These are the doors: if a unit needs to change,
  edit one of these, never the oracle, an emission, or an installed crate.
- **The guard is a courtesy rail, not the enforcement — be honest about what it can't see.** The PreToolUse
  guard sees FILE TOOLS only (Edit/Write/MultiEdit/NotebookEdit); a shell redirect or `node oracle/gen.mjs`
  writes unseen by it, and a determined edit can always go around it. The ENFORCEMENT is the grade
  (`runs/decision.json` accepted at the CURRENT primary sha, checked via `tools/lab validate`) and
  `tools/install --check`, run by the Stop hook (advisory — always exits 0, prints a FAIL line) and pre-commit
  (blocking — exits 1 on any FAIL). `git commit` is the one place that actually refuses.

## Commands
```
cargo check                                   # the workspace (sim + installed unit crates)
tools/lab validate <unit>                     # the family validates (decomposer's job to make it so)
tools/lab prepare <unit> [--n 3]              # encode oracle → bind → stage cleanrooms → task cards → plan.json
tools/lab grade <unit> --round N [--cap 3]    # rungs, quorum, decision.json (exit 0 only on accept)
tools/lab status [--watch 30]                 # every unit's step, emissions landed, next
tools/typikon route --spec typikon.yaml --repo . --all
tools/typikon contract --spec typikon.yaml --contract contracts/{{contract}}   # --ratify --by <name> is the giver's act
```
<!-- rederive:end -->
