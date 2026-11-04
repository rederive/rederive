# Changelog — rederive (Claude Code plugin)

One line (or a short list) per released version. A version here MUST match `.claude-plugin/plugin.json`'s
`version` AND the `rederive` entry's `version` in the repo-root `.claude-plugin/marketplace.json` — see
README.md's "Versioning" section for why that pairing is load-bearing, not just bookkeeping.

## 0.5.8
- Every `sir-factory` version pin reads 0.5: `sir-unit-runner` (≥ 0.5.0, was ≥ 0.4.0 — the number that read as "the
  v0.4 loop") and the rust-game profile's CLAUDE section (`sir-factory@^0.5.0`; profile 0.5.1).
- `sir-verify` no longer names `sir-factory-runner` (an agent this plugin never shipped): the roster entry is
  `sir-unit-runner` for the v0.5 loop, and Step 2 says plainly that it walks the LEGACY single-file loop
  (SIR v0.2–v0.4) and points v0.5 units at `sir-unit-runner` + the `tools` skill. A full v0.5 rewrite of the skill is
  still to do.

## 0.5.7
- **sir-factory is renumbered 0.4.0 → 0.5.0 with no code change**: its major.minor now tracks the SIR spec version it
  targets (0.5.x builds v0.5 units; the legacy loop inside still builds v0.2–v0.4 units). "sir-factory 0.4" next to
  rederive 0.5.x / plugin 0.5.x / spec v0.5 read as "the v0.4 loop" and convinced a context-free agent the v0.5 loop
  was not on npm. The tools skill now pins `sir-factory@^0.5.0`.

## 0.5.6
- The public v0.5 loop is **sir-factory** (npm `sir-factory` ≥ 0.4.0); the private SIR v0.5 lab (`@rederive/lab`) is not
  published and nothing here depends on it any more. The runner role is renamed `sir-lab-runner` → **`sir-unit-runner`**
  and drives `sir-factory prepare / grade / checkpoint / void` (same contract: one unit, N `sir-reemitter-cr` per language
  from the task cards, never a decomposer, report-then-act, round cap, artifacts confirmed on disk before grading,
  out-of-cleanroom replies quoted). A consumer whose CLAUDE.md names `rederive:sir-lab-runner` re-runs `rdv init`.
- rust-game profile: `tools/lab` / `tools/emit` call sir-factory (resolved from `SIR_FACTORY`, the repo's `node_modules`,
  or PATH; missing → a plain `npm i -D sir-factory@^0.4.0` hint, exit 3); `tools/lab status` is `sir-factory status-v05`,
  `validate` is `sir-factory validate`; the observer feed is `SIR_FACTORY_EVENTS_FILE`. `profile.json` requires
  `sir-factory@^0.4.0`. The CI seal installs `sir-factory` from npm (pinned by `rederive.lock`'s `factory.version`, else
  `^0.4.0`) and fails closed until 0.4.0 is published. `verify-changed` reports an unreachable verifier as such, not as a
  stale binding.
- `/rederive:status`, `/rederive:doctor`, `/rederive:init`, the `tools` skill, the decomposer (bind / validate /
  encode-oracle via sir-factory; v0.5 exemplars from `examples/v05/`) and the READMEs say sir-factory where they said the lab.

## 0.5.5
- v0.5 currency, no contract changes: the rust-game profile's `tools/lab` / `tools/emit` resolve the lab from `SIR_LAB` or
  the `sir-lab` on PATH (no `~/sir-lab/v05-lang` default) and say plainly when neither exists; `tools/typikon` uses the
  `typikon` on PATH or a `TYPIKON` checkout (no `~/typikon` default) and its advisory `stop-hook` passes with a one-line
  note when typikon is absent; the CI seal fails closed with a plain reason when `@rederive/lab` cannot be installed.
- `/rederive:init` runs `rdv init --yes` (a bare init off a TTY only prints its plan); the `sir-decomposer` OUTPUT rule
  says a v0.5 SIR carries NO comments (`#` is `E_COMMENT`, which `rdv check` now enforces) and marks `minimal.sir` /
  `complex.sir` as v0.4-register density calibration; `@rederive/lab` and typikon are named as not yet published.

## 0.5.4
- `examples/v05/*.{js,ts,rust}.sir` re-bound: `PRIMARY-SHA256` now hashes the primary's canonicalText (a formatting-only
  normalization) instead of its canonical print, which under-covered the primary (found by rederive's re-derivation of its own
  binding hash, selfhost/units/canonical_print). Contracts unchanged.

## 0.5.3
- v0.5 exemplars re-proven for the SIR v0.5 Phase 1 gate, fresh blind 3/3 in js, ts and rust each:
  `examples/v05/min_indent.{sir,js.sir,ts.sir,rust.sir}` (new: the minimal exemplar's unit re-cut cold into the v0.5
  register, round 1, cross-verified 2000/2000) and `get_rgb.sir` + `.rust.sir` refreshed to the hardened primary (R9
  signed zero, EARNED round-1 heldout v7; R5 percent alpha as x 0.01; 3 rounds, cross-verified 2000/2000).

## 0.5.2
- profile no longer ships its own test fixture (#15): `rdv init` copies everything under
  `profiles/rust-game/` verbatim into a consumer repo, so `profiles/rust-game/tests/profile-hooks.test.mjs`
  was landing as a stray `tests/profile-hooks.test.mjs` in every real consumer. Moved to
  `plugins/rederive/tests/profile-hooks.test.mjs`, alongside the plugin's other tests; nothing under
  `profiles/rust-game/` is a test file any more.

## 0.5.1
- SessionStart hook probes `rdv` instead of trusting it by name — never prints raw usage/help text into a
  session's context when a stale binary is resolved, and prints exactly one line either way (#12).
- `.rederive/guard-contracts.mjs` (rust-game profile): the landed-emission deny is per-file, not
  per-directory (a two-write Rust emitter landing `Cargo.toml` then `src/lib.rs` no longer gets its second
  write denied), and now matches single-file js/ts emissions (`emit_1.mjs`, `emit_2.ts`), not just
  directory-shaped rust crates.
- `.rederive/verify-changed.mjs` (rust-game profile): no longer prints a false FAIL for a changed product
  crate (`sim`, `shell`, `bots`, `tube`) that was never installed as a unit — only a real unit's crate is
  checked.
- `CLAUDE.section.md` (rust-game profile): new "What is enforced vs advisory" section stating plainly what
  the guard can and can't see.

## 0.5.0
- Initial ship: the `rederive` marketplace + plugin move the Claude-side kit out of the legacy
  `sir@sir-toolkit` plugin — roles (`sir-decomposer` with GREENFIELD mode, `sir-reemitter`/`-cr`,
  `sir-lab-runner`), skills (`greenfield-quorum`, `sir-verify`, `preflight`, `tools`), commands
  (`/rederive:init`, `/rederive:doctor`, `/rederive:status`), a SessionStart hook, v0.5-register examples,
  and the `rust-game` profile extracted from a real Rust game repo.
