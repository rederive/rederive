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
  // own keys only; a map carrying a codec marker key is escaped {__t:'obj', v} (lockstep with the factory codec)
  if (v && typeof v === 'object') { const o: any = {}; for (const k of Object.keys(v)) { if (typeof v[k] === 'function') continue; Object.defineProperty(o, k, { value: enc(v[k]), enumerable: true, writable: true, configurable: true }); } return (Object.hasOwn(v, '__t') || Object.hasOwn(v, '__throw') || Object.hasOwn(v, '__threw')) ? { __t: 'obj', v: o } : o; } // OWN marker keys only (selfhost #67: `in` read inherited ones); skip fn-valued keys (a borrowed toJSON hijacks JSON.stringify; functions aren't JSON-comparable)
  return v;
};

/** Deep structural equality, value-based and order-sensitive; robust to non-JSON-safe values. */
/** DECODE a legacy (v0.4 codec) value to its native JS value — the oracle's args, and its expected value before comparison. */
export function revive(v: any): any {
  if (Array.isArray(v)) return v.map(revive);
  if (v && typeof v === 'object') {
    if (v.__t === 'undef') return undefined;
    if (v.__t === 'regex') return new RegExp(v.source, v.flags);
    if (v.__t === 'bigint') return BigInt(v.v);
    if (v.__t === 'num') { if (!['NaN', 'Infinity', '-Infinity', '-0'].includes(v.v)) throw new Error(`legacy num tag: ${JSON.stringify(v.v)} — the codec writes only NaN, Infinity, -Infinity, -0 (rederive selfhost #55)`); return Number(v.v); }
    if (v.__t === 'boxed') { const x = revive(v.v); return v.k === 'Number' ? new Number(x) : v.k === 'String' ? new String(x) : new Boolean(x); }
    if (v.__t === 'set') return new Set((v.values || []).map(revive));
    if (v.__t === 'map') return new Map((v.entries || []).map(([k, val]: any[]) => [revive(k), revive(val)]));
    if (v.__t === 'u8') return v.buf ? Buffer.from(v.bytes) : Uint8Array.from(v.bytes);
    if (v.__t === 'sparse') { const a = new Array(v.length); for (const [i, val] of (v.entries || [])) a[i] = revive(val); return a; }
    if (v.__t === 'obj' && (v.v === null || typeof v.v !== 'object' || Array.isArray(v.v))) throw new Error('legacy obj tag: v must be a plain map (rederive selfhost #55)'); const src = v.__t === 'obj' ? v.v : v; const o: any = {}; for (const k of Object.keys(src)) Object.defineProperty(o, k, { value: revive(src[k]), enumerable: true, writable: true, configurable: true }); return o;   // {__t:'obj'} = an escaped user map; own keys only
  }
  return v;
}

// Compare LIKE WITH LIKE: the artifact's native result against the oracle's expected value DECODED to native, both through enc.
// enc escapes a user map carrying a codec marker key ({__t:'obj', v}), so it is no longer idempotent on encoded tags — comparing
// enc(got) with enc(expected-as-stored) would wrap a stored {__t:'num', v:'-0'} as a user map (55 shipped packages failed that
// way for one build, 2026-10-26, before this line decoded the expected side first).
export const eq = (got: any, expected: any): boolean => JSON.stringify(enc(got)) === JSON.stringify(enc(revive(expected)));

/** Is this a captured-throw sentinel produced by the runner when a unit threw? */
export const threw = (x: any): boolean => !!x && typeof x === 'object' && !Array.isArray(x) && Object.hasOwn(x, '__throw');   // an OWN key (selfhost #58)

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
export function quorum(graded: { full: boolean }[], need: number) {
  // `need` is a count of agreeing emissions: an integer >= 1. Below that a quorum held with no winner (selfhost quorum,
  // 2026-10-26: quorum([], 0) said hasQuorum with winnerIdx undefined), so anything else throws. -1 is the one "no winner".
  // REQUIRED, no default (round 2): an omitted need quietly became 2 while null threw — "no value" had two outcomes by spelling.
  if (!Number.isInteger(need) || need < 1) throw new Error(`quorum: need must be an integer >= 1 (got ${need})`);
  const fullIdx = graded.map((g, i) => (g.full === true ? i : -1)).filter((i) => i >= 0);
  return {
    fullCount: fullIdx.length,
    hasQuorum: fullIdx.length >= need,
    winnerIdx: fullIdx.length >= need ? fullIdx[0] : -1,
  };
}

/** Content hash of bytes → hex. PURE given bytes; the SHA-256 algorithm is the host's. */
export const hashHex = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

/** A pin is 64 lowercase hex; an absent, empty or malformed pin never matches — the ONE rule rdv's gates use (round 5b, #113: rdv
 *  had its own copy and the carried check a third). */
export const pinMatches = (actual: string, want: unknown): boolean => typeof want === 'string' && /^[0-9a-f]{64}$/.test(want) && actual === want;
/** Hash-match check. An ABSENT `want` (undefined / null) means "not pinned" → ok; anything else must BE a pin — 64 lowercase
 *  hex — or this throws (round 5, selfhost hash_ok: any falsy want — '', 0, false, NaN — skipped the check). Text is hashed as
 *  UTF-8 and must be well-formed: every lone surrogate encodes as U+FFFD, so two different texts would pass one pin. */
export const hashOk = (bytes: Buffer | string, want?: string | null): boolean => {
  if (want === undefined || want === null) return true;
  if (typeof want !== 'string' || !/^[0-9a-f]{64}$/.test(want)) throw new Error(`hashOk: a pin is 64 lowercase hex digits (got ${typeof want === 'string' ? JSON.stringify(want) : typeof want})`);
  if (typeof bytes === 'string' && !bytes.isWellFormed()) throw new Error('hashOk: text with a lone surrogate has no UTF-8 form of its own');
  return hashHex(bytes) === want;
};
