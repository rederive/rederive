# rederive — the trust-nothing package manager

A SIR package ships its **contract** — a structural spec (`sir/`) + a **held-out oracle** (`oracles/`) —
not bytes you have to trust. A consumer either **verifies** the shipped implementation against that
contract, or **rebuilds** it locally from the spec. Either way, the thing you trust is an independent
oracle the publisher can't move, not the publisher's binary.

```
npm registry:          you install a prebuilt artifact and TRUST the publisher (and everyone upstream).
rederive:                 you get a spec + a held-out oracle. You verify the bytes, or regenerate them yourself.
```

> **Open core, for real.** The CLI, the SIR format, the verified-recompose loop, and the public
> catalog are Apache-2.0 and stay that way. What's open and what we'll ever charge for — and the
> things we promise *never* to do to the community — are written down and binding in
> **[The rederive Promise](STEWARDSHIP.md)**.

## Getting set up: `rdv init`, `rdv doctor`, `rdv claude`

Install the CLI with `npm i -g rederive` (or run it once with `npx -p rederive rdv …` — the npm name `rdv` belongs to an
unrelated package; `rdv --help` lists every command).

`rdv init --yes [--lang <lang> --type <type>]` scaffolds a project: the CLAUDE.md/AGENTS.md marker section,
contract-guard + verify hooks, agent roster, and pre-commit + CI seal are written every time. A **bare `rdv init`
only prints its plan** unless it runs at a TTY (where it asks y/N) or you pass `--yes` — so in scripts, CI, and agent
sessions use `rdv init --yes` (`--dry-run` prints the plan for either form). With
`--lang`/`--type` it additionally copies the matching profile (e.g. `rust-game`) write-once — it never
overwrites a file it didn't write — wires `extraKnownMarketplaces`/`enabledPlugins` and, when the profile
ships a `typikon.yaml`, a Stop hook into `.claude/settings.json`, and stamps a `rederive.lock` recording
the exact plugin/sir-factory/typikon/rdv/toolchain versions it found. `rdv doctor [--brief] [--strict]` re-probes
that same judge and reports `OK`/`DRIFT`/`MISSING` per component (`--brief` for a one-line status suitable
for a SessionStart hook; `--strict` exits 1 on any drift, suitable for CI). `rdv claude [args…]` is the
no-CLI-required on-ramp: it reports whether the optional `sir-factory` (the v0.5 unit loop; `npm i -D sir-factory`) and
`typikon` (the Stop-hook harness, not a published package yet) are found — it installs nothing — runs `rdv init` if the repo is not
initialized yet and you passed `--init`, refuses to launch when
`ANTHROPIC_API_KEY` is set (emitter fleets shouldn't run on API-key billing — pass `--allow-api-key` to
override), and then execs the real `claude` with your arguments untouched.

## The commands

| command | what it does | tokens |
|---|---|---|
| `rdv check <pkg>`   | re-run each unit's **held-out oracle** against `src/`, and verify the recorded **content hashes**. Deterministic. | none |
| `rdv vis <pkg>`     | (re)generate `vis.html` — what's in the package, each unit's kind/signature/proof, provenance, limitations. | none |
| `rdv resynth <pkg>` | **rebuild `src/` locally** from `sir/` + `oracles/` via N isolated quorum workers (original deleted), then re-verify. v0.1–v0.4 bundles; a v0.5 bundle with language variants halts (re-derive it with `sir-factory`). | torches tokens |
| `rdv audit [dir]`   | declared vs delivered: the **real** dependency surface of a project (lockfile or `node_modules`), install hooks included. `--json` for machines. | none |
| `rdv guard <base-lock> <head-lock>` | gate a PR's dependency **adds** (npm/pnpm) → green/yellow/red; RED = an install hook on a non-established dep. `--reporter github\|ado\|json`. | none |

`check` is the load-bearing trust primitive — and it's deterministic and free. The oracle is held-out
(the implementation never saw it), so passing it is evidence of *behavior*, not of matching a snapshot. A v0.5
bundle is also held to the strict v0.5 SIR rules (no comments, register, leak and pin lints, binding) — a lint
error fails the unit, whatever it grades.

## Languages & toolchains

A v0.5 unit can ship **language variants** — `sir/<unit>.sir` (the language-neutral primary) plus
`sir/<unit>.<lang>.sir` and a `lang:<lang>` implementation — each graded on the **same** canonical oracle through a
verifier-owned driver. `rdv check` harnesses three:

| variant | needs on your machine | rung it can earn |
|---|---|---|
| `lang:js`   | nothing beyond Node | harness-verified |
| `lang:ts`   | `typescript` + `@types/node` resolvable from the bundle or your project (`npm i -D typescript @types/node`) | type-checked (`tsc --strict` + SIG conformance) → harness-verified |
| `lang:rust` | `cargo` on PATH ([rustup.rs](https://rustup.rs)) | type-checked (`cargo check`) → harness-verified |

rdv bundles no compiler: when a bundle carries a variant whose toolchain is missing, `check` **halts** and names the
install hint rather than skipping the variant. A language outside these three halts the same way.

## A second mode: verified normalization (`rdv normalize`)

The catalog re-derives a unit from a *compact* contract. But some code has no compact contract — a
2,000-line promise machine, a stateful HTTP client, a concurrent coordinator. For those you don't delete the
original; you **keep it running as the oracle**, propose a firewall-clean factoring, and verify the new
structure reproduces the original on **generated, held-out scenarios it never saw**. You modernize a tangle
and prove you didn't change its behavior. (Mode 1 guards against hallucination; Mode 2 guards against an
incomplete refactor.)

It reaches the parts that defeat a compact contract: timers verify on **virtual time**, the event loop is
injected and replayed, and genuinely **concurrent** code is verified by owning the message scheduler and
checking the space of interleavings — exhaustively for small inputs, **partial-order-reduced** beyond.

**Status (honest):** the *method* is validated on real modules — `debug`, `q`, `request`'s redirect state
machine (256/256 on generated + held-out scenarios), `p-map` (concurrency contract verified across the whole
interleaving space for small inputs, POR-scaled beyond). `rdv normalize` as a one-command workflow is **being
built — it is not a shipping CLI command yet.**

## Why it's a supply-chain defense

The oracle is an **independent source of truth nobody upstream can edit**. Tamper with the shipped
`src/` — a sabotage, a malicious patch, a subtle regression — and `check` catches it two ways at once:

```
$ rdv check packages/colors          # after flipping one character in src/strip.js
  ✗ FAILED  strip
     held-out 5/10 miss=[ho_combined_sgr_leading,ho_csi_clear_screen,…]   hashes MISMATCH (src:false …)
  VERIFICATION FAILED — do not trust this src; rebuild with: rdv resynth packages/colors
```

The behavioral oracle catches *what changed*; the content hash catches *that anything changed at all*.

## First package: `@rederive/colors`

A verified-recompose of **`colors@1.4.0`** — the last release before the [Jan-2022 maintainer
sabotage](https://github.com/Marak/colors.js) of `colors`/`faker` that broke thousands of builds.
The exact case this model is for: an abandoned-but-load-bearing package you can't trust to a maintainer.

- **`strip`** — zero-dependency, quorum-verified (3/3), 10 frozen / 10 held-out. Behavior-locked to
  the original *including its limitation*: it removes only single-parameter SGR codes — CSI/OSC
  terminal-injection escapes survive (see `packages/colors/README.md`). The oracle documents that,
  so the contract is honest about what the code does and doesn't do.

From a **checkout of this repo** (the npm scripts below exist only here, not in the installed package):

```bash
npm install            # dev deps (tsx, esbuild)
npm run check          # rdv check packages/colors  → ✓ VERIFIED
npm run vis            # writes packages/colors/vis.html
```

## Package layout

```
packages/<name>/
  sir.manifest.json   provenance (source + sha256), units[], per-unit oracle/src/sir hashes, verify status
  sir/<unit>.sir      the spec skeleton (kind, signature, oracle pointer; original deleted)
  oracles/<unit>.json frozen (in-prompt) + held-out (graded) vectors — expecteds stamped by EXECUTION
  src/<unit>.js       the verified, quorum-passed, zero-dep implementation
  vis.html            generated by `rdv vis`
  package.json        zero-dep
```

## Status (honest)

- `check` + `vis` — deterministic, done, self-contained: the published CLI is one bundled file with no runtime
  dependencies (a `lang:ts` / `lang:rust` variant additionally needs that toolchain — see above).
- `resynth` — the local token-torching rebuild. The re-emit substrate is **not wired into this CLI**:
  a plain CLI can't spawn Claude Code subagents. Drive it via the **`sir-verify` skill** from the
  `rederive` Claude Code plugin (`/plugin marketplace add rederive/rederive` → `/plugin install rederive@rederive`,
  see below), or a direct Messages-API worker; then `rdv check` must pass and the manifest `srcSha256` is updated.
  v0.5 language-variant bundles are re-derived with `sir-factory` (`prepare → emit → grade → pack-v05`), not `resynth`. `rdv build`
  (AOT/native) is reserved.
- Built on the SIR verified-recompose toolkit (decompile → kind-graph → held-out oracle → quorum re-emit).

## The ecosystem

| artifact | what | where |
|---|---|---|
| `rdv` (this repo) | the trust-nothing verifier | [npm `rederive`](https://www.npmjs.com/package/rederive) |
| `sir-factory` | the build orchestrator (the v0.5 unit loop: `prepare` / `grade` / `pack-v05`) | [npm](https://www.npmjs.com/package/sir-factory) · [repo](https://github.com/rederive/sir-factory) |
| `rederive` plugin | Claude Code skills & agents (`sir-verify`, `preflight`, `greenfield-quorum`, the SIR roles) | `plugins/rederive/` in this repo (`rederive@rederive`) |
| SIR Schema | the normative spec (v0.5) | [repo](https://github.com/rederive/sir-spec) · [narrative](https://rederive.ai/spec.html) |

## Claude Code plugin

The `rederive` marketplace and plugin now live in this repo: `.claude-plugin/marketplace.json` at the root,
plugin at `plugins/rederive/` (SIR v0.5: the `sir-decomposer` / `sir-reemitter(-cr)` / `sir-unit-runner` roles,
the `greenfield-quorum` / `sir-verify` / `preflight` / `tools` skills, `/rederive:init` · `/rederive:doctor` ·
`/rederive:status`, and language+type profiles such as `rust-game`). Add the marketplace and install with:
```
/plugin marketplace add rederive/rederive
/plugin install rederive@rederive
```
For local development against a checkout instead of GitHub, add it by path — a relative path must start with
`./` or `../`, or use an absolute path (see the [plugin install docs](https://code.claude.com/docs/en/plugins/install.md#add-a-marketplace)):
```
/plugin marketplace add /path/to/your/rederive-checkout
/plugin install rederive@rederive
```
The previous `sir@sir-toolkit` plugin ([`rederive/sir-toolkit`](https://github.com/rederive/sir-toolkit)) is
now **legacy**: its skills and examples moved here, and new work should target `rederive@rederive`.
