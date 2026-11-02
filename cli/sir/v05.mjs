// SIR v0.5 lab core — the file-split format, binding, feature detection, and the three deterministic lints.
// Promoted from sir-lab/v05-lang lib/v05.mjs into rederive (SIR_V05_PLAN Phase 1): the executable form of SIR_SCHEMA §23b.
// The language registry is the capability model's (cli/capabilities.json), never a second list.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { canonicalSha, parse, get, sirLines, splitTrailingComment, splitAttributes, isDirectiveName, DIRECTIVES, ATTR_ONLY, quotedSpans, glued, INVISIBLE_LEAD } from './sir-parse.mjs';
import { legacyPrintSha } from './legacy-print.mjs';
import { parseType, encode } from './canon.mjs';
import { languageRegistry, detectFeatures } from '../features.mjs';

/** The closed language registry (versioned, like §7's domain set). A file suffix outside it is an ERROR. */
export const LANGS = languageRegistry();
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
// A directive's value as the PARSER reads it — one reader of a SIR file (selfhost directive, 2026-10-26: a regex over raw text
// disagreed with parse() on a BOM, U+2028 (it found a SIG hidden inside a NOTE line), NBSP separators, trailing comments,
// attributes, `NAME:`, continuation lines, and it interpolated the name into a regex unescaped). The value is the directive's
// arguments with its continuation lines joined by one space ('' for a bare directive), or null when it is absent. Empty
// pieces (an attribute-only continuation) never join as a double space (#43). Read in the parser's legacy mode on purpose: a
// v0.5 file cannot carry a ` # ` the strict validator would not refuse (E_COMMENT), and the comment split no longer fires
// inside a double-quoted literal, so legacy and strict give the same value for any file that validates.
export const directive = (text, name) => {
  if (typeof name !== 'string' || !/^(?:[A-Z][A-Z0-9-]*|R[0-9]+)$/.test(name)) throw new Error(`not a directive name: ${JSON.stringify(name)}`);
  // an attribute-only keyword is never a directive the parser produces: asking for one is a mistake, not an absent value (#62)
  if (ATTR_ONLY.has(name)) throw new Error(`${name} is an attribute, never a directive: read it from a directive's attrs`);
  const d = get(parse(text).ast, name); return d ? [d.args, ...d.cont].filter(Boolean).join(' ') : null;
};

// A harness-BUILD failure that is the ENVIRONMENT's fault, never the artifact's: cargo refusing the verifier's own build
// copies (the build-copy artifact under .harness/<emit>/artifact/, and the generated harness crate beside it) because an
// ANCESTOR directory outside the lab's own tree declares an unrelated `[workspace]` — the kill_precedence round 1 scar,
// a consumer game repo's first out-of-tree run: a consumer repo's root Cargo.toml (`members = ["crates/*"]`) made every rust
// emission fail with "current package believes it's in a workspace when it's not" before a single rung ran, and the grade
// read it as a contract reject -> harden pointing at a divergence.json that never existed. A NARROW, explicit list of
// cargo's own wording for this failure mode — an artifact's own compile error (a type mismatch against the declared SIG)
// must never match here and must stay a contract reject, never a verifier-fault.
const CARGO_WORKSPACE_FAULT_PATTERNS = [/believes it's in a workspace when it's not/, /failed to load manifest for workspace member/, /could not find `Cargo\.toml`/];
export const isCargoEnvironmentFault = (errText) => typeof errText === 'string' && CARGO_WORKSPACE_FAULT_PATTERNS.some((re) => re.test(errText));
/** EVERY non-control artifact of a language rejected by the SAME recognizable cargo-environment error (never a mix with a
 *  real compile error, never a language where some artifact simply passed) is a HARNESS FAULT: the caller should record
 *  verifier-fault, not a contract reject -> harden. Takes the language's `artifacts` array as run.mjs/report.json shapes it. */
export function cargoEnvironmentFault(artifacts) {
  const errs = artifacts.filter((a) => !a.control).map((a) => a.error);
  return errs.length > 0 && errs.every(isCargoEnvironmentFault);
}
// The same failure mode for TypeScript (selfhost vector_set_sha, 2026-10-26; promoted from the lab, #163): a ts language file allowed
// `node:crypto`, every emission imported it, and every one failed `tsc --strict` because the VERIFIER had no Node type
// definitions — graded as a contract reject. tsc's own wording for a missing type environment ONLY: an artifact's real type error
// (TS2322 and friends) must never match here.
const TS_TYPES_ENV_FAULT_PATTERNS = [/error TS2591: Cannot find name '[^']+'\. Do you need to install type definitions for node\?/, /error TS2688: Cannot find type definition file for/];
export const isTsEnvironmentFault = (report) => typeof report === 'string' && TS_TYPES_ENV_FAULT_PATTERNS.some((re) => re.test(report));
/** Every non-control artifact of a language failed on a toolchain-ENVIRONMENT error (cargo workspace, missing TS type
 *  definitions) and on nothing else: a HARNESS FAULT, never a contract reject. */
export function toolchainEnvironmentFault(artifacts) {
  const rows = artifacts.filter((a) => !a.control); if (!rows.length) return false;
  return cargoEnvironmentFault(artifacts) || rows.every((a) => a.typeCheck && !a.typeCheck.ok && isTsEnvironmentFault(a.typeCheck.report));
}

/** The per-language divergence verdict run.mjs writes to runs/<lang>/divergence.json — "the SIR-ambiguity signal" plus the
 *  cold quorum, in the shape a HARDEN task consumes. `artifacts` is that language's res.artifacts array for THIS round, as
 *  run.mjs/report.json shapes it; CONTROL artifacts (emit_0, the shipped reconstruction) never enter the quorum.
 *  Returns null when there is NOTHING to report this round (no non-control artifact was even submitted — a pending pilot,
 *  or only a control shipped): the caller must leave any existing divergence.json alone rather than overwrite it.
 *  Otherwise ALWAYS returns a TRUTHFUL verdict for the non-control artifacts submitted this round, including the
 *  all-rejected case (quorum '0/0', never a number left over from an earlier round) — the kill_precedence round 2 scar:
 *  when every artifact of a language had `.error` (a harness build fault, e.g. cargoEnvironmentFault above), the caller
 *  used to `continue` past the whole computation before ever reaching the write, so divergence.json kept showing a PRIOR
 *  round's "3/3 quorum" while decision.json correctly recorded 0 kept, 3 rejected for the round actually being graded — a
 *  human (or an agent) reading divergence.json directly saw a lie. An artifact with `.error` (it never built or ran at
 *  all) counts toward the round but never toward `full` or the miss tally. */
export function divergenceOf(round, artifacts) {
  // Round 5 (selfhost divergence_of): an EMPTY error string is still an error (F4: `throw new Error()` recorded '' and the artifact
  // was counted as graded, passing every vector); a vote needs no miss as well as every rung (F1: two artifacts with the same
  // held-out miss voted quorum 2/2); each artifact counts ONCE per vector (F2: a repeated miss made passedBy negative); a miss's
  // slice is exactly frozen or heldout (F3: any other spelling vanished from both tallies); rungs is a list (F7: a text rungs
  // matched as a substring).
  const hasError = (a) => a.error !== undefined && a.error !== null;
  const attempted = artifacts.filter((a) => !a.control);
  if (!attempted.length) return null;
  const graded = attempted.filter((a) => !hasError(a));
  if (!graded.length) return { round, quorum: '0/0', verdict: 'no-quorum', heldoutDisagree: [] };
  for (const a of graded) {
    if (!Array.isArray(a.rungs)) throw new Error(`divergence: artifact ${a.artifact} has no rungs list`);
    for (const m of a._misses || []) if (m === null || typeof m !== 'object' || (m.slice !== undefined && m.slice !== null && m.slice !== 'frozen' && m.slice !== 'heldout')) throw new Error(`divergence: artifact ${a.artifact} has a miss with slice ${JSON.stringify(m?.slice)} (frozen or heldout)`);
  }
  const full = graded.filter((a) => a.rungs.includes('harness-verified') && (!a.typeCheck?.applicable || a.typeCheck.ok) && !(a._misses || []).length).length;   // a vote needs EVERY applicable rung and no miss: a ts artifact that fails its own checker does not count
  // A FROZEN miss is not a SIR-ambiguity signal: the emitter was SHOWN that vector's expected value (frozen.md) and got it
  // wrong anyway — an emitter error. Only held-out misses are points where the contract let two readings through, so only
  // they go in heldoutDisagree (what a HARDEN reads). Frozen misses are reported apart, never dropped (get_rgb round 2 scar:
  // a rust emitter's frozen v13 miss was listed as a held-out disagreement). A miss with no `slice` predates the tag: held-out.
  const tally = (slice) => {
    const byName = new Map();
    for (const a of graded) for (const m of (a._misses || [])) { if ((m.slice ?? 'heldout') !== slice) continue; const k = m.name; if (!byName.has(k)) byName.set(k, { name: k, args: m.args, expected: m.expected, failedBy: [] }); const v = byName.get(k); if (!v.failedBy.includes(a.artifact)) v.failedBy.push(a.artifact); }
    return [...byName.values()].map((v) => ({ ...v, passedBy: graded.length - v.failedBy.length, of: graded.length }));
  };
  const heldoutDisagree = tally('heldout'), frozenMissed = tally('frozen');
  return { round, quorum: `${full}/${graded.length}`, verdict: full >= 2 ? 'quorum' : 'no-quorum', heldoutDisagree, ...(frozenMissed.length ? { frozenMissed } : {}) };
}

/** A language file's binding, read through the PARSER (review-system selfhost, binding_of): the first PRIMARY-SHA256 directive,
 *  whose argument is exactly 64 lowercase hex digits, on its own line, with no continuation or attribute. The old line regex
 *  bound a hash written on the NEXT line (\s+ crossed the break), 65+ digits or a suffix (nothing ended the match), and lines the
 *  parser never sees as directives (^ under /m starts a line at U+2028; \s took NBSP and U+3000 as the separator). */
export const boundSha = (text) => { const d = get(parse(text).ast, 'PRIMARY-SHA256'); return d && !d.cont.length && !d.attrList.length && /^[0-9a-f]{64}$/.test(d.args) ? d.args : null; };
/** Parse a family: sir/<unit>.sir (PRIMARY) + sir/<unit>.<lang>.sir (per-language), with PRIMARY-SHA256 binding. */
export function family(sirDir, unit) {
  const primaryPath = join(sirDir, `${unit}.sir`);
  if (!existsSync(primaryPath)) throw new Error(`no primary: ${primaryPath}`);
  const primaryBytes = readFileSync(primaryPath);
  const primary = primaryBytes.toString('utf8');
  const primarySha = canonicalSha(primary);   // over canonicalText (a formatting-only normalization), never raw bytes
  const legacySha = legacyPrintSha(primary);  // the pre-2026-10-26 binding: recognized, reported, never written
  const langs = {}, errors = [], warnings = [];
  for (const f of readdirSync(sirDir).sort()) {
    const m = f.match(/^(.+?)\.([^.]+)\.sir$/);
    if (!m || m[1] !== unit) continue;
    const lang = m[2];
    if (!LANGS.has(lang)) { errors.push(`${f}: '${lang}' is not in the closed language registry ${[...LANGS].join(',')}`); continue; }
    const bytes = readFileSync(join(sirDir, f)); const text = bytes.toString('utf8');
    const bound = boundSha(text);
    const declared = directive(text, 'LANG');
    const legacyBinding = bound !== null && bound !== primarySha && bound === legacySha;
    const entry = { lang, path: join(sirDir, f), text, sha: sha256(bytes), bound, stale: bound !== primarySha && !legacyBinding, legacyBinding, declared };
    if (!bound) errors.push(`${f}: no PRIMARY-SHA256 binding`);
    // round 5 (selfhost legacy_print_sha): a legacy binding is an ERROR — the old hash cannot see comment lines, ` # ` tails, prose
    // before the first directive or an overwritten CITED, so an edit there after binding was reported as "legacy", never STALE
    else if (legacyBinding) errors.push(`${f}: LEGACY BINDING — bound to the pre-2026-10-26 print hash, which does not cover every character of the primary (an edit there after binding is invisible to it); re-bind it`);
    else if (entry.stale) errors.push(`${f}: STALE — bound to ${bound.slice(0, 12)}…, primary is ${primarySha.slice(0, 12)}… (declared, not a claim)`);
    if (declared !== lang) errors.push(`${f}: LANG ${declared} ≠ filename language ${lang}`);
    langs[lang] = entry;
  }
  return { unit, primaryPath, primary, primarySha, langs, errors, warnings, features: featuresOf(langs) };
}
/** A7: features detected mechanically — `lang-variant` ⇐ a <unit>.<lang>.sir exists. */
export function featuresOf(langs) { return detectFeatures({ sirFiles: Object.values(langs).map((e) => e.path) }); }

// ---------------------------------------------------------------------------------------------------------
// Lint 1 — TRANSCRIPTION (design move 6): code shapes in a PRIMARY. The deterministic floor; Jev Seam 2's
// dial Score is the calibrated version for the ambiguous middle.
const CODE_SHAPES = [
  [/\btypeof\b/, 'typeof'], [/=>/, 'arrow fn'], [/\.(match|reduce|slice|test|exec|split|map|filter)\(/, 'method call'],
  [/\b(parseInt|parseFloat|Number|String|Math)\s*[.(]/, 'JS builtin'], [/\bif\s*\(/, 'if ('], [/\breturn\b/, 'return'],
  [/\bfor\s+\w+\s+in\b|\bfor\s*\(|\bwhile\s*\(/, 'loop'], [/^\s*#?\s*(STEP|NODE|BRANCH|GATE)\s+[\w-]+/i, 'STEP/NODE/BRANCH narration'],
  [/\w\[\w+\]\s*(?:\*\*|<<|>>>?|&&|\|\||\?\?|[-+*\/%&|^])?=(?![=>])/, 'indexed assignment'], [/\/\^.*\$\/[a-z]*/, 'dialect regex literal'], [/\b(null|undefined)\b/, 'JS value name (say none)'],   // NaN / ±Infinity / -0 are IEEE-754 value names, not code shapes; indexed assignment includes the compound forms (`a[i] += 1`, `a[i] ||= x`), never `x[0] => y` (#68)
  [/[A-Za-z_]\w*\s*=\s*[^=\s].*;\s*$/, 'assignment statement'], [/\bgroup\d\b/, 'capture-group reference'],
];
export function transcriptionLint(primaryText) {
  // the parser's own lines (one reader: CR breaks, BOM marks); hit text cut at a code point (selfhost lint_transcription)
  const lines = sirLines(primaryText); const hits = [];
  lines.forEach((l, i) => { for (const [re, what] of CODE_SHAPES) if (re.test(stripQuoted(l))) hits.push({ line: i + 1, what, text: cut96(l.trim()) }); });
  const nonEmpty = lines.filter((l) => l.trim()).length;
  const commentLines = lines.filter((l) => l.trim().startsWith('#')).length;
  const hitLines = new Set(hits.map((h) => h.line)).size;
  return { hits, hitLines, lines: nonEmpty, commentLines, density: nonEmpty ? hitLines / nonEmpty : 0 };
}

// Lint 2 — LANGUAGE LEAK, both directions: dialect mechanism in a PRIMARY; behavior in a LANGUAGE file (rederive selfhost
// lint_leak, 2026-10-26). The language-file direction is STRUCTURAL — a directive whose register is P (BEHAVIOR, R<n>,
// INVARIANT, TABLE …) in a language file, read through the parser — so the register's own one-space `R1 …` and CR-only files
// can no longer slip past a line regex. The primary direction reads each directive's CONTENT (its arguments and continuation
// lines) — never its citations: a CITED / EARNED / ANCHOR value points at a source and may name it (ECMA-262 LineTerminator).
// Named, language-NEUTRAL standards (UTF-8, UTF-16, U+XXXX code points, SHA-256, IEEE-754) are contract, not leaks. A quoted
// string is DATA and stays exempt: units whose outputs or patterns are code-like text (a JSON escape table, a lint's own
// shape list) must be able to quote them — a code fragment smuggled into quotes is review's to catch, not a lexical floor's.
const DIALECT = [
  [/\/\^.*\$\/[gimsuy]*/, 'anchored regex literal'], [/\\[wsdWSDbB]\b/, 'regex class escape'], [/\\p\{/, 'regex property escape'],
  [/\b(?:Math\.\w+|String\.prototype|parseInt|parseFloat|BigInt)\b|\b(?:Number|String|Boolean|BigInt)\(|(?:\.|\b)(?:toLowerCase|toUpperCase|charCodeAt|codePointAt|localeCompare|normalize|padStart|padEnd)\(/, 'JS API name'],
  [/\b(?:JSON|Object|Array|Reflect|Symbol|Intl|Number|String|BigInt|Boolean|Date|RegExp|Promise)\.[A-Za-z]\w*/, 'JS API name'],   // a member, either case (Number.isFinite, String.fromCharCode, Object.Keys); a sentence's "a String." has no member
  [/\bfancy[-_]regex\b|\b(?:f64|u8|u64|i64|usize|String|Vec|char|str|Box|HashMap|BTreeMap)::|\bOption<|\bVec<|&str\b|\bto_lowercase\b/, 'Rust API name'],
  [/\b(?:new)?line[- ]?terminator/i, 'line-terminator mechanism'], [/\b(null|undefined)\b/, 'JS value name (say none)'],   // NaN / ±Infinity / -0 are IEEE-754 value names, not leaks
];
// A quoted string literal is DATA, not code: a unit whose RESULT is the text "null" (kind_of) must be able to say so inline.
// (Scar: the blind kind_of decomposer had to PIN "null"/"undefined" because this lint rejected them as JS value names.)
// The parser's quoted spans (#59 #60): one rule with the comment split and the attribute split.
export const stripQuoted = (l) => { let out = '', at = 0; for (const [a, b] of quotedSpans(l)) { out += l.slice(at, a) + '""'; at = b; } return out + l.slice(at); };
// Hit text is the PHYSICAL line, cut at a code point; one hit per (line, kind). Both directions read the parser's own lines.
const cut96 = (x) => Array.from(x).slice(0, 96).join('');
export function leakLint(text, { isPrimary }) {
  const hits = []; const seen = new Set();
  const hit = (line, what, raw) => { const k = `${line}\0${what}`; if (!seen.has(k)) { seen.add(k); hits.push({ line, what, text: cut96(raw.replace(/^[ \t]+/, '')) }); } };
  const lines = sirLines(text);
  // the PRIMARY direction (#42): every physical line — text before the first directive included — read with the parser's own
  // tokens (comment marker, attribute groups, the directive name); a leak is reported on the line that carries it. Comment text
  // counts (in a legacy primary the leaks live in `#` comments, W.0a); citation values do not (they name their sources).
  if (isPrimary) lines.forEach((raw, i) => {
    const indent = raw.match(/^[ \t]*/)[0]; const content = raw.slice(indent.length); if (!content) return;
    let segs;
    if (content.startsWith('#')) segs = [content.replace(/^#+/, '')];
    else {
      let [code, comment] = splitTrailingComment(content);
      if (!indent) { const sp = code.search(/[ \t]/); const name = (sp < 0 ? code : code.slice(0, sp)).replace(/:$/, ''); if (isDirectiveName(name) && !ATTR_ONLY.has(name)) code = sp < 0 ? '' : code.slice(sp); }   // the name is grammar, not content
      segs = [splitAttributes(' ' + code).body, ...(comment !== null ? [comment] : [])];
    }
    for (const seg of segs) { const c = stripQuoted(seg); for (const [re, what] of DIALECT) if (re.test(c)) hit(i + 1, what, raw); }
  });
  // the LANGUAGE-FILE direction is structural: a register-P directive (BEHAVIOR, R<n>, INVARIANT, TABLE …) — at column 0, or
  // glued to its text by a non-space/tab whitespace (`BEHAVIOR\u00a0x`, which the parser reports and does not take as a
  // directive). A continuation opening with `R<n>` is NOT flagged: real language files name the rule a MECHANISM implements
  // (`R4 compares the BigInts with !== and >`), and lexically that is the same shape as a rule wrapped into prose (#42 r3).
  else {
    for (const d of parse(text).ast) if (d.register === 'P') hit(d.line, 'behavior in a language file', lines[d.line - 1]);
    lines.forEach((raw, i) => {
      if (/^[ \t]/.test(raw)) return; const lead = raw.match(INVISIBLE_LEAD)?.[0] ?? ''; const g = glued(raw.slice(lead.length).split(/[ \t]/)[0]) ?? (lead ? raw.slice(lead.length).match(/^(?:[A-Z][A-Z0-9-]*|R\d+)/)?.[0] : null);   // the parser's glued() (#61) and its invisible lead (#107)
      if (g && (DIRECTIVES[g] ?? (/^R\d+$/.test(g) ? 'P:lb' : '')).startsWith('P:')) hit(i + 1, 'behavior in a language file', raw);
    });
    hits.sort((x, y) => x.line - y.line);
  }
  return { hits };
}

// Lint 3 — NO PIN WITHOUT A CITATION: every PINNED / EARNED directive names what earned it. Read through the PARSER (round 5,
// selfhost pin_lint: the raw-line reader passed `PINNED x = 1 # not cited`, `PINNED x = "cited"`, a CR-only file, an empty CITED,
// and refused a v0.5 pin whose CITED sits on its continuation line). A citation is a CITED / EARNED / ANCHOR attribute with a
// value; an EARNED directive's own arguments name the round that earned it (the schema's `EARNED round-<n> heldout <vector>`).
// ONE citation rule for lint 3 and the validator's E_UNCITED_PIN (round 5b, #104: the validator refused the schema's own
// `EARNED round-2 heldout v3`, an EARNED continuation line did not count, and a value of only NBSP or `""` cited): a citation is
// a CITED / EARNED / ANCHOR value — or an EARNED directive's own text, continuation lines included — with something VISIBLE in it.
const visible = (v) => typeof v === 'string' && /[^\s\p{Cf}"']/u.test(v);
export const pinCited = (d) => d.attrList.some(([, v]) => visible(v)) || (d.name === 'EARNED' && [d.args, ...d.cont].some(visible));
export function pinLint(text) {
  const { ast } = parse(text); const lines = sirLines(text); const hits = []; let pins = 0;
  for (const d of ast) {
    if (d.name !== 'PINNED' && d.name !== 'EARNED') continue;
    pins++;
    const cited = pinCited(d);   // a `# … cited …` comment is never a citation (`# not cited` passed)
    if (!cited) hits.push({ line: d.line, what: 'pin without a citation', text: cut96(lines[d.line - 1].replace(/^[ \t]+/, '')) });
  }
  return { hits, pins };
}

/** Full lint of a family: returns { ok, report } — the pack-time gate of Phase 4, run in the lab. */
export function lintFamily(fam, { maxDensity = 0.10 } = {}) {
  const t = transcriptionLint(fam.primary);
  const leakP = leakLint(fam.primary, { isPrimary: true });
  const pinP = pinLint(fam.primary);
  const per = {};
  for (const [lang, e] of Object.entries(fam.langs)) per[lang] = { leak: leakLint(e.text, { isPrimary: false }), pin: pinLint(e.text), stale: e.stale };
  let decl = null, declErr = null; try { decl = carriedDeclared(fam.primary); } catch (e) { declErr = e.message; }   // a malformed CARRIED block is a reported problem, never a crash
  const schemaHits = [...schemaLint(fam.primary, decl?.name).hits.map((h) => ({ ...h, where: 'primary' })),
    ...Object.entries(fam.langs).flatMap(([lang, e]) => schemaLint(e.text, decl?.name).hits.map((h) => ({ ...h, where: lang })))];
  const problems = [
    ...fam.errors,
    ...(declErr ? [`primary: carried data: ${declErr}`] : []),
    ...schemaHits.map((h) => `${h.where}:${h.line} ${h.what}: ${h.text}`),
    ...(t.density > maxDensity ? [`primary: transcription density ${(t.density * 100).toFixed(0)}% > ${maxDensity * 100}% (${t.hitLines} code-shaped lines)`] : []),
    ...leakP.hits.map((h) => `primary:${h.line} language leak — ${h.what}: ${h.text}`),
    ...pinP.hits.map((h) => `primary:${h.line} ${h.what}: ${h.text}`),
    ...Object.entries(per).flatMap(([lang, r]) => [
      ...r.leak.hits.map((h) => `${lang}:${h.line} ${h.what}: ${h.text}`),
      ...r.pin.hits.map((h) => `${lang}:${h.line} ${h.what}: ${h.text}`),
    ]),
  ];
  return { ok: problems.length === 0, problems, transcription: t, leakPrimary: leakP, pinsPrimary: pinP, per, features: fam.features, carried: decl };
}

// ---------------------------------------------------------------------------------------------------------
// CARRIED DATA (§18) with the v0.5 split: the PRIMARY declares the data's identity — abstract SHAPE, a
// CANONICAL-SHA256 over a language-neutral form (sorted-key compact JSON), and AUTHORITY assertions against a
// published standard; each LANGUAGE FILE declares only its binding (`CARRIED <name> = <module> (...)`). The
// harness verifies every language's bound table hashes to the same canonical form and satisfies the authority.
// Read through the PARSER (round 5, selfhost carried_declared): the block is the CARRIED directive and ITS continuation lines,
// never the rest of the file (the raw-text reader took the ORACLE's CANONICAL-SHA256, a NOTE's, or a second table's AUTHORITY as
// this table's own); a malformed hash, SHAPE or AUTHORITY line is REFUSED, never skipped (an uppercase hash turned the hash check
// off; reversed AUTHORITY fields dropped the assertion; an object `equals` crashed lint with a raw SyntaxError); an `equals`
// integer JSON cannot hold exactly throws (#51's assertion side). One CARRIED per primary.
export function carriedDeclared(primaryText) {
  const ast = parse(primaryText).ast; const all = ast.filter((d) => d.name === 'CARRIED'); if (!all.length) return null;
  // a sub-field that lost its indent is its own directive to the parser: refuse it, never drop it (round 5b, #116)
  const stray = ast.find((d) => ['CANONICAL-SHA256', 'SHAPE', 'AUTHORITY'].includes(d.name)); if (stray) throw new Error(`CARRIED: ${stray.name} at line ${stray.line} is not indented under CARRIED`);
  if (all.length > 1) throw new Error(`one CARRIED table per primary (lines ${all.map((d) => d.line).join(', ')})`);
  const d = all[0]; const head = d.args.match(/^([A-Za-z_][A-Za-z0-9_]*)[ \t]+FROM[ \t]+(.+)$/);
  if (!head) throw new Error(`CARRIED must read \`CARRIED <name> FROM <source>\` (line ${d.line})`);
  let sha = null, shape = null; const assertions = [];
  const trimWS = (x) => x.replace(/^[ \t]+|[ \t]+$/g, '');
  for (const c of d.cont) {
    if (!/^(?:CANONICAL-SHA256|SHAPE|AUTHORITY)(?![A-Z0-9-])/.test(c)) continue;   // a prose continuation
    // a sub-field keyword in any other spelling (`CANONICAL-SHA256:`, NBSP after it, `AUTHORITY{`) is refused, never read as prose (#116)
    const k = c.match(/^(CANONICAL-SHA256|SHAPE|AUTHORITY)(?:[ \t]+([^]*))?$/); if (!k) throw new Error(`CARRIED: a malformed sub-field line ${JSON.stringify(c.slice(0, 60))} (the keyword, a space or tab, then its value)`);
    const v = k[2] ?? '';
    if (k[1] === 'CANONICAL-SHA256') { if (sha !== null) throw new Error('CARRIED: two CANONICAL-SHA256 lines'); if (!/^[0-9a-f]{64}$/.test(v)) throw new Error(`CARRIED: CANONICAL-SHA256 must be 64 lowercase hex (got ${JSON.stringify(v)})`); sha = v; }
    else if (k[1] === 'SHAPE') { if (shape !== null) throw new Error('CARRIED: two SHAPE lines'); if (!trimWS(v)) throw new Error('CARRIED: an empty SHAPE'); shape = trimWS(v); }
    else {
      const a = v.match(/^\{[ \t]*expr:[ \t]*("(?:\\[^]|[^"\\])*")[ \t]*,[ \t]*equals:[ \t]*([^]+?)[ \t]*\}$/);
      if (!a) throw new Error(`CARRIED: AUTHORITY must read { expr: "<key>", equals: <json> } (got ${JSON.stringify(v.slice(0, 60))})`);
      let expr, equals; try { expr = JSON.parse(a[1]); equals = JSON.parse(a[2]); } catch (e) { throw new Error(`CARRIED: AUTHORITY ${JSON.stringify(v.slice(0, 60))} is not JSON: ${e.message}`); }
      const lits = a[2].replace(/"(?:\\.|[^"\\])*"/g, '""').match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) ?? [];
      // a numeral past 2^53 (in any spelling) or one that underflows to zero has no exact JSON number (#116)
      for (const n of lits) { const x = Number(n); if (!Number.isFinite(x) || Math.abs(x) > 2 ** 53 || (x === 0 && /[1-9]/.test(n.replace(/[eE].*$/, ''))) || (/^-?\d+$/.test(n) && BigInt(n) !== BigInt(x))) throw new Error(`CARRIED: AUTHORITY equals ${n} has no exact JSON number`); }
      if (!/[^\s\p{Cf}]/u.test(expr)) throw new Error('CARRIED: AUTHORITY expr is empty');
      assertions.push({ expr, equals });
    }
  }
  return { name: head[1], from: trimWS(head[2]), sha, shape, assertions };
}
export function carriedBinding(langText) { const m = langText.match(/^CARRIED\s+(\w+)\s*=\s*(\S+)/m); return m ? { name: m[1], module: m[2] } : null; }
/** Read a language's bound table as the same plain object the js module yields, so `canonical` hashes both identically.
 *  `decl` (optional) is the primary's carriedDeclared() result or its SHAPE string: when given, every Rust entry is checked
 *  against the declared value type and a misfit is an explanatory Error — never a silently different (or empty) table. */
export function carriedTable(lang, filePath, decl = null) {
  const src = readFileSync(filePath, 'utf8');
  if (lang === 'rust') return rustCarriedTable(src, filePath, typeof decl === 'string' ? decl : decl?.shape ?? null);
  return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1));   // js / ts: `export default {...}`
}
// ---- Rust carried tables: shape-driven and syntax-tolerant (scar: the v1 reader matched only ("name", [n, n, n]) tuples, so
// slugify's 738-entry text -> text table parsed to {} and every Rust file failed E_CARRIED_HASH_MISMATCH with nothing said).
// Entries are (string-literal key, value) pairs found in the token stream: `("k", v)` tuples first (&[…], [(…); N], vec![…],
// HashMap::from([…])), then `"k" => v` arms (phf_map! / match) as the fallback. A value is a string, char, number, bool, or a
// bracketed / parenthesized sequence of those. Comments and every string form (escapes, \u{…}, r#"…"#) are handled by the tokenizer.
const RUST_CHAR = /^'(?:\\(?:u\{[0-9a-fA-F_]{1,8}\}|x[0-9a-fA-F]{2}|[nrt0\\'"])|[^'\\])'/u;
const RUST_NUM = /^(?:0x[0-9a-fA-F_]+|0o[0-7_]+|0b[01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d[\d_]*)?)(?:_?(?:[ui](?:8|16|32|64|128|size)|f32|f64))?/;
// an integer literal past 2^53 has no exact JSON number: it THROWS rather than round (#51: u64::MAX read as u64::MAX-1, so two tables hashed alike)
// round 5: EXACTNESS is judged per entry value, not for every literal in the file (a const MAX: u64 = u64::MAX elsewhere made the
// whole table unreadable), and exactly: an integer literal whose double is not the literal (2^53 + 1) is inexact, 2^53 is not
const rustNumber = (lit) => { const s = lit.replace(/_/g, ''); const body = s.replace(/^0x/.test(s) ? /[ui](?:8|16|32|64|128|size)$/ : /(?:[ui](?:8|16|32|64|128|size)|f32|f64)$/, ''); const n = Number(body);
  const inexact = /^(?:0x[0-9a-fA-F]+|0o[0-7]+|0b[01]+|\d+)$/.test(body) ? !Number.isFinite(n) || BigInt(body) !== BigInt(n) : !Number.isFinite(n);
  // an f32 literal is the binary32 value rustc stores (#121: 0.1f32 read as the f64 0.1); inexact when that is not the literal
  if (/f32$/.test(s) && !/^0x/.test(s)) { const f = Math.fround(n); return { n: f, inexact: inexact || f !== n }; }
  return { n, inexact }; };   // Number() reads 0x / 0o / 0b; a hex literal has no f-suffix (0x1f64 IS hex)
function rustUnescape(s, file, at) {   // the body of a "…" literal (or a char literal) → its text
  let out = ''; for (let j = 0; j < s.length;) {
    const c = s[j]; if (c !== '\\') { out += c; j++; continue; }
    const d = s[j + 1];
    if (d === 'n') { out += '\n'; j += 2; } else if (d === 'r') { out += '\r'; j += 2; } else if (d === 't') { out += '\t'; j += 2; } else if (d === '0') { out += '\0'; j += 2; }
    else if (d === '\\' || d === '"' || d === "'") { out += d; j += 2; }
    else if (d === 'x') { out += String.fromCharCode(parseInt(s.slice(j + 2, j + 4), 16)); j += 4; }
    else if (d === 'u' && s[j + 2] === '{') { const e = s.indexOf('}', j + 3); const cp = parseInt(s.slice(j + 3, e).replace(/_/g, ''), 16); if (e < 0 || !Number.isFinite(cp)) throw new Error(`${file}:${at} bad \\u{…} escape in string literal`); out += String.fromCodePoint(cp); j = e + 1; }
    else if (d === '\n' || d === '\r') { j += 2; while (j < s.length && /[ \t\r\n]/.test(s[j])) j++; }   // line continuation
    else throw new Error(`${file}:${at} unknown escape \\${d} in string literal`);
  }
  return out;
}
export function rustTokens(src, file = 'rust') {   // → [{ t: str|chr|num|bool|id|p, v, line }], comments and whitespace dropped
  const toks = []; const n = src.length; let i = 0, line = 1;
  const push = (t, v) => toks.push({ t, v, line });
  const advance = (to) => { for (let k = i; k < to; k++) if (src[k] === '\n') line++; i = to; };
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { advance(i + 1); continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); advance(e < 0 ? n : e); continue; }
    if (c === '/' && src[i + 1] === '*') { let d = 1, j = i + 2; while (j < n && d) { if (src.startsWith('/*', j)) { d++; j += 2; } else if (src.startsWith('*/', j)) { d--; j += 2; } else j++; } advance(j); continue; }
    const raw = /^b?r(#*)"/.exec(src.slice(i, i + 32));
    if (raw) { const start = i + raw[0].length, close = '"' + raw[1], e = src.indexOf(close, start); if (e < 0) throw new Error(`${file}:${line} unterminated raw string`); push('str', src.slice(start, e)); advance(e + close.length); continue; }
    if (c === '"' || (c === 'b' && src[i + 1] === '"')) {
      let j = i + (c === 'b' ? 2 : 1); const start = j;
      while (j < n && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
      if (j >= n) throw new Error(`${file}:${line} unterminated string literal`);
      push('str', rustUnescape(src.slice(start, j), file, line)); advance(j + 1); continue;
    }
    if (c === "'") { const m = RUST_CHAR.exec(src.slice(i, i + 16)); if (m) { push('chr', rustUnescape(m[0].slice(1, -1), file, line)); advance(i + m[0].length); } else { push('p', "'"); advance(i + 1); } continue; }
    if (c >= '0' && c <= '9') { const m = RUST_NUM.exec(src.slice(i, i + 64)); const r = rustNumber(m[0]); toks.push({ t: 'num', v: r.n, inexact: r.inexact, lit: m[0], line }); advance(i + m[0].length); continue; }
    if (/[A-Za-z_]/.test(c)) { let j = i + 1; while (j < n && /[A-Za-z0-9_]/.test(src[j])) j++; const w = src.slice(i, j); if (w === 'true' || w === 'false') push('bool', w === 'true'); else push('id', w); advance(j); continue; }
    const two = src.slice(i, i + 2); if (two === '=>' || two === '->' || two === '::' || two === '..') { push('p', two); advance(i + 2); continue; }
    push('p', c); advance(i + 1);
  }
  return toks;
}
const isP = (t, v) => t?.t === 'p' && t.v === v;
// a cast is APPLIED when it keeps the value and REFUSED when it would change it (round 5: the old reader skipped every cast, so
// `255 as i8` read 255 where rustc gives -1, and `1.9 as u8` read 1.9 where rustc gives 1)
const INT_RANGE = { u8: [0, 255], u16: [0, 65535], u32: [0, 4294967295], i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647] };
const castOf = (toks, i, v) => {
  if (!(toks[i]?.t === 'id' && toks[i].v === 'as')) return { v, next: i };
  const ty = toks[i + 1]?.t === 'id' ? toks[i + 1].v : null; const where = `rust carried table: line ${toks[i].line}: \`${v} as ${ty}\``;
  if (ty === 'f64' || ty === 'f32') { if (ty === 'f32' && Math.fround(v) !== v) throw new Error(`${where} changes the value`); return { v, next: i + 2 }; }
  const r = INT_RANGE[ty] ?? (/^(?:u64|usize|u128)$/.test(ty) ? [0, 2 ** 53] : /^(?:i64|isize|i128)$/.test(ty) ? [-(2 ** 53), 2 ** 53] : null);   // #121: exactness reaches 2^53
  if (!r) throw new Error(`${where} is not a numeric cast this reader applies`);
  if (!Number.isInteger(v) || v < r[0] || v > r[1]) throw new Error(`${where} changes the value — write the value itself`);
  return { v: v === 0 ? 0 : v, next: i + 2 };   // an integer has no -0 (#121)
};
const exact = (t) => { if (t.inexact) throw new Error(`rust carried table: line ${t.line}: ${t.lit} has no exact JSON number`); return t.v; };
function rustValue(toks, i) {   // → { v, next } | null — a table VALUE starting at token i
  const t = toks[i]; if (!t) return null;
  if (isP(t, '&')) return rustValue(toks, i + 1);
  if (t.t === 'str' || t.t === 'chr' || t.t === 'bool') return { v: t.v, next: i + 1 };
  if (t.t === 'num') return castOf(toks, i + 1, exact(t));
  if (isP(t, '-') && toks[i + 1]?.t === 'num') return castOf(toks, i + 2, -exact(toks[i + 1]));
  if (t.t === 'id' && t.v === 'None') return { v: null, next: i + 1 };   // an Option entry is the value or none — Some(1) and 1 are one value, None is none (it used to be dropped)
  if (t.t === 'id' && t.v === 'Some' && isP(toks[i + 1], '(')) { if (toks[i + 2]?.t === 'id' && (toks[i + 2].v === 'Some' || toks[i + 2].v === 'None')) throw new Error(`rust carried table: line ${t.line}: a nested Option is not read (Some(None) and None are one json value)`);
    const r = rustValue(toks, i + 2); return r && isP(toks[r.next], ')') ? { v: r.v, next: r.next + 1 } : null; }
  if (isP(t, '[') || isP(t, '(')) {
    const close = t.v === '[' ? ']' : ')'; const items = []; let j = i + 1, comma = false;
    for (;;) {
      if (isP(toks[j], close)) { j++; break; }
      const r = rustValue(toks, j); if (!r) return null; items.push(r.v); j = r.next;
      if (isP(toks[j], ',')) { comma = true; j++; } else if (!isP(toks[j], close)) return null;
    }
    return { v: t.v === '(' && items.length === 1 && !comma ? items[0] : items, next: j };   // `(x)` is x; `(x,)` a 1-tuple
  }
  return null;
}
export function rustEntries(toks) {   // → { entries: [[key, value, line]…], form: 'tuple' | 'match-arm' }
  const tuples = [], arms = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (isP(t, '(') && toks[i + 1]?.t === 'str' && isP(toks[i + 2], ',')) {
      const r = rustValue(toks, i + 3); if (r && isP(toks[r.next], ')')) { tuples.push([toks[i + 1].v, r.v, toks[i + 1].line]); i = r.next; continue; }
      if (!r) throw new Error(`rust carried table: line ${toks[i + 1].line}: the value of entry ${JSON.stringify(toks[i + 1].v)} is not one this reader reads — it would be dropped (#121)`);
    }
    if (t.t === 'str' && isP(toks[i + 1], '|') && toks[i + 2]?.t === 'str') throw new Error(`rust carried table: line ${t.line}: an or-pattern arm ("a" | "b" => v) is not read — one key per arm`);
    if (t.t === 'str' && isP(toks[i + 1], '=>')) {
      const r = rustValue(toks, i + 2); if (r && (isP(toks[r.next], ',') || isP(toks[r.next], '}'))) { arms.push([t.v, r.v, t.line]); i = r.next - 1; continue; }
      throw new Error(`rust carried table: line ${t.line}: the arm ${JSON.stringify(t.v)} => … has a value this reader does not read — it would be dropped (#121)`);
    }
  }
  return tuples.length ? { entries: tuples, form: 'tuple' } : { entries: arms, form: 'match-arm' };
}
/** The CARRIED SHAPE's leading type expression as a canon.mjs type — the same normalization drivers/ts.mjs applies: `map K -> V`
 *  is the arrow spelling of map[K, V]; fixed-width integers are the canonical integer kinds (u8/u16/u32 → u64, i8/i16/i32 → i64). */
// Round 5 (selfhost carried_shape_type): one whitespace rule (space / tab — the JS trim read NBSP and U+3000 as separators the
// type grammar refuses), and the width rewrite touches TYPE tokens only (it renamed a record field named `u8`).
export function carriedShapeType(shape) {
  // round 5b (#103): the rewrites read the TYPE GRAMMAR's whitespace — space, tab, CR, LF — so a newline beside a width token or
  // after `map` reads as it does everywhere else in the type
  const WS = '[ \\t\\r\\n]';
  const trim = (s) => s.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
  const norm = (s) => { s = trim(s); const m = s.match(new RegExp(`^map${WS}+(.+?)${WS}*->${WS}*(.+)$`, 's')); return m ? `map[${norm(m[1])}, ${norm(m[2])}]` : s; };
  const width = (s) => s.replace(new RegExp(`(^|[[,|:]${WS}*)([ui])(8|16|32)(?=${WS}*(?:[\\],|]|$))`, 'g'), (_, pre, sign) => `${pre}${sign}64`);
  return parseType(width(norm(shape.split(';')[0])));
}
const typeText = (t) => t.k === 'union' ? t.alts.map(typeText).join(' | ') : t.k === 'tuple' ? `tuple[${t.items.map(typeText).join(', ')}]` : t.k === 'list' ? `list[${typeText(t.item)}]` : t.k === 'map' ? `map[${typeText(t.key)}, ${typeText(t.val)}]` : t.k === 'record' ? `record[${t.fields.map(([n, f]) => `${n}: ${typeText(f)}`).join(', ')}]` : t.k;
export function rustCarriedTable(src, file, shape = null) {
  const { entries, form } = rustEntries(rustTokens(src, file));
  if (!entries.length) throw new Error(`${file}: no carried entries found — expected a Rust table of ("key", value) tuples (&[(k, v), …], [(k, v); N], vec![…], HashMap::from([…])) or "key" => value arms (phf_map! / match); string-literal keys, values a string / number / bool or a [..] / (..) of those`);
  let type = null; if (shape) { type = carriedShapeType(shape); if (type.k !== 'map') throw new Error(`${file}: declared SHAPE '${shape.split(';')[0].trim()}' is not a map — a Rust (key, value) table can only realize map[K, V]`); }
  const table = {};
  for (const [k, v, line] of entries) {
    if (type) {
      try { encode(k, type.key); } catch (e) { throw new Error(`${file}:${line} key ${JSON.stringify(k)} does not fit the declared SHAPE key type ${typeText(type.key)}: ${e.message}`); }
      try { encode(v, type.val); } catch (e) { throw new Error(`${file}:${line} entry ${JSON.stringify(k)} has value ${JSON.stringify(v)} which does not fit the declared SHAPE value type ${typeText(type.val)}: ${e.message} (${form} form, ${entries.length} entries parsed)`); }
    }
    // an OWN key (round 5: `k in table` read Object.prototype, so `constructor` / `toString` keys threw "duplicate"), and -0 ≠ 0
    const same = (x, y) => Object.is(x, y) || (typeof x === 'object' && x !== null && JSON.stringify(x) === JSON.stringify(y));
    if (Object.hasOwn(table, k) && !same(table[k], v)) throw new Error(`${file}:${line} duplicate key ${JSON.stringify(k)} with a different value (${JSON.stringify(table[k])} then ${JSON.stringify(v)}) — the table is ambiguous`);
    Object.defineProperty(table, k, { value: v, enumerable: true, writable: true, configurable: true });
  }
  return table;
}
// The canonical form a CARRIED table hashes to: compact JSON with keys sorted by UTF-16 code units at EVERY depth, written
// directly (never through a JS object, whose integer-like keys "9" < "10" jump any sort). The table is a map; numbers are
// finite and not -0 (JSON cannot tell them apart); no undefined. Before 2026-10-26 only the top level was sorted, so one
// table had two hashes (selfhost carried_canonical) — the two declared tables (get_rgb, slugify) are flat and hash the same.
const plainMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x) === Object.prototype || Object.getPrototypeOf(x) === null);
export function canonical(t) {
  if (!plainMap(t)) throw new Error('a carried table is a map');
  return canonicalValue(t);
}
/** The same canonical form for ANY json value (an AUTHORITY `equals` and the entry it is compared with). */
export function canonicalValue(t) {
  const w = (x) => {
    if (typeof x === 'string' || typeof x === 'boolean' || x === null) return JSON.stringify(x);
    if (typeof x === 'number') { if (!Number.isFinite(x) || Object.is(x, -0)) throw new Error(`carried table: ${Object.is(x, -0) ? '-0' : String(x)} has no JSON form`); return JSON.stringify(x); }
    if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) if (!(i in x)) throw new Error('carried table: an array hole'); return '[' + x.map(w).join(',') + ']'; }
    if (plainMap(x)) return '{' + Object.keys(x).sort().map((k) => JSON.stringify(k) + ':' + w(x[k])).join(',') + '}';
    throw new Error(`carried table: ${x === undefined ? 'undefined' : typeof x} is not a JSON value`);
  };
  return w(t);
}
// Round 5 (selfhost check_carried): no hash pin is UNPINNED, never "skip the hash" (an invalid or missing pin left the status to
// the assertions alone); an assertion reads an OWN key (`__proto__` read Object.prototype and attested every table) and needs an
// `equals`; values compare in the canonical form (sorted keys at every depth; JSON.stringify failed a reordered map and matched
// NaN to null); `attested` holds only when the hash matched too.
export function checkCarried(decl, table) {
  // round 5b (#108): one refusal rule with carriedDeclared — a declaration is { sha: pin | none, assertions: list }; a PRESENT pin
  // that is not 64 lowercase hex throws (it read as "unpinned"); an assertion's expr is non-empty text and its equals has a canonical
  // form (an equals of -0 / NaN failed quietly); a result is exactly { expr, equals, got, ok } (extra fields leaked through)
  if (decl === null || typeof decl !== 'object' || !Array.isArray(decl.assertions)) throw new Error('carried: a declaration is { sha, assertions: [...] }');
  if (decl.sha !== undefined && decl.sha !== null && !(typeof decl.sha === 'string' && /^[0-9a-f]{64}$/.test(decl.sha))) throw new Error(`carried: sha must be 64 lowercase hex (got ${JSON.stringify(decl.sha)})`);
  const sha = sha256(Buffer.from(canonical(table)));
  const hashOk = typeof decl.sha === 'string' ? sha === decl.sha : null;
  const results = decl.assertions.map((a) => {
    if (a === null || typeof a !== 'object' || typeof a.expr !== 'string' || !a.expr || !Object.hasOwn(a, 'equals')) throw new Error(`carried: an assertion is { expr: <non-empty text>, equals: <json> } (got ${JSON.stringify(a)})`);
    const want = canonicalValue(a.equals);   // throws when equals has no canonical form
    const has = a.expr === 'count' || Object.hasOwn(table, a.expr); const got = a.expr === 'count' ? Object.keys(table).length : has ? table[a.expr] : undefined;
    let ok = false; if (has) { try { ok = canonicalValue(got) === want; } catch { ok = false; } }
    return { expr: a.expr, equals: a.equals, got, ok };
  });
  const attested = hashOk === true && decl.assertions.length > 0 && results.every((r) => r.ok);
  const status = hashOk === null ? 'unpinned' : !hashOk ? 'hash-mismatch' : !decl.assertions.length ? 'unattested' : attested ? 'attested' : 'authority-FAIL';
  return { sha, hashOk, results, attested, status, entries: Object.keys(table).length };
}
/** Lint 4 — carried data must be declared with CARRIED, never smuggled under DEPENDS-ON (Lane's catch, 2026-09-22). */
// Read through the PARSER (round 5, selfhost schema_lint): a DEPENDS-ON directive's own arguments and continuation lines (the raw
// reader missed CR-only files and every indented v0.5 continuation, let any `none` on the line disable the name test, and built
// a RegExp from the carried name unescaped). Smuggled carried data = the word `carried` (any case) or the carried name as a whole
// word, outside quotes; `DEPENDS-ON none` alone is clean. Citations name sources and are not read.
export function schemaLint(text, carriedName) {
  // round 5b (#109): a smuggling lint OVER-reads — every part of a DEPENDS-ON directive: its arguments, continuations, attribute
  // values, comments and quoted text (the round-5 rewrite skipped all four, so `DEPENDS-ON none # carried table` and
  // `DEPENDS-ON "colorNames, carried"` passed). `carried` is a word (not miscarried); a table named `none` gets no name test (it
  // cannot be told from "no dependency").
  const lines = sirLines(text); const hits = [];
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameRe = carriedName && carriedName !== 'none' ? new RegExp(`(?<![A-Za-z0-9_])${esc(carriedName)}(?![A-Za-z0-9_])`) : null;
  for (const d of parse(text).ast) {
    if (d.name !== 'DEPENDS-ON') continue;
    const content = [d.args, ...d.cont, ...d.attrList.map(([, v]) => v), ...d.comments].join(' ');
    if (/(?<![A-Za-z])carried(?![A-Za-z])/i.test(content) || (nameRe && nameRe.test(content)))
      hits.push({ line: d.line, what: 'carried data declared under DEPENDS-ON — use CARRIED (§18)', text: cut96(lines[d.line - 1].replace(/^[ \t]+/, '')) });
  }
  return { hits };
}
