# rederive — agent setup & first verified re-derivation

You are setting up rederive (it replaces npm dependencies with small copies in the user's repo and checks code — rebuilt
or AI-written — against held-back tests whose answers come from running the original; independent builds must agree,
and one spec serves JavaScript, TypeScript and Rust; anyone can re-run the check offline with `rdv check`) and running its loop for me.
Follow these steps in order.

0. Install the CLIs (Node ≥ 18; this installs global tools only, nothing in my project): `npm i -g rederive@^0.5 sir-factory`. Verify with `rdv --version` (it must print
   0.5 or later; this document is written for 0.5 and its steps differ on 0.4). Toolchains are mine, not rdv's:
   TypeScript variants need `typescript` (tsc) and `@types/node` resolvable from the project, Rust variants need
   `cargo` — check with `npx tsc --version` / `cargo --version` and tell me what is missing rather than skipping a
   language. `rdv check` halts with an install hint on a missing toolchain, by design.

1. **Zero-footprint demo first — nothing in my project changes.** In a fresh temporary directory (e.g.
   `cd "$(mktemp -d)"`), run `npm i @rederive/colors`, then `rdv check node_modules/@rederive/colors` and show me
   the output (it should say VERIFIED). Then change one character of a file under
   `node_modules/@rederive/colors/src/` (for example, remove the `g` flag from the pattern in `src/strip.js`) and
   run the same `rdv check` again: show me that it now FAILS — some held-back tests miss and the file hash mismatches.
   That is the whole idea in one minute. Do not run anything in my project during this step.

2. **Ask me before touching my project.** Only after I say yes: in the project root, run
   `rdv init . --dry-run` and show me the plan. Only after I approve that plan, run `rdv init . --yes`.
   (Without a terminal, a bare `rdv init .` only prints its plan and writes nothing — you need `--yes`.) If the
   project already has its own CLAUDE.md or AGENTS.md section, use `--adopt`: it never drops content, and
   anything the managed section does not say is kept verbatim under "## Project rules". Never use
   `--force-adopt` unless I ask. It writes the rederive section into CLAUDE.md/AGENTS.md, an agent roster, hooks
   that protect contract artifacts and re-verify touched units, and a pre-commit + CI seal. Ask me before
   committing what it writes. From here on, the scaffold — not this document — is your working frame; re-read
   the CLAUDE.md section it added.

3. If you are Claude Code, also install the plugin: `/plugin marketplace add rederive/rederive`, then
   `/plugin install rederive@rederive` (adds the `sir-verify`, `greenfield-quorum`, and `preflight` skills plus
   the full role-agent roster). If `sir@sir-toolkit` is already installed, that is the legacy pre-0.5 plugin —
   tell me and prefer `rederive@rederive`. Other agents: the CLIs + the scaffold are enough — the sources live
   at https://github.com/rederive/rederive and the spec at https://github.com/rederive/sir-spec.

4. Ask me which of these I want:
   a. VERIFY — re-check a verified package against its contract: `rdv check <dir>`. Deterministic, offline,
      no tokens; safe in CI as `rdv check <dir> && deploy`.
   b. RE-DERIVE — get a dependency out of my trust tree: decompose it into a contract + oracle, rebuild it
      blind, and accept it only on quorum (the `sir-verify` skill drives `sir-factory`:
      install → decompose → stamp → re-emit → grade → pack).
   c. DE-DEPENDENCY A PROJECT — the whole-tree version of (b), in this order:
      c1. BASELINE (gate — do not start any decomposition before this): run the project's own test suite
          and report the counts to me (e.g. "182 passing, 1 known failure"). This number is the finish line.
      c2. Enumerate the runtime dependencies (skip devDependencies and types-only packages — say so if you skip one).
      c3. Re-derive each, leaves first; vendor the verified sources with provenance headers.
      c4. Rewire the imports; remove the dependencies from package.json.
      c5. Re-run the project's test suite and report baseline vs. after — the counts must match.
      Keep the verification bundles in the repo so CI can re-check every vendored unit with `rdv check`.
      Quarantine (and report) anything you cannot soundly verify — an ambient-effect unit, an RNG core, a
      licensing gap — rather than shipping it unverified.
   d. PREFLIGHT — my code has no tests: build a measured-strength characterization oracle first
      (coverage inputs → adversarial review → mutation testing → chaos pass), then use it as the
      source of truth for (b) or for a migration.
   e. BUILD NEW CODE — I'm building a feature or an app "using rederive": decompose it into NAMED leaves
      (behaviors with names worth saying out loud — the kind npm packages, RFCs, or algorithm literature
      already name; glue stays thin), then per leaf: contract + stamped oracle → implement or blind-re-emit
      via 2–3 isolated re-emitter subagents (the roster `rdv init` installed) → accept on quorum →
      `rdv check` green. The `greenfield-quorum` skill drives this end to end. For each unit, ask which languages
      it ships in. You (the agent, through the skill and its role agents) write the contract files: the behavior
      goes in ONE primary file (`<unit>.sir`, language-neutral), and each target language gets its own language
      file (`<unit>.js.sir`, `<unit>.ts.sir`, `<unit>.rust.sir`) holding only that language's signature and
      mechanism. The toolkit does not write them for you — it checks them: `sir-factory` stamps the oracle and
      grades the blind re-emissions, and `rdv check` verifies each language against the same oracle and the same
      primary. The languages must agree; never fork the behavior per language.
      Do NOT invent an internal spec format — the SIR spec exists: https://rederive.ai/spec.html.
   If I name a project and say it has too many dependencies, that means (c). If I say "build X using
   rederive", that means (e). If I'm not sure, propose (b) on my smallest pure dependency and estimate
   the time before starting.

5. Two objections you will be tempted by — the answers, in advance:
   - "This is too big to spec." → Decompose further. A leaf too big to contract is two leaves.
   - "This is non-deterministic." → The nondeterminism (clock, network, randomness, model calls) lives at
     the EFFECT BOUNDARY as injected inputs; the core stays deterministic and oracle-testable. A wrapper
     around an LLM is deterministic plumbing around a nondeterministic input.

6. Run the loop. The discipline is non-negotiable: expected values are NEVER hand-authored — they are stamped
   by executing the original (or a chosen reference). Held-back (held-out) cases stay hidden from whoever implements while they build. If a
   gate fails, report the failure precisely; do not tune inputs or retry your way past it — a miss is a finding.

7. When it is green, give me three things: the `rdv check` output, where the verified bundle lives, and one
   sentence stating exactly what was verified (per language: quorum, held-out count, the rung earned —
   type-checked / harness-verified / cross-verified — and the verified envelope, including any language that was
   narrowed or omitted and why). For mode (c), also
   the before/after test-suite counts — a mode-(c) result without a baseline number is incomplete.

The toolkit is immutable from your seat: never edit `rdv` or `sir-factory` to make a check pass — if you hit a
real tool bug, report it (github.com/rederive/sir-factory/issues) or quarantine the unit. The hooks `rdv init`
installed enforce the same rule for this project's contracts: a red check is a finding, not an obstacle.
