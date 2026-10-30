# rederive (Claude Code plugin)

SIR v0.5 verified-recompose kit: the `sir-decomposer` (npm-sighted + GREENFIELD design-doc modes),
`sir-reemitter` / `sir-reemitter-cr` (blind clean-room), and `sir-unit-runner` (flat process driver over `sir-factory`) roles;
the `greenfield-quorum`, `sir-verify`, `preflight`, and `tools` skills; `/rederive:init`, `/rederive:doctor`,
`/rederive:status` commands; a SessionStart hook that surfaces the live judge (sir-factory/typikon/rdv/toolchain)
versus this repo's `rederive.lock`; and data profiles (`rust-game`) that scaffold a language+type target end
to end. See `.claude-plugin/plugin.json` for the full component inventory and the repo root's `README.md`
for how to add this marketplace.

## Versioning

**A change to this plugin ships to installed consumers only through a version bump.** `claude plugin update`
compares `.claude-plugin/plugin.json`'s `version` field against what a consumer's cache copy has — never file
contents, never a commit hash. Land a fix here without bumping the version and it is real in this repo but
invisible everywhere the plugin is installed: `claude plugin update` reports "already at the latest version"
and leaves the stale cache copy exactly as it was (finding #13, 2026-09-29 — the SessionStart fix in ccae2aa
initially shipped without a bump and a consumer's `claude plugin update` silently did nothing).

The rule, mechanically:
1. Every commit that changes anything under `plugins/rederive/` bumps `.claude-plugin/plugin.json`'s
   `version` — a patch bump (`0.5.0` → `0.5.1`) for a fix or small addition, same as any semver package.
2. The bump is made in **two places at once**, and they must always agree:
   `plugins/rederive/.claude-plugin/plugin.json`'s `version`, and the `rederive` entry's `version` in the
   repo-root `.claude-plugin/marketplace.json`. (`plugin.json`'s value is authoritative when the two differ —
   `claude plugin validate` warns on a mismatch — but a consumer browsing the marketplace before installing
   sees the entry's value, so drift between them is a real bug even though only one of them gates updates.)
   `tests/plugin-version.test.mjs` asserts they're equal; run it before every commit that touches either file.
3. Add a line to `CHANGELOG.md` under the new version number describing what changed, so "why did this
   version bump" never has to be reconstructed from `git log`.

Skipping this for a change that "is too small to matter" is exactly how finding #13 happened — there is no
threshold below which a bump is optional.

## Tests

Plain `node`, no test-runner flags required (works with `node <file>` or `node --test <file>`):
- `tests/plugin-version.test.mjs` — the two version numbers above agree.
- `tests/session-start.test.mjs` — the SessionStart hook's `rdv`-probing behavior.
- `tests/profile-tools.test.mjs` — the rust-game profile's `tools/{lab,emit,typikon}` on a machine without sir-factory or
  typikon, and `tools/lab` forwarding to sir-factory.
- `tests/profile-hooks.test.mjs` — the rust-game profile's guard + verify hooks. (This test file itself
  lives here, not under `profiles/rust-game/`, because `rdv init` copies everything under a profile
  directory into the consumer verbatim — a test fixture is not a consumer file; see CHANGELOG.md 0.5.2.)
