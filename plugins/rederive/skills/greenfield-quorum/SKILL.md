---
name: greenfield-quorum
description: >
  Build NEW code (a feature or an app) leaf-by-leaf as verified, ZERO-DEPENDENCY units — and surface the genuine
  decisions the ecosystem disagrees on so a human decides them on purpose instead of by accident. Use when
  implementing greenfield functionality whose sub-problems are NAMED behaviors the npm ecosystem already
  implements (slug, currency/number/date formatting, rounding, transliteration, parsing, pluralize, humanize,
  etc.). The flow: doesNotUnderstand-decompose the feature into named leaves + glue → for each leaf, discover a
  QUORUM of reference packages → run them (sandboxed) to find where they AGREE (the contract) and DISAGREE (the
  decisions) → surface only the GENUINE forks to the human at product altitude → ratify the intent contract (play
  the decomposition back in the giver's terms; no requirement dropped) BEFORE any oracle → stamp an oracle from the
  chosen reference → synthesize a verified zero-dep implementation via blind quorum → install. You keep the behavior;
  you ship none of the packages. NOT for pure-novel logic with no reference (that falls to property oracles /
  a human ruling) — see BOUNDARIES.
---

# greenfield-quorum

The insight: today `npm install <x>` grabs bytes you trust and ship, and it silently accepts every decision the
package's author baked in — you never even see a decision was made. This flow inverts that. It uses the ecosystem
for its **behavior** (run a quorum of implementations once, in a sandbox, to derive oracles and surface where they
disagree) not its **bytes** (you ship your own verified, zero-dep implementation). The disagreements become
*decisions you make on purpose*. The 650-dependencies problem and "how do I verify greenfield code" are the same
move: harvest npm safely.

You drive this leaf-by-leaf. Each leaf is a full pass of the loop below. Delegate the synthesis + verification to
the existing SIR machinery (the `sir-reemitter-cr` role agent, `sir-factory stamp`, `rdv check`); this skill owns
the two NEW parts — **reference discovery/quorum** and **the decision-surfacer**.

## The loop (per named leaf)

0. **DECOMPOSE (doesNotUnderstand).** Break the feature into NAMED LEAVES + GLUE. A leaf is a behavior with a
   name worth saying that the ecosystem likely implements (`money_round`, `format_currency`, `slug`). Glue is the
   orchestration that composes leaves; it has no reference and is verified by PROPERTIES (step 9). If a leaf has
   no name and no npm implementation, it is not a quorum leaf — see BOUNDARIES.

1. **DISCOVER the reference set.** Find 3–5 packages implementing the leaf (your knowledge + `npm search`).
   **Always include the platform builtin as a spec-anchor when one exists** (`Intl.NumberFormat`,
   `Intl.DateTimeFormat`, `Intl.PluralRules`, `URL`, `TextEncoder`). The builtin is the standard AND zero-dep —
   often the quorum reveals the packages are strictly worse than what's already in the runtime. And when the builtin embodies the ruling, it becomes the **implementation**, not merely the oracle anchor (step 8): you wrap it, you don't rebuild it.

2. **QUORUM STAMP (sandboxed).** In a throwaway dir: `npm init -y && npm i --ignore-scripts <the packages>`.
   Write ONE call-adapter per reference (each API differs — that's the discovery work) and a **stratified +
   CHAOS** input set (normal cases, boundaries, AND out-of-domain garbage — empty, wrong-type, non-finite,
   other-locale — because you only find the disagreements your inputs hit). Then let the helper do the mechanics:
   ```
   import { runQuorum, report } from '<this skill dir>/quorum.mjs';
   console.log(report(runQuorum(adapters, inputs)));
   ```
   It computes agreement, the disagreement set, and pairwise-agreement CLUSTERS.

3. **SPLIT.** Where all references agree = the **invariant contract** (the base behavior, not up for debate).
   Where they disagree = the **decision surface**.

4. **CHARACTERIZE + DISENTANGLE.** For each disagreement, name the AXIS in plain language (reason over the
   diverging outputs — the clusters tell you which references share a "school"). A single output can differ on
   several axes at once (case AND transliteration AND separator) — SEPARATE them into independent decisions.
   Then bucket each axis:
   - **OBVIOUS** → auto-resolve, capture the reasoning (e.g. a float-naive rounder that returns literally wrong
     money; a locale-blind formatter vs the standard). Do NOT ask the human about these.
   - **GENUINE CALL** → a real decision with real consequences. Save for step 5.
   - **DIFFERENT ALGORITHM** (clusters that implement different things, e.g. Damerau- vs classic-Levenshtein;
     pinyin vs drop for CJK) → this is ambiguity in the INTENT itself; surface as "which behavior did you mean?"

5. **SURFACE — only the genuine forks — via `AskUserQuestion`.** This is the crown of the flow. Obey all four:
   - **(a) Proven fork.** Never ask a question the quorum hasn't PROVEN is a real disagreement. No manufactured
     permission-asking — every question has a measured fork under it.
   - **(b) Product altitude.** You did the technical characterization upstream; the human sees "banker's vs
     half-up, and who requires which," never "IEEE-754 half-way ties." Resolve the technical part before asking.
   - **(c) Strip the obvious.** Only the genuine calls reach the human. Asking about auto-resolvable things is
     what makes a flow feel like nagging.
   - **(d) Frame as tradeoff + consequence, not preference.** Each option states what it optimizes and who needs
     it ("banker's: unbiased over many transactions; some tax authorities require it"). The human judges on what
     they care about, not on taste.

6. **RULINGS.** Record each answer as a **project ruling** (a small `RULINGS.md`). Rulings are reusable and
   inherited: index them by intent ("this project: locale-aware, de-DE; rounding: banker's, at-total") so the
   NEXT leaf that hits the same axis does not re-ask. The human is consulted once per *intent*, not per occurrence.

6.5. **THE INTENT CONTRACT — the hard stop before ANY oracle (build-level, runs ONCE).** A perfect oracle for
   the wrong contract verifies the wrong thing perfectly. So before you stamp a single oracle, play the
   decomposition back to the requirement-giver **in their terms** and freeze it. The scar this exists to stop
   (2026-08-13): "return the EVEN integers" was decomposed into a unit that returns "what the gate says is
   truthy" — it did NOT compute evenness. Three blind emitters built it identically; quorum went 3/3 and the
   requirement was *gone*. **Quorum measures whether builders converged; it cannot measure whether the contract
   kept the requirement.** Grade that here, as its own axis.
   - Write `<build>.contract.yaml`: the giver's ORIGINAL ask decomposed into `requirements` (each `text` in the
     giver's words, verbatim — NOT the technical restatement; that is the anti-steamroll anchor), each tagged
     `kind: domain | timing`, and each `satisfied_by:` the leaf/glue unit that computes it (step 0's leaves) —
     or `waived:` by a frozen ruling. List the `units` with `role: unit | glue | collaborator`. (Schema:
     `typikon/docs/SCHEMA.md` § intent contract.)
   - Run `typikon contract --spec typikon.yaml --contract <build>.contract.yaml --ratify --by <giver>`
     (`typikon` on PATH, or `python3 -m typikon.cli` from a checkout — typikon is not a published package yet; `--spec` is the
     project typikon that holds the frozen rulings a waiver may cite — a minimal `rulings: {frozen: []}` is
     fine when nothing is waived, and step-6 out-of-scope rulings are frozen into it with `typikon rule`).
   - It **refuses to ratify** while any requirement is `dropped` (no unit), `dangling` (unknown unit), or
     `pushed-out` (DOMAIN work landed on a collaborator — the scar; the unit does all domain work, a
     collaborator only signals timing). A refusal means the DECOMPOSITION lost the requirement: go back to
     step 0 and fix it — never stamp around it. **No oracle is stamped (step 7) until this ratifies.** This is
     the one gate quorum cannot substitute for: `converge + unfaithful` is a distinct, expensive failure whose
     cause is the decomposer, and this is where it is caught.

7. **STAMP THE ORACLE from the CHOSEN reference.** *Precondition: the build contract ratified (6.5). Never stamp
   an oracle for a requirement the contract dropped or pushed out — a held-out oracle over the wrong contract is
   the steamroll with a green check.* The oracle is `sir-factory stamp`-style: execute the reference
   that embodies the ruling (the package + config, OR the builtin spec-anchor) over the stratified + CHAOS inputs;
   expected values are ALWAYS execution-derived, never hand-authored. Capture the out-of-domain behavior (what the
   reference does on garbage) — it goes in the SIR's `OUT-OF-DOMAIN` stanza. Split frozen (teaching) / held-out
   (grading), disjoint.

8. **SYNTHESIZE (blind quorum), in TypeScript.** Write a SPEC-FIDELITY SIR that states the RULING (the behavior +
   its discriminators + the out-of-domain note) — NOT an implementation; leave the technique open. Spawn N ≥ 3
   `sir-reemitter-cr` agents against a clean room (the SIR + the FROZEN oracle only; held-out hidden). Grade every
   emission against the FULL oracle including held-out; require quorum (≥2 agree on the full held-out set). A
   held-out miss = the SIR was ambiguous → harden it and re-emit. Install the winner as the verified zero-dep leaf.
   **Emit `.ts`, not `.js`** — the SIR's `SIG` line carries the types (`moneyRound(amount: number) -> number`), so
   the re-emitter writes `export default function moneyRound(amount: number): number`. Types are part of the
   contract, not decoration; the leaf must `tsc --noEmit` clean under `strict`.

   **When the chosen reference is a platform builtin, WRAP it — do not reconstruct it.** A builtin (`Intl.*`,
   `crypto.randomUUID`, `URL`, `TextEncoder`, `structuredClone`) is part of the runtime, not a package — so a thin
   guarded wrapper over it is *still* `dependencies: {}` zero-dep, AND it is **definitionally correct**: it cannot
   diverge from the standard it implements. A from-scratch reconstruction is only as correct as your oracle's input
   coverage — it will pass held-out and still be silently wrong on the domain you did not sample. (The currency run
   rebuilt `Intl` and got `ISK`/`CLF` minor units wrong: no held-out vector exercised them, so the gate could not
   see it.) So when a builtin embodies the ruling, the verified leaf **is** `wrap(builtin) + input guards`, and the
   SIR names the builtin as the technique. Reconstruct ONLY when you deliberately need runtime-independence (e.g.
   `Intl` output drifts across ICU versions) — and then the oracle MUST cover the standard's FULL domain (every
   currency, every locale), not a sample, or the reconstruction is unsound. Default to wrap.

   *Worked micro-example — the reflex.* Leaf: `uuid` (generate a v4 UUID). Discover: `uuid`, `nanoid`,
   **`crypto.randomUUID()`** (builtin — Node >= 15, every browser). The builtin fully implements RFC 4122 v4, zero
   behavioral gap, so the verified leaf is a thin wrapper: `export default () => crypto.randomUUID()`. Do NOT
   hand-roll `xxxxxxxx-xxxx-4xxx-yxxx-...` from `Math.random`/`getRandomValues` — the training data is saturated
   with those, so a blind re-emitter reaches for one FIRST, re-implementing (often with a weaker RNG or a wrong
   variant nibble) a thing the runtime already does correctly. Because the output is random, the oracle here is a
   **property oracle** (format regex, version nibble `4`, variant nibble in `{8,9,a,b}`, uniqueness across N calls),
   not value vectors — but the implementation is still just the wrapper. Random != quarantine when a builtin is the
   authority.

9. **GLUE by PROPERTIES.** The orchestration that composes verified leaves has no reference — verify it with
   property oracles (round-trip, idempotence, conservation, ordering, monotonicity) plus the project rulings that
   govern composition (e.g. "sum exact, round once at the total"). No reference needed; the properties are the
   oracle. Declare TypeScript interfaces for the composite shapes (the feature's inputs/outputs).

10. **INSTALL + LEARN.** The verified leaf + its rulings go into the project (and, if catalog-worthy, the
    catalog). Next feature that needs this leaf already understands it — greenfield novelty shrinks with use.

11. **PACKAGE — the verification ships WITH the code.** A verification product whose deliverable can't be
    re-verified by the recipient is a broken deliverable. Package so `npm test` re-runs the exact held-out proof:
    - **TypeScript source** (`src/*.ts`), strict, typechecks clean (types from the SIGs; interfaces for the glue).
    - **The held-out oracles ARE the test suite.** Copy each leaf's oracle into `test/oracles/` and write a
      `test/leaves.test.ts` (`node:test`) that asserts every held-out vector — expected values were
      execution-stamped, never hand-authored, so this is *stronger* than a hand-written suite (it can't inherit an
      author's blind spot, and the held-out split is anti-overfit). Add the glue's property checks as
      `test/glue.test.ts`.
    - **`package.json`:** `dependencies: {}` (runtime is zero-dep BY CONSTRUCTION — that's the whole point);
      `devDependencies: { typescript, @types/node }` (build/typecheck only, never shipped, both type-only);
      scripts `{ start, test: "node --test 'test/*.test.ts'", typecheck: "tsc --noEmit" }`; `engines.node >=23.6`
      (native type-stripping runs `.ts` directly — no build step to run or test).
    - **`tsconfig.json`:** strict, `module: nodenext`, `allowImportingTsExtensions`, `noEmit`.
    - **Prove it before declaring done:** `node --test` green (leaves on held-out + glue properties), `tsc --noEmit`
      clean, `dependencies` empty. A developer who receives the app runs `npm test` and re-executes the verification.

## SANDBOX discipline (non-negotiable)

You are running untrusted packages to derive oracles. Do it once, in an EPHEMERAL throwaway dir, with
`--ignore-scripts` (no install hooks), no credentials in the environment, ideally no network after install. Keep
ONLY the stamped vectors (they are data). DISCARD the packages — none of them ship. The install-hook worm cannot
touch a run-once-and-discard.

## BOUNDARIES (say which truth-source you are standing on)

- **Quorum covers NAMED leaves with references.** Genuinely novel logic (nobody has built it) has no quorum → it
  falls to a **property oracle** (step 9) or a **frozen human ruling**. Do not pretend a novel leaf is quorum-able.
- **Quorum is CONSENSUS, not TRUTH.** If every reference forked the same buggy gist, they agree on the wrong
  thing. Where a real standard exists (an RFC, ISO 4217, a builtin), anchor a `spec`-fidelity oracle to IT, not to
  package consensus. (The currency case: three packages "agreed" and were all wrong vs the Intl/ISO standard.)
- **You only find disagreements your inputs hit.** Weak inputs → missed forks. Throw CHAOS (out-of-domain) inputs;
  that is where silent-degradation decisions hide.
- Verification strength is unchanged by this skill: a leaf is only "verified" via held-out blind quorum, same as
  any recompose. This skill adds discovery + decisions in front of that; it does not weaken the gate.

## The payoff

Every leaf ships zero dependencies and is verified against a held-out oracle. Every ecosystem-disagreement
decision was made on purpose, framed as a real tradeoff, and recorded. The bug where a German site silently
strips German characters — or an invoice silently rounds with `toFixed` and half-up — is caught at AUTHORSHIP, as
a question you actually answer, not discovered in production.
