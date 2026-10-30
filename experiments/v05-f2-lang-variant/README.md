# F.2 (SIR_V05_PLAN) — the language capability model: the A6 fixture

**Claim under test:** a bundle that carries a target-language variant no released rdv can harness is
refused everywhere it could slip through: by this rdv, by an rdv from before the capability model, and
by the factory before it can be packed. The bundle is never quietly graded through the JS harness, never
under-stamped, and never over-claimed.

**Result: PASS.**

`bundle/` is the shipped `@rederive/bytes` plus a `lang:rust` variant taken from the v0.5 lab
(`sir-lab/v05-lang/units/bytes`: `bytes.rust.sir` + the quorum-kept `runs/rust/emit_1`; js/ts/rust 3/3
there, cross-verified 1976/1976). It is stamped `specVersion 0.5` with features `vectors, lang-variant`.
It is a SHAPE fixture. No rdv can verify it yet, and saying so is the point. Rebuild it with
`node experiments/v05-f2-lang-variant/stamp.mjs` (needs `~/sir-lab/v05-lang`).

| rdv | bundle | verdict |
|---|---|---|
| this rdv (0.5, capability model) | as stamped | HALTED: requires lang-variant; carries lang:rust, this rdv harnesses js |
| this rdv | UNDER-stamped (no `features`, no `specVersion`) | HALTED, same message. The structural gate reads variant keys and per-language SIR paths, not the bundle's own claims |
| published rederive@0.4.0 (predates `features` and `languages`) | as stamped | HALTED on the scalar: spec v0.5 > rdv 0.3 |
| published rederive@0.4.0 | under-stamped | exit 1, a crash importing `src/bytes.rs`: fails closed, but untidily. An old rdv is protected only by the stamp, which is why pack must never under-stamp |
| sir-factory pack | a workdir holding `sir/<unit>.rust.sir` | REFUSED before writing anything: uses lang-variant, which rdv does not implement yet |
| `@fixture/par`, `@fixture/ring` (v0.4) | unchanged | VERIFIED, unchanged; all 218 shipped packages also verify |

Tests: `cli/features.test.mts` (F.2 cases + both rdv gates) and `sir-factory/test/pack_features_selftest.mjs`
(the pack refusal). The 0.4.0 rows were measured once by hand (npm pack rederive@0.4.0, 2026-10-23); the test
suite does not fetch from the network.
