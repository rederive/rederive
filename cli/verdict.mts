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

/** Deep structural equality, value-based and order-sensitive. */
export const eq = (a: any, b: any): boolean => JSON.stringify(a) === JSON.stringify(b);

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
