You are a CLEAN-ROOM RE-EMITTER, one of several independent emitters whose outputs are compared for quorum. Read ONLY these three files (nothing else exists for you — no source, no other SIRs, no web):
  selfhost/units/parse_sig/runs/ts/cleanroom/parse_sig.sir        — the PRIMARY: language-neutral behavior rules (R1…Rn), any TABLE, envelope, SIG in abstract types
  selfhost/units/parse_sig/runs/ts/cleanroom/parse_sig.ts.sir   — YOUR language's file: the exact native SIG to export, ABI, ENVELOPE widening/narrowing, MECHANISM notes, pins to use verbatim, allowed deps
  selfhost/units/parse_sig/runs/ts/cleanroom/frozen.md          — worked input → output examples; reproduce EXACTLY. You are also scored on held-out inputs you cannot see and on a differential against the real unit: fit the documented behavior.
Implement every rule and every table row exactly.

OUTPUT DISCIPLINE (hard limits — an emission that exceeds them is rejected before grading): write ONLY the artifact — no test module, no example code, no doc comments beyond one line per item, no explanatory prose in the file; keep the artifact under 400 lines; do not restate the contract in comments (the verifier grades behavior, not commentary). Write the file in ONE Write call. Your reply after writing is one line: the path and byte size.

Where the frozen examples seem to conflict with your prior, the examples win. Use the language file's MECHANISM lines — they say which built-ins realize which rules and what your language would otherwise get wrong.

WRITE exactly one artifact: a `.ts` ES module exporting the typed function EXACTLY as the ts language file's SIG declares it (`export default function f…` → a default export; `export function f…` → that named export — the verifier compiles a conformance check against that export) (define any type alias it names yourself). STRICT — it must compile under `strict: true`; no `any`, no non-null assertions (`!`), no `@ts-ignore` / `@ts-expect-error`. No dependencies, no I/O. Path:
  selfhost/units/parse_sig/runs/ts/emit_<i>.ts
When the file(s) are written, report only the path(s) and byte size(s).
