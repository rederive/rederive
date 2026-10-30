# dep-guard — dependency-add PR gate (GitHub Actions + Azure DevOps)

Gate a PR on risky dependency **adds** — the "a junior slipped `left-pad` / a hook-bearing worm into a PR" case — on your own infra, no data egress. One CI-aware script (`dep-guard.sh`) drives both GitHub and ADO.

- **RED** (blocks): an install hook on a *non-established* package (GitHub contributor bus-factor < 5 and not allowlisted) — the worm/typosquat vector.
- **YELLOW** (surfaces): a new direct dep you can't vouch for; a brand-new package.
- **GREEN**: rederive-verified, or a clean add. Established native binaries (esbuild, fsevents, …) are build steps, not worms.

Zero-network core (works behind a private registry); GitHub/npm metadata is best-effort and never blocks when unavailable. npm (`package-lock.json`) + pnpm (`pnpm-lock.yaml`).

**Only the root lockfile is read** (`pnpm-lock.yaml`, else `package-lock.json`, at the repository root). Lockfiles in subdirectories are not gated. A repo with no root lockfile gets a notice ("nothing to gate") and passes (exit 0): that is a deliberate no-op, not a failure, so check the notice if you expected a gate.

## Exit codes and failure mode

| exit | meaning |
|---|---|
| 0 | green / yellow, or no root lockfile (notice) |
| 1 | RED — blocks the PR |
| 2 | the guard itself failed: `npx`/`rdv` crashed, or printed empty or invalid JSON |

The guard **fails closed** by default: a crash is exit 2 and fails the check, because a gate that silently passes when it cannot run is not a gate. Set `fail-closed: 'false'` (GitHub) or `DEPGUARD_FAIL_CLOSED: 'false'` (ADO) to turn a guard failure into a warning and a pass.

## Inputs (GitHub) / environment (ADO)

| input | env | default | |
|---|---|---|---|
| `rederive-version` | `DEPGUARD_RDV_VERSION` | `0.5.0` | the exact verifier version: runs `npx --yes rederive@<version>` |
| `fail-closed` | `DEPGUARD_FAIL_CLOSED` | `true` | see above |
| `rdv` | `DEPGUARD_RDV` | (empty) | advanced: replace the whole invocation, e.g. `node ./dist/cli.cjs` for a local build |

The guard always runs with `--reporter json`; the script renders each CI's native annotations from that JSON.

## GitHub Actions
Copy `example-workflow.yml` to `.github/workflows/dep-guard.yml`. Needs `fetch-depth: 0`. Pin the action to a release tag (`@v0.5.0`), never `@main`.

## Azure DevOps
Use `azure-pipelines-dep-guard.yml` as a pipeline (or fold its steps into an existing one), and add it as a **build-validation branch policy** so it runs on PRs. Needs `fetchDepth: 0`. Emits `##vso[task.logissue]` annotations + a build summary; a RED fails the task and blocks the PR.

The plumbing auto-detects the CI (GitHub `GITHUB_ACTIONS` / ADO `TF_BUILD`) and emits each one's native annotations + summary.
