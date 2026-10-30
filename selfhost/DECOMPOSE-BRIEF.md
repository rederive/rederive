# Selfhost decomposer brief (REDERIVE_SELF_PLAN, Tier 1)

You are the SIGHTED decomposer for one SIR v0.5 unit of rederive's self-treatment: rederive's own trust kernel goes
through the same loop as any npm package. Cut ONE unit cold into the v0.5 CONTRACT REGISTER.

- **UNIT DIR:** `selfhost/units/<unit>`. `STAGE.json` names the pinned authority
  (`realPath`, under `selfhost/`) and the seam (`seams/<unit>.mjs`), which says exactly
  which function the unit is and how its arguments reach it.
- **THE REAL CODE** is the module the seam names, inside the pinned authority snapshot
  (`selfhost/.authority/<commit>/…`; `stamp.mjs` extracts it on first use). Read the code
  ONLY there, never `cli/`.
- **FIDELITY package:** the code is the truth. You may read `../sir-spec/SIR_SCHEMA.md` for
  vocabulary and intent; where it and the code disagree, the contract states the code and you list the disagreement
  under FINDINGS. There is no prior SIR for this unit; do not look for one, and do not read other selfhost units.

**Read first:** `../sir-lab/v05-lang/pressure/DECOMPOSER-TASK.md` (the register, the closed type
set, the language split, the exemplar). Substitutions: the unit is out of the lab tree (every lab tool accepts the
absolute unit dir), and the oracle is NOT pre-captured; you write the input generator and stamp it.

**Write** under `UNIT DIR/sir/`: `<unit>.sir` (primary), `<unit>.js.sir`, `<unit>.ts.sir`, `<unit>.rust.sir` (omit a
language only with a NOTE giving the cause), and `<unit>.inputs.mjs`: `export function genInputs(n, rnd)` returning
n argument lists, deterministic from `rnd()` (seeded, [0,1)). You are sighted: make the inputs reach every branch and
boundary you find in the code. The oracle can only pin what the inputs reach. Throws are observations: include
one probe per throw path, but keep most inputs in the function's real domain.

**Loop** (run from `../sir-lab/v05-lang`):
- stamp: `node selfhost/stamp.mjs <UNIT DIR>` (24 frozen + 48 held-out from the pinned code)
- bind: `node bind.mjs <UNIT DIR>`
- validate: `node tools/sir-validate.mjs <UNIT DIR>` until **OK, 0 errors**. Never work around it.
- encode check: `node tools/encode-oracle.mjs <UNIT DIR> --dry-run` (the oracle must encode under your SIG)

Write nothing outside UNIT DIR. **Test your rules:** before reporting, check your rules against the real code on a
large seeded sample (use a proper generator such as mulberry32; an LCG that leaves exact integer range cycles).

**Traps a cross-language contract must pin** where they apply: key and string ordering (UTF-16 code units vs bytes
vs scalars), string escaping, number-to-text rendering, integer width and overflow, NaN/-0/Infinity, regex dialect
(a language file's PINNED), Unicode case and whitespace sets, and anything the code does through a JS built-in whose
behavior another language does not share.

**REPORT** (final message): files written; the final validator output verbatim; the encode dry-run summary; the
languages and why; and **FINDINGS**: every behavior you would call a bug, an accident, an under-specified choice, or
a disagreement with the schema, each with an input that shows it and the code line. Findings are decisions for the
architect. State them; do not fix the code.
