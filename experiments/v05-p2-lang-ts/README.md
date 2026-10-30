# Phase 2a (SIR_V05_PLAN): the TypeScript driver in rdv

**Claim under test:** rdv verifies a `lang:ts` variant through its own driver (`cli/lang-ts.mts`): bound to the unit's
primary, type-checked against the language file's SIG, then graded on the same held-out oracle as the JavaScript.
Each control fails on exactly one of those, and the output says which.

**Result: PASS.** Tests: `cli/lang-ts.test.mts` (9) + the updated `cli/features.test.mts`. Rebuild the fixture with
`node experiments/v05-p2-lang-ts/stamp.mjs` (needs `~/sir-lab/v05-lang`).

| bundle | verdict |
|---|---|
| `bundle/`: shipped `@rederive/bytes` + the lab's v0.5 family + the quorum-kept `emit_1.ts` | VERIFIED, `harness-verified`: held-out 43/43 on the SHIPPED oracle (the emission was graded in the lab on a different, canonical oracle), tsc --strict ok, conforms to SIG, bound to primary `41de3c55a395…` |
| `controls/widened/`: only the return type widened (`\| undefined`) | FAILED at type-checked alone: TS2322 in the conformance shim; held-out still 43/43 |
| `controls/stale/`: the primary edited after `bytes.ts.sir` was bound | FAILED on the binding alone (`STALE: bound to 41de3c55a395…`); no rung |
| a behavior change that still type-checks (test-only mutation) | FAILED on held-out; earns `type-checked` only |
| an otherwise-correct artifact with `as any` (test-only) | FAILED: any-ban |
| a src edited without re-stamping its hash (test-only) | FAILED on hashes |
| the good bundle on a machine with no TypeScript | HALTED before grading: "carries lang:ts, whose toolchain is not on this machine (npm i -D typescript)" |

**Design:** rdv ships no compiler. It runs the consumer's own `typescript` (resolved from the bundle dir, then the working
directory) as a process, so TypeScript 5 and 7 both work. The SIG check compiles a one-line shim,
`const conforms: <SIG as a function type> = impl`, so a widened return or a narrowed parameter is a compile error.
`tsc --strict` accepts `any`, `!` and `@ts-ignore`, so those are linted (the lab's any-ban, code positions only).

**Not yet:** carried data in a `lang:ts` variant is refused, not graded (the lab generates `.d.ts` from the primary's
SHAPE; rdv does not yet). rdv checks rungs up to `harness-verified`; a claimed `cross-verified` is reported, never echoed.
