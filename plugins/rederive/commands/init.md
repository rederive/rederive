---
description: Scaffold the rederive frame (and, with --lang/--type, a data profile) into this repo.
argument-hint: "[--lang <lang> --type <type>]"
---

Run `rdv init --yes $ARGUMENTS` in the project root, then run `rdv doctor`. (`--yes` is the consent a bare
`rdv init` needs off a TTY — without it, a bare init only prints its plan and writes nothing.)

`rdv init` is idempotent and marker-managed: it never overwrites a file it did not write, and re-running it
after a plugin or profile update replaces only the sections it manages (the `<!-- rederive:begin -->` /
`<!-- rederive:end -->` block in `CLAUDE.md`/`AGENTS.md`, the hook scripts, the CI seal).

What it writes:
- **Prompt layer** — a marker-managed section in `CLAUDE.md` (and `AGENTS.md`) explaining the verified-recompose
  workflow, plus `.claude/agents/sir-reemitter(-cr).md` role stubs.
- **Hook layer** — `.claude/settings.json` merged with a `PreToolUse` guard over contract artifacts (`sir/**`,
  `oracles/**`, `specs/**`, `sir.manifest.json`) and a `Stop` hook that refuses "done" while a touched unit's
  `rdv check` (or, for a profile repo, `tools/typikon stop-hook`) is red.
- **Seal layer** — a `.git/hooks/pre-commit` and a GitHub Action re-proving every vendored unit on push/PR —
  the one layer that is harness-agnostic: git is the chokepoint every agent passes.
- With `--lang <lang> --type <type>` naming a profile this plugin ships (currently `rust game`): the profile's
  `CLAUDE.section.md`, `typikon.yaml`, `contracts/<type>.contract.yaml` shape, `tools/{lab,install,typikon,emit}`,
  a Cargo workspace skeleton, and `RULINGS.md`/`HARNESS-FEEDBACK.md` headers, plus a written `rederive.lock`
  (plugin version, sir-factory version+commit, typikon commit, rdv version, toolchain versions, profile).

Then run `rdv doctor` and report its OK/DRIFT lines verbatim — that is the confirmation the scaffold is live,
not a guess.
