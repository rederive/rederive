# rederive — launch readiness audit (2026-06-16)

Non-destructive audit run from disk (not from prose). Verdict: **the Mode-1 product is mechanically
launch-ready** — `check`, the dual-channel tamper detection, the dep-free CLI, and packaging are all solid.
**One honesty blocker** (request ships an un-checkable unit) and a couple of cosmetics to clear before
publishing. The irreversible launch actions (repo public, deploy, npm publish) are still pending by design.

## GREEN — verified working

- **`rdv check` passes on all three packages** — colors (1 unit), rdv (4: eq/grade/quorum/hashOk),
  request (3: paramsHaveRequestBody/toBase64/getProxyFromURI). Exit 0.
- **Dep-free bundle** — `npm run build` → `dist/cli.cjs` (16.4 kB); the *bundled* CLI runs standalone and
  `check` passes with zero runtime deps. (`dist/` is git-ignored and rebuilt by `prepublishOnly` — correct.)
- **Tamper detection (dual channel), rigorously confirmed** (sha verified to actually change first):
  - behavioral tamper (`\x1B`→`\x1C`) → held-out 6/10 miss **and** hash mismatch;
  - cosmetic, behavior-preserving tamper (append a comment) → held-out 10/10 pass **but hash mismatch
    catches it**. Exactly the README's "behavioral catches what changed; hash catches that anything did."
- **CLI exit codes are CI-safe** — PASS → 0, tampered → 1, missing package → 1. `rdv check && deploy` is safe.
- **`npm pack` contents clean** — root CLI = 7 files (LICENSE, README, STEWARDSHIP, both `.mts` sources for
  transparency, `dist/cli.cjs`, manifest). Each catalog package = exactly its `files` whitelist
  (`src/ sir/ oracles/ specs/ sir.manifest.json README LICENSE`); no build scripts, no `vis.html`, no
  `node_modules`. Per-package LICENSE + README present.
- **Metadata sane** — scoped names, semver+`-rdv.N` tags, `homepage` rederive.ai, repo URLs with
  `directory`, licenses (Apache-2.0 for CLI/rdv/request, MIT for colors), `publishConfig.access:public`,
  `engines.node>=18`, `type:module`, bins `rdv`+`rederive`.
- **CLI UX honest** — `resynth` runs a graceful *prepare* mode (writes prompts, points to the sir-verify
  skill; does not pretend to spawn agents), `vis` writes the report, help works.
- **Site** — open-source-first, no dead patent language; `faker`/`q` correctly badged "queued" (roadmap).

## YELLOW — clear before publishing

1. **[blocker] `@rederive/request` ships an un-checkable unit.** The package ships `src/httpRequest.js` +
   `oracles/httpRequest.json` + `sir/httpRequest.sir`, but the manifest `units[]` lists only the 3 that
   `rdv check` verifies; `httpRequest` (the NET trace unit) is verified by `trace-verify.mjs`, which is **not
   published**. So a consumer who installs `@rederive/request` receives an `httpRequest` unit the shipped
   tooling cannot verify — which undercuts the trust-nothing thesis. **Fix (pick one):** (a) drop
   `httpRequest` from the published package (ship only the 3 checkable units); (b) add a trace-check mode to
   `rdv check` and ship the trace harness + a trace oracle entry in `units[]`; (c) clearly mark it in the
   request README as "trace-verified separately, not by `rdv check`" with a repo pointer. (a) is the cleanest
   for launch; (b) is the right long-term answer.
2. **[cosmetic] `vis.html` is tracked in git** (a generated artifact); regenerating it produces diffs.
   Either git-ignore it (like `dist/`) or accept it as an intentionally-rendered in-repo report.

## GAP — launch doesn't reflect current capability (separate task, deferred)

- **No Mode 2 / `rdv normalize` anywhere** in site/README/spec. The verified-normalization capability
  (untangle legacy + concurrent monoliths, behavior-locked, POR-scaled) is the strongest thing we have now
  and is entirely absent from the launch materials. Folding it in is its own task (you chose audit-first).

## PENDING — the irreversible launch actions (do last, after YELLOW)

- [ ] flip repo public: `gh repo edit rederive/rederive --visibility public --accept-visibility-change-consequences`
- [ ] deploy rederive.ai
- [ ] `npm publish` — order: CLI (`rederive`), then `@rederive/colors`, `@rederive/rdv`, `@rederive/request`
  (dry-run each first; `request` only after the httpRequest decision).

## Go / no-go

- **CLI + `@rederive/colors` + `@rederive/rdv`:** GO (mechanically clean, verified).
- **`@rederive/request`:** NO-GO until the httpRequest un-checkable-unit decision is made.
- **Story:** mechanically launchable as Mode-1; consider folding in `rdv normalize` so the launch reflects
  capability.
