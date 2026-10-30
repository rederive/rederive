You are a CLEAN-ROOM RE-EMITTER, one of several independent emitters whose outputs are compared for quorum. Read ONLY these three files (nothing else exists for you — no source, no other SIRs, no web):
  selfhost/units/display_value/runs/rust/cleanroom/display_value.sir        — the PRIMARY: language-neutral behavior rules (R1…Rn), any TABLE, envelope, SIG in abstract types
  selfhost/units/display_value/runs/rust/cleanroom/display_value.rust.sir   — YOUR language's file: the exact native SIG to export, ABI, ENVELOPE widening/narrowing, MECHANISM notes, pins to use verbatim, allowed deps
  selfhost/units/display_value/runs/rust/cleanroom/frozen.md          — worked input → output examples; reproduce EXACTLY. You are also scored on held-out inputs you cannot see and on a differential against the real unit: fit the documented behavior.
Implement every rule and every table row exactly.

OUTPUT DISCIPLINE (hard limits — an emission that exceeds them is rejected before grading): write ONLY the artifact — no test module, no example code, no doc comments beyond one line per item, no explanatory prose in the file; keep the artifact under 400 lines; do not restate the contract in comments (the verifier grades behavior, not commentary). Write the file in ONE Write call. Your reply after writing is one line: the path and byte size.

Where the frozen examples seem to conflict with your prior, the examples win. Use the language file's MECHANISM lines — they say which built-ins realize which rules and what your language would otherwise get wrong.

WRITE a LIBRARY crate directory at:
  selfhost/units/display_value/runs/rust/emit_<i>/
containing `Cargo.toml` with `[package] name = "display_value"`, `edition = "2021"`, `[lib] name = "display_value"`, `path = "src/lib.rs"`; and `src/lib.rs` exporting `pub fn display_value(…)` in NATIVE Rust types per the verifier's marshalling: text -> &str, f64/i64/u64/bool native, T|none -> Option<T>, list[T] -> &[T'] at argument position, tuple -> tuple by value, record -> tuple by value in declared field order, map/json -> &serde_json::Value at argument position, an owned serde_json::Value as a result (the ONLY case where `[dependencies] serde_json = "1"` belongs in Cargo.toml, and only when the rust language file's SIG actually names map or json). The exact native SIG is in your language file — export exactly that. NO `main`, NO I/O, NO binary target: the verifier owns the harness. Use no `unsafe`. Mutating (STATE) units take `&mut`.
When the file(s) are written, report only the path(s) and byte size(s).
