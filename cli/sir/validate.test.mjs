// Every ERROR must have a fixture that triggers it — a gate that has never failed is not known to work.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'; import { join } from 'node:path'; import { tmpdir } from 'node:os';
import { validate } from './validate.mjs'; import { canonicalSha } from './sir-parse.mjs'; import { encode, vectorSetSha, ENCODING } from './canon.mjs'; import { sha256, canonical } from './v05.mjs';
const HERE = new URL('.', import.meta.url).pathname;   // the real units are committed fixtures (copied from sir-lab/v05-lang units/, 2026-10-23)
const ROOT = join(tmpdir(), 'sir-validate-fixtures'); rmSync(ROOT, { recursive: true, force: true });
const PRIMARY = `UNIT fx\nKIND FUNCTIONAL\nFIDELITY package\nORACLE-CLASS deterministic\nSIG fx(x: f64) -> bool\nENVELOPE any f64\nDEPENDS-ON none\nDESCRIPTION A fixture unit.\nBEHAVIOR\nR1 finite -> true; otherwise -> false.\nPROVENANCE fixture\n`;
const js = (primary) => `UNIT fx\nLANG js\nPRIMARY-SHA256 ${canonicalSha(primary)}\nSIG fx(x: number): boolean\nABI f64=number\nDEPENDS-ON none\n`;
function fixture(name, { primary = PRIMARY, lang = null, extraFile = null, oracle = null, rust = null, carried = null }) {
  const d = join(ROOT, name, 'fx'); mkdirSync(join(d, 'sir'), { recursive: true }); mkdirSync(join(d, 'oracles'), { recursive: true });
  writeFileSync(join(d, 'sir', 'fx.sir'), primary); writeFileSync(join(d, 'sir', 'fx.js.sir'), lang ?? js(primary));
  if (extraFile) writeFileSync(join(d, 'sir', extraFile[0]), extraFile[1]); if (oracle) writeFileSync(join(d, 'oracles', 'fx.json'), JSON.stringify(oracle));
  if (rust) writeFileSync(join(d, 'sir', 'fx.rust.sir'), rust); if (carried) { mkdirSync(join(d, 'carried'), { recursive: true }); for (const [f, text] of Object.entries(carried)) writeFileSync(join(d, 'carried', f), text); } return d;
}
// A CARRIED unit in two languages: the js module is the good table; the Rust module is whatever `rs` says (the SHAPE is text -> text).
const CARRIED_PRIMARY = PRIMARY.replace('DEPENDS-ON none', `DEPENDS-ON none\nCARRIED tbl FROM somewhere\n  SHAPE map text -> text; 1 entry\n  CANONICAL-SHA256 ${sha256(Buffer.from(canonical({ a: 'b' })))}\n  AUTHORITY { expr: "count", equals: 1 }\n  AUTHORITY { expr: "a", equals: "b" }`);
const carriedUnit = (name, rs) => fixture(name, { primary: CARRIED_PRIMARY, lang: js(CARRIED_PRIMARY) + 'CARRIED tbl = tbl.js (default export)\n',
  rust: `UNIT fx\nLANG rust\nPRIMARY-SHA256 ${canonicalSha(CARRIED_PRIMARY)}\nSIG pub fn fx(x: f64) -> bool\nABI f64=f64\nCARRIED tbl = tbl.rs (pub static TBL: &[(&str, &str)])\nDEPENDS-ON none\n`,
  carried: { 'tbl.js': 'export default {"a":"b"}\n', 'tbl.rs': rs } });
const RS_MISFIT = 'pub static TBL: &[(&str, &str)] = &[\n    ("a", "b"),\n    ("c", 7),\n];\n';   // a number where the SHAPE says text
const typedOracle = () => { const o = { unit: 'fx', sig: 'fx(x: f64) -> bool', encoding: ENCODING, frozen: [{ name: 'v0', args: [encode(1, { k: 'f64' })], expected: encode(true, { k: 'bool' }) }], heldout: [{ name: 'h0', args: [encode(NaN, { k: 'f64' })], expected: encode(false, { k: 'bool' }) }] }; o.canonicalSha256 = vectorSetSha(o); return o; };
const cases = [
  ['E_COMMENT',               { primary: PRIMARY + '# a stray comment\n' }],
  ['E_PSEUDOCODE',            { primary: PRIMARY + 'LET y = x\n' }],
  ['E_EMITTER_META',          { primary: PRIMARY + 'EMISSION write an ES module\n' }],
  ['E_UNKNOWN_DIRECTIVE',     { primary: PRIMARY + 'FROBNICATE now\n' }],
  ['E_REGISTER',              { lang: js(PRIMARY) + 'BEHAVIOR\nR1 finite -> true\n' }],
  ['E_UNCITED_PIN',           { lang: js(PRIMARY) + 'PINNED regex X = /a/\n' }],
  ['E_CARRIED_AS_DEPENDENCY', { primary: PRIMARY.replace('DEPENDS-ON none', 'DEPENDS-ON tbl\nCARRIED tbl FROM somewhere\n  SHAPE map text -> f64') }],
  ['E_STALE_BINDING',         { lang: js(PRIMARY).replace(/PRIMARY-SHA256 [0-9a-f]+/, 'PRIMARY-SHA256 ' + '0'.repeat(64)) }],
  ['E_LANG_REGISTRY',         { extraFile: ['fx.cobol.sir', 'UNIT fx\nLANG cobol\nPRIMARY-SHA256 ' + canonicalSha(PRIMARY) + '\n'] }],
  ['E_NOT_UNICODE',           { extraFile: ['fx.js.sir', Buffer.from([...Buffer.from('UNIT fx\nNOTE '), 0xff, 0xfe, 0x0a])] }],   // invalid UTF-8 would read as U+FFFD and bind alike (canonical_text, round 1)
  ['E_SIG',                   { primary: PRIMARY.replace('SIG fx(x: f64) -> bool', 'SIG fx(x: quux) -> bool') }],
  ['E_LANGUAGE_LEAK',         { primary: PRIMARY.replace('DESCRIPTION A fixture unit.', 'DESCRIPTION Uses Math.round and parseFloat on the input.') }],
  ['E_ORACLE_FILE_SHA',       { oracle: { ...typedOracle(), canonicalSha256: 'f'.repeat(64) } }],
  ['E_ORACLE_DECLARED_SHA',   { primary: PRIMARY + 'ORACLE value -> oracles/fx.json  CANONICAL-SHA256 ' + 'a'.repeat(64) + '\n', oracle: typedOracle() }],
  ['E_STATE_ARG',             { primary: PRIMARY.replace('KIND FUNCTIONAL', 'KIND STATE').replace('SIG fx(x: f64) -> bool', 'SIG fx(x: f64) -> bool\nSTATE mutates nope') }],
  ['E_STATE_KIND',            { primary: PRIMARY.replace('SIG fx(x: f64) -> bool', 'SIG fx(x: f64) -> bool\nSTATE mutates x') }],
  ['E_TRANSCRIPTION_DENSITY', { primary: PRIMARY + 'R2 if (x) return true;\nR3 typeof x === "number"\nR4 return false;\n' }, { enforceDensity: true }],
  ['E_CARRIED_UNPARSEABLE',   { primary: CARRIED_PRIMARY, lang: js(CARRIED_PRIMARY) + 'CARRIED tbl = tbl.js (default export)\n', rust: `UNIT fx\nLANG rust\nPRIMARY-SHA256 ${canonicalSha(CARRIED_PRIMARY)}\nSIG pub fn fx(x: f64) -> bool\nABI f64=f64\nCARRIED tbl = tbl.rs (pub static TBL)\nDEPENDS-ON none\n`, carried: { 'tbl.js': 'export default {"a":"b"}\n', 'tbl.rs': RS_MISFIT } }],
];
let bad = 0; console.log('fixture suite — every ERROR has a fixture that triggers it');
for (const [code, spec, opts] of cases) { const d = fixture(code, spec); const r = validate(d, opts); const hit = r.errors.some((e) => e.code === code); bad += !hit; console.log(`  ${hit ? 'OK ' : 'MISS'} ${code.padEnd(26)} fired=${hit}  (all: ${[...new Set(r.errors.map((e) => e.code))].join(',') || 'none'})`); }
const typedThrowRecord = () => { const o = { unit: 'fx', sig: 'fx(x: f64) -> bool', encoding: ENCODING, frozen: [{ name: 'v0', args: [encode(1, { k: 'f64' })], expected: encode({ __throw: 'boom' }, { k: 'bool' }) }], heldout: [{ name: 'h0', args: [encode(2, { k: 'f64' })], expected: encode({ result: true, post: 2 }, { k: 'record', fields: [['result', { k: 'bool' }], ['post', { k: 'f64' }]] }) }] }; o.canonicalSha256 = vectorSetSha(o); return o; };
const tr = validate(fixture('THROW_RECORD', { oracle: typedThrowRecord() })); console.log(`  ${tr.ok ? 'OK ' : 'BAD'} a typed oracle with throw + record observations passes the hash check`); bad += !tr.ok;
const clean = validate(fixture('CLEAN', { oracle: typedOracle() })); console.log(`  ${clean.ok ? 'OK ' : 'BAD'} a valid fixture passes (warnings: ${clean.warnings.map((w) => w.code).join(',') || 'none'})`); bad += !clean.ok;
for (const u of ['get_rgb', 'is_number'].map((n) => join(HERE, 'fixtures', n))) { const r = validate(u); console.log(`  ${r.ok ? 'OK ' : 'BAD'} ${u}: ${r.errors.length} errors, ${r.warnings.length} warnings`); bad += !r.ok; }
// Negative fixture (Tier A scar): a quoted RESULT literal is data — `R2 none -> "null"` must NOT be a language leak, while a bare
// `null` in the same position still is.
{
  const quoted = fixture('quoted_literal_ok', { primary: PRIMARY + 'R2 none -> "null" and the absent value -> "undefined"\n' });
  const bare = fixture('bare_null_leaks', { primary: PRIMARY + 'R2 none -> null\n' });
  const q = validate(quoted, {}), b = validate(bare, {});
  const qLeak = q.errors.some((x) => x.code === 'E_LANGUAGE_LEAK'), bLeak = b.errors.some((x) => x.code === 'E_LANGUAGE_LEAK');
  console.log(`${!qLeak ? 'ok  ' : 'FAIL'} quoted "null" result literal is NOT a leak; ${bLeak ? 'ok  ' : 'FAIL'} bare null still IS`);
  if (qLeak || !bLeak) { console.log('quoted-literal fixture wrong'); process.exit(1); }
}
// Negative control (carried-rust scar): a SHAPE-violating Rust table reaches the validator as the EXPLAINED E_CARRIED_UNPARSEABLE —
// not as E_CARRIED_HASH_MISMATCH (what the {}-reading v1 reader produced) and not as a crash — while js still attests; and the
// same unit with a well-formed Rust table validates clean in both languages (the reader is exercised through the caller, not only directly).
{
  let r; try { r = validate(carriedUnit('carried_rust_misfit', RS_MISFIT)); } catch (e) { console.log(`FAIL validate() threw on a SHAPE-violating Rust table: ${e.message}`); process.exit(1); }
  const unp = r.errors.find((e) => e.code === 'E_CARRIED_UNPARSEABLE' && e.where === 'rust'); const hm = r.errors.filter((e) => e.code === 'E_CARRIED_HASH_MISMATCH');
  const explained = !!unp && /"c"/.test(unp.msg) && /value 7/.test(unp.msg) && /value type text/.test(unp.msg);
  console.log(`${explained ? 'ok  ' : 'FAIL'} SHAPE-violating Rust table -> E_CARRIED_UNPARSEABLE for rust, explained: ${unp?.msg ?? '(not raised; codes: ' + r.errors.map((e) => e.code + '@' + e.where).join(',') + ')'}`);
  console.log(`${hm.length === 0 ? 'ok  ' : 'FAIL'} …and NOT as a hash-mismatch (${hm.length} E_CARRIED_HASH_MISMATCH); ${r.facts.carried?.perLanguage?.js === 'attested' && r.facts.carried?.perLanguage?.rust === 'unparseable' ? 'ok  ' : 'FAIL'} facts.carried.perLanguage = ${JSON.stringify(r.facts.carried?.perLanguage)}`);
  const good = validate(carriedUnit('carried_rust_ok', 'pub static TBL: &[(&str, &str)] = &[("a", "b")];\n'));
  console.log(`${good.ok && good.facts.carried?.perLanguage?.rust === 'attested' ? 'ok  ' : 'FAIL'} the same unit with a well-formed Rust table validates clean, rust ${good.facts.carried?.perLanguage?.rust} (errors: ${good.errors.map((e) => e.code + '@' + e.where).join(',') || 'none'})`);
  if (!explained || hm.length || r.facts.carried?.perLanguage?.rust !== 'unparseable' || !good.ok) { console.log('carried-rust control fixture wrong'); process.exit(1); }
}
rmSync(ROOT, { recursive: true, force: true }); console.log(bad ? `\n${bad} PROBLEM(S)` : '\nall fixtures fire; both real units validate clean'); process.exit(bad ? 1 : 0);
