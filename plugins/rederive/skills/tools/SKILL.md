---
name: tools
description: What commands exist in a rederive-scaffolded repo, and who runs them. Load this before reaching for a role agent or a raw CLI invocation in a consumer repo — it is the map, not a workflow to execute.
---

# The tools in a rederive repo

This is a brief, not a workflow. Read it to know which command does which job before you run one or spawn a
role. The full loop (architect decides, roles operate) is `CLAUDE.md`'s job in the consumer repo — read that
too when one exists.

## The verifier — sir-factory, deterministic, no LLM

`tools/lab` (a repo-local wrapper) or `sir-factory` (the npm package directly, `npm i -D sir-factory@^0.4.0`; its judge
is rederive's own) is the verifier. The wrapper finds sir-factory via `SIR_FACTORY` (a checkout), the repo's
`node_modules`, or `sir-factory` on PATH, says so plainly when none exists, takes unit NAMES (`units/<unit>`), and sets
the observer feed for you. Called directly, sir-factory takes the unit DIRECTORY (`sir-factory grade units/<unit> …`).

| command | does |
|---|---|
| `prepare <unit> [--n 3] [--real <module>]` | encode the oracle, bind the language file(s), stage clean-room copies, write task cards + `runs/plan.json` |
| `grade <unit> --round N [--cap 3]` | run every emission through the harness, decide quorum, write `runs/decision.json` — `next` is `accept` \| `harden` \| `quarantine` \| `verifier-fault` |
| `void <unit> --lang L --round N --reason '…' [--restore]` | a round the VERIFIER spent (staging/driver fault) does not count against the cap |
| `checkpoint <unit> --step S …` | write `runs/STATUS.json` + append the observer feed — the only way anything but `prepare`/`grade` records progress |
| `validate <unit>` | the SIR family validates on its own (binding, schema, self-consistency, transcription-density lint) |
| `status [--watch N]` | every unit's step, emissions landed, what's next — reads `units/*/runs/STATUS.json` (`sir-factory status-v05`) |
| `doctor` | are the roles this repo names actually registered (`.claude/agents/*.md`), is sir-factory reachable (wrapper only) |

Deterministic means: never asks an LLM anything. It runs real code (the emission, the harness, the oracle
comparison) and reports facts. This is why it is a command, not a skill or an agent.

## The roles — spawn via the Agent tool, never as a raw process unless emitting

- **`rederive:sir-decomposer`** — the only role that reads original source (npm-sighted mode) or a design
  document (GREENFIELD mode, no package). Writes `sir/<unit>.sir` (+ language files, + oracle generator in
  GREENFIELD). Never spawned by the runner — a harden is a REPORT, the architect decides and re-spawns it.
- **`rederive:sir-unit-runner`** — drives `prepare` → spawns N `sir-reemitter-cr` per language, all at once →
  `grade` → reports VERIFIED / QUARANTINED / a harden request. Never writes a contract or an implementation.
- **`rederive:sir-reemitter-cr`** (Read+Write only) / **`rederive:sir-reemitter`** (Write only) — blind
  clean-room emitters. One of N whose outputs are compared for quorum; never see the original.
- Outside a session, `tools/emit <unit> <lang> <i>…` spawns emitters as fresh `claude -p --agent
  sir-reemitter-cr` processes instead (a fresh process always sees `.claude/agents`; refuses if
  `ANTHROPIC_API_KEY` is set — emitter fleets never bill an API key).

**The main agent decides; the roles operate.** Reading a divergence, accepting a harden, ratifying a
contract, freezing a ruling — those are the architect's (the session's, ultimately the requirement-giver's) acts. A role that
finds itself doing one of those STOPS and reports instead.

## `tools/install [--check] [<unit>…]`

Copies an accepted emission byte-exact into the consumer's installed tree (e.g. `crates/<unit>/` for a Rust
game repo) and records `INSTALLED.json` (files + hashes, the primary's SHA, the oracle's canonical SHA, the
round and quorum). `--check` re-hashes every installed unit against its record and against the CURRENT
primary — drift or a stale primary both fail. Never edit the installed tree by hand; edit the contract and
re-emit.

## `tools/typikon <subcommand>` (PYTHONPATH-wired to `typikon`, or `typikon` on PATH via `uv tool install`)

The intent-contract and reach auditor. The subset a unit's loop touches: `route --spec typikon.yaml --repo .
[--all]` (reach vs. declared aspect), `contract --contract <file> [--ratify --by <name>]` (does the
decomposition still satisfy the giver's requirements, in the giver's words), `rulings` (the pending-ruling
queue), `ask` (file one), `rule` (freeze one into the canon), `decide` (the SIR-or-not gate), `stop-hook`
(what the repo's Stop hook calls). `typikon --help` lists the rest (`attest`, `deny`, `anathemas`, `density`,
`admit`) — those back the audit surface, not the per-unit loop.

## `tools/emit` — see Roles above; the out-of-session emitter spawn path.

## `rdv <subcommand>` — the CLI wrapper (npm, on PATH)

`rdv init --yes` (bare: the generic frame) or `rdv init --lang rust --type game` (a profile) scaffolds an empty or
existing repo (never overwrites a file it did not write; a bare `rdv init` without a TTY only PRINTS its plan — pass
`--yes`); `rdv doctor [--brief|--strict]` compares the live toolchain (sir-factory, typikon, rdv,
plugin versions) against `rederive.lock` and prints OK/DRIFT per row; `rdv claude […]` is the convenience
wrapper (report sir-factory/typikon → init if needed → `exec claude`); `rdv check <pkg-or-unit>` re-runs a unit's
held-out oracle against its shipped source, deterministic, no tokens.

## State that lives on disk, not in a transcript

- `units/<unit>/runs/STATUS.json` — the current step. `observer/events.jsonl` — the timeline
  (`SIR_FACTORY_EVENTS_FILE`, set by the wrapper).
- `rederive.lock` (repo root) — the judge lockfile: plugin version, sir-factory version+commit, typikon commit,
  rdv version, toolchain versions, profile. `rdv doctor` is the only thing that compares against it.
- `RULINGS.md` / `HARNESS-FEEDBACK.md` (repo root, profile-seeded) — decisions the giver made on purpose,
  and every place the harness itself got in the way and what changed at the source, with a fixture.

The judged never writes the judge: `sir/`, `oracles/`, `contracts/`, and `typikon.yaml` are written by the
decomposer role or the architect, never by an emitter or the runner.
