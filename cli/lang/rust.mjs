// Promoted from sir-lab/v05-lang drivers/rust.mjs (SIR_V05_PLAN Phase 2b), unchanged but for import paths and two rdv
// additions marked `rdv:` — the result-type pin and --locked builds.
// Verifier-owned rust driver. The ARTIFACT is a library crate (`[lib]`, `pub fn <unit>`), never a binary (§15). `type-checked`
// = cargo check on the artifact. The verifier GENERATES its own harness crate FROM THE ABSTRACT SIG: stdin = one JSON array of
// canonical-typed args per line → marshalled per type → `<crate>::<fn>(…)` → the result (and `post` for STATE; a Result::Err
// as a throw) serialized as one JSON line. Compiling that harness against the declared signature IS the SIG check.
// NATIVE ARGUMENT MARSHALLING (the zero-dep rule). Only TWO abstract routes ever reach the artifact as `serde_json::Value`:
// `map[K, V]` and `json`. Every other abstract type is marshalled by the HARNESS (which may depend on serde_json) into a
// concrete native Rust type that the ARTIFACT declares — so a leaf whose SIG is built entirely from scalars/list/tuple/
// record/union needs NO dependency at all (found on kill_precedence: `list[record[id: u64, cause: text]]` used to force
// every consumer crate to carry serde_json just to accept a list of records). The mapping (abstract -> Rust the ARTIFACT
// declares; ownedType()/nativeType()/paramType() below implement it):
//   text              -> &str                    the harness owns a String per leaf and hands out .as_str()
//   f64               -> f64                     wire: a 16-hex bit-pattern STRING, at ANY nesting depth (see TRANSPORT)
//   bool / i64 / u64  -> bool / i64 / u64         wire: a plain JSON literal
//   T | none          -> Option<T'>               JSON null <-> None; only when the union has exactly one non-none alt —
//                                                  a multi-way union (more than one non-none alt) has no clean native
//                                                  shape and stays serde_json::Value (Option<Value> if `none` is one of
//                                                  its alts, else bare Value), same as before this change
//   list[T]           -> &[T']  at the OUTERMOST argument position (Vec<T'> -> &[T'] is a free deref coercion);
//                        Vec<T'>  at any NESTED position (a list inside a list/tuple/record/union stays owned — never a
//                        borrow tangled through an inner position; "nested lists -> &[Vec<...>]")
//   tuple[A, B, …]    -> (A', B', …)              BY VALUE always, at every position (the harness constructs it once and
//                                                  moves it in — never re-borrowed, so non-Copy content like `String`-
//                                                  turned-`&str` needs no reference gymnastics beyond the leaf itself)
//   record[a:A, b:B]  -> (A', B', …) in DECLARED FIELD ORDER  — same by-value rule as tuple (no shared struct exists
//                        between harness and artifact; the wire form is a JSON OBJECT keyed by field name, read with
//                        `.get("name")`, never positional)
//   map[K, V] / json  -> &serde_json::Value at the OUTERMOST argument position (callArg borrows it, like a list);
//                        serde_json::Value nested and as a result. The only two routes that may declare a serde_json dependency; `prepare`
//                        below rejects (lint finding) an artifact whose Cargo.toml declares serde_json when the SIG has
//                        neither route anywhere (args, result, or a STATE post type)
// A value is marshalled TWICE per nested-text argument: once into an OWNED shape (ownedType — String at every text leaf,
// so the harness holds the allocation), then into a VIEW over it (viewExpr — String -> &str at every leaf, same shape
// otherwise) that is what's actually passed to the artifact; a type with no text anywhere skips the second pass (owned
// IS native already, mod the free Vec -> slice coercion at the outermost list position).
// TRANSPORT: JSON text cannot carry NaN, ±Infinity or -0. An abstract f64 therefore crosses as its IEEE-754 BIT PATTERN — an
// arg as a 16-hex-char JSON string (`f64::from_bits`), a result as `{"__f64bits":"<16 hex>"}` (`f64::to_bits`) — so the typed
// oracle's NaN/Inf/-0 vectors round-trip exactly (tests/rust-transport.mjs), AT ANY NESTING DEPTH: an f64 inside a list,
// tuple, record or union arg is bit-encoded on its own line of the JSON tree, not the whole vector. Only `map`/`json` args
// (serde_json::Value has no NaN/Inf/-0 form at all) fall back to narrowing: a vector holding one anywhere under a map/json
// position is NARROWED for this language (`{ __narrowed: reason }` in place of a result) — never sent, never a miss.
// CARRIED DATA: placement is VERIFIER-OWNED. The unit's `.rust.sir` binds `CARRIED <name> = <module>`; an artifact that ships its own
// src/<base> must be byte-identical to the attested file — a transcribed or modified copy is REJECTED, never compiled (the slugify
// scar, round 3: three emitters hand-transcribed a partial 738-entry table). The attested .rs is supplied into src/<base> of the
// VERIFIER'S BUILD COPY, never into the artifact (the slugify scar, round 5: the verifier had injected the module into the artifact
// itself, so when the attested file's bytes later changed — a comment line — the verifier found ITS OWN residue "differing" and
// rejected three verified artifacts; and the artifact on disk was no longer byte-exact as emitted). THE VERIFIER NEVER WRITES INTO
// THE ARTIFACT DIRECTORY: prepare copies the crate to runs/rust/.harness/<emit>/artifact/ (fresh each time, never target/), injects
// there, runs cargo check there, and points the generated harness crate at that copy.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync, renameSync } from 'node:fs'; import { join, basename, resolve } from 'node:path'; import { spawnSync } from 'node:child_process';
import { encode, escapeMarkers, f64fromBits, parseSig } from '../sir/canon.mjs'; import { carriedBinding, sha256 } from '../sir/v05.mjs';
export const lang = 'rust';
// top-level entries only, matched by name: a sibling dir (stale/, rejected/, voided/, cleanroom/, .harness/) is never named
// emit_*, so tools/unit.mjs prepare moving emissions aside to runs/rust/stale/<sha>/ can never surface here as an artifact.
export const artifacts = (dir) => readdirSync(dir).filter((f) => /^emit_/.test(f) && existsSync(join(dir, f, 'Cargo.toml'))).map((f) => join(dir, f));
export const NARROWED_JSON = 'json holds no NaN/Inf/-0 in serde_json::Value';
const isNone = (a) => a.k === 'none';
// a union's non-none alternatives, and whether `none` was actually one of them (a plain multi-way union with no `none`
// alt at all is a different, rarer shape — SPEC doesn't ask for it and it isn't a real route today; treated as opaque).
function unionSplit(t) { const rest = t.alts.filter((a) => !isNone(a)); return { rest, hasNone: rest.length !== t.alts.length }; }
export const containsF64 = (t) => t.k === 'f64' || (t.k === 'union' && t.alts.some(containsF64)) || (t.k === 'list' && containsF64(t.item)) || (t.k === 'tuple' && t.items.some(containsF64)) || (t.k === 'map' && (containsF64(t.key) || containsF64(t.val))) || (t.k === 'record' && t.fields.some(([, ft]) => containsF64(ft)));
export const containsText = (t) => t.k === 'text' || (t.k === 'union' && t.alts.some(containsText)) || (t.k === 'list' && containsText(t.item)) || (t.k === 'tuple' && t.items.some(containsText)) || (t.k === 'record' && t.fields.some(([, ft]) => containsText(ft)));
export const usesSerdeJsonRoute = (t) => t.k === 'map' || t.k === 'json' || (t.k === 'union' && t.alts.some(usesSerdeJsonRoute)) || (t.k === 'list' && usesSerdeJsonRoute(t.item)) || (t.k === 'tuple' && t.items.some(usesSerdeJsonRoute)) || (t.k === 'record' && t.fields.some(([, ft]) => usesSerdeJsonRoute(ft)));
/** whether ANYTHING in this SIG (fixed/rest args, result, or a STATE post type) legitimately needs serde_json::Value — a
 *  REST arg always crosses as one raw Value::Array regardless of its element type (unchanged by this file), so it always counts. */
export function usesSerdeJsonValue(sig) {
  return sig.args.some((a) => a.rest || usesSerdeJsonRoute(a.type)) || usesSerdeJsonRoute(sig.result);
}
// ---- native type mapping (see the header comment for the table)
function ownedType(t) {
  if (t.k === 'union') { const { rest, hasNone } = unionSplit(t); if (hasNone && rest.length === 1) return `Option<${ownedType(rest[0])}>`; return hasNone ? 'Option<serde_json::Value>' : 'serde_json::Value'; }
  switch (t.k) {
    case 'text': return 'String';
    case 'f64': case 'bool': case 'i64': case 'u64': return t.k;
    case 'list': return `Vec<${ownedType(t.item)}>`;
    case 'tuple': return `(${t.items.map(ownedType).join(', ')})`;
    case 'record': return `(${t.fields.map(([, ft]) => ownedType(ft)).join(', ')})`;
    default: return 'serde_json::Value';   // map, json (and a bare `none`, never a real arg on its own)
  }
}
export function nativeType(t) {
  if (t.k === 'union') { const { rest, hasNone } = unionSplit(t); if (hasNone && rest.length === 1) return `Option<${nativeType(rest[0])}>`; return hasNone ? 'Option<serde_json::Value>' : 'serde_json::Value'; }
  switch (t.k) {
    case 'text': return '&str';
    case 'f64': case 'bool': case 'i64': case 'u64': return t.k;
    case 'list': return `Vec<${nativeType(t.item)}>`;
    case 'tuple': return `(${t.items.map(nativeType).join(', ')})`;
    case 'record': return `(${t.fields.map(([, ft]) => nativeType(ft)).join(', ')})`;
    default: return 'serde_json::Value';
  }
}
/** the ARTIFACT's declared parameter type for the OUTERMOST position of an argument — a `list[T]` becomes a borrowed
 *  slice here (nested lists stay `Vec` inside nativeType); everything else is exactly its nativeType. */
export const paramType = (t) => t.k === 'list' ? `&[${nativeType(t.item)}]` : nativeType(t);
// ---- marshal: a `&serde_json::Value` expression `v` (at abstract-type position `t`, error path `p` — a Rust `String`
// expression) -> a Rust expression of type `Result<ownedType(t), String>`. Never panics; a wrong shape at any nesting
// depth is a per-line harness fault naming the offending position (frozen inside the Result's Err, unwrapped once at the
// argument's top level so `continue` — invalid inside a nested closure — only ever has to run there).
const pathTop = (name) => `${JSON.stringify(String(name))}.to_string()`;
const pathIndex = (parentExpr) => `format!("{}[{}]", ${parentExpr}, __i)`;
const pathSuffix = (parentExpr, suffix) => `format!("{}${suffix}", ${parentExpr})`;
function marshalExpr(t, v, p) {
  if (t.k === 'union') {
    const { rest, hasNone } = unionSplit(t);
    if (hasNone && rest.length === 1) return `(if ${v}.is_null() { Ok(None) } else { (${marshalExpr(rest[0], v, p)}).map(Some) })`;
    if (hasNone) return `(if ${v}.is_null() { Ok::<_, String>(None) } else { Ok(Some(${v}.clone())) })`;
    return `Ok::<_, String>(${v}.clone())`;
  }
  switch (t.k) {
    case 'text': return `(match ${v}.as_str() { Some(x) => Ok(x.to_string()), None => Err(format!("{} is not text", ${p})) })`;
    case 'f64': return `(match ${v}.as_str().filter(|s| s.len() == 16).and_then(|s| u64::from_str_radix(s, 16).ok()) { Some(b) => Ok(f64::from_bits(b)), None => Err(format!("{} is not f64 (expected a 16-hex bit-pattern string)", ${p})) })`;
    case 'bool': return `(match ${v}.as_bool() { Some(x) => Ok(x), None => Err(format!("{} is not bool", ${p})) })`;
    case 'i64': return `(match ${v}.as_i64() { Some(x) => Ok(x), None => Err(format!("{} is not i64", ${p})) })`;
    case 'u64': return `(match ${v}.as_u64() { Some(x) => Ok(x), None => Err(format!("{} is not u64", ${p})) })`;
    case 'list': return `(match ${v}.as_array() { Some(arr) => arr.iter().enumerate().map(|(__i, __e)| ${marshalExpr(t.item, '__e', pathIndex(p))}).collect::<Result<Vec<_>, String>>(), None => Err(format!("{} is not a list", ${p})) })`;
    case 'tuple': return `((|| -> Result<${ownedType(t)}, String> {\n` +
      t.items.map((it, i) => `        let f${i} = (${marshalExpr(it, `${v}.get(${i}).unwrap_or(&serde_json::Value::Null)`, pathSuffix(p, `.${i}`))})?;\n`).join('') +
      `        Ok((${t.items.map((_, i) => `f${i}`).join(', ')}))\n    })())`;
    case 'record': return `((|| -> Result<${ownedType(t)}, String> {\n` +
      `        let obj = match ${v}.as_object() { Some(o) => o, None => return Err(format!("{} is not a record", ${p})) };\n` +
      t.fields.map(([name, ft], i) => `        let f${i} = (${marshalExpr(ft, `obj.get(${JSON.stringify(name)}).unwrap_or(&serde_json::Value::Null)`, pathSuffix(p, `.${name}`))})?;\n`).join('') +
      `        Ok((${t.fields.map((_, i) => `f${i}`).join(', ')}))\n    })())`;
    default: return `Ok::<_, String>(${v}.clone())`;   // map, json -> serde_json::Value (the artifact declares the Rust type); the error type is NAMED — a bare Ok(..) at an argument's top level leaves E uninferable (E0282: every top-level json/map arg failed the harness build from 9c2dfc6 on)
  }
}
// ---- view: a Rust expression `r` of type `&ownedType(t)` -> an expression of type `nativeType(t)`, converting every
// text leaf (String -> &str) while keeping the same shape; Copy scalars are dereferenced, everything else is unchanged
// structurally. Only called when containsText(t) — otherwise ownedType(t) already equals nativeType(t) verbatim.
// every use of `r` below is parenthesized: `r` may itself be `&a0_owned` (a leading unary `&` from the top-level call),
// and Rust's method/field-access binds tighter than a prefix `&` — an unparenthesized `${r}.iter()` would parse as
// `&(a0_owned.iter())`, not `(&a0_owned).iter()` (the mismatched-types bug this comment replaced).
function viewExpr(t, r) {
  if (t.k === 'union') { const { rest, hasNone } = unionSplit(t); if (hasNone && rest.length === 1) return `(${r}).as_ref().map(|x| ${viewExpr(rest[0], 'x')})`; return `(${r}).clone()`; }
  switch (t.k) {
    case 'text': return `(${r}).as_str()`;
    case 'f64': case 'bool': case 'i64': case 'u64': return `*(${r})`;
    case 'list': return `(${r}).iter().map(|x| ${viewExpr(t.item, 'x')}).collect::<Vec<_>>()`;
    case 'tuple': return `(${t.items.map((it, i) => viewExpr(it, `&(${r}).${i}`)).join(', ')})`;
    case 'record': return `(${t.fields.map(([, ft], i) => viewExpr(ft, `&(${r}).${i}`)).join(', ')})`;
    default: return `(${r}).clone()`;
  }
}
/** the argument expression the generated `<crate>::<fn>(…)` call passes for a top-level type, given the Rust variable
 *  `name` already holds nativeType(t) (text is always its own view; a top-level list is the one free Vec->slice
 *  coercion; map/json keep the old by-reference ABI; everything else — tuple, record, union, other scalars — by value). */
function callArg(t, name) { return (t.k === 'list' || t.k === 'map' || t.k === 'json') ? `&${name}` : name; }
// Emitted only when a result (or a STATE post) contains f64: whatever Rust type the artifact returns is walked structurally and
// every f64 leaves as its bits. A type the trait does not cover fails the harness BUILD (visible), never a silent null.
const WIRE_TRAIT = `// f64 leaves the harness as its bit pattern: JSON has no NaN/Inf and collapses -0 (serde_json::to_value(f64::NAN) is null)
trait WireF64 { fn wire(&self) -> serde_json::Value; }
impl WireF64 for f64 { fn wire(&self) -> serde_json::Value { serde_json::json!({ "__f64bits": format!("{:016x}", self.to_bits()) }) } }
impl WireF64 for f32 { fn wire(&self) -> serde_json::Value { (*self as f64).wire() } }
macro_rules! wire_via_serde { ($($t:ty),*) => { $(impl WireF64 for $t { fn wire(&self) -> serde_json::Value { serde_json::to_value(self).expect("serialize") } })* } }
wire_via_serde!(bool, char, i8, i16, i32, i64, i128, isize, u8, u16, u32, u64, u128, usize, String, str, (), serde_json::Value);
impl<T: WireF64 + ?Sized> WireF64 for &T { fn wire(&self) -> serde_json::Value { (**self).wire() } }
impl<T: WireF64 + ?Sized> WireF64 for Box<T> { fn wire(&self) -> serde_json::Value { (**self).wire() } }
impl<T: WireF64> WireF64 for Option<T> { fn wire(&self) -> serde_json::Value { match self { Some(x) => x.wire(), None => serde_json::Value::Null } } }
impl<T: WireF64, E: std::fmt::Display> WireF64 for Result<T, E> { fn wire(&self) -> serde_json::Value { match self { Ok(x) => x.wire(), Err(e) => serde_json::json!({ "throw": e.to_string() }) } } }
impl<T: WireF64> WireF64 for [T] { fn wire(&self) -> serde_json::Value { serde_json::Value::Array(self.iter().map(|x| x.wire()).collect()) } }
impl<T: WireF64> WireF64 for Vec<T> { fn wire(&self) -> serde_json::Value { self.as_slice().wire() } }
impl<T: WireF64, const N: usize> WireF64 for [T; N] { fn wire(&self) -> serde_json::Value { self.as_slice().wire() } }
// tuple results up to 8-ary — a 5-tuple f64 result failed the harness BUILD before this macro (the arity-4 ceiling scar).
macro_rules! wire_tuple { ($($T:ident : $i:tt),+) => { impl<$($T: WireF64),+> WireF64 for ($($T,)+) { fn wire(&self) -> serde_json::Value { serde_json::Value::Array(vec![$(self.$i.wire()),+]) } } } }
wire_tuple!(A:0, B:1);
wire_tuple!(A:0, B:1, C:2);
wire_tuple!(A:0, B:1, C:2, D:3);
wire_tuple!(A:0, B:1, C:2, D:3, E:4);
wire_tuple!(A:0, B:1, C:2, D:3, E:4, F:5);
wire_tuple!(A:0, B:1, C:2, D:3, E:4, F:5, G:6);
wire_tuple!(A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7);
impl<V: WireF64> WireF64 for std::collections::HashMap<String, V> { fn wire(&self) -> serde_json::Value { serde_json::Value::Object(self.iter().map(|(k, v)| (k.clone(), v.wire())).collect()) } }
impl<V: WireF64> WireF64 for std::collections::BTreeMap<String, V> { fn wire(&self) -> serde_json::Value { serde_json::Value::Object(self.iter().map(|(k, v)| (k.clone(), v.wire())).collect()) } }
`;
// rdv: the RESULT is pinned to the SIG too. The lab's harness pinned every argument type but only serialized whatever came back,
// so an artifact returning u32 where the SIG says u64 compiled and graded (any serde-serializable type passed). The pin accepts
// the declared owned type T or Result<T, E> (Err is how a Rust artifact throws), for SCALAR results (text, bool, i64, u64, f64)
// and `scalar | none` — where a narrower type is exactly the bug (a u32 that wraps where u64 does not). Composite results stay
// unpinned: the lab verified five get_rgb crates returning [f64; 4] for tuple[f64, f64, f64, f64] — the same wire, a different
// Rust spelling — and a Value-shaped result has no single Rust type at all.
// Emitted for every harness (round 4: the f64 path too, so the line is always an {ok}/{throw} envelope): a language file may make a throw `Err` (the SIG's `Result<T, E>`, which the pin accepts),
// and serde has no wire for it. Autoref dispatch picks the Result impl before the any-value one, with no serde bound named — the
// harness depends on serde_json alone (the scar: selfhost directive, 2026-10-26: the harness BUILD failed on three exact crates).
const SPLIT_TRAIT = `// rdv: a Result result wires its Ok value, or { "throw": msg } — Err is a throw
struct Wired<'a, R>(&'a R);
trait SplitResult { type Ok; fn split(&self) -> Result<&Self::Ok, String>; }
impl<'a, T, E: std::fmt::Display> SplitResult for Wired<'a, Result<T, E>> { type Ok = T; fn split(&self) -> Result<&T, String> { self.0.as_ref().map_err(|e| e.to_string()) } }
trait SplitAny { type Ok; fn split(&self) -> Result<&Self::Ok, String>; }
impl<'a, R> SplitAny for &Wired<'a, R> { type Ok = R; fn split(&self) -> Result<&R, String> { Ok(self.0) } }
`;
const PIN_TRAIT = `// rdv: the result must be the SIG's declared type (or Result<that, E> — Err is a throw)
trait DeclaredResult<T> {}
impl<T> DeclaredResult<T> for T {}
impl<T, E: std::fmt::Display> DeclaredResult<T> for Result<T, E> {}
fn declared<T, R: DeclaredResult<T>>(_: &R) {}
`;
const SCALARS = new Set(['text', 'bool', 'i64', 'u64', 'f64']);
export const pinnedResultType = (sig) => { const t = sig.result; if (SCALARS.has(t.k)) return ownedType(t);
  if (t.k === 'union') { const { rest, hasNone } = unionSplit(t); if (hasNone && rest.length === 1 && SCALARS.has(rest[0].k)) return ownedType(t); }
  return null; };
export function harnessMain(unit, sig) {
  const pin = pinnedResultType(sig);
  const postT = sig.state ? sig.args[sig.state.index].type : null;
  const wire = (expr, t) => containsF64(t) ? `${expr}.wire()` : `serde_json::to_value(&${expr}).unwrap()`;
  // the RESULT goes through SPLIT_TRAIT on every path, so a Result's Err is a throw, and a line is an ENVELOPE — {"ok": value} or
  // {"throw": msg} — never the bare value (selfhost #55: a returned json map {"throw": "x"} read as a throw; a STATE unit's Err
  // was written inside {result, post} and graded as a value)
  const okOf = (x, t) => containsF64(t) ? `${x}.wire()` : `serde_json::to_value(${x}).unwrap()`;
  const declOf = (a, i) => {
    if (a.rest) return `        let a${i} = serde_json::Value::Array(match v.as_array() { Some(arr) => arr.iter().skip(${i}).cloned().collect(), None => { writeln!(out, "{}", serde_json::json!({ "harness": "args line is not a list" })).expect("write"); continue; } });   // REST: the trailing args as one JSON array`;
    const isState = sig.state?.index === i; const t = a.type;
    const owned = `        let ${isState ? 'mut ' : ''}a${i}_owned: ${ownedType(t)} = match ${marshalExpr(t, `v[${i}]`, pathTop(a.name))} { Ok(x) => x, Err(msg) => { writeln!(out, "{}", serde_json::json!({ "harness": msg })).expect("write"); continue; } };`;
    if (isState || !containsText(t)) return owned;   // STATE args skip the view (mutation stays on the owned binding); otherwise owned == native verbatim
    return `${owned}\n        let a${i}: ${nativeType(t)} = ${viewExpr(t, `&a${i}_owned`)};`;
  };
  const decl = sig.args.map(declOf).join('\n');
  const call = sig.args.map((a, i) => {
    if (sig.state?.index === i) return `&mut a${i}_owned`;
    return callArg(a.type, a.rest || containsText(a.type) ? `a${i}` : `a${i}_owned`);
  }).join(', ');
  const out = sig.state ? `serde_json::json!({ "ok": { "result": rv, "post": ${wire(`a${sig.state.index}_owned`, postT)} } })` : 'serde_json::json!({ "ok": rv })';
  return `// VERIFIER-OWNED harness — generated from the abstract SIG; not part of the unit.
use std::io::{self, BufRead, Write};
${containsF64(sig.result) || (postT && containsF64(postT)) ? WIRE_TRAIT : ''}${SPLIT_TRAIT}${pin ? PIN_TRAIT : ''}fn main() {
    let stdin = io::stdin(); let stdout = io::stdout(); let mut out = stdout.lock();
    for line in stdin.lock().lines() {
        let line = line.expect("read"); if line.trim().is_empty() { continue; }
        let v: serde_json::Value = match serde_json::from_str(&line) { Ok(v) => v, Err(e) => { writeln!(out, "{}", serde_json::json!({ "harness": format!("unparseable args line: {}", e) })).expect("write"); continue; } };
${decl}
        let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| ${unit}::${sig.name}(${call})));
        match res {
            Ok(r) => { ${pin ? `declared::<${pin}, _>(&r); ` : ''}match (&Wired(&r)).split() { Ok(x) => { let rv: serde_json::Value = ${okOf('x', sig.result)}; writeln!(out, "{}", ${out}).expect("write"); } Err(m) => { writeln!(out, "{}", serde_json::json!({ "throw": m })).expect("write"); } } }
            Err(_) => { writeln!(out, "{}", serde_json::json!({ "throw": "panic" })).expect("write"); }
        }
    }
}
`;
}
// ---- the wire: decoded-native args → one JSON args line, or { __narrowed } when this language's transport cannot hold the vector
// Round 5 (rederive selfhost wire_line): a value the rust side would receive DIFFERENTLY is narrowed, never sent changed — the
// old wire sent a Uint8Array as {"0":1,…}, holes as `[1,,3]` (not JSON), a lone surrogate serde refuses, a big integer past
// u64 that serde reads as a float, an absent value or a Map as null / {}, and followed a multi-way union by its first
// alternative (NaN under `text | f64` became null). Record fields are read as OWN keys (a missing `constructor` read a function).
const ownKeys = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const lone = (x) => typeof x === 'string' && !x.isWellFormed();
// why serde_json::Value cannot hold v exactly, or null
function notCarriable(v) {
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return !Number.isFinite(v) || Object.is(v, -0) ? NARROWED_JSON : Number.isInteger(v) && Math.abs(v) > 2 ** 53 ? 'a whole number past 2^53 reaches serde_json as a different integer' : null;   // #119
  if (typeof v === 'bigint') return v < -(2n ** 63n) || v > 2n ** 64n - 1n ? 'an integer past i64/u64 has no serde_json form' : null;
  if (typeof v === 'string') return lone(v) ? 'a lone surrogate has no UTF-8 form' : null;
  if (v === undefined) return 'the absent value has no serde_json form';
  if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) { if (!(i in v)) return 'an array hole has no serde_json form'; const r = notCarriable(v[i]); if (r) return r; } return null; }
  if (ownKeys(v)) { for (const k of Object.keys(v)) { if (lone(k)) return 'a lone surrogate has no UTF-8 form'; const r = notCarriable(v[k]); if (r) return r; } return null; }
  return `a ${Object.prototype.toString.call(v).slice(8, -1)} has no serde_json form`;
}
const jsonText = (v) => typeof v === 'bigint' ? v.toString() : v === undefined ? 'null' : Array.isArray(v) ? '[' + v.map(jsonText).join(',') + ']' : v && typeof v === 'object' ? '{' + Object.keys(v).map((k) => JSON.stringify(k) + ':' + jsonText(v[k])).join(',') + '}' : JSON.stringify(v);
const narrowed = (why) => ({ __narrowed: why });
const optionOf = (t) => { if (t.k !== 'union') return null; const rest = t.alts.filter((a) => a.k !== 'none'); return rest.length === 1 && t.alts.length === 2 ? rest[0] : null; };
function wireValue(v, t) {
  if (v === undefined && !(t.k === 'none' || optionOf(t))) return narrowed('the absent value has no serde_json form');   // #119: it reached rust as null
  if (v === null || v === undefined) return 'null';   // the `none` alt of an option: JSON null
  if (t.k === 'union') { const o = optionOf(t); if (o) return wireValue(v, o); const r = notCarriable(v); return r ? narrowed(r) : jsonText(v); }   // a multi-way union crosses as a serde_json::Value
  const seq = (parts) => { const bad = parts.find((p) => typeof p !== 'string'); return bad !== undefined ? bad : '[' + parts.join(',') + ']'; };
  switch (t.k) {
    case 'f64': return typeof v === 'number' ? JSON.stringify(encode(v, { k: 'f64' }).bits) : narrowed('not an f64 value');   // canonical bits (NaN -> quiet NaN), at ANY nesting depth
    case 'list': { if (!Array.isArray(v)) return narrowed('not a list value'); for (let i = 0; i < v.length; i++) if (!(i in v)) return narrowed('an array hole has no serde_json form'); return seq(v.map((x) => wireValue(x, t.item))); }
    case 'tuple': for (let i = 0; Array.isArray(v) && i < v.length; i++) if (!(i in v)) return narrowed('an array hole has no serde_json form');
      return Array.isArray(v) && v.length === t.items.length ? seq(t.items.map((it, i) => wireValue(v[i], it))) : narrowed(`not a ${t.items.length}-tuple`);
    case 'record': { if (!ownKeys(v)) return narrowed('not a record value'); const parts = t.fields.map(([name, ft]) => [name, wireValue(Object.hasOwn(v, name) ? v[name] : undefined, ft)]); const bad = parts.find(([, p]) => typeof p !== 'string'); return bad ? bad[1] : '{' + parts.map(([n, p]) => JSON.stringify(n) + ':' + p).join(',') + '}'; }
    case 'json': case 'map': { const r = notCarriable(v); return r ? narrowed(r) : jsonText(v); }   // serde_json::Value holds no NaN/Inf/-0 anywhere inside it: narrow the whole vector, never send it
    case 'text': return typeof v === 'string' ? (lone(v) ? narrowed('a lone surrogate has no UTF-8 form') : JSON.stringify(v)) : narrowed('not a text value');
    case 'bool': return typeof v === 'boolean' ? String(v) : narrowed('not a bool value');
    case 'i64': case 'u64': { const ok = (typeof v === 'number' && Number.isSafeInteger(v)) || typeof v === 'bigint'; const b = ok ? BigInt(v) : null; const lo = t.k === 'i64' ? -(2n ** 63n) : 0n, hi = t.k === 'i64' ? 2n ** 63n - 1n : 2n ** 64n - 1n;
      return ok && b >= lo && b <= hi ? b.toString() : narrowed(`not a ${t.k} value`); }
    default: return narrowed(`the rust harness has no route for ${t.k}`);   // bytes
  }
}
export function wireLine(args, sig) {
  const nFixed = sig.args.filter((a) => !a.rest).length, restT = sig.args.find((a) => a.rest)?.type ?? null;
  if (!Array.isArray(args)) return narrowed('the args are not a list');
  if (!restT && args.length !== nFixed) return narrowed(`${args.length} args for a ${nFixed}-parameter SIG`);
  for (let j = 0; j < args.length; j++) if (!(j in args)) return narrowed('an array hole has no serde_json form');
  const parts = [];
  for (let j = 0; j < args.length; j++) {
    let w; try { w = wireValue(args[j], j < nFixed ? sig.args[j].type : restT); } catch (e) { w = narrowed(`wire: ${e.message}`); }
    if (typeof w !== 'string') return w; parts.push(w);
  }
  return '[' + parts.join(',') + ']';
}
const unwire = (j) => Array.isArray(j) ? j.map(unwire) : j && typeof j === 'object' ? (typeof j.__f64bits === 'string' && Object.keys(j).length === 1 ? f64fromBits(j.__f64bits) : Object.fromEntries(Object.entries(j).map(([k, x]) => [k, unwire(x)]))) : j;
// The Rust harness prints a u64/i64 result as an exact JSON integer (serde) — plain JSON.parse silently ROUNDS any integer
// past 2^53 (18446744073709551615 read back as 18446744073709552000: the kill_precedence scar, a decomposer probe on
// `kill_precedence(events) -> u64 | none` graded a correct artifact a MISS because the DRIVER, not the artifact, lost the
// bits). Args are unaffected (they cross as text and serde parses the digits into u64/i64 exactly); only results — bare, or
// nested in list/tuple/map/record/json — go through this parse. parseWire (a hand-written reader, below) recovers the lost
// precision from the literal's own digits, but only where a double actually lost it: the check is
// an EXACT BigInt round trip against the source digits, not `Number.isSafeInteger` — 2^53 itself sits one past
// MAX_SAFE_INTEGER yet round-trips a double exactly and must stay a plain number, while 2^53+1 does not and must come back
// as a BigInt. Non-integers (f64 crosses as a `{"__f64bits"}` hex string, never a bare float) pass through untouched.
export function parseWire(line) {
  // A HAND-WRITTEN RFC 8259 reader, not JSON.parse (round 5, selfhost parse_wire): Node 24.16's JSON.parse carries a key cache
  // ACROSS calls (#51 — after a key that is one backslash, a later short escaped key reads back as the backslash), and the driver
  // parses every result line of a batch in one process, so a correct artifact's map keys could be misread by vector order.
  // Integers stay exact (see above); `__proto__` is an own key; a repeated key keeps its last value, as JSON.parse does.
  if (typeof line !== 'string') throw new TypeError('wire line: not text');   // #120
  const s = line; let i = 0;
  const fail = (m) => { throw new SyntaxError(`wire line: ${m} at ${i}`); };
  const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === '\t' || s[i] === '\n' || s[i] === '\r')) i++; };
  const ESC = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
  const str = () => { i++; let out = '';
    for (;;) { if (i >= s.length) fail('unterminated string'); const c = s[i++];
      if (c === '"') return out;
      if (c === '\\') { const e = s[i++]; if (e === 'u') { const h = s.slice(i, i + 4); if (!/^[0-9a-fA-F]{4}$/.test(h)) fail('bad \\u escape'); out += String.fromCharCode(parseInt(h, 16)); i += 4; } else if (Object.hasOwn(ESC, e)) out += ESC[e]; else fail('bad escape'); }
      else { if (c < ' ') fail('a control character in a string'); out += c; } } };
  const num = () => { const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(i)); if (!m) fail('not a JSON value'); i += m[0].length;
    const x = Number(m[0]); const int = /^-?[0-9]+$/.test(m[0]);
    if (int && !Number.isSafeInteger(x)) { const big = BigInt(m[0]); return Number.isFinite(x) && big === BigInt(x) ? x : big; }   // lossy -> recover the exact integer
    if (!Number.isFinite(x)) fail(`${m[0]} has no double`); return x; };
  const val = (depth) => { if (depth > 128) fail('nests too deep'); /* serde_json, the producer, refuses at 128 (#120) */ ws(); const c = s[i];
    if (c === '{') { i++; const o = {}; ws(); if (s[i] === '}') { i++; return o; }
      for (;;) { ws(); if (s[i] !== '"') fail('expected a key'); const k = str(); ws(); if (s[i] !== ':') fail("expected ':'"); i++;
        Object.defineProperty(o, k, { value: val(depth + 1), enumerable: true, writable: true, configurable: true }); ws();
        if (s[i] === ',') { i++; continue; } if (s[i] === '}') { i++; return o; } fail("expected ',' or '}'"); } }
    if (c === '[') { i++; const a = []; ws(); if (s[i] === ']') { i++; return a; }
      for (;;) { a.push(val(depth + 1)); ws(); if (s[i] === ',') { i++; continue; } if (s[i] === ']') { i++; return a; } fail("expected ',' or ']'"); } }
    if (c === '"') return str();
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) if (s.startsWith(w, i)) { i += w.length; return v; }
    return num(); };
  const v = val(0); ws(); if (i !== s.length) fail('unexpected text after the value'); return v;
}
// A record crosses the harness as a TUPLE in declared field order (the ABI above), so a record-typed RESULT comes back as a
// positional array; reshape it to the named record the oracle observes, at any depth (selfhost quorum: its
// record[fullCount, hasQuorum, winnerIdx] result failed every non-throwing vector with correct values).
// Round 5 (rederive selfhost rust_reshape): only an OPTION union (`X | none`) is followed — a union of two non-none alternatives
// used to reshape by the first, so a wrong `list[f64]` result became the right-looking record {x: 1}; an array becomes a record
// only when its length IS the field count (extra or missing slots were dropped or read as none — a wrong result graded right);
// a map's values are reshaped too (a HashMap<String, (i64, i64)> came back positional and a right result graded wrong).
export function reshape(v, t) {
  if (v === null || v === undefined) return v;
  if (t.k === 'union') { const rest = t.alts.filter((a) => a.k !== 'none'); return rest.length === 1 && t.alts.length === 2 ? reshape(v, rest[0]) : v; }
  if (t.k === 'record' && Array.isArray(v)) return v.length === t.fields.length ? Object.fromEntries(t.fields.map(([name, ft], i) => [name, reshape(v[i], ft)])) : v;
  if (t.k === 'tuple' && Array.isArray(v)) return v.map((x, i) => (t.items[i] ? reshape(x, t.items[i]) : x));
  if (t.k === 'list' && Array.isArray(v)) return v.map((x) => reshape(x, t.item));
  if (t.k === 'map' && v !== null && typeof v === 'object' && !Array.isArray(v)) { const o = {}; for (const k of Object.keys(v)) Object.defineProperty(o, k, { value: reshape(v[k], t.val), enumerable: true, writable: true, configurable: true }); return o; }
  return v;
}
/** callBatch over a built harness binary: narrowed vectors are held back (never written to stdin) and answered in place. */
export function batchCaller(bin, sig) {
  const postT = sig.state ? sig.args[sig.state.index].type : null; const wr = containsF64(sig.result), wp = !!postT && containsF64(postT);
  return async (argsList, { state } = {}) => {
    const lines = argsList.map((a) => wireLine(a, sig)); const sent = lines.map((l, i) => (typeof l === 'string' ? i : -1)).filter((i) => i >= 0);
    const r = sent.length ? spawnSync(bin, [], { input: sent.map((i) => lines[i]).join('\n') + '\n', encoding: 'utf8', maxBuffer: 1e8 }) : { stdout: '', stderr: '' };
    const out = r.stdout.split('\n'); const results = lines.map((l) => (typeof l === 'string' ? undefined : l));
    sent.forEach((i, j) => { const l = out[j]; if (l === undefined || l === '') { results[i] = { __threw: 'no output: ' + (r.stderr || '').slice(-120) }; return; } let v; try { v = parseWire(l); } catch { results[i] = { __threw: 'unparseable: ' + l.slice(0, 80) }; return; }
      // the envelope (#55): exactly {"throw": text} or {"ok": value}; anything else is a harness fault, never a value
      const env = v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : [];
      if (env.length === 1 && env[0] === 'throw' && typeof v.throw === 'string') { results[i] = { __threw: v.throw }; return; }
      // the HARNESS could not carry this vector into the artifact (serde_json's 128-level limit, a value the native type cannot
      // hold): NARROWED, counted on its own — never a throw the oracle could match (rederive selfhost round 5: the parse failure
      // was written as {"throw"} and a too-deep "must refuse" vector passed every rust artifact untested)
      if (env.length === 1 && env[0] === 'harness' && typeof v.harness === 'string') { results[i] = { __narrowed: 'harness: ' + v.harness }; return; }
      if (env.length !== 1 || env[0] !== 'ok') { results[i] = { __threw: 'harness: not an {ok}/{throw} envelope: ' + l.slice(0, 80) }; return; }
      const o = v.ok;   // a returned value is marker-escaped, as every js/ts driver's is (#55 #58)
      // result and post are escaped SEPARATELY (one depth model, #100) and a value past the codec cap is narrowed for this vector only
      try { results[i] = state ? { result: escapeMarkers(reshape(wr ? unwire(o.result) : o.result, sig.result)), post: escapeMarkers(reshape(wp ? unwire(o.post) : o.post, postT)) } : escapeMarkers(reshape(wr ? unwire(o) : o, sig.result)); }
      catch (e) { results[i] = { __narrowed: `result: ${e.message}` }; } });
    return results;
  };
}
// ---- carried-module placement (verifier-owned)
/** The carried module this artifact must carry, from the unit's rust language file (`CARRIED <name> = <module>`) and the primary's
 *  CARRIED block. `ctx.carried` (an explicit binding, or null) overrides discovery; `ctx.unitDir` overrides the default
 *  <crate>/../../.. (= units/<unit> for runs/rust/emit_<i>). The attested source is resolved the way run.mjs and stage.mjs do:
 *  units/<u>/carried/<base>, runs/<base>, runs/rust/<module>. Returns null when the unit binds no carried module. */
export function carriedFor(projectDir, ctx) {
  if (ctx.carried !== undefined) return ctx.carried;
  const unitDir = ctx.unitDir ?? resolve(projectDir, '..', '..', '..');   // runs/rust/emit_<i> -> runs/rust -> runs -> units/<unit>
  const primary = join(unitDir, 'sir', `${ctx.unit}.sir`), langSir = join(unitDir, 'sir', `${ctx.unit}.rust.sir`);
  if (!existsSync(primary) || !existsSync(langSir) || !/^CARRIED\b/m.test(readFileSync(primary, 'utf8'))) return null;
  const b = carriedBinding(readFileSync(langSir, 'utf8')); if (!b) return null;
  const base = b.module.split('/').pop(); const candidates = [join(unitDir, 'carried', base), join(unitDir, 'runs', base), join(unitDir, 'runs', 'rust', b.module)];
  return { name: b.name, module: b.module, base, source: candidates.find((c) => existsSync(c)) ?? null, candidates };
}
const noSource = (carried) => new Error(`verifier fault: carried module ${carried.module} is bound by the rust language file but has no attested source (looked in ${carried.candidates.join(', ')})`);
/** PURE check of the ORIGINAL artifact — reads, never writes. A shipped src/<base> must be byte-identical (sha256) to the attested
 *  file: identical → fine (`shipped: 'identical'`); absent → `shipped: 'absent'` (the build copy gets the injection); different →
 *  `{ error }` naming the file and the attested path — the artifact is rejected and NOTHING is copied or compiled. A binding with no
 *  attested source is a VERIFIER fault and throws (stage() refuses to build such a cleanroom, so prepare stops before any emitter is
 *  spawned). */
export function shippedCarried(projectDir, carried) {
  if (!carried) return { shipped: null };
  if (!carried.source) throw noSource(carried);
  const own = join(projectDir, 'src', carried.base);
  if (!existsSync(own)) return { shipped: 'absent', attested: carried.source };
  if (sha256(readFileSync(own)) !== sha256(readFileSync(carried.source))) return { error: `carried module transcribed or modified: src/${carried.base} differs from the attested ${carried.source}`, placed: null, shipped: 'differs', attested: carried.source };
  return { shipped: 'identical', attested: carried.source };
}
/** Supply the attested module into <buildCopy>/src/<base> — the VERIFIER'S copy of the crate, never the artifact. A copy that
 *  already holds the file (the artifact shipped an identical one, checked by shippedCarried) is left as is (`shipped: 'identical'`);
 *  absent → written (`shipped: 'injected'`). Called only on a copy whose original passed shippedCarried, so a differing file here is
 *  a verifier fault (the copy is not the artifact), reported as `{ error }` and thrown by prepare. */
export function placeCarried(buildDir, carried) {
  if (!carried) return { placed: null, shipped: null };
  if (!carried.source) throw noSource(carried);
  const dst = join(buildDir, 'src', carried.base); const attested = readFileSync(carried.source);
  if (existsSync(dst)) {
    if (sha256(readFileSync(dst)) !== sha256(attested)) return { error: `carried module transcribed or modified: src/${carried.base} differs from the attested ${carried.source}`, placed: null, shipped: 'differs', attested: carried.source };
    return { placed: dst, shipped: 'identical', attested: carried.source };
  }
  mkdirSync(join(buildDir, 'src'), { recursive: true }); writeFileSync(dst, attested); return { placed: dst, shipped: 'injected', attested: carried.source };
}
// A crate the verifier builds may sit nested under a CONSUMER repo's own ancestor `[workspace]` (a SIR unit's runs/rust/
// under someone else's cargo workspace with unrelated `members` — the kill_precedence round 1 scar, a consumer game repo's
// first out-of-tree run) — cargo then refuses it outright: "current package believes it's in a workspace when it's not",
// before a single rung runs. Appending an empty `[workspace]` table makes a crate its own workspace root regardless of
// ancestry; a crate that already declares one (`[workspace]` or `[workspace.*]`) is left untouched, never double-declared.
function ensureSelfContainedWorkspace(cargoTomlPath) {
  const text = readFileSync(cargoTomlPath, 'utf8');
  if (/^\s*\[workspace(?:\.[\w-]+)?\]/m.test(text)) return;
  writeFileSync(cargoTomlPath, text.replace(/\n?$/, '\n') + '\n[workspace]\n');
}
/** The verifier's build copy of the artifact crate: <harnessDir>/artifact/, fresh each prepare (removed and recreated — assembled
 *  beside it and renamed into place). Everything the artifact holds is copied EXCEPT target/ (regenerable build output; the copy
 *  builds into the harness's own target/). SELF-CONTAINED regardless of the artifact's ancestry (see ensureSelfContainedWorkspace
 *  above) — applied to the COPY only, never projectDir (the artifact itself; the verifier never writes into the artifact
 *  directory, see the header comment). Returns the copy's path. */
export function buildCopy(projectDir, harnessDir) {
  const dst = join(harnessDir, 'artifact'), tmp = `${dst}.${process.pid}.tmp`;
  rmSync(dst, { recursive: true, force: true }); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  for (const f of readdirSync(projectDir)) { if (f === 'target') continue; cpSync(join(projectDir, f), join(tmp, f), { recursive: true }); }
  ensureSelfContainedWorkspace(join(tmp, 'Cargo.toml'));
  renameSync(tmp, dst); return dst;
}
export async function prepare(projectDir, ctx) {
  const cargo = (cwd, args) => spawnSync('cargo', args, { cwd, encoding: 'utf8', env: { ...process.env, CARGO_TERM_COLOR: 'never' } });
  const errs = (s) => s.trim().split('\n').filter((l) => /error/.test(l)).slice(0, 4).join(' | ');
  const manifest = readFileSync(join(projectDir, 'Cargo.toml'), 'utf8'); const isLib = /^\s*\[lib\]/m.test(manifest);
  const crate = manifest.match(/^\s*\[lib\][\s\S]*?name\s*=\s*"([^"]+)"/m)?.[1] ?? manifest.match(/^\s*name\s*=\s*"([^"]+)"/m)?.[1] ?? ctx.unit;
  if (!isLib) { const report = 'artifact is a BINARY crate — must be a library ([lib], pub fn ' + ctx.unit + '); §15: the adapter belongs to the verifier'; return { typeCheck: { applicable: true, ok: false, report }, callBatch: async () => { throw new Error(report); } }; }
  // LINT (the zero-dep rule): only map[K,V]/json ever cross as serde_json::Value; an artifact that declares the
  // dependency anyway, for a SIG that has neither route anywhere, is rejected here — before a single line is copied or
  // compiled — never silently allowed through as harmless.
  const declaresSerdeJson = /^\s*serde_json\s*=/m.test(manifest) || /^\s*\[dependencies\.serde_json\]/m.test(manifest);
  if (declaresSerdeJson && !usesSerdeJsonValue(ctx.sig)) {
    const report = `lint: Cargo.toml declares a serde_json dependency, but ${ctx.sig.name}'s SIG has no map[K,V]/json anywhere (args, result, or STATE post) — those are the only two routes that cross as serde_json::Value; list/tuple/record/union now marshal to native Rust types and need no dependency at all (the zero-dep rule)`;
    return { typeCheck: { applicable: true, ok: false, report }, callBatch: async () => { throw new Error(report); } };
  }
  // VERIFIER-OWNED carried check, before anything is copied or compiled: a shipped src/<base> that differs from the attested file
  // (transcribed or modified) is rejected here on the ORIGINAL artifact — read only — and never compiled.
  const binding = carriedFor(projectDir, ctx); const shipped = shippedCarried(projectDir, binding);
  if (shipped.error) { const report = shipped.error; return { typeCheck: { applicable: true, ok: false, report }, carried: shipped, callBatch: async () => { throw new Error(report); } }; }
  // THE VERIFIER NEVER WRITES INTO THE ARTIFACT: the crate is copied to .harness/<emit>/artifact/ (fresh), the attested module is
  // supplied THERE, cargo check runs THERE (into the harness's target/), and the harness depends on THAT copy by path.
  const h = join(resolve(projectDir), '..', '.harness', basename(projectDir)); mkdirSync(join(h, 'src'), { recursive: true });
  const copy = buildCopy(projectDir, h); const carried = placeCarried(copy, binding);
  if (carried.error) throw new Error(`verifier fault: the build copy ${copy} differs from the artifact it was copied from — ${carried.error}`);
  // rdv: a crate that ships its Cargo.lock is built with EXACTLY those dependency versions — `--locked` refuses a lock that does
  // not match its Cargo.toml, and the harness (whose own lock cargo would otherwise resolve fresh) is seeded with it, so the binary
  // that gets graded links the versions the publisher shipped, not whatever the registry serves today.
  const lockPath = join(projectDir, 'Cargo.lock'); const locked = existsSync(lockPath) ? ['--locked'] : [];
  const chk = cargo(copy, ['check', '--release', '-q', ...locked, '--target-dir', join(h, 'target')]); let ok = chk.status === 0; let report = ok ? 'cargo check ok (library crate)' : 'cargo check FAILED: ' + errs(chk.stderr);
  // the harness's OWN [workspace] must EXCLUDE its nested "artifact" build copy — that copy always lives inside the
  // harness dir (buildCopy places it at <h>/artifact) and, since buildCopy just gave it its own [workspace] table too
  // (ensureSelfContainedWorkspace above), an unexcluded harness workspace would claim the same subtree and cargo refuses
  // with "multiple workspace roots found in the same workspace" — this is universal, not just the hostile-ancestor case.
  writeFileSync(join(h, 'Cargo.toml'), `[package]\nname = "harness"\nversion = "0.0.0"\nedition = "2021"\n\n[[bin]]\nname = "harness"\npath = "src/main.rs"\n\n[dependencies]\n${crate.replace(/-/g, '_')} = { path = ${JSON.stringify(copy)}, package = ${JSON.stringify(crate)} }\nserde_json = { version = "1", features = ["float_roundtrip"] }\n\n[workspace]\nexclude = ["artifact"]\n`);   // the HARNESS parses JSON text: default serde_json float parsing is fast, not correctly rounded (1-ULP scar, defaults_deep differential); [workspace] here too — self-contained regardless of ancestry (kill_precedence round 1)
  writeFileSync(join(h, 'src', 'main.rs'), harnessMain(crate.replace(/-/g, '_'), ctx.sig));
  if (locked.length) writeFileSync(join(h, 'Cargo.lock'), readFileSync(lockPath));
  const b = cargo(h, ['build', '--release', '-q']);
  if (b.status !== 0) { ok = false; report += '; harness build FAILED (signature mismatch vs the declared SIG?): ' + errs(b.stderr); }
  const bin = join(h, 'target', 'release', 'harness'); const typeCheck = { applicable: true, ok, report };
  if (b.status !== 0 || !existsSync(bin)) return { typeCheck, carried, callBatch: async () => { throw new Error('harness build failed: ' + errs(b.stderr)); } };
  return { typeCheck, bin, carried, callBatch: batchCaller(bin, ctx.sig) };
}
/** Tooling/test entry: prepare a crate against an abstract SIG text and push decoded-native arg lists through its harness. */
export async function callWith(sigText, crateDir, argsList, { state, carried, unitDir } = {}) {
  const sig = parseSig(sigText); const p = await prepare(crateDir, { unit: basename(crateDir), labRoot: resolve(crateDir, '..'), sig, ...(carried !== undefined ? { carried } : {}), ...(unitDir ? { unitDir } : {}) });
  if (!p.typeCheck.ok) throw new Error(p.typeCheck.report);
  return p.callBatch(argsList, { state });
}
