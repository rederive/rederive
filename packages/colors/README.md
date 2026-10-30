# @rederive/colors

Verified re-derivation of `colors@1.4.0` (Marak/colors.js): an implementation in js, rust and ts.

**Trust nothing.** This package ships its **contract**: one primary SIR (`sir/strip.sir`), a language file per
language, and ONE held-out oracle (`oracles/strip.json`, typed, f64 compared by bits). Each implementation was
reconstructed from the contract alone by independent blind workers and accepted only on quorum.

The js variant is also graded on a **js envelope extension** (`oracles/strip.js.json`, pinned in the manifest's `lang:js` variant):
vectors whose values fall outside the primary's language-neutral envelope (JS-only values such as undefined, bigint or a
lone surrogate), held in their own js-native encoding and checked for the js artifact only.

| language | artifact | verified |
|---|---|---|
| js | `src/strip.mjs` | quorum 3/3, cross-verified, + js envelope extension |
| rust | `src/strip-rs/` | quorum 3/3, cross-verified |
| ts | `src/strip.ts` | quorum 3/3, cross-verified |

Cross-verified: 2000/2000 seeded inputs produce identical results in js, rust, ts.

```
npx -p rederive rdv check .     # re-verify every language against the oracle + content hashes (no tokens)
```

`rdv check` uses your own toolchains: TypeScript (`npm i -D typescript @types/node`) for the ts variant; `cargo` for the Rust crate. A language whose toolchain is missing halts the check with
the install hint; it is never skipped.

- **Claim:** verified-equivalent to the original on a held-out set, per language. Testing, not proof.
- **Provenance & full contract:** `sir.manifest.json`.
