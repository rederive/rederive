# Phase 2 gate (SIR_V05_PLAN): `@fixture/lang`, one bundle in three languages

**Claim under test:** rdv verifies a v0.5 bundle's `lang:js`, `lang:ts` and `lang:rust` variants, each through its own
verifier-owned driver, against ONE canonical oracle (`sir-canonical-v1`: typed values, f64 by bits, no tolerance).
Each control fails on exactly one thing, and the output says which.

**Result: PASS.** Tests: `cli/lang-rust.test.mts` (8), with `cli/lang-ts.test.mts` (9) and `cli/features.test.mts`.
Rebuild with `node experiments/v05-p2-lang/stamp.mjs` (needs `~/sir-lab/v05-lang`).

The unit is min-indent@1.0.1, re-cut cold and re-proven fresh blind 3/3 in every language in Phase 1 (cross-verified
2000/2000 in the lab). The bundle is the lab's family as-is: the primary, three language files, the canonical oracle
(16 frozen + 13 held-out), and one quorum-kept emission per language.

| bundle | verdict |
|---|---|
| `bundle/` | VERIFIED. js `harness-verified`; ts and rust `type-checked` → `harness-verified`; all three bound to primary `dad9c27fdf88…` |
| `controls/ts-widened/`: ts return type `number \| undefined` | FAILED at type-checked alone (TS2322); js and rust unaffected |
| `controls/rust-wrap/`: the empty case wraps to `0u64.wrapping_sub(1)` | FAILED on the u64 comparison alone, 9/13: `expected 0 got 18446744073709551615`, all 64 bits intact |
| `controls/rust-narrowed/`: returns `u32` for the SIG's `u64` | FAILED at type-checked alone: `u32: DeclaredResult<u64>` (rdv's result pin) |
| one byte changed in the crate, hash not re-stamped (test-only) | FAILED on the tree hash (`src:false`) |
| an oracle vector edited, file sha re-stamped (test-only) | ORACLE FAULT in every language: the vectors no longer hash to their declared canonical sha |
| `lang:rust` pointed at a legacy (untyped) oracle (test-only) | refused: needs a `sir-canonical-v1` oracle |
| no `cargo` on PATH (test-only) | HALTED before grading: "install Rust: https://rustup.rs" |

**The Rust driver** is the lab's (`cli/lang/rust.mjs`, promoted), with two rdv additions:
- **Result pin.** The lab's harness pinned every argument type but only serialized the result, so a `u32` where the SIG says
  `u64` compiled and graded. rdv pins scalar results (`T` or `Result<T, E>`). Composite results stay unpinned: the lab
  verified five get_rgb crates returning `[f64; 4]` for `tuple[f64, f64, f64, f64]`, the same wire in a different spelling.
- **`--locked`.** A crate shipping `Cargo.lock` builds with exactly those versions, and the harness is seeded with it.

**Found promoting it:** the lab driver had failed every top-level `json`/`map` argument since 2026-09-25 (E0282, an
uninferable `Ok`). Fixed in both copies, with a lab test (`tests/json-toplevel-arg.mjs`) that fails on the old driver.
Swept: all 20 kept lab crates (bytes, defaults_deep, escape_string_regexp, get_rgb, min_indent, slugify) build and grade
EXACT through rdv's driver. minimist's crates and `.rust.sir` still declare the pre-09-25 ABI and need a re-cut.

**Not yet:** carried data in a `lang:ts`/`lang:rust` variant is refused, not graded. The harness crate depends on
`serde_json` from crates.io at verify time (needs the network once; not pinned by checksum).
