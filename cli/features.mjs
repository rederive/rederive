// The ONE feature detector (SIR_V05_PLAN W.0c). Before this file there were two that never met:
// sir-factory's `pack.featuresFor` saw only the v0.2/v0.3 features (carried-data / envelope / trace-seam) and
// sir-toolkit's `payload.featuresOfSir` saw only the v0.4 ones (PAR / RING / lifecycle / scheduler). So the
// factory could not stamp a v0.4 bundle: a unit using PAR packed with no `par-interleaving` in `features`, and an
// under-stamped feature is a silently skipped gate (A6). Every consumer — rdv, pack, payload — calls THIS.
//
// Plain .mjs on purpose: rdv bundles it through esbuild, sir-factory imports it with no build step. The JSON is a
// static import, not a runtime read: rdv ships as a CJS bundle where import.meta.url is empty, so the model is
// compiled into dist/cli.cjs from this exact file — there is no second copy for it to drift from.
import capabilities from './capabilities.json' with { type: 'json' };
import { parse, sirLines, quotedSpans, splitAttributes } from './sir/sir-parse.mjs';

/** The capability model (the single source of truth). */
export { capabilities };

/** Features the verifier can CHECK. A claim about rdv, never about what the schema has published. */
export const implementedFeatures = () =>
  new Set(Object.entries(capabilities.features).filter(([, v]) => v.implemented).map(([k]) => k));

/** Features a decomposer may WRITE: implemented AND earned by the Phase 5 cold-re-emitter gate. */
export const generableFeatures = () =>
  new Set(Object.entries(capabilities.features).filter(([, v]) => v.implemented && v.generable).map(([k]) => k));

/** The highest SIR spec version whose whole feature set this toolchain can check. */
export const supportedSpec = () => capabilities.toolchain.maxSpecVersion;

/** Target languages rdv can HARNESS (design move 4): js; ts and rust where the consumer has the toolchain. */
export const harnessedLanguages = () => new Set(capabilities.toolchain.languages);
/** What a harnessed language needs on the consumer's machine ({ resolves, hint }), or undefined when it needs nothing. */
export const toolchainOf = (lang) => capabilities.toolchain.toolchains?.[lang];

/** The closed language registry. A <unit>.<lang>.sir suffix or lang:<id> key outside it is an error. */
export const languageRegistry = () => new Set(capabilities.toolchain.languageRegistry);

// A SIR file name whose basename has a segment between the unit and `.sir` NAMES a language — and must name a registered one.
// FAIL CLOSED (selfhost languages_of, 2026-10-26): the old pattern silently ignored names it could not parse (`x.TS.sir`,
// `a.b.ts.sir`, a `\` path), so a variant pointing at one was graded through the JS harness. A lone `<unit>.sir` (no middle
// segment) is the primary / implicit js.
// A SIR file name ending in `.sir` (ASCII case only) whose basename has a further dot NAMES a language — and must name a
// registered one. Unit names are snake_case (no dots): the basename is `<unit>.sir` (the primary / implicit js) or
// `<unit>.<lang>.sir`, and anything with more dots is MALFORMED (#63: only the last segment was read, so `x.go.ts.sir`
// claimed ts and `a.b.ts.sir` passed while `a.b.sir` threw). Surrounding spaces/tabs are trimmed (only those: JS trim's
// wider set is not one rule with the parser).
const SIR_TAIL = /\.[sS][iI][rR]$/;   // ONE fold for `.sir` (#63: one regex had `iu`, so U+017F folded to s, the other `i`)
// A name that is `.sir` plus only text that is not visible ASCII (U+0085, U+200B, NBSP, a control char, an unassigned or
// private-use code point, a lone surrogate) is a MALFORMED SIR name, never "not a SIR file". The set is PINNED — every code
// point outside U+0021..U+007E — never the host's Unicode tables (#63: \p{Cf} moved with Node's Unicode version). Other names
// (`x.sir~`, `x.sir.bak`, `<unit>.inputs.mjs`) are ignored on purpose: callers pass a whole sir/ listing.
const HIDDEN_TAIL = /\.[sS][iI][rR][^\x21-\x7e]+$/;
const langOfPath = (p, where) => {
  const base = p.split(/[\\/]/).pop().replace(/^[ \t]+|[ \t]+$/g, '');
  if (HIDDEN_TAIL.test(base)) throw new Error(`${where}: ${JSON.stringify(p)} is a .sir name followed by invisible or non-ASCII characters`);
  if (!SIR_TAIL.test(base)) return null;
  const parts = base.slice(0, -4).split('.');
  // a unit name is word characters and hyphens (round 5, #77: `\u200b.ts.sir`, `x y.ts.sir` claimed ts); a bare `.sir` / `.<lang>.sir`
  // with no unit is left as it was (no claim / that language), never a new refusal
  if (parts[0] && !/^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(parts[0])) throw new Error(`${where}: ${JSON.stringify(p)} — a unit name is letters, digits, _ and -`);
  if (parts.length > 2) throw new Error(`${where}: ${JSON.stringify(p)} has ${parts.length - 1} dotted segments before .sir — a unit name has no dots, so a SIR file is <unit>.sir or <unit>.<lang>.sir`);
  if (parts.length === 1) return null;
  if (!parts[1]) throw new Error(`${where}: an empty language segment in ${JSON.stringify(p)}`);
  return parts[1];
};

/**
 * The target languages a bundle carries, from its STRUCTURE (never from prose): per-language SIR file names, `lang:<id>`
 * variant keys, a variant's own `lang` field and its `sir` path. FAIL CLOSED (selfhost languages_of, rounds 1-2): every way a
 * bundle can name a language must agree, or the call throws — an id outside the closed registry, a key that disagrees with
 * its variant's `lang` or `sir` path, a `lang:<id>` variant whose `sir` names no language, two variants claiming one
 * language, a variant that is not a map, a non-text `lang`/`sir`, a non-list sirFiles, a non-map variants or input. Sorted.
 */
export function languagesOf(input = {}) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('languagesOf takes a map { sirFiles, variants }');
  const { sirFiles = [], variants } = input;
  const reg = languageRegistry(), langs = new Set();
  const add = (id, where) => {
    if (!reg.has(id)) throw new Error(`${where}: '${id}' is not in the closed language registry (${[...reg].join(', ')})`);
    langs.add(id);
  };
  if (!Array.isArray(sirFiles)) throw new Error(`sirFiles must be a list of paths (got ${sirFiles === null ? 'null' : typeof sirFiles})`);
  for (const f of sirFiles) {
    if (typeof f !== 'string') throw new Error(`sirFiles: a path must be text (got ${f === null ? 'null' : typeof f})`);
    const l = langOfPath(f, f); if (l !== null) add(l, f);
  }
  if (variants !== undefined && variants !== null) {
    if (typeof variants !== 'object' || Array.isArray(variants)) throw new Error('variants must be a map');
    const claimed = new Map();
    for (const [k, v] of Object.entries(variants)) {
      if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error(`variant ${k}: a variant is a map`);
      if (v.lang !== undefined && typeof v.lang !== 'string') throw new Error(`variant ${k}: lang must be text`);
      // a variant's sir names a SIR file (round 5: `{sir: '/'}` had no file name and named nothing)
      if (typeof v.sir === 'string') langOfPath(v.sir, `variant ${k} sir`);   // a malformed SIR name reports as itself first
      if (v.sir !== undefined && (typeof v.sir !== 'string' || !/\.[sS][iI][rR]$/.test(v.sir.split(/[\\/]/).pop().replace(/^[ \t]+|[ \t]+$/g, '')))) throw new Error(`variant ${k}: sir must be a path to a .sir file (got ${JSON.stringify(v.sir)})`);
      // a variant KEY is `package` or `lang:<id>` — the only keys any manifest writes (round 5, #77: look-alikes — ` lang:ts`,
      // `lang\u200b:ts`, Cyrillic а, a fullwidth colon, `Lang:ts` — passed as ordinary keys naming nothing)
      if (k !== 'package' && !/^lang:[a-z][a-z0-9]*$/.test(k)) throw new Error(`variant ${k}: a variant key is 'package' or 'lang:<id>'`);
      const keyLang = k.startsWith('lang:') ? k.slice(5) : null, ownLang = v.lang ?? null, pathLang = v.sir !== undefined ? langOfPath(v.sir, `variant ${k} sir`) : null;
      const named = [keyLang, ownLang, pathLang].filter((x) => x !== null);
      if (new Set(named).size > 1) throw new Error(`variant ${k}: its key, lang field and sir path name different languages (${named.join(', ')})`);
      // a variant that names a language — by its key OR its lang field (#63: one rule, however it is keyed) — must point at a SIR that names it
      if ((keyLang !== null || ownLang !== null) && v.sir !== undefined && pathLang === null) throw new Error(`variant ${k}: its sir path ${JSON.stringify(v.sir)} names no language`);
      if (!named.length) continue;
      const l = named[0]; add(l, `variant ${k}`);
      if (claimed.has(l)) throw new Error(`variants ${claimed.get(l)} and ${k} both claim language '${l}'`); claimed.set(l, k);
    }
  }
  return new Set([...langs].sort());
}

// A version is ASCII digits in dot-separated segments, no leading zeros, no sign, prefix or whitespace. Anything else THROWS:
// the old comparison read a non-numeric segment as 0, so "0.5-rc1", "v1.0" and even `true` passed rdv's 0.4 gate (selfhost
// cmp_ver, 2026-10-26). Segments compare as integers of any size; a shorter version is padded with zeros.
const VERSION = /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*))*$/;
export const isVersion = (v) => typeof v === 'string' && VERSION.test(v);
// A message names the bad value without JSON.stringify, which throws its own TypeError on a BigInt (selfhost cmp_ver round 2).
// No segment-length cap: comparison is linear in the manifest's own text, and real segments run past 2^53 (gates #14).
const show = (x) => { if (typeof x === 'string') return JSON.stringify(x); try { return String(x); } catch { return typeof x; } };
export const cmpVer = (a, b) => {
  for (const x of [a, b]) if (!isVersion(x)) throw new Error(`not a version: ${show(x)} (expected <digits>(.<digits>)*, no leading zeros)`);
  const pa = a.split('.').map(BigInt), pb = b.split('.').map(BigInt);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] ?? 0n, y = pb[i] ?? 0n; if (x !== y) return x > y ? 1 : -1; }
  return 0;
};

/**
 * The features a bundle uses, detected mechanically from what it contains — never a judgment call (A7), and read through the
 * PARSER (one reader of a SIR file): a feature is triggered by its DIRECTIVE or by structure, never by a word in prose. The old
 * regexes over raw text under-stamped (a primary's own TRACE-SEAM / CARRIED went undetected) and over-stamped (an indented
 * "PAR is not used here", a quoted "setTimer") — selfhost detect_features, 2026-10-26. Detection is a UNION of what the SIR
 * declares and what the oracle/manifest carry, so neither half can under-stamp the other.
 *   sirText      the unit's SIR                    carriedData  manifest carriedData (a non-empty list ⇒ carried-data)
 *   envelope     the verified ENVELOPE text, if extracted       mode   the oracle mode: vectors | trace | par | ring
 *   sirFiles     file names under sir/             variants     a manifest unit's variants map
 */
export function detectFeatures({ sirText = '', carriedData, envelope, mode, sirFiles, variants } = {}) {
  if (typeof sirText !== 'string') throw new Error('sirText must be text');
  if (carriedData !== undefined && carriedData !== null && !Array.isArray(carriedData)) throw new Error('carriedData must be a list');
  if (envelope !== undefined && envelope !== null && typeof envelope !== 'string') throw new Error('envelope must be text');
  const reg = languageRegistry();
  const ds = parse(sirText).ast.filter((d) => d.kind !== 'comment');
  const has = (name) => ds.some((d) => d.name === name);
  const argsOf = (name) => ds.filter((d) => d.name === name).map((d) => [d.args, ...d.cont].join(' '));
  const trimWS = (x) => x.replace(/^[ \t]+|[ \t]+$/g, '');   
  const unquote = (l) => { let out = '', at = 0; for (const [a, b] of quotedSpans(l)) { out += l.slice(at, a) + '""'; at = b; } return out + l.slice(at); };   // the parser's ONE whitespace rule (#64: JS trim()/\s took NBSP, U+3000 …)
  // a directive's PIECES: its args, each continuation and each attribute value — never joined into one line, so no token
  // spans a wrap or an attribute boundary (round 2: `DESCRIPTION a virtual CITED time` stamped scheduler).
  // An ANCHOR directive's own CITED / EARNED values are its citations, never anchors (#64: `ANCHOR x CITED ref(php:y)` stamped).
  const piecesOf = (d) => [d.args, ...d.cont, ...(d.attrList ?? []).filter(([k]) => k === 'ANCHOR').map(([, v]) => v)];
  // cross-lang-anchor (§12: "as a directive or as an attribute", anchoring a fidelity variant): EVERY ref( of the ANCHOR
  // DIRECTIVE, continuations included, and of an ANCHOR attribute on a variant-declaring directive (`FIDELITY spec ANCHOR …`,
  // `VARIANT spec ANCHOR …`). Round 2: only the first ref( was judged, a wrapped ref was missed, and an ANCHOR attribute in
  // prose (`NOTE x CITED ANCHOR ref(js:y)`) stamped this unimplemented feature and halted rdv.
  const anchorTexts = (d) => d.name === 'ANCHOR' ? piecesOf(d) : (d.name === 'FIDELITY' || d.name === 'VARIANT') && d.attrs?.ANCHOR !== undefined ? [d.attrs.ANCHOR] : [];
  const anchorsCrossLang = ds.some((d) => anchorTexts(d).map(unquote).some((a) => [...a.matchAll(/\bref\([ \t]*([a-z][a-z0-9]*):/g)].some((m) => reg.has(m[1]))));
  const f = new Set(['vectors']);                                    // every bundle grades vectors
  if ((carriedData?.length ?? 0) > 0 || has('CARRIED') || ds.filter((d) => d.name === 'CARRIED-DATA').some((d) => [[d.args, ...d.cont].join(' '), ...(d.attrList ?? []).map(([, v]) => v)].some((a) => trimWS(a) && trimWS(a) !== 'none'))   /* round 5c (#129, #139): NOT unquoted, and a value behind an attribute keyword counts (`CARRIED-DATA ANCHOR sbox.json` declared nothing) — — unquoting made `CARRIED-DATA "sbox.json"` declare nothing (an under-stamp skips a gate; a quoted "none" over-stamps, which only halts) */) f.add('carried-data');
  if (trimWS(envelope ?? '') || has('ENVELOPE')) f.add('envelope');
  if (mode === 'trace' || has('TRACE-SEAM') || argsOf('ORACLE-CLASS').some((a) => /^trace(?![A-Za-z0-9_])/.test(trimWS(a)))) f.add('trace-seam');
  if (mode === 'par' || has('PAR')) f.add('par-interleaving');
  if (mode === 'ring' || has('RING')) f.add('ring');
  // lifecycle and scheduler have no dedicated directive in v0.4 practice — real units declare the timer boundary in prose
  // (raceTimeout: `DESCRIPTION clock.setTimer(fn, ms) -> handle`). Under-stamping is the hole and over-stamping only halts,
  // so these two keep their tokens, matched over the text a unit's author wrote, ONE PHYSICAL LINE AT A TIME (round 2):
  //   - per line, so no token spans a wrap (`DESCRIPTION on virtual\n  time` stamped scheduler);
  //   - the raw line, so an inline ` # ` tail is read (legacy parsing cannot tell a comment from a literal holding ` # `:
  //     `NOTE x # setTimer` under-stamped) and prose before the first directive is read (the parser drops it);
  //   - never a whole-line `#` comment. Attribute keywords stay in the line, so `a virtual CITED time` is no token either.
  // a QUOTED literal is data and a CITED / EARNED / ANCHOR value names a source: neither is a token (round 5, selfhost
  // detect_features: `NOTE we never call "setTimer"` stamped lifecycle, `NOTE x CITED virtual time` stamped scheduler)
  const body = sirLines(sirText).filter((l) => !/^[ \t]*#/.test(l)).map((l) => splitAttributes(' ' + unquote(l)).body).join('\n');
  if (has('LIFECYCLE') || /\bsetTimer\b/.test(body)) f.add('lifecycle');
  if (argsOf('EFFECT').some((a) => /\btime\.timer\b|\bmicrotask\b/.test(unquote(a))) || /\bschedule\(|\bvirtual time\b|\btimers\./.test(body)) f.add('scheduler');
  if (languagesOf({ sirFiles: sirFiles ?? [], variants }).size) f.add('lang-variant');
  if (anchorsCrossLang) f.add('cross-lang-anchor');
  return [...f];
}

/**
 * The SIR spec version a bundle TARGETS = the minimum version whose feature set it actually uses: the max `since` over its
 * features. It states what the bundle targets, not what any verifier can check (rdv's gates and pack's refusal decide that).
 * UNDER-stamping is the soundness hole, so an unknown feature throws — looked up as an OWN key of capabilities.features
 * (selfhost spec_version_for: `constructor`, `__proto__` and ten other inherited names used to pass as known features).
 */
export function specVersionFor(features) {
  if (!Array.isArray(features)) throw new Error('features must be a list');
  let v = '0.2';                                                     // the v0.2 bundle contract (§14) is the floor
  for (const name of features) {
    const cap = typeof name === 'string' && Object.hasOwn(capabilities.features, name) ? capabilities.features[name] : null;
    if (!cap) throw new Error(`unknown feature ${show(name)} — not in cli/capabilities.json; refusing to stamp a version for it`);
    if (cmpVer(cap.since, v) > 0) v = cap.since;
  }
  return v;
}

/**
 * The capability model is checked ONCE, at load (selfhost spec_version_for round 2): a malformed `since` used to throw only when
 * a bundle happened to use that feature — so a bad entry was a gate that failed lazily, per bundle. Every feature is an own map
 * with a version `since`, boolean `implemented` / `generable`, and a non-empty `rungs` list; the toolchain's versions and
 * language lists are well formed and harnessed languages are registered. Throws, naming the first bad entry.
 */
export function checkCapabilities(c) {
  const bad = (m) => { throw new Error(`cli/capabilities.json: ${m}`); };
  const isMap = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const textList = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string' && s);
  if (!isMap(c) || !isMap(c.toolchain) || !isMap(c.features)) bad('toolchain and features must be maps');
  const t = c.toolchain;
  if (!isVersion(t.maxSpecVersion)) bad(`toolchain.maxSpecVersion ${show(t.maxSpecVersion)} is not a version`);
  if (!textList(t.languageRegistry)) bad('toolchain.languageRegistry must be a list of ids');
  if (!textList(t.languages)) bad('toolchain.languages must be a list of ids');
  for (const l of t.languages) if (!t.languageRegistry.includes(l)) bad(`toolchain.languages names '${l}', which is not in languageRegistry`);
  if (t.toolchains !== undefined) {
    if (!isMap(t.toolchains)) bad('toolchain.toolchains must be a map');
    for (const [l, v] of Object.entries(t.toolchains)) if (!t.languages.includes(l) || !isMap(v) || typeof v.hint !== 'string') bad(`toolchain.toolchains.${l} must be a harnessed language with a text hint`);
  }
  for (const [name, f] of Object.entries(c.features)) {
    if (!isMap(f)) bad(`feature ${name} must be a map`);
    if (!isVersion(f.since)) bad(`feature ${name}: since ${show(f.since)} is not a version`);
    if (typeof f.implemented !== 'boolean' || typeof f.generable !== 'boolean') bad(`feature ${name}: implemented and generable must be booleans`);
    if (!textList(f.rungs) || !f.rungs.length) bad(`feature ${name}: rungs must be a non-empty list`);
  }
  return c;
}
checkCapabilities(capabilities);
