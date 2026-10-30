# @rederive/lodash.ceil

Zero-dependency, verified re-derivation of `lodash.ceil@4.0.4` (lodash/lodash).

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
