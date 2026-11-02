#!/usr/bin/env node
// sir-validate.mjs <unitDir> [--mode strict|legacy] [--enforce-density] [--json] — THE validator: one parse, three tiers.
//   ERROR    — facts, mechanically decidable; refuses stamp/pack; re-checked consumer-side. Exit code 1.
//   WARN     — deterministic heuristics (transcription density, note density, legacy forms). Advisory unless --enforce-density.
//   ADVISORY — Jev (semantic), a separate channel, never in the exit code.
//   facts    — what pack stamps FROM (primary sha over the canonical print, languages, features, carried, oracle).
import { readFileSync, existsSync, readdirSync } from 'node:fs'; import { join, basename, resolve } from 'node:path';
import { family, lintFamily, carriedBinding, carriedTable, checkCarried, directive, pinCited } from './v05.mjs';
import { parse } from './sir-parse.mjs'; import { parseSig, vectorSetSha, ENCODING } from './canon.mjs';
export const PSEUDO = new Set(['LET', 'FOR', 'RETURN', 'NODE', 'CONTROL', 'ERROR', 'THROW-PATHS', 'BEHAVIORAL', 'OBSERVABLE', 'PURITY', 'FIREWALL', 'ELSE', 'TERMINATOR-SPLIT', 'STEP', 'GATE', 'IF', 'WHILE']);
export const META = new Set(['EMISSION', 'RE-EMITTER', 'EMISSION-CONTRACT', 'EMITTER-DIRECTIVE', 'EMISSION-INTERFACE', 'ABOUT', 'SETUP', 'FINALIZE']);

export function validate(unitDir, { mode = 'strict', enforceDensity = false, gate = 0.10, unit: unitName = null } = {}) {   // `unit`: a multi-unit bundle root (sir/<unit>.sir, oracles/<unit>.json) — the dir's basename otherwise
  const errors = [], warnings = [], advisories = [];
  const E = (code, where, line, msg = '') => errors.push({ code, where, line, msg: String(msg).slice(0, 120) });
  const W = (code, where, line, msg = '') => warnings.push({ code, where, line, msg: String(msg).slice(0, 120) });
  const unit = unitName ?? basename(resolve(unitDir)); const facts = { unit, mode };
  let fam;
  // a SIR file must be VALID UTF-8 before anything binds it (canonical_text, round 1). Reading it leniently would turn every
  // invalid byte sequence into U+FFFD, so two files differing only there would bind alike; decode the raw bytes strictly instead.
  const sirDir = join(unitDir, 'sir'); let unicodeOk = true; const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
  if (existsSync(sirDir)) for (const f of readdirSync(sirDir).filter((x) => x.endsWith('.sir'))) { try { strictUtf8.decode(readFileSync(join(sirDir, f))); } catch { E('E_NOT_UNICODE', f, 0, 'not valid UTF-8: an invalid byte sequence would read as U+FFFD and bind like any other'); unicodeOk = false; } }
  if (!unicodeOk) return finish();
  try { fam = family(join(unitDir, 'sir'), unit); } catch (e) { E('E_NO_PRIMARY', 'primary', 0, e.message); return finish(); }
  for (const w of fam.warnings ?? []) W('W_LEGACY_BINDING', 'family:' + w.split(':')[0], 0, w);   // valid, but under-covers its primary: re-bind
  for (const err of fam.errors) E(/STALE/.test(err) ? 'E_STALE_BINDING' : /registry/.test(err) ? 'E_LANG_REGISTRY' : /no PRIMARY-SHA256/.test(err) ? 'E_UNBOUND' : 'E_FAMILY', 'family:' + err.split(':')[0], 0, err);   // keyed per file: every stale language file is its own declared error
  const files = [['primary', fam.primary, 'P'], ...Object.entries(fam.langs).map(([l, e]) => [l, e.text, 'L'])];
  for (const [where, text, reg] of files) { const r = validateText(text, { mode, reg }); for (const e of r.errors) E(e.code, where, e.line, e.msg); for (const w of r.warnings) W(w.code, where, w.line, w.msg); }
  const lint = lintFamily(fam, { maxDensity: gate });
  for (const p of lint.problems) {
    const where = p.split(':')[0];
    if (/carried data declared under DEPENDS-ON/.test(p)) E('E_CARRIED_AS_DEPENDENCY', where, 0, p);
    else if (/language leak/.test(p)) E('E_LANGUAGE_LEAK', where, 0, p);
    else if (/behavior in a language file/.test(p)) E('E_REGISTER', where, 0, p);
    else if (/pin without a citation/.test(p)) E('E_UNCITED_PIN', where, 0, p);
    else if (/transcription density/.test(p)) (enforceDensity ? E : W)(enforceDensity ? 'E_TRANSCRIPTION_DENSITY' : 'W_TRANSCRIPTION_DENSITY', 'primary', 0, p);
    else if (/STALE|registry|PRIMARY-SHA256/.test(p)) {/* already reported from fam.errors */}
    else E('E_LINT', where, 0, p);
  }
  facts.primarySha = fam.primarySha; facts.languages = Object.keys(fam.langs); facts.features = fam.features; facts.transcriptionDensity = +lint.transcription.density.toFixed(3);
  const decl = lint.carried;
  if (decl) {
    facts.carried = { name: decl.name, sha: decl.sha, perLanguage: {} };
    for (const [lang, e] of Object.entries(fam.langs)) {
      const b = carriedBinding(e.text); if (!b) { E('E_CARRIED_UNBOUND', lang, 0, decl.name); continue; }
      const base = b.module.split('/').pop(); const path = [join(unitDir, 'carried', base), join(unitDir, 'runs', base)].find(existsSync);
      if (!path) { E('E_CARRIED_MISSING', lang, 0, b.module); continue; }
      let table; try { table = carriedTable(lang, path, decl); }   // the declaration drives the reader: a SHAPE misfit is EXPLAINED, not a hash-mismatch
      catch (err) { facts.carried.perLanguage[lang] = 'unparseable'; E('E_CARRIED_UNPARSEABLE', lang, 0, err.message.startsWith(path) ? base + err.message.slice(path.length) : err.message); continue; }   // reported, never an abort
      let c; try { c = checkCarried(decl, table); } catch (e) { E('E_CARRIED_DECL', lang, 0, e.message); continue; }   // a refusal is reported, never a crash (#123)
      facts.carried.perLanguage[lang] = c.status;
      if (c.status !== 'attested') E('E_CARRIED_' + c.status.toUpperCase().replace(/-/g, '_'), lang, 0, `${c.status} (${c.sha.slice(0, 12)})`);
    }
  }
  const op = join(unitDir, 'oracles', `${unit}.json`);
  if (!existsSync(op)) W('W_NO_ORACLE', 'oracle', 0);
  else { const o = JSON.parse(readFileSync(op, 'utf8'));
    if (o.encoding !== ENCODING) W('W_ORACLE_LEGACY', 'oracle', 0, 'untyped — run tools/encode-oracle.mjs');
    else { const vs = vectorSetSha(o); const declared = (directive(fam.primary, 'ORACLE') ?? '').match(/CANONICAL-SHA256\s+([0-9a-f]{64})/)?.[1] ?? null;
      if (vs !== o.canonicalSha256) E('E_ORACLE_FILE_SHA', 'oracle', 0, `file says ${String(o.canonicalSha256).slice(0, 12)}, vectors hash ${vs.slice(0, 12)}`);
      if (!declared) W('W_ORACLE_UNDECLARED', 'primary', 0); else if (declared !== vs) E('E_ORACLE_DECLARED_SHA', 'primary', 0, `declares ${declared.slice(0, 12)}, vectors hash ${vs.slice(0, 12)}`);
      facts.oracle = { frozen: o.frozen.length, heldout: o.heldout.length, sha: vs }; } }
  advisories.push({ tier: 'jev', status: (process.env.JEV_API_KEY || process.env.TYPESAFE_API_KEY || existsSync(process.env.JEV_ENV_FILE ?? join(process.env.HOME ?? '', 'jev-bakeoff', '.env'))) ? 'available via tools/jev_advisory.py (predict at prepare, triage at grade; advisory only)' : 'not run (no key) — never affects the exit code' });
  return finish();
  function finish() { const seen = new Set(); const dedup = errors.filter((e) => { const k = `${e.code}|${e.where}|${e.line}`; if (seen.has(k)) return false; seen.add(k); return true; }); return { ok: dedup.length === 0, errors: dedup, warnings, advisories, facts }; }
}
/** ONE file's checks — the per-file half of validate(), shared with the editor (cli/lsp): the parse in `mode`, unknown names
 *  classified, the register (`reg` P = primary, L = language file), uncited pins, NOTE density, and for a primary SIG and
 *  STATE. → { errors, warnings }, each { code, line, msg } (line 1-based; 0 = the file). The family checks (binding, oracle,
 *  carried data) and the line lints stay in validate() / v05.mjs. */
export function validateText(text, { mode = 'strict', reg = 'P' } = {}) {
  const errors = [], warnings = []; const E = (code, line, msg = '') => errors.push({ code, line, msg }); const W = (code, line, msg = '') => warnings.push({ code, line, msg });
  const r = parse(text, { mode });
  for (const e of r.errors) E(e.code, e.line, e.msg);
  for (const w of r.warnings) {
    if (w.code === 'W_UNKNOWN_DIRECTIVE') { const n = w.msg; E(PSEUDO.has(n) ? 'E_PSEUDOCODE' : META.has(n) ? 'E_EMITTER_META' : 'E_UNKNOWN_DIRECTIVE', w.line, n); }
    else W(w.code, w.line, w.msg);
  }
  let notes = 0, directives = 0;
  for (const d of r.ast) {
    if (d.kind === 'comment') continue; directives++; if (d.name === 'NOTE') notes++;
    if (d.register && d.register !== 'B' && d.register !== reg) E('E_REGISTER', d.line, `${d.name} belongs to the ${d.register === 'P' ? 'primary' : 'language file'}`);
    if ((d.name === 'PINNED' || d.name === 'EARNED') && !pinCited(d)) E('E_UNCITED_PIN', d.line, d.args);   // the lint's own rule (#104)
  }
  if (directives && notes / directives > 0.5) W('W_NOTE_DENSITY', 0, `${notes}/${directives} directives are NOTE`);
  if (reg === 'P') { const sig = directive(text, 'SIG'); let parsed = null; if (!sig) E('E_NO_SIG', 0); else { try { parsed = parseSig(sig); } catch (e) { E('E_SIG', 0, e.message); } }
    // STATE units: `STATE mutates <arg>` must name a SIG argument; KIND STATE without it is a warning (the oracle would observe result only)
    const kind = directive(text, 'KIND'); const st = directive(text, 'STATE');
    if (st) { const m = st.match(/^mutates\s+(\w+)/); if (!m || !parsed || !parsed.args.some((a) => a.name === m[1])) E('E_STATE_ARG', 0, `STATE must read 'mutates <arg>' naming a SIG argument: ${st}`); if (kind && kind !== 'STATE') E('E_STATE_KIND', 0, `STATE declared but KIND is ${kind}`); }
    else if (kind === 'STATE') W('W_STATE_UNDECLARED', 0, 'KIND STATE without `STATE mutates <arg>` — the oracle observes result only'); }
  return { errors, warnings };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2); const dir = a.find((x) => !x.startsWith('--')); const opt = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const r = validate(dir, { mode: opt('--mode') ?? 'strict', enforceDensity: a.includes('--enforce-density') });
  if (a.includes('--json')) console.log(JSON.stringify(r, null, 1));
  else { console.log(`sir-validate ${r.facts.unit} [${r.facts.mode}]: ${r.ok ? 'OK' : r.errors.length + ' ERROR(S)'}, ${r.warnings.length} warning(s)`);
    for (const e of r.errors) console.log(`  ERROR ${e.code} @${e.where}${e.line ? ':' + e.line : ''} ${e.msg}`);
    for (const w of r.warnings) console.log(`  warn  ${w.code} @${w.where}${w.line ? ':' + w.line : ''} ${w.msg}`);
    console.log(`  facts: primary ${String(r.facts.primarySha).slice(0, 12)}… languages [${(r.facts.languages || []).join(',')}] features [${(r.facts.features || []).join(',')}] density ${r.facts.transcriptionDensity}${r.facts.carried ? ` carried ${r.facts.carried.name}:${JSON.stringify(r.facts.carried.perLanguage)}` : ''}${r.facts.oracle ? ` oracle ${r.facts.oracle.frozen}+${r.facts.oracle.heldout} ${r.facts.oracle.sha.slice(0, 12)}…` : ''}`); }
  process.exit(r.ok ? 0 : 1);
}
