/**
 * rederive verdict core — the FUNCTIONAL, trust-critical decision logic of `rdv`.
 *
 * These are the units whose correctness EVERY rederive guarantee depends on: the code that
 * decides VERIFIED vs FAILED, and which re-derivation wins a quorum. They are pure
 * (FUNCTIONAL ⊅ EFFECT) — no fs, no network, no process, no clock — so they are oracle-able,
 * and they are the first intended members of the self-hosted package @rederive/rdv.
 *
 * The host still owns the runtime (node) and the SHA-256 primitive (node:crypto). Verifying the
 * substrate itself ("every byte verified") is a deliberate non-goal for rdv — it's the enterprise
 * / attested-execution extension, not the 99% path. See site → Open core.
 */
import { createHash } from 'node:crypto';

/**
 * JSON-safe normalization for structural comparison. A LIVE call result can carry values that
 * JSON.stringify would THROW on (bigint) or silently corrupt (NaN/±Infinity → null, undefined,
 * RegExp/Set/Map/typed-array/boxed-primitive). The stamped oracle stores `expected` in the SAME
 * tagged form (codec.encode in the toolkit), so we encode the live `got` to match before comparing.
 * Keep these tags in lockstep with the toolkit codec.encode and rdv.mts reviveArg.
 */
const enc = (v: any): any => {
  if (v === undefined) return { __t: 'undef' };
  if (typeof v === 'bigint') return { __t: 'bigint', v: v.toString() };
  if (Object.is(v, -0)) return { __t: 'num', v: '-0' };  // -0 collapses to 0 in JSON; lodash special-cases -0 -> "-0"
  if (typeof v === 'number' && !Number.isFinite(v)) return { __t: 'num', v: String(v) };
  if (v instanceof RegExp) return { __t: 'regex', source: v.source, flags: v.flags };
  if (v instanceof Number || v instanceof String || v instanceof Boolean) return { __t: 'boxed', k: v.constructor.name, v: enc(v.valueOf()) };
  if (v instanceof Set) return { __t: 'set', values: [...v].map(enc) };
  if (v instanceof Map) return { __t: 'map', entries: [...v].map(([k, val]) => [enc(k), enc(val)]) };
  if (v instanceof Uint8Array) { try { return { __t: 'u8', bytes: Array.from(v), buf: typeof Buffer !== 'undefined' && Buffer.isBuffer(v) }; } catch { /* pseudo/detached typed-array: instanceof true, no backing buffer (clone@2 of a Uint8Array) — fall through to generic-object encoding */ } }
  if (Array.isArray(v)) {
    let sparse = false; for (let i = 0; i < v.length; i++) { if (!(i in v)) { sparse = true; break; } }
    if (!sparse) return v.map(enc);
    const entries: any[] = []; for (let i = 0; i < v.length; i++) { if (i in v) entries.push([i, enc(v[i])]); }
    return { __t: 'sparse', length: v.length, entries };
  }
  if (v && typeof v === 'object') { const o: any = {}; for (const k of Object.keys(v)) { if (typeof v[k] === 'function') continue; o[k] = enc(v[k]); } return o; } // skip fn-valued keys (a borrowed toJSON hijacks JSON.stringify; functions aren't JSON-comparable)
  return v;
};

/** Deep structural equality, value-based and order-sensitive; robust to non-JSON-safe values. */
export const eq = (a: any, b: any): boolean => JSON.stringify(enc(a)) === JSON.stringify(enc(b));

/** Is this a captured-throw sentinel produced by the runner when a unit threw? */
export const threw = (x: any): boolean => x && typeof x === 'object' && '__throw' in x;

/** Per-vector verdict: a throw matches a throw; otherwise structural equality. */
export const vectorPass = (got: any, expected: any): boolean =>
  (threw(got) && threw(expected)) || eq(got, expected);

/**
 * Grade already-computed results against their vectors. PURE — the effectful step (running the
 * candidate to produce `gots`) lives at the edge in rdv; this is just the verdict.
 * `gots[i]` is the result (or throw-sentinel) for `vectors[i]`.
 */
export function grade(gots: any[], vectors: { name: string; expected: any }[]) {
  let pass = 0;
  const miss: string[] = [];
  for (let i = 0; i < vectors.length; i++) {
    if (vectorPass(gots[i], vectors[i].expected)) pass++;
    else if (miss.length < 8) miss.push(vectors[i].name);
  }
  return { pass, total: vectors.length, full: pass === vectors.length, miss };
}

/**
 * Quorum decision over graded emissions. PURE.
 * Quorum holds when at least `need` (default 2) emissions pass the FULL held-out set; the winner
 * is the first such emission (input order). One passing emission is luck; agreement is evidence.
 */
export function quorum(graded: { full: boolean }[], need = 2) {
  const fullIdx = graded.map((g, i) => (g.full ? i : -1)).filter((i) => i >= 0);
  return {
    fullCount: fullIdx.length,
    hasQuorum: fullIdx.length >= need,
    winnerIdx: fullIdx.length >= need ? fullIdx[0] : -1,
  };
}

/** Content hash of bytes → hex. PURE given bytes; the SHA-256 algorithm is the host's. */
export const hashHex = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/** Hash-match check; an absent/empty `want` means "not pinned" → ok. */
export const hashOk = (bytes: Buffer | string, want?: string): boolean => !want || hashHex(bytes) === want;
