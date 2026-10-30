# SIR v0.5 — the plan: primary / per-language definitions, and Jev as the decomposer's iterative element

**Status:** plan · 2026-09-22 · spans `rederive` (rdv), `sir-factory` (stamp/grade/pack), `sir-toolkit`
(schema + capabilities + fragments + agents), and — new — the `~/jev-bakeoff` evidence. Parent:
`sir-spec/SIR_SCHEMA.md` §§12–14 (fidelity variants), §15 (verifier-owned adapters), §17 (envelope).
Predecessor: `docs/SIR_V04_PLAN.md` (this plan reuses its two design moves and its A6/A7/A8 discipline).

**The v1 hard requirement this serves:** a second language *in production*. `sir-lab/roadmap/DATA-POINTS.md`
row "Language/target": *JS/TS prod; PHP/C#/JS 12/12 (lab)* → gap = *any second language IN PRODUCTION*. v0.5 is
the schema + toolchain change that turns a per-language artifact from a lab result into a first-class verified
claim. It does so by splitting every unit's definition into a **PRIMARY** (language-neutral) block and
**per-language** blocks, and by making each target language a fidelity **variant** verified against the primary
oracle through a **verifier-owned** harness.

## Where we actually are

| component | state | verdict |
|---|---|---|
| schema (`sir-spec/SIR_SCHEMA.md`) | v0.4. "Cross-language `spec`-variant anchors" deferred **twice** (v0.2 line 299: *boto3 for aws4 — design only*; carried to v0.4's deferred list) | the v0.5 headline is that item, un-deferred |
| §12/§14 fidelity variants | implemented in rdv (`checkUnit` iterates a `variants` map, each vs its own anchor) | **0 of 225 shipped bundles use `variants`**; 2/225 SIRs carry any `FIDELITY` line; `VARIANT`/`ANCHOR` never written. Design-only in production. v0.5's per-language variants are the first real consumer |
| `rdv` (`cli/rdv.mts`) | `SUPPORTED_SPEC='0.3'`, 8 implemented features, two-gate (coarse scalar + fine feature set). `resolveFn`/`gradeVs` load a **JS export only** | correct; JS-only by construction. No notion of a target language anywhere in rdv, pack, or factory (grepped) |
| `sir-factory` | `stamp` runs the generator against the **real JS export**; `grade` = held-out quorum (≥2 full) + saturation differential; `stage-reemit` builds a cleanroom (SIR + `frozen.md`); `specVersionFor` emits 0.2/0.3; `featuresFor` mechanical | correct; JS-only harness |
| decomposer (`.claude/agents/sir-decomposer.md`) | says *"The SIR is a language-neutral IR"* (line 188) and sets specificity by fidelity anchor | the **exemplars carry JS mechanism in the "neutral" body**: `examples/minimal.sir` pins a JS regex, JS `\S` Unicode class, JS line-terminator set (`\n \r U+2028 U+2029`); `complex.sir` pins `Math.min`, `'' + str` coercion, JS regex flavor. Language leaks into the primary definition today because there is nowhere else to put it |
| per-unit `spec` (`packages/*/specs/*.md`) | a human spec per unit (e.g. colors `strip.md`: *"ZERO dependencies — String/RegExp only, no Node builtins"*) | JS-bound prose; the natural home for a per-language block, not the primary |
| multi-target lab (`endgame/experiments/sir-multitarget/`, doc `EXPERIMENT_MULTITARGET_CONFORMANCE.md`) | **RAN 2026-06-04, 12/12 green** (PHP/C#/JS × gcd/fnv1a_64/array_gcd/sum_i64) against a shared Python oracle; each subject isolates one axis (signed / wrap / control-flow / glue-overflow) | proven in lab, zero in production. **The per-language definition already exists — as a Python dict** (`run_experiment.py` `SIGNATURE` / `RETURN_NOTE` / `DEPS_NOTE` per target) injected into the prompt, plus a trusted ~20-LOC per-target harness (`harness/run_php.php`, `run_js.mjs`: decimal-string i64 → native → unsigned-64 decimal). v0.5 promotes exactly this into the schema and the verifier |
| the located adapter (`gen/php/fnv1a_64.run0.php`) | PHP has no wrapping i64 multiply; the emitter **re-derived one from scratch on every emit** (FNV prime as set-bit shifts + 32-bit-half carry adds) — correct ×3, deterministic, and a re-derivation each time, not a primitive | the case that forces a *named per-language dependency* (§9): `mul_u64`/`add_u64` as verified helpers, named in the PHP block, never re-invented |
| Rust (`sir-lab/color-string-rederive-rust`) | `get_rgb` spec-fidelity SIR → **3 blind JS + 1 Rust, 5000/5000 equivalent** (`examples/complex.sir` header) | the primary block *can* converge cross-language even carrying JS mechanism — the emitter reinterpreted it. A1 tests whether it still converges once that mechanism is moved out |
| Jev (`~/jev-bakeoff/`, 5 bake-offs, 2026-09-22) | catalog-match 8/8; ABI identity 2/2; SIR **version attribution 19/21 FULL, 18/21 keyword-BLIND** (reads semantics: caught `raceTimeout`/`fireOrder` as v0.4 with no `PAR`/`RING` token; the empty-`CARRIED-DATA` slot trap passed); named-leaf vs Fable: Fable ≥ Jev on raw accuracy, Jev conf-sep +0.35 vs +0.21 | a **fast (~220ms), calibrated, off-Claude-budget** semantic judge. Not bit-deterministic, no seed knob → **advisory only, never a gate, never in a shipped artifact**. The public use-case corpus (`awesome-jev`, 33 picks) is routing / ranking / action-selection / agent supervision throughout — **no code-analysis, verification, or iterative-hardening use anywhere**; these seams are novel, and the five bake-offs are the only measurements |
| the JS baseline | 219 shipped packages, all JS, quorum + differential, checked by a released rdv | **battle-tested; JS is the control, never a pilot.** The two pilot languages (Lane, 2026-09-22) are **TypeScript and Rust** — chosen to be VERY different from each other, bracketing the design |

**Nothing is broken for v0.3 bundles.** The cost of the gap is addressable surface (v0.4's framing): a unit cannot
be *shipped* in a second language, and every cross-language emit re-invents the language mechanism the SIR doesn't
carry. But the pipeline map (read-only recon, 2026-09-22) surfaced **three pre-existing drifts in the capability
model that sit directly on v0.5's path** and must be fixed before any new feature is added to it (W.0c):

- **Drift 1 — rdv is not a consumer of `capabilities.json`.** `cli/rdv.mts` hardcodes `IMPLEMENTED_FEATURES`; the
  JSON's "three consumers, none duplicate it" is aspirational. The two copies match today by hand.
- **Drift 2 — two unconnected feature detectors.** `pack.featuresFor` sees only the v0.2/v0.3 features
  (carried-data / envelope / trace-seam); `payload.featuresOfSir` sees only the v0.4 ones (PAR / RING / lifecycle /
  scheduler). Consequence: **the factory cannot stamp a v0.4 bundle** — a unit using `PAR` packs with no
  `par-interleaving` in `features`. That is the A6 under-stamping soundness hole, live.
- **Drift 3 — the versions disagree.** `capabilities.json` says `maxSpecVersion "0.4"`; rdv says
  `SUPPORTED_SPEC = '0.3'`. Per the rule both files state (the version tracks what rdv can *check*), the JSON's
  claim is the one to examine.

And one **vocabulary drift** between the schema and practice: the decomposer emits `UNIT`, `FIDELITY`, `BEHAVIOR`,
`DESCRIPTION`, `INVARIANT`, `PROVENANCE`, `SCOPE`, `UNGUARDED-PRECONDITION`, `OUT-OF-DOMAIN` — none defined in
`SIR_SCHEMA.md`, whose own terms are `SIR` (header) and `VARIANT` (§12). Directive census across the corpus: `UNIT`
228, `SIR` 9. A7's "mechanical detection" needs a *defined* vocabulary to be mechanical; Phase 1 freezes it.

## The design moves

### 1. Split the definition: the primary `<unit>.sir` + per-language `<unit>.<lang>.sir` files — the language firewall (PRIORITY)

A unit's definition becomes a small family of files, **shippable separately**:

```
sir/get_rgb.sir          # PRIMARY — the language-neutral contract; the ONLY place BEHAVIOR lives
sir/get_rgb.js.sir       # BASELINE: JS ABI + mechanism — the 219 shipped units are implicitly this; the control, never a pilot
sir/get_rgb.ts.sir       # pilot 1: TypeScript — JS's runtime ABI, but the SIG is a TYPE signature the compiler enforces
sir/get_rgb.rust.sir     # pilot 2: Rust — VERY different: own toolchain, i64 wrapping, UTF-8 &str, Option
```

The rule is a firewall, the same shape as §0's FUNCTIONAL/EFFECT firewall, and it cuts **both ways**:

- the **primary may not contain language mechanism** — regex dialect, Unicode class semantics, line-terminator
  sets, coercion idioms, `Math.*`, native types in `SIG`;
- a **language file may not contain behavior** — no `BEHAVIOR` / `INVARIANT` / decision rules. If a language
  needs *different behavior*, that is a spec-fidelity divergence (§12), never a language file.

The primary:

```
UNIT get_rgb
KIND FUNCTIONAL
FIDELITY spec
SIG get_rgb(input: text) -> tuple[u8, u8, u8, unit] | none    # abstract type vocabulary (A8: seeded from semcom's ABI tags)
ENVELOPE <input scope, language-neutral>
DEPENDS-ON colorNames                                           # carried data, as today
BEHAVIOR / INVARIANT / DESCRIPTION …                           # the contract; nothing a language would spell differently
```

A language file:

```
UNIT get_rgb
LANG rust
PRIMARY-SHA256 <sha256 of get_rgb.sir>              # binds this file to ONE primary; mismatch ⇒ declared, not a claim
SIG get_rgb(input: &str) -> Option<[f64; 4]>        # native signature: abstract → native
ABI text=UTF-8 &str; u8/unit=f64; tuple=[f64;4]; none=None; int=i64 wrapping
MECHANISM RE flavor regex-crate (no lookaround — see EARNED); …
DEPENDS-ON none                                      # per-language NAMED deps (§9) — e.g. a PHP file would name OPAQUE(rederive.php.mul_u64) instead of re-deriving it (the lab's finding)
ENVELOPE <optional narrowing: what this language can represent>
PROVENANCE <emitter, round, harness, rung>
```

A TypeScript language file — JS's runtime ABI, plus a `SIG` the compiler enforces:

```
UNIT get_rgb
LANG ts
PRIMARY-SHA256 <sha256 of get_rgb.sir>
SIG get_rgb(input: string): readonly [number, number, number, number] | null   # a TYPE signature: `tsc --strict --noEmit` must accept the artifact against it
ABI text=UTF-16 string; u8/unit=number; tuple=readonly [number,number,number,number]; none=null; STRICT — no `any`, no non-null assertions
MECHANISM line-terminators {\n \r U+2028 U+2029}; \S = full-Unicode; RE flavor ECMAScript   # shared with js — RESTATED, not inherited
DEPENDS-ON none
PROVENANCE <emitter, round, harness, rung>
```

What goes in a language file, and only there: the **native `SIG`** (abstract → native types), the **`ABI`**
(integer width + signedness + wrap/overflow behavior, string encoding + code-unit semantics, container shapes,
none/null), the **`MECHANISM`** notes that are legitimately language-specific, **per-language named
dependencies** (§9), an optional **`ENVELOPE`** narrowing, and its own **`PROVENANCE`**. Everything the Rust
emitter had to *reinterpret* from the JS-flavored `get_rgb.sir` is language-file content by definition.

Language files are **self-contained** — no `EXTENDS` / inheritance between them in v0.5 (a `.ts.sir` restates the
`MECHANISM` it shares with `.js.sir`). The duplication is a few lines; self-containment keeps a cleanroom = the
primary + **exactly one** file, with one `PRIMARY-SHA256` to check and no chain to resolve. Inheritance is deferred.

**Why files, not `LANG` blocks inside the primary** — four properties inline blocks cannot give:

1. **Hash stability.** `checkVariant` verifies `sirSha256`. With inline blocks, adding PHP rewrites the primary and
   **invalidates every existing variant's hash**. With files, adding a language never touches the primary; each
   variant binds to `{primarySha256, langSha256}` independently.
2. **Ship separately — including spec-only.** A `<unit>.rust.sir` may ship *without* a Rust `src`: it is a contract
   a consumer rebuilds locally (`rdv resynth --lang rust`) against the same primary oracle — rederive's thesis
   ("ship the contract, rebuild locally, trust nothing") extended to languages. The manifest distinguishes a
   **spec-only** language (no `verified`) from a **publisher-verified** one. Distribution — one bundle vs
   per-language registries (crates.io, Packagist) — is a packaging choice downstream; the file split is what makes
   either possible.
3. **The firewall is structural, not textual.** No block parser: the primary file must pass the leak lint; the
   language file must contain no `BEHAVIOR`. A Rust re-emitter's cleanroom is `get_rgb.sir` + `get_rgb.rust.sir` +
   `frozen.md` — v0.4's derived-context principle falls out of the filesystem.
4. **Detection is trivially mechanical (A7).** `lang-variant` ⇐ a `<unit>.<lang>.sir` exists; the language set ⇐
   the filename. No regex over content.

**The language registry is closed.** `<lang>` ∈ `{js, ts, rust, php, csharp, python, …}` — a versioned set, like §7's
domain set — so a stray `foo.bar.sir` is an **error**, not a language. Unit names are snake_case with no dots (§1,
"a name worth saying"), so `<unit>.<lang>.sir` parses unambiguously.

**Staleness gate.** A language file whose `PRIMARY-SHA256` no longer matches its primary is *declared* but not a
*claim*: pack refuses to stamp its variant and `rdv check` reports it `stale` until re-verified. Changing a primary
therefore invalidates every language, mechanically — which is correct: the contract changed.

**Back-compat.** A unit with only `<unit>.sir` is an **implicit JS unit**, exactly as "no `variants` ⇒ implicit
`package` variant" (§14). Migrating an existing unit = moving its JS mechanism lines into `<unit>.js.sir`; the
W.0a leak lint names those lines. Every existing unit eventually carries a `.js.sir` — JS becomes one language
among several, which is the point.

Why a firewall and not a convention: the exemplars show the leak is the default outcome when there is no
designated place for language mechanism. A rule that can be linted (Seam 3 — advisory) and gated (pack refuses a
leaking primary or a behavior-carrying language file; Phase 4) holds; a style note does not.

### 2. A target language is a fidelity variant, verified through a verifier-owned harness

Extend §12/§14: `units[].variants` gains `lang:<id>` entries alongside `package`/`spec`:

```
units[].variants["lang:rust"] = {
  lang: "sir/get_rgb.rust.sir", langSha256,      # the language file
  primarySha256,                                  # must equal the unit's sirSha256, else the variant is `stale`
  src: "src/rust/get_rgb.rs", srcSha256,          # OPTIONAL — absent ⇒ spec-only (consumer rebuilds via resynth)
  verified: { rung, heldout, differential, at }   # present only for a publisher-verified artifact
}
```

Each variant is graded against the **same primary oracle** — not a per-language oracle. The oracle is the
substrate (§0); the language is a rendering of it.

**Carried data gets the same split (Lane's catch, 2026-09-22).** The re-cut `get_rgb` — and the exemplar it came from —
declared the named-color table as `DEPENDS-ON colorNames   # carried data: …`: a §18 constant table smuggled into §9's
*code*-dependency slot, with a `#` comment doing the directive's job. That is a schema leak of the same kind as a
language leak, and it hid a real gap: §18 as practiced is JS-bound (a `.js` data module + a sidecar `carried.json`).
In v0.5 the **primary declares the data's identity** — `CARRIED <name> FROM <source-ref>` (§18), plus `SHAPE` (abstract:
`map text -> tuple[u8,u8,u8]`, 148 entries), `CANONICAL-SHA256` over a **language-neutral canonical form** (sorted-key
compact JSON), and `AUTHORITY { expr, equals }` assertions against the published standard (CSS Color 4 §6.1) — and each
**language file declares only its binding**: `CARRIED colorNames = ../carried-color-names.js (default export; own-property
lookup)` for js/ts, `= color_names.rs (pub static &[(&str, [u8; 3])]; lookup by lowercased name)` for rust. `DEPENDS-ON`
is reserved for code (`none` here). The verifier hashes every language's bound table to the canonical form and re-runs
the authority per language — so the three trust legs of §18 hold **across languages**, not just in JS. Lint 4 refuses
carried data under `DEPENDS-ON`. Lab-proven: js/rust/ts all `attested` at the same canonical hash, 6/6 authority; a
one-byte tamper → `hash-mismatch` and the authority names the entry (`experiments`: `~/sir-lab/v05-lang/units/get_rgb/controls`).

**An artifact is the unit's export surface and nothing else (Lane's catch #2, 2026-09-22: "library vs executable").**
The lab's Rust artifact was a binary whose `main` was the stdin/stdout adapter — harness code shipped inside the
package, which §15 forbids and the `.rust.sir` itself disclaimed. Per-language artifact shape is therefore part of the
language file's ABI: js/ts = an ES module default-exporting the unit; rust = a **library crate** (`[lib]`, `src/lib.rs`,
`pub fn get_rgb`); never a binary. **Every I/O adapter is the verifier's:** the rust driver generates its own harness
crate per artifact, depending on the artifact by path, and compiling that harness against the declared `SIG` *is* the
signature check — a sharper `type-checked` than `cargo check` alone. A binary-shaped artifact is refused on shape
before any behavior is graded (lab control `rust_binary_shape`). Consumer-side `rdv resynth --lang rust` then hands
back something to *depend on*, not a CLI.

The marshalling between the language-neutral oracle and the native ABI lives **in rdv, never in the package**
— §15's rule, applied to languages: *"the injected-boundary adapters live in the verifier; a trust-nothing
consumer must not run publisher-shipped harness code to check publisher code."* The lab's `run_php.php` /
`run_js.mjs` are the prototype; in v0.5 they become `rdv`'s per-language drivers.

### 3. Close the deferred item: cross-language `ANCHOR`, and a language-neutral vector encoding

`VARIANT spec ANCHOR ref(<lang>:<module>.<symbol>)` — the oracle may be captured from a reference implementation
in *another* language (the lab's Python `fnv1a_64_reference.py`; the v0.2 case, boto3 for `aws4`). This is what
makes "≥2 languages agree" mean more than self-consistency: they agree with a third authority.

It forces the lab's load-bearing encoding rule into §10 as a **canonical vector form — DECIDED 2026-09-22** (Lane:
"pick a default representation that represents the superset of representations, then it tools out"; ratified with the
sharpening that the superset is of the SIR's **abstract types**, keyed by the `SIG` — never the union of native quirks,
which are `ENVELOPE` facts excluded by the primary or narrowed in a language file; the type set is closed and versioned
like the language registry). Every value is tagged by its abstract type and has one lossless encoding:

```
{"t":"i64","v":"-9223372036854775808"}                            # decimal string; exact
{"t":"f64","v":"0.5333333333333333","bits":"3fe1111111111111"}   # shortest-roundtrip + IEEE bits; compare on BITS
{"t":"text","v":"#f00","cu":"utf8"}   {"t":"bytes","v":"base64:…"}   {"t":"bool","v":true}   {"t":"none"}
{"t":"tuple","v":[…]}  {"t":"list","v":[…]}  {"t":"map","v":[["k",…],…]}   # maps as sorted pairs → canonical
```

**The NaN rule** (Lane: "NaN handling feels like the missing piece"): NaN is **canonicalized at encode time** to the
quiet NaN `7ff8000000000000` — any payload, either sign — so `NaN == NaN` and cross-engine payload noise can never
manufacture a divergence; equality for `f64` is bit equality after that canonicalization, so `-0 ≠ +0` and `±Inf` are
distinct; `none` is a *value* that equals only `none` (a NaN can never collapse into it); equality is **per type**
with no global tolerance; integer slots (`i64`/`u64`) can never hold NaN/Inf — a target that would produce one there
(PHP's float promotion) fails at *marshal* as an envelope violation. A SIR may declare a cited relaxation (payload-
preserving NaN for a bytes-level codec; signed-zero insensitivity); the grader never assumes one. Drivers marshal **by
type** ("it tools out"); Python decodes `f64` from the bits and `i64` from the decimal string with a range assert, so
its number model stops mattering. `CANONICAL-SHA256` over the sorted compact form pins the vector set — the same
mechanism as carried data. *Lab evidence:* the first lab grader compared via `JSON.stringify` and had
`eq(NaN,null) = eq(Infinity,null) = eq(-0,0) = true` — latent (get_rgb's envelope can't produce them), fixed to
bit-faithful equality, nine probes green, three-language run unchanged.

**The LLVM IR target is the sharpest instance** (Lane: "LLVM IR proved to be super wacky when dealing with those").
There the hazards are compiler *assumptions*, not just equality: `fcmp` ordered vs unordered predicates (`oeq` is false
for NaN, `ueq` true); fast-math flags `nnan`/`ninf`/`nsz` license LLVM to miscompile exactly the edge inputs the oracle
carries — **a verified capability must never carry them**; `fptosi`/`fptoui` of NaN or out-of-range is *poison*, so it
is an `ENVELOPE` exclusion or a guard, never a "NaN value"; `fneg` vs `fsub -0.0` differ on signed zero; default NaN
payloads differ between x86 and ARM. Rule for semcom's executor: compare `f64` on bits after canonicalization, never
`==`. Deferred for i64: the byte-data and text encodings above; retro-encoding the shipped JS oracles (they remain
valid under the implicit `package` variant).

> **BUILT 2026-09-22** in the lab (`~/sir-lab/v05-lang/lib/canon.mjs`, `tools/encode-oracle.mjs`): `oracles/<unit>.json` is
> `sir-canonical-v1`; the primary's `ORACLE` line declares `CANONICAL-SHA256` and `run.mjs` verifies both the file's hash
> and the declaration before grading (control: one flipped `expected` → both MISMATCH, refused, exit 1). Drivers marshal
> by type; equality is per type on the canonical string, no tolerance; Rust `Display`'s `NaN` / `inf` / `-inf` are parsed
> explicitly and anything else is unparseable, never a silent NaN. **get_rgb** re-encoded losslessly (legacy kept):
> js / ts / rust still `type-checked → harness-verified → cross-verified`. **The NaN rule validated on real data —
> `units/is_number`** (the plan's own illustration, re-cut; a JS-envelope unit): the shared typed oracle carries
> `NaN → false`, `±Infinity → false`, `-0 → true` as first-class canonical values, and the shipped src grades
> 16/16 + 33/33. Its 7 vectors with no language-neutral meaning (boxed wrappers, a `RegExp`, `{}`, `bigint`,
> `undefined`) are **refused by the encoder** — correctly — and routed to a **js envelope extension**
> (`oracles/is_number.js.json`, `js-native-v0.4`), graded only by the js variant in its own encoding: 7/7. That is the
> mechanism by which a JS-shaped unit coexists with the canonical form without the form absorbing JS quirks; the
> `.js.sir` declares the widening in its `ENVELOPE` line. Two lab bugs found + fixed on the way: the lints counted
> `NaN` as a JS leak / code shape (it is an IEEE-754 value name; only `null` / `undefined` remain), and
> `directive('ORACLE')` matched `ORACLE-CLASS` first, so the declared hash was silently never checked.
> **Python sanity (Lane, 2026-09-22: "prove it will process sensibly").** `lib/canon.py` is an independent implementation;
> `sanity.py` is 30/30 green: equality semantics on bits (`NaN == NaN`, `NaN != none`, `-0 != +0`, `±Inf` distinct, no
> tolerance); integer edges `2^63-1`, `-2^63`, `2^64-1` as exact `int` with `2^63`, `-1`(u64), `NaN`, `1.5` and `True`
> rejected (Python's `bool` is an `int` subclass — checked first); every vector of both oracles round-trips losslessly
> (126 + 98 values); the hard vectors decode to real natives (`nan`, `inf`, `-inf`, `-0.0`) and back to the same bits; and
> **cross-implementation agreement** — Python's canonical hash of each vector set equals the JS file's and the primary's
> declaration. **Spec fix it forced first:** shortest-roundtrip *renderings* differ across languages (Python `repr(255.0)`
> = `'255.0'`, JS `'255'`), so an `f64`'s decimal `v` is a display hint and the canonical string carries `{bits, t}` only —
> both oracles re-encoded and re-declared (get_rgb `8cb08617…`, is_number `35a0059c…`). Nuance: a primary carries TWO
> canonical hashes (carried table, oracle) — read each BY DIRECTIVE, never "the first `CANONICAL-SHA256` in the file".

### 4. Feature flags one level down: rdv declares the languages it can harness

v0.4's design move 1, reused. `lang-variant` is the feature; **which languages** rdv can drive is a capability
set (`languages: {js, rust, php, …}` beside `IMPLEMENTED_FEATURES`). A bundle with `variants.lang:php` on an rdv
with no PHP driver halts naming it — *"needs lang:php harness; this rdv drives js, rust"* — and still verifies
the JS variant. Ramp, not cliff. `specVersion 0.5` stays the coarse gate (an rdv predating `languages` must halt
on the scalar — A6).

### 5. Jev as the decomposer's iterative element — predicted divergence before the blind quorum

The loop today (`sir-factory/PROTOCOL.md`, runner steps 2–7): decompose (sighted) → stamp → stage → **re-emit
×3 (blind)** → grade → on failure `divergence.json` → HARDEN (sighted) → re-stamp → re-emit ×3 → grade → … cap 3
→ quarantine. The signal that drives every iteration — `heldoutDisagree`, which `grade.mjs` literally labels
*"the SIR-ambiguity signal (independent engineers diverged)"* — is only available **after** paying for three
blind emitters. Jev's job is to **predict that signal for ~220ms, off the Claude budget, before the emitters
are spent**, so the decomposer hardens the predicted-ambiguous points first and the quorum *confirms* rather
than *discovers*. The quorum stays the binding gate. Jev decides only *where to look next*. See "The Jev seams".

### 6. The register pivot: the primary is a CONTRACT, not a transcription — with a typed, cited slot for hard requirements

**The finding (Lane, 2026-09-22: "SIR as the agents have been really really code heavy with weird comments — I want to
eliminate that methodology").** The SIRs the agents produce narrate the source: `packages/is-number/sir/isNumber.sir`
carries a 40-line `# BEHAVIOR (ordered pipeline — exact + complete; transcribed from the source)` block of
`# NODE 1 (BRANCH: typeof num === 'number') … RETURN (num - num === 0)`; the **exemplars** pin JS pseudo-code and
literals verbatim (`examples/minimal.sir`: `match = string.match(RE)` / `reduce(…)`; `complex.sir`: "verbatim pinned
literals … five load-bearing regexes"); and the mechanism arrives as `#` comments. The schema and the decomposer
**already forbid this register** — §0: prose is "never load-bearing"; `sir-decomposer.md`: "Contract first, transcribe
on PROVEN divergence" and "a SPEC-fidelity SIR that reads like the source is a SMELL" — and practice went the other
way anyway, for three structural reasons: (a) the exemplars the decomposer calibrates its register against
("CONCISION — calibrate against the examples") are themselves transcriptions; (b) there is no designated slot for a
genuinely hard requirement, so it lands in a comment; (c) nothing mechanical rejects code shapes. A comment-pinned
regex is the worst of both worlds: it reads like source — PROTOCOL: convergence "bought by transcription … hollows out
the independence the quorum measures" — *and* it is not a verified constraint, because it is prose.

**The rule — structural, per Hard Rule 7 (never rule N+1 on the prompt):**

1. **`BEHAVIOR` is rules, not narration.** Numbered behavioral rules over the *abstract* `SIG` (`R1 … Rn`): each a
   statement a blind engineer can implement two ways only where the **oracle** leaves room — and the oracle, not the
   prose, pins the edges. Pipeline order, control flow, and branch-walking are transcription and are **rejected**.
2. **Hard requirements get a typed, minimal, CITED slot** — never a comment. "There will have to be regex and other
   hard-code requirements" — yes, and they get a home:
   - `TABLE` — §13's decision table as a first-class directive (cells verified differentially, as §13 already requires);
   - `PINNED <kind> <name> = <literal>` — a literal that IS the contract: a byte layout, a constant, a grammar. In the
     **primary** a pin must be **language-neutral** (ABNF, a declared portable pattern subset, bytes). A dialect
     regex is a **language-file** pin — `.js.sir`: `PINNED regex RE = /^[ \t]*(?=\S)/gm` — because the *accept-set*
     is the contract and the *pattern* is a rendering of it: the same firewall as move 1;
   - carried data is §18 **with the split of move 2**: identity (`SHAPE`, `CANONICAL-SHA256`, `AUTHORITY`) in the
     primary, binding in the language file — never under `DEPENDS-ON` (Lint 4).
   - **No pin without a citation.** Every `PINNED` / `EARNED` line names what earned it — a spec anchor
     (`ANCHOR rfc5321 §4.1.2`) or a divergence (`EARNED round-1 heldout v7`). **Pack refuses an un-cited pin.** This is
     the decomposer's "transcribe on PROVEN divergence" turned from a plea into a gate; `minimal.sir` already does it
     informally ("EARNED (round-1 divergence: 2/3 emissions syntax-dead)").
3. **`#` comments are not in the strict grammar at all (V.0).** In legacy mode they are never load-bearing — restated as a gate. A deterministic **transcription lint** (no model)
   scores code shapes in a primary — `typeof`, `=>`, `.match(`, `.reduce(`, `if (`, `return`, index arithmetic,
   `STEP n` / `NODE n` narration — and pack refuses a primary above threshold. Jev Seam 2's dial `Score` ("reads like a
   transcription vs a contract") is the calibrated version for the ambiguous middle; the lint is the cheap floor.
4. **The decomposer becomes two passes** (the decomposition principle: the frame matters more than the horsepower).
   **CONTRACT** — rules + invariants + `TABLE` + the oracle generator, with the lint run before the file leaves.
   **HARDEN** — only on a divergence report (real or Jev-predicted); may add `PINNED` / `EARNED` lines, each cited.
   Contract-writing and mechanism-pinning are different cognitive frames; one prompt doing both produced the register
   we have.
5. **The exemplars are the lever.** Re-cut `minimal.sir` and `complex.sir` as contracts — rules + `TABLE` + neutral
   pins in the primary, dialect regexes in `.js.sir` — and **re-prove them 3/3 blind**. If contract-register exemplars
   converge, the register flips factory-wide with no prompt rule at all. That is Phase 1's gate, sharpened — and the
   cheapest experiment in this plan.

**The honest cost, and why this and the Jev seams are one design.** The decomposer's own note: *"contract-first can
cost extra harden rounds."* A contract states less, so blind engineers have more room to diverge on round 1 — that is
the price of a quorum that measures independence instead of re-typing. **Seam 2 exists to pay it:** predicted
per-sentence ambiguity lets the CONTRACT pass harden its under-determined rules *before* the emitters are spent, so
contract-first stops being the expensive path. Jev is what makes a contract-register SIR converge in the rounds a
transcription did.

**Illustration — a shipped unit, re-cut.** `packages/is-number/sir/isNumber.sir` today: a 40-line
`# BEHAVIOR (ordered pipeline — exact + complete; transcribed from the source)` block — `# NODE 1 (BRANCH: typeof num
=== 'number') … RETURN (num - num === 0)`, `# NODE 2 (BRANCH: typeof num === 'string' AND num.trim() !== '') …`,
`# GATE A …` — the source, re-typed as comments. The same contract in the v0.5 register:

```
UNIT is_number
KIND FUNCTIONAL
FIDELITY package                     # is-number@7.0.0, accidents included — see R4
SIG is_number(x: any) -> bool
ENVELOPE any value
DEPENDS-ON none

BEHAVIOR
R1  a primitive number that is finite → true; NaN and ±Infinity → false. (-0 is finite → true.)
R2  a primitive text that is non-empty after trimming whitespace and parses as a finite number → true.
R3  everything else → false.
R4  boxed wrappers (a Number object, a String object) are not primitives → R3 → false.
    # cited: FIDELITY package — the primitive/boxed accident of is-number@7.0.0
```

```
UNIT is_number
LANG js
PRIMARY-SHA256 <…>
SIG isNumber(num: any): boolean
ABI number=f64 (finite ⇔ neither NaN nor ±Infinity); text=UTF-16 string; "parses as a number" = numeric coercion
    of the trimmed string (Number(...)); "primitive" = typeof, so boxed wrappers are typeof 'object'
MECHANISM trim = String.prototype.trim (Unicode whitespace + line terminators)
```

Same accept-set, pinned by the same 16 frozen + 13 held-out vectors from the real package — the oracle carries the
edges (`"1e309"`, `" 42 "`, `""`, hex strings, boxed values), not the prose. Nothing a blind engineer needs is missing;
nothing that would let them *re-type the source* is present. The JS mechanism (`typeof`, `Number()` coercion, `trim`)
lives in `.js.sir`, so a Rust re-emitter reads R1–R4 and its own `.rust.sir` and never sees a word of JavaScript.

## Assumptions (write these down; check them as you go)

**A1 — the primary block converges without its language mechanism.** *Untested.* The Rust proof (5000/5000)
was against a JS-flavored primary — and it is the **only** rederive-dialect cross-language run (one emitter, not a
quorum). The 12/12 PHP/C#/JS matrix was on the **semcom SIR dialect** (`CAPABILITY` / `TAKES` / `GIVES` with
`i64:ptr` ABI tags, a Python oracle), so it evidences the *oracle + per-target ABI + harness* pattern, not that a
rederive-dialect primary converges in PHP or C#. Phase 0 runs the matrix on rederive-dialect units. Test: split `get_rgb.sir` into `get_rgb.sir` + `get_rgb.js.sir` + `get_rgb.ts.sir` + `get_rgb.rust.sir`, then 3
blind JS + 2 blind TS + 2 blind Rust from *the primary + their own `.<lang>.sir` only*. If convergence drops, the abstract type
vocabulary or the MECHANISM boundary is drawn wrong — fix the split, not the firewall.

**A2 — a verifier-owned harness is sufficient for the ABI; no publisher-shipped adapter.** *Evidenced* by the
lab (the ~20-LOC harnesses carried the whole i64 story) and by the PHP case: the wrapping multiply is a
**named verified dependency of the unit** (§9), not harness code. The lab's PHP case is the evidence; the pilots test it on TS (a transpile-only driver) and Rust
(a binary driver). Where the language has a static type system, the language file's `SIG` is also *statically*
checkable against the artifact (`tsc --strict --noEmit`, `cargo check`) — the **`type-checked`** rung, which both
pilots earn and the JS baseline cannot.

**A3 — blind-quorum convergence is a valid proxy for comprehensibility across languages** (extends v0.4 A3).
One Rust emitter is evidence, not quorum: **N≥2 per language**, and a language's `generable` flag is earned per
language by the Phase 4 gate, never inherited from JS.

**A4 — Jev's predicted divergence correlates with the real `heldoutDisagree`.** *Untested — the key Jev
assumption.* Measure it on the factory's own record **before** wiring Seam 2 (W.0b): the catalog's graded
rounds give hundreds of (SIR sentence, diverged-or-not) pairs, and v0.4 Phase 5 gives the canonical one (three
emitters unanimous on `PAR`, split 2–1 on *"gate or unit computes the mapping"*). If the correlation is weak,
Seam 2 is dropped and Seams 1/3/4 stand on evidence already measured.

**A5 — calibration transfers to SIR-sentence granularity.** Measured in-session at file/unit granularity
(catalog-match, version attribution, named-leaf conf-sep +0.35). Re-measure at sentence level in W.0b; set the
escalation threshold from that record for a stated error budget (the named-leaf pilot: 71% auto-handled at
<1% error), never by feel.

**A6 — `lang-variant` is backward-compatible *by halting*.** An old rdv iterates **every** `variants` entry
(`checkUnit`) and would try to load a PHP `src` as a JS module. It must never get there: `specVersion 0.5`
trips the coarse gate first. **Verify with a fixture** — a silently mis-graded foreign-language variant is the
under-stamping soundness hole (W.0 in v0.4) in a new coat.

**A7 — features stay mechanically derivable.** `lang-variant` ⇐ ≥1 `LANG` block in the SIR / `variants.lang:*`
in the manifest; `cross-lang-anchor` ⇐ `ANCHOR ref(<lang>:…)` with `<lang>` ≠ the primary target. Constructs,
not judgment. Today that detection is **split across two regex files that do not see each other** (Drift 2);
W.0c makes `featuresOfSir` the single detector that stamp, pack, and payload all call. **Jev never stamps a
feature** (Seam 3 is a lint that *reports* under-declaration; the stamp is that one mechanical detector).

**A8 — bootstrap by best guess** for the abstract type vocabulary, the per-language ABI tables, and the
rung names — but **seed the type vocabulary from the semcom dialect's typed ABI tags** (`TAKES`/`GIVES`,
`i64`, `i64:ptr`, byte buffers), which are already proven across PHP / C# / JS / LLVM, rather than inventing a
second one. The two dialects meet exactly here: semcom = a typed primary with thin behavior; rederive = a
behavior-rich primary with no types. v0.5's PRIMARY `SIG` is the union. Hardened by use; every miss recorded by the downstream gate, never papered over.

**A9 — a second production language is worth the per-language harness cost.** *Not measured.* The pilot's
cost-per-unit (emitter spawns + harness maintenance per language) answers it; if it is high, v0.5 ships the
schema split (moves 1–3, which pay for themselves in de-leaked primaries) and defers the second driver.

## The Jev seams (the ask, made concrete)

Four seams, one per phase of the loop *chop → define the nodes → write the SIR → blind re-emit*. The boundary is
the ecosystem's own — typesafe's guidance in the public use-case corpus (`awesome-jev`): *bounded decisions
(routing, ranking, an agent's next action) to Jev; new prose, code, or an open-ended plan to a generative LLM* — and
it falls exactly on the two-pass decomposer of move 6: **CONTRACT is generative and stays with the LLM; every seam
is bounded.** The nearest prior art is `Foreman` (a coding-agent supervisor: Jev assesses progress, a deterministic
policy decides) — the Seam 1/4 shape. Each is a
**typed decision** (Choice / Noul / Score), each has a **ground truth already recorded by the factory**, each is
**recoverable** (a wrong call is caught by the deterministic gate downstream and costs at most one round — the
status quo), and each writes a `predicted-*.json` the mechanical step reads as a *hint*. Guardrails, non-negotiable:
Jev output never becomes a stamp, a feature, a verdict, or a byte of a shipped bundle; the factory runs unchanged
with Jev absent (no key = today's loop); the escalation threshold is tuned from the factory's own outcomes (A5). Degraded mode has a second rung:
independent local option-scorers exist (`Jevlike`, `OpenJev SGLang`, `CUA-S1-FORMS` — per the corpus, "not official
weights or proof of equivalent quality"); for an *advisory* seam a worse-but-present local scorer is an acceptable
fallback when the API is unreachable in CI. The deterministic gate never notices the difference.

| seam | loop phase | decision (primitive) | ground truth on record | what it saves |
|---|---|---|---|---|
| **1 · route** | chop | **harden vs split** — *is this unit compound (matcher / parser / evaluator) such that hardening buys convergence only by transcription?* (`Choice{harden-definition, fix-generator-coverage, split}` — HARDEN mode already distinguishes "an updated generator if the gap was coverage" from a definition gap, so the route is 3-way — plus the named-leaf `Noul`, measured 94% / 8-of-8 in-session). Run before round 1 and on every `divergence.json` | `state.json` history: units that converged by hardening vs. units split or quarantined at cap; the PROTOCOL "harden vs decompose" rule (lines 77–82) is the label's definition | rounds burned hardening an under-decomposed unit; today this call is made by the runner *after* failed rounds |
| **2 · predict** | define the nodes | **which sentences are under-determined** — per node/sentence `Noul` *"an independent engineer could implement this line two defensible ways"* → a **`predicted-divergence.json` in the same shape as `divergence.json`** (so HARDEN mode consumes it unchanged) + a dial-position `Score` (*reads like a transcription vs a contract* — the decomposer's own SMELL rule) | real `heldoutDisagree` per graded round across the catalog; Phase 5's "gate or unit computes the mapping" sentence | the whole point: harden *before* three emitters are spent. If it removes one harden round per unit on average, that is three blind spawns per unit |
| **3 · lint** | write the SIR | two advisory checks, never a stamp: (a) **under-declared feature** — *this SIR's semantics require X but do not declare it* (version attribution 18/21 keyword-BLIND; caught `raceTimeout`/`fireOrder` with no `PAR`/`RING` token — exactly the drift a regex stamper misses); (b) **language leak, both directions** — *this line is language mechanism sitting in the primary file* / *this line is behavior sitting in a language file* (the v0.5 firewall, enforced cheaply on every SIR); (c) **self-declaration check** — `FIDELITY package` / `spec`, `ORACLE-CLASS`, and `SEAM` are declared by the decomposer and then regex-*routed*, never *checked*; a `Noul` that the declared anchor/class matches what the BEHAVIOR describes catches a mis-routed stamp before it is stamped | (a) the regex detector + the v0.4 corpus; (b) the lines the Rust emitter had to reinterpret in `get_rgb.sir` | the A6/W.0 under-stamping class before pack; the exemplar leak before it reaches a cross-language emitter |
| **4 · triage** | blind re-emit | before spawning N: *will this contract converge?* (whole-contract `Noul`; if confidently **no**, run Seam 2 and harden first — do not spend the emitters yet). After a 1/3: *which emission is the outlier vs the contract* (minor; the graded misses already say most of this) | round-1 verdict per unit (`ring`/`scheduler`/`lifecycle` 3/3 first round; `par` 1/3 then 3/3) | one round, on the units it correctly flags |

**Catalog-match at scale is two-pass.** `Choice` caps at 255 options; the semcom catalog has 498 names (the bake-off
silently offered 235). So Seam 1's catalog-match runs in the shape the corpus converged on (`jev_search`): a cheap
deterministic pre-filter — name / keyword / embedding — to ≤255 candidates, then Jev judges. The pre-filter's misses
are the same class as any static label's, and the aggregate-over-synonyms rule from the catalog bake-off still applies.

**The handoff both ways.** Deterministic → Jev: `featuresOfSir` cannot judge semantics, so it hands the SIR to
the lint. Jev → the sighted decomposer / the runner: below the threshold, Jev escalates and says nothing.
Confirmed outcomes → back to Jev: every graded round labels Jev's predictions, so the threshold is re-tuned by
the factory's record — A8's *"a downstream oracle catches the error and the miss gets recorded."*

**Cost, honestly.** ~220ms and pennies per call, off the Claude budget; a full Seam-2 pass over a 150-line SIR
is seconds. Three blind emitters are three subagent spawns on the subscription, minutes each. The multiplier is
`1/(1 − auto-handle rate)` on the fraction of harden decisions Jev makes confidently — measured, not assumed
(W.0b). "Inference isn't just cost, it's time" is the argument: the loop's latency is dominated by emitter
spawns, and Seam 2 moves work from *after* them to *before* them.

## Phases

Dependency order. Each ships independently, each has a pilot, each is accepted by a gate rather than by review.
Toolkit edits (schema, `capabilities.json`, rdv, pack, agents) go through the maintainer window
(`~/.sir-allow-toolkit-edits`); everything else is a plan-side or lab-side artifact.

### W.0a — warm-up: measure the leak (read-only, zero risk, do first)

> **RAN 2026-09-22** (`~/sir-lab/v05-lang/lint.mjs catalog ~/rederive/packages` → `w0a-catalog.json`), deterministic
> lints only (the Jev semantic pass is additive). **226 primaries: transcription density mean 23.4%; 212/226 (94%)
> above the 10% gate; 93 above 25%. Dialect leaks in 219/226 files, 7,097 lines.** The two exemplars the decomposer
> calibrates against: `complex.sir` 34% / 51 leaks, `minimal.sir` 14% / 9 leaks. The register baseline for move 6, and
> its empirical case. The re-cut `get_rgb` primary lints at 0% / 0 leaks (from 35% / 51 leaks) — see Phase 0.


Run Jev Seam 3(b) over the 225 shipped SIRs and the two exemplars: **how many "language-neutral" primaries carry
language mechanism, and which lines?** — and, with the deterministic transcription lint, **how much of each primary is
transcription (code shapes, pinned literals, pipeline narration) vs contract**: the register baseline the pivot is
measured against, and the threshold the pack gate is set from. Advisory output only; nothing changes. This is the empirical case for
design move 1 in one number, and the ground truth for the lint. *Gate:* a report in-repo
(`experiments/v05-w0-leak/`), with the `get_rgb.sir` lines the Rust emitter reinterpreted recovered by the lint.

### W.0b — warm-up: test A4/A5 on the factory's own record (read-only, zero risk)

> **RE-SCOPED 2026-09-22.** There is no record: zero `divergence.json` files exist anywhere (no sir-factory workdirs
> survived; the only narrative is `experiments/v04-phase5-generation/RESULTS.txt`). A4/A5 cannot be measured
> historically. The v0.5 lab runs generate the ground truth going forward — every graded round writes its held-out
> disagreements — and the Seam-2 go/no-go is measured on those once ≥ ~20 rounds exist. Until then Seam 2 stays unwired.


Replay Jev Seam 2 over every SIR that has a graded `divergence.json` in the factory's `out/` history (and the
v0.4 Phase 5 records). Score: does predicted per-sentence ambiguity rank the sentences that *actually* diverged
above those that did not (AUC), and at what threshold does it auto-handle what fraction at ≤1% error? **This is
the go/no-go for Seam 2** and sets its threshold. *Gate:* AUC and the auto-handle curve in-repo; a stated
threshold with its error budget.

### V.0 — the SIR parser + validator (foundation; do before W.0c — it is the vehicle for W.0c, §23a and Phase 4's gate)

> **BUILT 2026-09-22** in the lab (Lane: "Parser for sure!"): `~/sir-lab/v05-lang/lib/sir-parse.mjs`, `tools/sir-fmt.mjs`,
> `tools/sir-validate.mjs`, `tools/census.mjs`, `tests/validate-fixtures.mjs`.

**Why a parser first.** Every consumer re-parses SIR text with its own regexes — stamp, pack, rdv, `payload.mjs`, the lab —
and they disagree (Drift 2) or trip (`ORACLE` vs `ORACLE-CLASS`; "the first `CANONICAL-SHA256` in the file"). One canonical
parse → a typed AST; every check is a function over the AST; `featuresOf(ast)` replaces both detectors (W.0c collapses into
this); the **directive table is the §23a vocabulary freeze**, checked against `SIR_SCHEMA.md` and versioned with it.

**Three grammar decisions, from Lane's three annoyances (2026-09-22):**
1. *Whitespace* — indentation-insensitive: a column-0 directive starts a record, any indented line continues it (tabs, 2 or 4
   spaces alike); the canonical printer emits the one layout; **`PRIMARY-SHA256` binds to the canonical print**, so
   reformatting or commenting can never stale a binding (proven: raw sha changes, canonical sha does not; `print∘parse` is a
   fixed point).
2. *Comments* — in strict (v0.5) mode there is **no `#` in the grammar**: a parse ERROR outside a literal. Prose has named,
   parsed, *metered* homes — `DESCRIPTION`, `NOTE` (non-load-bearing; note density is a WARN), `RATIONALE` — and citations are
   attributes (`PINNED … CITED R3`, `EARNED round-1 heldout v7`), so "no pin without a citation" is grammar. Legacy mode reads
   the shipped corpus and reports every `#`; `sir-fmt --migrate` does the mechanical conversion.
3. *The checker is a tool, not a subagent* — `sir-validate <unit>` → `{errors, warnings, advisories, facts}`; the CONTRACT-pass
   author iterates against it (the closed-loop pattern); stamp, pack and **rdv (consumer-side, same code)** call the same tool;
   Jev is an optional advisory tier that never touches the exit code.

**Tier discipline (A7 applied to the validator).** ERROR = *facts*, mechanically decidable, refuses stamp/pack: comments in
strict, pseudo-code at column 0, emitter instructions in the artifact, unknown directives, register violations (a primary-only
directive in a language file or vice versa), un-cited pins, carried data under `DEPENDS-ON`, stale binding, language suffix
outside the registry, unparseable `SIG`, language leaks, carried hash/authority, oracle file-hash and declared-hash. WARN =
heuristics (transcription density — an ERROR only under the pack-time `--enforce-density` policy; note density; legacy forms).
ADVISORY = Jev, a separate channel. `facts` = what pack stamps *from*, so the manifest is derived, never hand-maintained.
**Golden rule, executable:** every ERROR has a fixture that triggers it — 14/14 fire; a valid fixture passes; both lab units
validate clean.

**Census of the shipped catalog (the vocabulary table's evidence):** 226 primaries, 47,629 lines — **89% are `#` comments**;
indentation in **40+ distinct widths** (up to 63 spaces); only 87/226 carry a `BEHAVIOR` directive; **29 ad-hoc directives** in
four classes: pseudo-code at column 0 (14 files: `LET`, `FOR`, `RETURN`, `NODE`, `CONTROL` …), **emitter instructions leaked
into the artifact** (7 files: `EMISSION`, `RE-EMITTER`, `EMITTER-DIRECTIVE` …), constants with no slot (7 files: `CONST` ×46,
`NAN = 0 / 0`, `INFINITY = 1 / 0` → v0.5 `PINNED`), export shape (4 files: `EXPORT-SHAPE` → `SEAM` + the language-file ABI);
one colon-dialect file (`UNIT: hashSync`). The newer register (exemplars, v0.4 experiments, lab units): 32% comments, two
indentation styles, zero unknown directives. *Gate for promotion:* all 226 parse in legacy mode (they do); the six lab files
are strict-clean, `#`-free, and both units verify on canonical-print bindings (they do).

### W.0c — warm-up: fix the capability-model drifts (do before F.2; one-line class, soundness class)

Make `featuresOfSir` the **single** detector (stamp, pack, and payload call it; `pack.featuresFor`'s v0.2/v0.3
branches fold in); make rdv **read** `capabilities.json` for its implemented set (with the hardcoded list as a
fail-safe fallback, never the source); reconcile `maxSpecVersion` with what rdv can check. *Gate:* a v0.4 fixture
bundle (`@fixture/par`) now **packs with `par-interleaving` in `features`** and verifies on the current rdv — today
it cannot be stamped at all. This is v0.4's W.0 again, one layer up: an under-stamped feature is a silently skipped
gate. Also fix, while here: `rdv resynth --apply` (rdv.mts ~525–551) grades every unit as plain `vectors` by
**unit name** (not `exportName`), misgrading trace / STATE / PAR / ring units — the named-export bug class
`checkVariant` already fixed. The consumer-side per-language resynth (Phase 2) reuses this path.

> **DONE 2026-10-23 (maintainer window).** Lane's call: the capability model moves into rederive beside rdv.
> `cli/capabilities.json` (moved from sir-toolkit, which no longer has a copy) + `cli/features.mjs` = the ONE detector
> (`detectFeatures` = union of SIR text and oracle mode/manifest; `specVersionFor` = max `since`, throws on an unknown
> feature). Consumers: rdv (`IMPLEMENTED_FEATURES` and `SUPPORTED_SPEC` now READ from the model, compiled into the
> bundle; the hardcoded list is gone rather than kept as a fallback, because a static import has no runtime failure
> to fall back from), sir-factory `pack.mjs` (depends on `rederive`), sir-toolkit `payload.mjs`. Drift 3 resolved
> upward: every feature with `since ≤ 0.4` is implemented, so rdv supports 0.4 (a test keeps that claim honest).
> `resynth --apply` grades by the oracle's exportName/mode/observe. **Gate PASS:** `sir-factory/test/
> pack_features_selftest.mjs` packs `@fixture/par` with `par-interleaving` at 0.4 and it verifies on the current rdv;
> run against the pre-fix pack it FAILS (0.2, `['vectors']`) — the negative control. `cli/features.test.mts` 9/9
> (incl. a bundle declaring an unimplemented feature halting by name); rederive suite 96/96; all 218 shipped
> packages verify on the rebuilt rdv.

### F.2 — the language capability model

`capabilities.json` gains `lang-variant` (§23; `detect: a sir/<unit>.<lang>.sir file / variants.lang:*`; `implemented: false`
until Phase 2; `generable: false` until Phase 4) and `cross-lang-anchor` (§12 ext; `detect: ANCHOR ref(<lang>:…)`).
rdv gains `languages: {js}` beside `IMPLEMENTED_FEATURES`; pack's `featuresFor` detects both mechanically and
**refuses to stamp `lang:*` while unimplemented** (A7, and the A6 discipline: never add a feature to unblock
generation). *Gate (the A6 fixture):* a v0.5 bundle with `variants.lang:rust` halts on today's rdv naming
`lang-variant`; a v0.4 bundle verifies unchanged; an rdv predating `languages` halts on the scalar.

> **DONE 2026-10-23.** `cli/capabilities.json` gains `lang-variant` (§23) and `cross-lang-anchor` (§12/§10), both
> `since 0.5`, `implemented: false`, `generable: false`; `toolchain.languages: ["js"]` + the closed
> `languageRegistry` (the lab's six). `features.mjs` detects both from STRUCTURE (`<unit>.<lang>.sir` names,
> `lang:<id>` keys, `ANCHOR ref(<lang>:…)`; an id outside the registry throws). rdv adds a STRUCTURAL gate ahead
> of the declared ones — it reads variant keys and per-language SIR paths itself, so an under-stamped bundle
> still halts, naming the feature AND the language. pack refuses any unimplemented feature BEFORE writing.
> **Gate PASS** (`experiments/v05-f2-lang-variant/`, the A6 fixture = shipped bytes + the lab's `lang:rust`):
> halts on this rdv (stamped AND under-stamped); published rederive@0.4.0 halts on the scalar (v0.5 > 0.3);
> v0.4 fixtures + all 218 shipped packages verify unchanged; pack refuses and writes nothing. Found on the way:
> `plugins/rederive/tests/profile-hooks.test.mjs` read the real `~/.sir-allow-toolkit-edits`, so all its
> must-deny tests failed while a maintainer window was open — now isolated to a temp HOME.

### Phase 0 — reproduce the evidence on THIS build (gate on A1)

> **LAB BUILT + SMOKE RAN 2026-09-22** at `~/sir-lab/v05-lang/` (outside the sealed toolkit; promotes to
> `experiments/v05-*` when the window opens). Implements moves 1, 2, 6 in lab form: the file split with
> `PRIMARY-SHA256` binding + staleness, the closed registry, A7 detection by filename, the three lints, per-language
> **verifier-owned** drivers (js; ts = `tsc --strict --noEmit` + an any-ban lint → `type-checked`, then emit; rust =
> `cargo check` → `type-checked`, build, harness-owned stdin/stdout adapter), cleanroom staging, grading against the
> shared oracle, cross-verification. **Subject:** `get_rgb` re-cut into the contract register — 155 lines of
> STEP/BRANCH narration → **53 lines, R1–R9**, regexes as cited pins in `get_rgb.{js,ts,rust}.sir`. **Results:** lint
> gate PASS; js (the 3/3-quorum reconstruction) 42/42 + 21/21 → harness-verified; rust (the blind reconstruction) cargo
> check ok → type-checked, 42/42 + 21/21 → harness-verified; **cross-verified js ≡ rust 3000/3000**. **Negative
> control:** R7 reverted in a Rust copy → type-checked still earned, frozen 39/42, misses exactly the R7 vectors
> (50% → 127, 90% → 229), harness-verified withheld. **TS — the first A1 data point in the new register, RAN:** one blind
> `sir-reemitter-cr` emitter (Read+Write only; saw ONLY `get_rgb.sir` + `get_rgb.ts.sir` + `frozen.md`) converged on
> **round 1** — five pins verbatim, zero `any`, `tsc --strict` ok → type-checked, 42/42 + 21/21 → harness-verified,
> **cross-verified js ≡ rust ≡ ts 3000/3000**. A 53-line rules-only primary + a 22-line language file were sufficient
> for a cold emitter in a language the unit had never been written in. TS negative control (one `any`): type-checked
> withheld, harness-verified kept. `run.mjs` makes `type-checked` a gate wherever the language has a checker. Two driver
> findings: `tsc --strict` does not reject explicit `any` (hence the lint); the shipped Rust artifact uses `f64::round`
> where `.rust.sir` specifies `(x+0.5).floor()` — unobservable inside the clamp domain, exactly the fact a language
> file exists to carry. **Carried data (after Lane's catch):** the primary's `DEPENDS-ON colorNames # carried…` was a
> §18-under-§9 category error (inherited from the exemplar); fixed to `DEPENDS-ON none` + a `CARRIED … FROM …` block
> with `SHAPE`, `CANONICAL-SHA256 678d5ab9…`, six `AUTHORITY` assertions; bindings in the language files; `bind.mjs`
> re-stamps `PRIMARY-SHA256`. The harness now attests the table per language (js/rust/ts: same canonical hash, 6/6);
> controls: a one-byte tamper → `hash-mismatch` + the failing entry named; the old smuggle → Lint 4 hit.
> **Artifact shape (after Lane's catch #2):** the Rust artifact converted from the lab's binary to a `[lib]` crate
> (logic untouched, 159 lines); the driver now generates a verifier-owned harness crate and compiles it against the
> SIG; full run still green (js/ts/rust verified, cross-verified 3000/3000); control `rust_binary_shape` refused on
> shape alone; the R7 control re-cut as a library so it fails only for R7 (39/42).
> **Typed oracle (design move 3) BUILT + the NaN rule validated on `is_number`** — see move 3's note.
> **Pressure test — Tier A, RAN 2026-09-22** (`kind_of`, `defaults_deep` [STATE], `escape_string_regexp` [throws]):
> re-cut BLIND by `sir-decomposer` from the real packages, N=3 cold emitters per language, shipped reconstructions as the
> control. **Every unit converged in round one with 3/3 cold quorum in every language it declared** (escape js/ts/rust,
> kind_of js/ts, defaults_deep js/ts/rust), cross-verified 2000/2000 per unit; no HARDEN loop was entered. Machine-checked
> claims all caught their planted fault (oracle SHA + refusal, stale binding per file, register smuggle, binary crate, STATE
> right-result-no-mutation). The prose claim — MECHANISM carries what an emitter would get wrong — was NOT demonstrated
> (two deletions, two convergences): **with a complete primary, MECHANISM is advisory; the language file's load-bearing
> content is SIG/ABI, ENVELOPE and PINNED, all machine-checked.** Schema consequence for §23b: MECHANISM is documented as
> guidance, never a gate. Grammar additions forced by the run: REST parameters (`...name: T`, canonical vectors stay
> call-shaped); the js-native extension codec (`cu:"utf16"`, `{t:'undefined'}`); STATE extension vectors carry `post`
> as `record[result, post]`; harness faults reported per line as the verifier's, never as emitter misses; the control
> excluded from quorum; a vote needs every applicable rung; the cross-verify differential is ORACLE-SHAPED and SIG-typed
> (mutations of real vectors — the color-string generator was a get_rgb leak), and the Rust harness transport is declared
> JSON text (no -0/NaN/Inf; `float_roundtrip` on). Scoreboard: `~/sir-lab/v05-lang/pressure/TIER-A.md`;
> lab README lists each verifier bug the units found. Two register items the blind decomposers raised: `TABLE` needs a
> defined row grammar in §23a (two units, two syntaxes — numbered rows vs pipe rows); the leak lint must ignore quoted
> string literals (a unit whose RESULT is the text "null" was forced to pin it) — fixed in the lab validator.

> **Pressure test — Tier B, RAN 2026-09-23** (`minimist` [HARDEN], `bytes` [language-file load-bearing: `toFixed`
> tie rounding], `slugify` [carried data: 738-entry table + locales]): blind decomposers (Fable), N=3 cold emitters
> per language, live Jev seams (predict/triage, advisory only). `bytes` VERIFIED js/ts/rust round 1 (cross
> 1976/1976); `slugify` VERIFIED js 2/2, ts 4/4 (round 2 harden), rust 3/3 (two rounds VOIDED), cross 2000/2000;
> `minimist` VERIFIED js 3/3 (Fable) + rust 2/2 (Sonnet) after a rule harden (round 1) and a cross-language harden
> (round 2), cross-verified js≡rust 1814/1814 — TypeScript PENDING, 0/6 emitters under the 64,000-token cap.
> Primary criterion (rounds ≤ shipped round): bytes and slugify pass, minimist (2 > 1) fails by construction —
> chosen to enter HARDEN. Six verifier faults fixed, each with a fixture: Rust carried-table shape,
> round-cap-by-contract, carried-module cleanroom staging, artifact-vs-build-copy injection (`void --restore`),
> type-changing fuzz mutations mis-scored as votes, and an unshared per-call input clone. Two Sonnet Rust emissions
> (140K/224K tokens) verified 16/16 + 42/42, 0 divergence, agreeing with Fable's js on every in-envelope input — no
> model difference, only cost/wall clock; deliberation against the output-token cap is the binding constraint on
> large units. Scoreboard `pressure/TIER-B.md`. Open for Lane: minimist DETACH vs. declared deviation; oracle
> extension at divergence points; TypeScript under a raised cap; verifier-dictated carried placement (§23b).


Re-run the multi-target matrix and the Rust `get_rgb` diff against the current SIR + factory, artifacts landing
in-repo (`experiments/v05-phase0-multitarget/`) — the v0.4 lesson: no evidence lives in a temp directory — **and
run the matrix on rederive-dialect units** (the 12/12 was semcom-dialect; see A1), so the evidence is for the
primary this plan actually splits. Then the
A1 test: `get_rgb.sir` split into `get_rgb.sir` + `get_rgb.js.sir` + `get_rgb.ts.sir` + `get_rgb.rust.sir`; 3 blind
JS + 2 blind TS + 2 blind Rust emitters, each given **the primary + its own `.<lang>.sir` only** (v0.4's derived-context principle: an emitter reconstructing the Rust
variant never reads a word about JS regex flavor). *Gate:* convergence ≥ the JS-flavored baseline. Failure
rewrites the type vocabulary / MECHANISM boundary, cheaply and early.

### Phase 1 — schema §23 + the encoding + the anchor

`SIR_SCHEMA.md` first **freezes the practiced vocabulary as §23a** — `UNIT` (the header, superseding `SIR`),
`FIDELITY` (superseding §12's `VARIANT` spelling; the `variants` manifest map is unchanged), `BEHAVIOR`,
`DESCRIPTION`, `INVARIANT`, `PROVENANCE`, `SCOPE`, `UNGUARDED-PRECONDITION`, `OUT-OF-DOMAIN` — each with its
one-line meaning and whether it is load-bearing or an unverified prior (§0) — and, per design move 6, `BEHAVIOR`
redefined as **numbered rules** (narration rejected), the new **`TABLE`** and **`PINNED`** directives with the
**no-pin-without-citation** rule, and `#` comments declared never load-bearing *as a gate*. Then it gains **§23b PRIMARY + per-language
files** (forced addition, with Phase 0 as evidence: the two-way firewall, the `<unit>.<lang>.sir` file grammar +
`PRIMARY-SHA256` binding + closed language registry + staleness rule, the abstract type vocabulary as a versioned table), a **§10 extension** (the language-neutral
vector encoding, mandatory under `lang-variant`), and a **§12 extension** (`ANCHOR ref(<lang>:…)`). Bundle
contract v0.5: `specVersion "0.5"`, `sir/<unit>.<lang>.sir` files, `variants.lang:<id>` per design move 2 (`lang` +
`langSha256` + `primarySha256`; `src` optional ⇒ spec-only; `verified {rung}` only where an artifact was verified). Deferred list updated: cross-language anchors **leave** it. *Gate — the pivot's proof:*
`examples/minimal.sir` + `complex.sir` re-cut as **contracts** in v0.5 form (rules + `TABLE` + neutral pins in the
primary; the dialect regexes moved to `.js.sir`, each cited) and **re-proven 3/3 blind** — their headers carry the
proof today; they must again, in the new register. If they converge, the register flips factory-wide because the
decomposer calibrates against them.

> **DONE 2026-10-23.** Schema v0.5 written into the canonical spec (`sir-spec/SIR_SCHEMA.md` 8b13fe3, local, not
> pushed: the repo is public): §23a vocabulary freeze (the table GENERATED from the parser's directive table,
> `cli/sir/directive-table.mjs`; `directive-table.test.mjs` fails on any drift, negative control run), §23b primary +
> language files, §10 ext. `sir-canonical-v1`, §12 ext. `ANCHOR ref(<lang>:…)`, bundle contract v0.5, deferred list
> updated. The lab's parser, encoder, family rules and validator moved into `rederive/cli/sir/` as the executable form
> (registry read from the capability model; fixtures: every ERROR fires, get_rgb + is_number validate clean).
> **Gate PASS, both exemplars, fresh blind 3/3 in js, ts AND rust** (the plan asked JS-only; we ran all three):
> **min-indent** (minimal) re-cut COLD by the decomposer, which never saw `minimal.sir`: three code-point pins
> (INDENT/BREAK/BLANK, probed over every UTF-16 code unit), the JS regex only in `.js.sir`; round 1, 3/3/3, cross
> 2000/2000. **get_rgb** (complex): round 1 found a real primary gap: R9 never said what negative zero becomes,
> and sir-canonical-v1 compares bits, so 2/3 Rust emitters returned -0 on held-out v7. Hardened (R9 +0 rule, EARNED
> round-1 heldout v7), plus a latent R5 misstatement the decomposer found (percent alpha is x 0.01, not /100;
> differs for 10 integer percents; no vector pins it yet). Round 2: js 3/3, ts 3/3, rust 2/3. The miss was FROZEN
> v13, an emitter ignoring its MECHANISM line, so no harden: round 3 rust 3/3. Cross 2000/2000. **Verifier fix on
> the way:** a frozen miss was reported as a held-out disagreement (what a harden reads); now `frozenMissed`
> (lab 259754d, fixture case 7, negative control run). Exemplars in the plugin refreshed (0.5.3). **Open for Lane:**
> pin R5's percent alpha with an oracle vector (needs `encode-oracle --extend`, the same call as Tier B decision
> (b)); whether the decomposer's CONCISION pair (`examples/minimal.sir`/`complex.sir`) is replaced by the v0.5
> families (the "register flips factory-wide" step); three lab tests fail on live run state, two of them already
> at HEAD (`lab-status`, `stale-emissions`), and `rust-carried-inject` hardcodes `units/get_rgb/runs/rust/emit_1`.

### Phase 2 — the first verifier-owned language driver in rdv

`checkVariant` for `lang:<id>`: load the native artifact through a per-language driver (Rust: build + run a
stdin/stdout binary, the `diff-rust-js.mjs` shape; PHP: `php` + the `run_php.php` shape; both marshal the §10
encoding), grade held-out + differential against the **primary** oracle, verify hashes. Report the rung honestly:
`type-checked` (static: the artifact satisfies its language file's `SIG` under the language's own checker; TS and
Rust earn it, JS cannot) → `harness-verified` (one language, held-out + differential) → `cross-verified` (≥2 languages agree on held-out
*and* on a differential against each other — the lab's "different source, identical behavior") →
`oracle-anchored` (the primary oracle is `ANCHOR ref(<lang>)`-anchored, so agreement is not self-consistency).
*Pilots (Lane's call, 2026-09-22): **TypeScript** and **Rust** — deliberately VERY different; JS stays the baseline.*
**TS first** — the cheap pole: the driver is the smallest possible — transpile (`tsc`/`esbuild`), then the
**existing** JS `gradeVs` — so Phase 2's cost is the schema/file mechanics, not a harness; `rdv resynth` already
writes `emit_<k>.ts` (`rdv.mts:505`), so TS is the natural consumer-side language too; and it earns the
`type-checked` rung (`tsc --strict --noEmit` against its `.ts.sir` `SIG`) before any runtime grading.
**Rust second** — the hard pole: its own toolchain, no shared runtime, i64 wrapping, UTF-8 `&str`, `Option`; it
stresses the ABI / MECHANISM / named-deps *content* of a language file; the `diff-rust-js.mjs` stdin-binary shape
is the driver; `cargo check` against `.rust.sir` earns the same `type-checked` rung. Together they bracket the
design — one language where the split is *cheap*, one where it is *hard* — and both earn a rung the baseline cannot. *Gate:* `@fixture/lang` at `specVersion 0.5`: correct TS and Rust srcs VERIFIED; a TS src with a widened return type
FAILED at `type-checked` alone; a wrap-broken Rust src FAILED on the unsigned-64 comparison alone; `languages: {js,
ts, rust}` flips `lang-variant` to `implemented` for `ts` and `rust` only.

> **Phase 2a DONE (2026-10-26) — TypeScript.** `cli/lang-ts.mts` + `checkLangVariant` in rdv: PRIMARY-SHA256 binding →
> `tsc --strict` + SIG-conformance shim + any-ban (`type-checked`) → the existing `gradeVs` (`harness-verified`). The consumer's
> own TypeScript, resolved from the bundle dir then cwd; without it, a lang:ts bundle HALTS with the install hint
> (capabilities.json `toolchain.toolchains`). `languages: [js, ts]`, `lang-variant` implemented (for those); maxSpecVersion
> stays 0.4 (cross-lang-anchor unimplemented). Gate: `experiments/v05-p2-lang-ts` (good VERIFIED; widened FAILED at
> type-checked alone; stale FAILED on binding alone; no-tsc HALTS) — `cli/lang-ts.test.mts` 9/9, rederive suite 138/138,
> 218 shipped packages unchanged. sir-factory pack refuses lang:rust by language and ANY language file until Phase 3.
> Open: carried data in lang:ts is refused, not graded. FOUND (pre-existing, not v0.5): `packages/@aws-sdk/util-dynamodb`
> FAILS 38/60 — its 2026-06-23 oracle encodes Uint8Array outputs as plain objects, from before rdv's eq tagged u8
> (8406cbb); fix = re-stamp from the real package through the factory, never a hand edit.
> **Phase 2b DONE (2026-10-26) — Rust; Phase 2 gate PASS.** `cli/lang/rust.mjs` + `cli/lang/grade.mjs` promoted from the lab;
> rdv grades any lang variant on a sir-canonical-v1 oracle through its driver (vector-set sha checked against the file and the
> primary's ORACLE declaration first), in a scratch dir. Rust src is a crate DIRECTORY hashed as a tree (`cli/tree-sha.mjs`).
> rdv additions: a scalar result pin (closes a lab gap: any serializable result type passed) and `--locked`. `languages: [js,
> ts, rust]`. Gate `experiments/v05-p2-lang` (= `@fixture/lang`, min-indent): all three VERIFIED; ts-widened FAILED at
> type-checked alone; rust-wrap FAILED on the u64 comparison alone (2^64-1 intact); rust-narrowed FAILED on the pin alone.
> Found: the lab driver failed every top-level json/map arg since 9c2dfc6 (E0282) — fixed in both, lab test added; minimist's
> rust ABI is pre-9c2dfc6 (needs a language-file re-cut). Suite 146/146; 218 packages unchanged.
> **Phase 3 DONE for pack (2026-10-26).** sir-factory `pack-v05 <unitDir>` (lib/pack-v05.mjs): a verified v0.5 unit (primary +
> language files, canonical oracle, runs/decision.json, STAGE.json) → the v0.5 bundle contract, one lang:<id> variant per
> language. Refuses: stale binding, lint failure, unharnessed language, no quorum, oracle not matching its declaration, carried
> data, missing upstream license, an existing bundle dir; the bundle survives only if rdv check verifies it as written.
> Selftest 19/19 on a self-contained min-indent fixture. Packed from the lab and VERIFIED in js/ts/rust: @rederive/min-indent
> (new) and @rederive/bytes (a v0.5 re-release: needs a version bump past the published 0.1.0). NOT ported: stage-reemit/grade
> --lang in sir-factory — the lab's tools/unit.mjs + sir-lab-runner run that loop today (decision for Lane: port, or keep the
> lab as the v0.5 front end). **Remaining for the v1 gate: publish rederive 0.5.x, then one @rederive/* bundle with a non-JS
> variant.**

### Phase 3 — the factory emits and packs per language

`stamp` unchanged (the primary oracle is stamped once, from the real export or the cross-language reference);
`stage-reemit --lang <id>` writes a cleanroom of **`<unit>.sir` + `<unit>.<lang>.sir` + `frozen.md`**; the runner spawns
N≥2 `sir-reemitter-cr` per language; `grade --lang <id>` drives the Phase 2 driver; `pack` stamps
`variants.lang:*` + `features` + `specVersion 0.5`. The per-language re-emitter's payload is derived, not
maintained (`payload.mjs`): a Rust emitter gets §23 + `get_rgb.rust.sir` and nothing about JS. *Gate:* the TS and Rust pilot
units round-trip install → decompose → stamp → stage → re-emit ×2 → grade → pack → `rdv check` shows the `lang:ts`
and `lang:rust` rows at `type-checked` + `harness-verified`.

### Phase 4 — generation: the decomposer writes the primary + per-language files, and earns `generable` per language

Restructure `sir-decomposer` into the two passes of design move 6 — **CONTRACT** (rules + invariants + `TABLE` +
oracle generator; the transcription lint runs before the file leaves) and **HARDEN** (only on a divergence report,
real or Jev-predicted; may add cited `PINNED` / `EARNED` lines) — and teach it the split (a per-language fragment per language, injected via `payload.mjs` only once that
language is `implemented`), with the firewall as a **validator at pack time** (a primary with a leak-lint hit
above threshold, or a language file carrying `BEHAVIOR`, is refused — a skill can be ignored; a gate cannot).
*Acceptance gate per language, per v0.4 Phase 5:* **cold re-emitters build the variant from `<unit>.sir` + `<unit>.<lang>.sir`
alone** — no schema, no fragments. Divergence means the language file needs a footnote, which means it is specified
wrong (A3). `generable` flips per language only on this gate.

### Phase 5 — the Jev seams, wired as removable advisory stages

Three runner stages, each a script under `sir-factory` that writes `predicted-*.json` and **changes no verdict**:
`predict <wd>` (Seams 2 + 4, before `stage-reemit`), `lint <wd>` (Seam 3, after decompose), `route <wd>` (Seam 1,
on `divergence.json`). The runner reads them as hints: on a confident `predict`, it re-spawns the decomposer in
HARDEN mode with `predicted-divergence.json` *before* the first re-emit; on a confident `route: split`, it reports
the under-decomposition instead of hardening. Gated on W.0b's threshold. *Gate:* on a held-out worklist, harden
rounds per unit **drop** vs the no-Jev baseline **and** `state.json` verdicts are byte-identical with and without
Jev (Jev never alters a verdict — proven by diff, not asserted). If the rounds do not drop, the stage is removed;
the evidence stays.

### v1 gate

≥1 published `@rederive/*` bundle carrying a verified **non-JS** `lang:<id>` variant at a stated rung, checked by
a released rdv that declares that language, with the primary SIR passing the leak lint. That is "a second
language in production," and it is what closes the DATA-POINTS gap.

## Derived agent context (v0.4's section, one layer further)

v0.4: *prompt = invariant core + payload derived from declared features.* v0.5 adds the language axis to the
derivation: a blind re-emitter's context is **`<unit>.sir` + exactly one `<unit>.<lang>.sir`** — the filesystem *is* the derivation, so the language firewall is
also a context-minimization rule with a falsifier — if the Rust emitter cannot converge from `get_rgb.sir` +
`get_rgb.rust.sir`, either the primary leaked (fix the split) or the language file is incomplete (fix the file), and the quorum
says which. The sighted decomposer remains the asymmetric role (it decides which languages to target); give it
the `languages` set from rdv as its compact index and let it write one language file at a time as it commits.

## Flags surfaced by the map (pre-existing; on v0.5's path, not v0.5's scope)

- `rdv resynth --apply` misgrades non-plain units (see W.0c).
- No SIR schema validator or linter exists anywhere; every routing decision is a regex over the SIR text. Phase 4's
  pack-time firewall is the **first** validator; Seam 3 is the first lint.
- Winner selection in `grade.mjs` is "smallest full-passer" — deterministic and fine; **not** a Jev slot (it would be
  a binding choice).
- §0 cites a `SIR_HARNESS_ROADMAP.md` that was not found (not searched exhaustively) — a dangling citation.
- Counting: 219 shipped packages, 223 manifests incl. experiments, 225 `.sir` files (multi-unit packages). The
  tables above say "225 SIRs" where they mean files.

## Out of scope

- Transactions / compensation, multi-process effects, the `ui` domain verbs — carried forward again.
- Retro-stamping the 225 legacy bundles as v0.5. They are valid unstamped (absent = v0.1). Re-cutting a primary
  is churn without a claim change — *except* the leak lint (W.0a) may name primaries whose JS mechanism is
  load-bearing; those are candidates when their unit is next touched, never a sweep.
- Idiomatic quality of a per-language artifact. The lab's rule stands: **behavior is the gate; idiomaticity is a
  separate axis** the oracle does not see.
- Jev anywhere binding: no Jev in a stamp, a feature list, a verdict, `rdv check`, or a shipped byte. No Jev as a
  required dependency: every stage in Phase 5 is absent-safe.
- Inheritance between language files (`EXTENDS js` for `.ts.sir`) — v0.5 language files are self-contained.
- PHP / C# / Python as pilots. The lab's PHP evidence (the re-derived wrapping multiply) stays as the §9 argument for
  named per-language deps; the languages themselves wait for the closed registry to grow after v1.
- A structured-Forth→applicative transpiler for per-language codegen — the lab found it an optimization, not a
  requirement; the prompt path transfers.
