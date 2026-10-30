---
name: preflight
description: >
  Rederive PREFLIGHT — build a MEASURED-strong characterization oracle for untested (or weakly-tested) source,
  so the rederive/migration path has a trustworthy source of truth. Use this BEFORE decompose→re-emit→verify
  whenever the unit you want to port has zero tests or only happy-path tests. Four passes: structural COVERAGE + an
  adversarial "pedantic senior engineer" REVIEW (the reasoning passes, for known-unknowns) + mechanical MUTATION
  testing + an out-of-domain CHAOS / property-based pass (the execution passes, for the unknown-unknowns). Runs the
  REAL source to capture input→output vectors (the golden master / oracle), gates on a measured mutation score plus a
  characterized garbage-input surface, and quarantines what it cannot soundly characterize. Turns "I have the ick
  about these tests" into a number.
---

# Rederive Preflight — characterization-oracle generation

Migration is only as trustworthy as its oracle. If the source unit has **no tests**, or **happy-path/single-pass**
tests, there is no trustworthy behavior to port *to* — a green suite that a broken implementation would also pass is
false comfort. The preflight produces the missing thing: a **characterization oracle** (input→output vectors captured
from the *real* code) whose strength is **measured**, not hoped.

## The principle — the oracle earns trust by rejecting wrong implementations

The engine of rederive is *not* re-emission — it's that an oracle only earns trust by **rejecting alternative
implementations that get the behavior wrong**. Flip that onto test-building: a suite is strong only when a *wrong*
version of the function would **fail** it. So the preflight doesn't ask "did my tests pass?" — it asks **"what wrong
implementations would slip through, and where?"** and closes those holes until (almost) none can.

### Reasoning vs. execution — why you need all four passes

The passes split along one deep axis: **two reason about inputs, two execute to find what reasoning missed.**

- **Reasoning passes** find *known-unknowns* — edges a mind can enumerate:
  - **Coverage** (structural) — inputs derived from the code's branches/boundaries.
  - **The Pedantic Senior Engineer** (semantic) — domain edges: leap years, timezone/DST, unicode normalization,
    numeric precision, two params that interact. Also asks *"WTF even is this test?"* — critiquing whether each test
    is well-formed and asserts something meaningful.
- **Execution passes** find *unknown-unknowns* — what reasoning can't foresee, surfaced only by running things:
  - **Mechanical mutation** (Stryker et al.) — perturbs the *code* (`<`→`<=`, `+`→`-`, drop a branch) and finds where
    the suite is blind to a real change. Answers "would a wrong version slip through, and where?"
  - **Chaos** (property-based / fuzzing) — throws *out-of-domain, absurd* inputs at the function ("BACON" into a color
    parser; emoji into a number; a 10 MB string into a name; null bytes; nested garbage) and captures what the real
    code *does*. Answers "what happens at inputs no one designed for?"

Mutation catches "you didn't test both directions of this branch." The pedant catches "you didn't consider this class
of input." Chaos catches "you never imagined *this* input at all." The pedant has a ceiling — subtleties are
unknown-unknowns, and you don't *think* your way to them, you *throw things* and watch. Run all four; they cover each
other's blind spots. It's "execute, don't review; never let a belief grade itself" applied to the test suite.

### Why chaos matters most for 1-to-1

Garbage-input behavior — error handling, silent coercion, defaults, what "BACON" actually returns — is **exactly where
ports drift, and it's user-facing** (the first weird thing a real user types). Coverage and the pedant won't generate
it; only chaos will. The golden master pins what the source *actually does* with nonsense (throws? null? black?), and
the port must reproduce it exactly. The property-based generators do double duty here: the same generator that fuzzes
the source for capture can **drive the cross-implementation differential** — generate wild inputs, assert
`source_output ≡ port_output` — which is your 1-to-1 proof on the garbage surface.

## The loop (per unit)

1. **Analyze the source.** Signature, parameter types, return type, every branch/condition, boundary expressions,
   exception paths, and any side effects (I/O, clock, randomness, DB, network → these become *seams*, see below).

2. **Coverage-targeted input generation.** Derive inputs from the code's *structure*, not from imagination:
   every branch taken **both** directions; every boundary in every condition (at, ±1 around it); null / empty /
   whitespace / single-element / duplicate / unordered for each param; numeric min/max/zero/negative/overflow;
   every input that should trigger each exception path. This is the anti-happy-path step.

3. **The Pedantic Senior Engineer pass.** Adopt the persona and *attack your own input set* (checklist below).
   Add the semantic/domain cases mutation can't generate. Be insufferable about it — that instinct is correct here.

4. **Capture — run the REAL source.** Compile and execute the actual code over the full input set and record
   `{args, expected}` for each, treating a thrown exception as an outcome (`{args, throws: "<Type/message>"}`).
   This IS the golden master. It pins behavior *as-is*, bugs included — which is exactly what a 1-to-1 port wants.
   (If a captured value looks wrong, that's a finding about the *original*, not a reason to "fix" the oracle — flag
   it, preserve it, decide with the owner.)

5. **Mutation-saturate.** Run mutation testing against the captured suite. Every **surviving** mutant is a hole —
   by file and line. Generate targeted inputs that kill each survivor (or triage it as an equivalent mutant with a
   written reason). Re-run. Iterate until the mutation score clears the threshold or the only survivors are
   justified-equivalent.

6. **Chaos pass.** Fuzz the source with out-of-domain, absurd, type-violating inputs — property-based generators
   (fast-check / FsCheck / Hypothesis) plus deliberately nonsensical values ("BACON" into a color parser, emoji into
   a number, a 10 MB string, null bytes, nested garbage). Capture what the REAL code *does* with each (throws / null /
   default / silent coercion): that garbage-behavior surface is part of the contract and the prime spot for a port to
   drift. Fold these vectors into the oracle and **re-run mutation** so they count. The same generator can drive the
   later source≡port differential directly.

7. **Emit + gate.** Output the `vectors.json` oracle **and a confidence report** (branch coverage, mutation score,
   surviving-mutant list with triage, chaos-surface captured). **Gate:** do not hand a unit to the migration unless it
   clears the bar (default: branch coverage complete AND mutation score ≥ 90% AND no un-triaged survivors AND the
   garbage/undefined-input surface characterized). A unit you cannot soundly characterize is **QUARANTINED**, not
   shipped with a weak oracle — same discipline as the factory.

## The Pedantic Senior Engineer — the checklist

Attack every input set with these. The goal is to *embarrass* the happy-path suite:

- **Boundaries & off-by-one:** at the threshold, one below, one above; `<` vs `<=`; first/last element; length 0/1/2.
- **Emptiness & absence:** null, empty string, whitespace-only, empty collection, missing/optional field, default value.
- **Numeric nasties:** 0, negative, `MaxValue`/`MinValue`, overflow, floating-point precision/rounding, `NaN`/`Infinity`,
  culture-specific number/decimal formatting.
- **Text nasties:** unicode (combining marks, surrogate pairs, RTL), casing/normalization, leading/trailing space,
  very long strings, injection-shaped input where relevant.
- **Time & locale:** timezone edges, DST transitions, leap years/seconds, epoch boundaries, locale-dependent parsing.
- **Collections & order:** duplicates, unsorted input, single vs many, nested, aliasing (same ref twice).
- **Interaction:** parameters that constrain each other; combinations, not just each param varied alone.
- **Failure paths:** every way the function is *supposed* to throw/reject — and confirm it does, with the right type.

Anything the pedant flags that the source handles *surprisingly* is a high-value vector: it's exactly where a naive
re-implementation (or a happy-path test) would diverge.

## Effects — side-effecting units

If the unit reads a clock, RNG, DB, filesystem, or network, you can't capture a pure input→output table directly.
**Inject the seam** (the same move the factory uses): make the ambient dependency a parameter/collaborator, capture
the logic *above* the seam deterministically, and record the seam interactions as part of the vector. Pure-ish logic
gets a value oracle; genuinely effectful boundaries get a trace oracle. If neither is achievable, quarantine.

## Language runners

The generative steps (input gen, pedant pass, survivor→new-input) are yours; the deterministic steps (compile, run,
capture, mutate, measure) call the language's native tooling via Bash:

Each pass maps to native tooling — coverage, **mutation** (the mechanical grader), and **property-based/chaos** (the
out-of-domain generator):
- **.NET / C#:** capture with a small `dotnet run` harness (below); coverage **coverlet**; mutation **`dotnet-stryker`**
  (`dotnet stryker`, `--since:<ref>` to scope to a change's blast radius); chaos **FsCheck** (or CsCheck). Needs the
  **SDK** (not just the runtime) on the capture machine — if `dotnet --info` shows no SDKs, run the preflight where one
  exists and ship the resulting `vectors.json`.
- **JS / TS:** capture with a node harness; coverage **c8**/**nyc**; mutation **StrykerJS**; chaos **fast-check**.
- **Python:** capture with a runner harness; coverage **coverage.py**; mutation **mutmut** (or cosmic-ray); chaos
  **Hypothesis**.
- **General:** any runner that can (a) execute the source over inputs, (b) mutation-test the code, and (c) fuzz it with
  a property-based generator.

### .NET capture harness (template)

```csharp
// preflight-capture.cs — emit vectors.json for ONE unit. Run: dotnet run
using System.Text.Json;
var cases = new object?[][] {
    /* the coverage-targeted + pedant inputs, as argument tuples */
};
var vectors = cases.Select(args => {
    try   { return new { args, expected = Target.Method(/* spread args */) as object, throws = (string?)null }; }
    catch (Exception e) { return new { args, expected = (object?)null, throws = e.GetType().Name }; }
});
File.WriteAllText("vectors.json", JsonSerializer.Serialize(vectors,
    new JsonSerializerOptions { WriteIndented = true }));
```

## Output → handoff to rederive

- **`vectors.json`** — `[{ args, expected }]` (with `{ args, throws }` for exception outcomes). This is the frozen +
  held-out oracle the **`sir-verify`** skill / **`sir-decomposer`** consumes: decompile the unit → SIR against this
  oracle → blind re-emit to the target language → the differential *is* your 1-to-1 proof.
- **confidence report** — branch coverage %, mutation score, survivor triage. This is the **quantified 1-to-1 bound**:
  "the port is proven equivalent to within a suite that kills N% of mutants." It replaces the ick with a number, and
  it's the honest ceiling on the guarantee.

## Honest bounds

Coverage is the guarantee: the oracle proves behavior it *exercises*, and mutation/coverage measure how much that is.
Behavior that only appears under specific data distributions, input types too complex to construct, and deep effects
still need a human in the loop. The preflight makes the strength **visible and gated** — it does not claim omniscience.
When it can't clear the bar, it says so and quarantines, rather than shipping false confidence.

## TL;DR

Analyze → **coverage** inputs (structural) → **pedant** pass (semantic edges + "WTF is this test?") → capture the
golden master from the real source → **mutation-saturate** (kill survivors) → **chaos** pass (fuzz the garbage surface,
capture what it does) → emit `vectors.json` + a confidence report → gate, or quarantine. Two reasoning passes for the
known-unknowns, two execution passes for the unknown-unknowns. The suite earns its green by rejecting wrong
implementations, not by passing the happy path. Then hand the oracle to `sir-verify`.
