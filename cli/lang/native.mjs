// The js/ts NATIVE driver, shared by rdv and the lab (the lab's copy is GENERATED from this file — one judge, #162/#163).
// An artifact is called through EXACTLY the export its language file's SIG names (`export default function f…` → default,
// `export function f…` → f) — the same export the ts conformance check type-checked. rdv used to take mod[unitName] ?? run ??
// default ?? the first function, so a ts artifact could conform on its named export and be graded on another function (#162).
import { escapeMarkers } from '../sir/canon.mjs';
import { pathToFileURL } from 'node:url';

/** The export a js/ts SIG names. `export default function f…` → { name: null }; `export function f…` → { name: 'f' }. A bare
 *  `f(…): R` (a js file written before export SIGs) names f, and a module default-exporting f is accepted for it — never any
 *  other export (no `run`, no "first function"). */
export function exportOf(sigLine) {
  const s = String(sigLine ?? '').replace(/^[ \t]+/, '');
  const m = s.match(/^export[ \t]+(default[ \t]+)?(?:async[ \t]+)?function[ \t]*\*?[ \t]*([A-Za-z_$][\w$]*)/);
  if (m) return { name: m[1] ? null : m[2], orDefault: false };
  const c = s.match(/^export[ \t]+(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*[=:]/);   // `export const f = (…) => …`
  if (c) return { name: c[1], orDefault: false };
  const b = s.match(/^([A-Za-z_$][\w$]*)[ \t]*\(/);
  if (b) return { name: b[1], orDefault: true };
  throw new Error(`SIG names no function: ${sigLine}`);
}

/** Import the module at `fileOrUrl` and return the function its SIG names — never another export. */
export async function resolveExport(fileOrUrl, sigLine) {
  const href = /^[a-z]+:/i.test(fileOrUrl) ? fileOrUrl : pathToFileURL(fileOrUrl).href;
  const mod = await import(`${href}?v=${Date.now()}`); const { name, orDefault } = exportOf(sigLine);
  const fn = name === null ? mod.default : typeof mod[name] === 'function' ? mod[name] : orDefault ? mod.default : undefined;
  if (typeof fn !== 'function') throw new Error(`the artifact has no ${name === null ? 'default export' : `export named ${name}`} that is a function (its SIG names it)`);
  return fn;
}

// js/ts artifacts are called natively; each case's args are cloned right before the call (a mutating artifact must never
// corrupt the next case), and STATE's post is read from the clone. A RETURNED value is marker-escaped (selfhost #55 #58): only
// the caller's own catch writes the bare {__threw}, so an artifact echoing that map is graded as the map it returned. The escape
// is the VERIFIER's step, outside the artifact's try: a value it cannot carry is narrowed, never the artifact's throw (#100).
export const nativeCaller = (fn) => async (argsList, { state } = {}) => argsList.map((a) => { const c = structuredClone(a);
  let result; try { result = fn(...c); } catch (e) { return { __threw: String(e?.message ?? e) }; }
  try { return state ? { result: escapeMarkers(result), post: escapeMarkers(c[state.index]) } : escapeMarkers(result); } catch (e) { return { __narrowed: `result: ${e?.message ?? e}` }; } });
