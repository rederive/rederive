# @rederive/fast-json-stable-stringify

Zero-dependency, verified re-derivation of `fast-json-stable-stringify@2.1.0` (https://github.com/epoberezkin/fast-json-stable-stringify).

**Trust nothing.** This package ships its **contract** — a SIR specification (`sir/`) and a held-out oracle
(`oracles/`) — not just bytes you have to trust. The `src/` implementation was reconstructed
**original-deleted** by independent blind workers and accepted only on quorum + a saturation differential
against the real package.

```
npx -p rederive rdv check .     # re-verify src/ against the held-out oracle + content hashes (no tokens)
```

- **Verified:** quorum 3/3, differential 400/400 (coverage-audited held-out).
- **Claim:** verified-equivalent to the original on a coverage-audited held-out set — testing, not proof.
- **Provenance & full contract:** `sir.manifest.json`.
