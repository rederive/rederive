---
name: sir-verify
description: Verify or migrate a code unit by reconstructing it from a spec + a frozen oracle and proving it on HELD-OUT inputs the implementation never saw (quorum of independent blind re-emissions). Drives the shipped `sir-factory` CLI (install→decompose→stamp→re-emit→grade→pack) and the `rdv` verifier (check / resynth) via the role agents. Use to re-derive an npm package into a verified zero-dependency version, to migrate a function/route to new code (the original is the oracle), or to verify novel code against properties. The held-out split is what distinguishes a correct port from a confident hallucination.
---

# sir-verify — the verified-recompose loop, as a tool

You turn "reimplement this unit" into a **supervised-learning problem with a held-out test set**:
frozen oracle = training set (in the prompt), held-out = test set (the impl never sees it),
quorum = ensemble agreement, coverage = hard-example mining. An in-prompt pass means nothing
(train accuracy is always ~100%); the **held-out pass** is the only evidence of generalization.

**Two legs, and they are NOT substitutes — ship only when both hold.** A verified-recompose passes
*both*: (1) a **differential vs the real unit** — your emission reproduces the original's behavior
(held-out expecteds are stamped from it; the factory's saturation differential extends this to N≥400
random cases). Proves *correctness*. (2) an **independent quorum** — ≥2 *blind* emitters, contract
only, agree on the full held-out set. Proves the *contract is sufficient to independently reconstruct
the unit* (the ship-the-contract / `rdv resynth` property). They catch different failures, so neither
replaces the other: **no differential, however large, removes the quorum requirement** — you built or
stamped your version *with the original in view*, so quorum is the *only* evidence an independent party
could rebuild it from the contract alone. (Conversely, a quorum on a thin oracle can agree on the wrong
thing — that is the coverage leg's job.) This holds for hand-rolled/custom units too: there is no "I
verified it well enough to skip the blind leg."

## The shipped tools (all you need installed)

- **`sir-factory`** — the build-orchestrator CLI. Subcommands: `install → decompose(role) → stamp →
  stage-reemit → grade → pack`. Mechanizes the whole loop for an npm unit and **enforces BOTH gates at
  `grade`** (held-out quorum + saturation differential). `sir-factory status` summarizes a run.
- **`rdv`** — the trust-nothing verifier. `rdv check <bundle>` re-verifies a shipped bundle's `src/` against
  its held-out oracle + content hashes (deterministic, no tokens; catches tamper — behavioral miss *and* hash
  mismatch). `rdv resynth <pkg>` rebuilds the impl **locally** from the contract, original-deleted.
- **Role agents** (spawn via the Agent tool, `subagent_type`): `sir-decomposer` (SIGHTED — the only role that
  reads source; writes the SIR + input-generator, runs the harden loop), `sir-reemitter-cr` / `sir-reemitter`
  (BLIND — reconstruct from the contract alone; tool-restricted so "original-deleted" is structural, not a
  promise).
- **`sir-factory-runner`** (agent) — drives the whole per-unit sequence *and* the role-agent spawns for you.
  Use it to run a unit (or a worklist) end to end instead of hand-stepping the subcommands.

Everything below is HOW to drive these well. The oracle is the only real decision; the rest is mechanical.

## Step 1 — source the oracle (the only real decision)

"Where does the held-out ground truth come from?" Walk this in order (strongest first):

1. **Original/reference exists** (re-derive a package, migration, lift-and-shift) → **vectors mode**: run the
   original on inputs to STAMP expecteds. Free + perfect. The original is the oracle.
2. **Known algorithm/protocol** (sha256, base32, semver) → vectors mode, expecteds from published
   test vectors or a reference lib you run.
3. **Trivially-correct slow version writable** → write it, it stamps the clever one (vectors mode).
4. **No exact outputs, but invariants hold** (novel code) → **property mode**: round-trip
   (decode∘encode=id), idempotence, determinism, charset/regex, conservation, monotonicity. The
   oracle is a `(generator, properties)` pair, not a table. Property oracles verify
   *correctness-of-contract*, not identity-to-a-reference — the right tool for greenfield.
5. **Effectful** → record/replay: inject the boundary (clock/fetch/rand/fs/env) and capture the trace as
   values. The `sir-decomposer` handles read-effects as INJECTED seams (deterministic above the seam); a
   network boundary is first-class TRACE-MODE (`KIND EFFECT` + `TRACE-SEAM http`, graded by `rdv check`).
6. **Genuine judgment** (a product decision, "should it 404 or 200?") → the human authors ONE
   frozen vector; the tool's job is to SURFACE the decision, never invent it.

A "novel" unit is rarely uniformly oracle-poor: **decompose to named leaves** (which are
oracle-rich by node 1–3) + property oracles for the thin glue + frozen human rulings for judgment.
Decomposition *is* oracle-sourcing.

### Off-fit classes — pick the sanctioned path, never improvise a grader
Some units don't sit cleanly on nodes 1–4. Do NOT hand-author a one-off grader for them (an agent that
is both author and judge of its own envelope is the vacuous-gate trap). Instead:
- **Higher-order / async-control** (takes a function; manages concurrency/scheduling — `p-map`,
  `p-limit`): differential vs the real unit using *instrumented probe mappers* (a mapper that records
  call order/args/timing); assert results **+ observable order + the concurrency bound**. It is a node-1
  differential with the function arg as a probe, not a value table. Still needs the quorum leg.
- **Orchestration** (walks a tree / drives IO / glues leaves — `globby`, a router): **decompose** —
  verify the leaves individually, then the thin glue by differential vs real over a *saturating fixture
  set* (random trees × in-scope inputs, sorted-result equality). Don't quorum the whole engine as one unit.
- **Un-oracleable here** (no real to run, no invariant, no reference): **quarantine** — emit a
  `QUARANTINED` record with the reason. Never ship a grader that can't fail.

## Step 2 — run the loop (npm unit → `sir-factory`)

Let the `sir-factory-runner` agent drive it, or hand-step the CLI:

1. **install** — `sir-factory install <name> <version> --out <out> --unit <unit> [--export <e>] [--hint "<h>"]`.
   Note `workdir`.
2. **decompose** — spawn `sir-decomposer` (sighted) with the unit + source path; it writes
   `<workdir>/sir/<unit>.sir` + `<unit>.inputs.mjs` (+ `<unit>.carried.json` for carried-data units).
3. **stamp** — `sir-factory stamp <workdir>`. Stamps the held-out oracle from the REAL package
   (execution-derived, never hand-authored; leakage-guarded). QUARANTINES on non-determinism / leakage.
   (Carried data: `sir-factory extract <workdir>` first — byte-exact, independent-authority-attested.)
4. **stage + re-emit** — `sir-factory stage-reemit <workdir>` writes a CLEAN ROOM (the SIR + a rendered
   frozen oracle, *no* source/meta), then spawn **N=3 `sir-reemitter-cr` agents IN PARALLEL** (one message,
   N tool-uses) — each reads the clean room and writes a distinct `runs/emit_<i>.mjs`. They cannot read the
   original.
5. **grade** — `sir-factory grade <workdir> --round <r>` → GATE 1 held-out quorum (≥2) + GATE 2 saturation
   differential vs real. exit `0` = verified · `2` = harden · `1` = quarantine.
6. **pack** (on verified) — `sir-factory pack <workdir>` → `@rederive/<name>` (ships the CONTRACT, not trusted
   bytes). Confirm with `rdv check <pkgdir>`.

**HARDEN — and harden vs DECOMPOSE.** A gate failure means the SIR (the definition) is inadequate → re-spawn
`sir-decomposer` in HARDEN mode with the prior SIR + `divergence.json`; it re-reads the source at the diverging
points and rewrites a hardened SIR; then re-stamp → re-emit → `grade --round r+1` (to `--cap`, then quarantine).
**But** if a unit keeps diverging because it is *compound* (a glob matcher, a parser, an evaluator), the fix is
NOT more SIR detail — a SIR that dictates the exact output (the regex to emit, the parse table) buys convergence
by **transcription**, not independent derivation, which hollows out the very independence the quorum measures.
That unit is UNDER-DECOMPOSED: split it into named leaves (each with a tight behavioral oracle) and run each
through the factory. Divergence on a compound unit is a decomposition signal, not a spec-detail gap.

## The grader is sound, or it is theater — the checklist

`sir-factory grade` enforces this for you. For a unit the CLI doesn't cover (see *non-npm units* below) you may
hand-build a grader — but it is sound ONLY if it does all of:
1. generates held-out from a **HIDDEN seed** the emitters never see (no leakage from the frozen slice);
2. **pass = match the oracle on EVERY held-out case** — never a threshold ("99% agree" is a FAIL, not a pass);
3. **quorum = ≥2 INDEPENDENT** emissions each pass the FULL held-out (one passing emission is luck);
4. **smoke-test that it can FAIL** — run a known-WRONG impl through it and confirm it rejects (a grader that
   can't fail is theater);
5. extends correctness with a **saturation differential** vs the real unit over a large random in-scope set.

A grader where you are *also* the author of the unit and its envelope is the vacuous-gate trap — the hidden
seed, the "every case" bar, and the independent quorum are exactly what keep a hand-rolled grader honest. (This
is the difference between the del matcher's `bq/grade.mjs`, which was sound, and a lenient self-judged one.)

## Authoring the oracle bundle (what decompose/stamp produce)

The factory names these EXACTLY. Do not invent alternates — a `spec.md` is a divergence; the SIR is always the
`.sir` file below. `rdv check` and the manifest resolve `sir/<unit>.sir`, so any other name is unverifiable.

- `<workdir>/sir/<unit>.sir` (the SIR — plain text, NOT markdown) — the contract: signature + behavior, the
  pipeline ORDER, edge/option/error semantics, exact regexes/constants, and the in-scope domain. It must **NOT
  contain the original source** — re-emit is original-deleted. Where a unit is verified for a SUBSET, the SIR
  carries an `ENVELOPE` line that `pack` propagates to the package manifest + README (so a reuser knows it is
  not a general drop-in). (Packed location: `sir/<unit>.sir`.)
- `<workdir>/sir/<unit>.inputs.mjs` (the input generator) — the stratified `genInputs(n, rnd)` the decomposer
  emits alongside the SIR; `sir-factory stamp` runs it against the real unit to fill expecteds.
- `<workdir>/oracle.json` — vectors mode `{mode:"vectors", exportName, unit, vectors:[FROZEN], heldout:[DISJOINT]}`
  (only `heldout` is graded; `vectors` teach the prompt) **or** property mode `{mode:"property", generator, n,
  properties:[{name,kind}], harness?}`. Expecteds are filled by `sir-factory stamp` from the REAL unit — never
  by the model. (Packed location: `oracles/<unit>.json`.)
- **Saturate multi-value coverage** (quorum is only as strong as held-out coverage): for any op that folds over
  a list (ANY/ALL/tries-each), add a DISCRIMINATING vector where only a NON-FIRST element satisfies — a
  `[matches, …]` case does not discriminate, `[no-match, matches]` does. A single-element list never tests
  "tries every element," so a first-element-only reconstruction passes quorum undetected.

## Non-npm units — migration, novel code, a local function

`sir-factory install` is npm-specific. For a unit that isn't a published package — a migration target, a route,
novel code — run the SAME loop by hand: author the bundle (Step 1/2), spawn N `sir-reemitter` agents (Write-only,
blind) for re-emit, and grade with a disciplined grader (the checklist above). Oracle source by case:
- **migration / lift-and-shift** — the ORIGINAL is the oracle: run it to stamp held-out expecteds.
- **novel code, no original** — a PROPERTY oracle (round-trip / idempotence / invariants / determinism) + anchors
  for the formats identity matters on. Property oracles verify correctness-of-CONTRACT — the right tool for greenfield.
- **compose** — a verified leaf oracles the next layer: grade glue against an already-verified emission.

## Verify or rebuild a shipped bundle (the consumer side — `rdv`)

A `@rederive/*` package ships its **contract** (`sir/` + held-out `oracles/`), not trusted bytes:
- `rdv check <bundle>` re-verifies the shipped `src/` against the held-out oracle + content hashes —
  deterministic, no tokens. Catches tamper (behavioral miss + hash mismatch). This is the CI contract.
- `rdv resynth <pkg>` rebuilds the implementation **locally** from the contract rather than trusting the
  publisher's `src/`: it writes ready-to-spawn prompts (spec + frozen oracle, original-deleted), you spawn N
  `sir-reemitter` agents on them, then `rdv resynth --apply` grades every emission on the HELD-OUT set, requires
  QUORUM (≥2), and installs the winner. Same self-policing signal: on NO-QUORUM, add a discriminating vector or
  escalate the worker tier and re-spawn.

## When to ASK the human (use AskUserQuestion — these are genuinely the user's call)

- **Oracle source is ambiguous** — no original to run and no obvious reference. Which node: a property oracle,
  a reference you write, or the user's ruling?
- **A node-6 judgment seam** — the spec leaves a real policy decision open. The user rules it; you freeze that vector.
- **The original does something SURPRISING** — returns `undefined` on a bad op, a vacuous-truth default-open, a
  NaN comparator. Ask: *intended (freeze it as the contract) or a bug (flag it, do not preserve)?* — the
  migration's most valuable findings, asked live instead of post-hoc.
- **Divergence / NO-QUORUM** — workers disagree, or quorum < 2. Show the split (the discriminating input + each
  output) and ask: which is correct / escalate the model tier / decompose / add coverage and re-emit?

When NOT to ask (decide it yourself — don't pepper): authoring inputs, stamping, computing quorum, coverage gaps
the spec clearly resolves, anything with a sensible default. Ask at the genuine fork, not the mechanics.

## Read the result honestly

- **QUORUM** → the passing emission is the verified artifact; ship it + the bundle (the oracle becomes a
  permanent CI contract).
- **Emissions DISAGREE** (some pass held-out, some don't) → quorum just caught a luck/divergence that a
  single-emission run would have shipped blind. The minority is the bug.
- **All emissions miss the same held-out class** → a shared wrong prior = a real quirk/finding of the unit.
  Density-cover it (several fresh inputs of that class, not one) and re-run.
- **Emissions diverge on a COMPLEX / compiler-class unit** (glob matcher, parser, expression evaluator) → read
  it as an *under-decomposition* signal, not a missing spec detail. The wrong fix is to pile algorithmic detail
  into the monolith's spec until they converge: a spec that dictates the exact output (the regex to emit, the
  parse table) buys convergence by **transcription**, not independent derivation — which hollows out the very
  independence the quorum measures. The right fix is **decompose** into named leaves (`expandBraces`,
  `glob-to-regex`, `compose`), each with a tight *behavioral* oracle, and quorum each. Keep the spec behavioral;
  push the algorithm into separately-verified leaves.
- **Never trust the loop's own prose summary** — re-run `sir-factory grade` (or `rdv check`) on the emit files.
  The disk is ground truth; a synthesis summary can misreport which round a miss happened in.

## Rules (non-negotiable, learned the hard way)

- Held-out inputs are FRESH and DISJOINT from frozen — reusing one is train/test leakage.
- A round closes only when ≥2 independent emissions agree on the FULL held-out set (one passing emission is luck).
- Oracles assert BEHAVIOR (wire bytes, claims, status, properties), never the source library's representation
  (error-string wording, object-vs-string body). Freezing representation is a trap.
- Expecteds are derived by EXECUTION, never authored by the model.
- Both legs always; a unit you can't soundly verify is QUARANTINED, not guessed.
- The toolkit is IMMUTABLE from your seat — never edit or rebuild `rdv` / `sir-factory`. Patching the verifier
  voids every check it makes (you'd be grading your own work with a gate you moved). On a real toolkit bug, HALT
  and report it (command, unit, error), or quarantine the unit. A tool bug is a finding to report, not to patch.
