# v0.5 register exemplars

`minimal.sir` and `complex.sir` (one level up) are the v0.4-era CONCISION calibration pair, still valid for
"how dense should this contract be." These two units are the v0.5-register exemplars: real contracts that
went through the SIR v0.5 unit loop end to end (then in the private SIR v0.5 lab; the public loop is
`sir-factory`, the same `prepare` / `grade` contract) — primary + a `.rust.sir` language
file, bound (`PRIMARY-SHA256` stamped, not the 64-zero placeholder), validated, and VERIFIED under blind
quorum. Study the register (`SIG` with abstract types, `TABLE`/`PINNED`/`MECHANISM`/`ABI` lines, numbered
`R1..Rn` rules, `CANONICAL-SHA256` on the `ORACLE` line), not the v0.4 `STEP`/`BRANCH` narration style.

- **`get_rgb.sir` + `get_rgb.rust.sir`** — from `color-string@2.1.4`'s `cs.get.rgb`, `FIDELITY spec` (one
  deliberate correction from the package, R7). Shows a `CARRIED` data table with `AUTHORITY` assertions
  pinned to an independent published standard (CSS Color Module Level 4), `PINNED regex` lines, and the
  `(x + 0.5).floor()` half-up rounding `MECHANISM` a naive `f64::round` gets wrong. Source (provenance):
  `units/get_rgb/` in the private v0.5 lab, which is not published. Re-proven for the
  Phase 1 gate (2026-10-23): fresh blind 3/3 in js, ts and rust after two hardens of the primary (R9: every zero
  in a result is +0, EARNED round-1 heldout v7; R5: percent alpha is the value x 0.01), cross-verified 2000/2000.
- **`min_indent.sir` + `.js.sir` + `.ts.sir` + `.rust.sir`** — `min-indent@1.0.1`, `FIDELITY package`: the
  minimal exemplar's unit, re-cut COLD into the v0.5 register (the decomposer never saw `minimal.sir`). The
  cleanest view of the firewall: the primary states the three character sets (INDENT, BREAK, BLANK) as
  language-neutral code-point pins, each established by probing the real package over every UTF-16 code
  unit; the JS dialect regex `/^[ \t]*(?=\S)/gm` appears ONLY in `.js.sir`, as a cited pin; `.rust.sir`
  names the std functions that get those sets wrong. VERIFIED round 1, fresh blind 3/3 in js, ts and rust,
  cross-verified 2000/2000 (SIR v0.5 Phase 1 gate, 2026-10-23).
- **`kill_precedence.sir` + `kill_precedence.rust.sir`** — GREENFIELD: no package exists. `ANCHOR` is a game
  design document section (`docs/GDD-v0.5.md` §4.2 + §14.4) instead of a package, the oracle is COMPUTED by
  an independent `oracle/gen.mjs` reference (never hand-typed), and a `NOTE decision-pending` records an
  ambiguity the requirement-giver later froze as a ruling. Shows a `TABLE RANKS` block, a zero-dependency
  Rust ABI (`&[(u64, &str)] -> Option<u64>`, no `[dependencies]` at all), and an `UNGUARDED-PRECONDITION`
  line. Source: a Rust game repo's `units/kill_precedence/` — the first unit through that game's GREENFIELD
  loop (see the plugin's `rust-game` profile).

Both are cited by `sir-decomposer.md`'s GREENFIELD MODE section as the study pair for a design-doc-anchored
contract; `get_rgb` for tables/pins, `kill_precedence` for records/TABLE ranks/frozen-ruling ANCHOR.
