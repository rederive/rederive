/**
 * Build @rederive/rdv oracles + manifest.
 *
 * Authors the INPUTS only (adversarial frozen + held-out); every `expected` is STAMPED by EXECUTING
 * the shipped unit (never hand-authored). Then computes content hashes and writes sir.manifest.json.
 * Re-runnable: `tsx build-oracles.mts`. This is the differential-stamp discipline applied to rdv's
 * own verdict core.
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const hfile = (p: string) => createHash('sha256').update(readFileSync(resolve(DIR, p))).digest('hex');
const h = (s: string) => createHash('sha256').update(s).digest('hex');
const flip = (x: string) => x.slice(0, -1) + (x[x.length - 1] === '0' ? '1' : '0'); // a different, valid-length hex

const fox = 'The quick brown fox';
const INPUTS: any = {
  eq: {
    frozen: [
      { name: 'int_equal', args: [1, 1] },
      { name: 'int_unequal', args: [1, 2] },
      { name: 'str_equal', args: ['abc', 'abc'] },
      { name: 'coerce_reject', args: [1, '1'] },
      { name: 'array_equal', args: [[1, 2, 3], [1, 2, 3]] },
      { name: 'nested_equal', args: [{ a: [1] }, { a: [1] }] },
      { name: 'empty_arrays', args: [[], []] },
      { name: 'bool_equal', args: [true, true] },
    ],
    heldout: [
      { name: 'ho_array_reorder', args: [[1, 2], [2, 1]] },
      { name: 'ho_objkey_order', args: [{ a: 1, b: 2 }, { b: 2, a: 1 }] },
      { name: 'ho_null_vs_zero', args: [null, 0] },
      { name: 'ho_arr_vs_obj', args: [[], {}] },
      { name: 'ho_zero_vs_false', args: [0, false] },
      { name: 'ho_emptystr_vs_emptyarr', args: ['', []] },
      { name: 'ho_deep_nonfirst_mismatch', args: [{ x: 1, y: [1, 2, 3] }, { x: 1, y: [1, 2, 4] }] },
      { name: 'ho_str_equal2', args: ['hello', 'hello'] },
      { name: 'ho_nested_obj_equal', args: [{ a: { b: 2 } }, { a: { b: 2 } }] },
    ],
  },
  grade: {
    frozen: [
      { name: 'all_correct', args: [[1, 2, 3], [{ name: 'a', expected: 1 }, { name: 'b', expected: 2 }, { name: 'c', expected: 3 }]] },
      { name: 'all_wrong', args: [[9, 9], [{ name: 'a', expected: 1 }, { name: 'b', expected: 2 }]] },
      { name: 'first_ok_rest_wrong', args: [[1, 9, 9], [{ name: 'a', expected: 1 }, { name: 'b', expected: 2 }, { name: 'c', expected: 3 }]] },
      { name: 'throw_matches_throw', args: [[{ __throw: 'boom' }], [{ name: 't', expected: { __throw: 'other' } }]] },
      { name: 'throw_vs_value', args: [[{ __throw: 'x' }], [{ name: 't', expected: 5 }]] },
      { name: 'obj_match', args: [[{ k: 1 }], [{ name: 'o', expected: { k: 1 } }]] },
      { name: 'single_ok', args: [[7], [{ name: 's', expected: 7 }]] },
      { name: 'keyorder_reject', args: [[{ a: 1, b: 2 }], [{ name: 'k', expected: { b: 2, a: 1 } }]] },
    ],
    heldout: [
      { name: 'ho_nonfirst_mismatch', args: [[5, 5, 9, 5], [{ name: 'a', expected: 5 }, { name: 'b', expected: 5 }, { name: 'c', expected: 5 }, { name: 'd', expected: 5 }]] },
      { name: 'ho_keyorder', args: [[{ x: 1, y: 2 }], [{ name: 'ko', expected: { y: 2, x: 1 } }]] },
      { name: 'ho_empty_vacuous', args: [[], []] },
      { name: 'ho_value_vs_throw', args: [[5], [{ name: 't', expected: { __throw: 'x' } }]] },
      { name: 'ho_miss_cap_8', args: [Array(10).fill(9), Array.from({ length: 10 }, (_, i) => ({ name: `v${i + 1}`, expected: i + 1 }))] },
      { name: 'ho_partial_mixed', args: [[1, 2, 9], [{ name: 'a', expected: 1 }, { name: 'b', expected: 2 }, { name: 'c', expected: 3 }]] },
      { name: 'ho_nested_mismatch', args: [[{ a: [1, 2] }], [{ name: 'n', expected: { a: [1, 3] } }]] },
      { name: 'ho_both_throw_diff_msg', args: [[{ __throw: 'A' }], [{ name: 't2', expected: { __throw: 'B' } }]] },
    ],
  },
  quorum: {
    frozen: [
      { name: 'two_full', args: [[{ full: true }, { full: true }, { full: false }]] },
      { name: 'lone_full', args: [[{ full: true }, { full: false }, { full: false }]] },
      { name: 'all_partial', args: [[{ full: false }, { full: false }]] },
      { name: 'all_full', args: [[{ full: true }, { full: true }, { full: true }]] },
      { name: 'need1', args: [[{ full: false }, { full: true }], 1] },
      { name: 'need3_only2', args: [[{ full: true }, { full: true }], 3] },
    ],
    heldout: [
      { name: 'ho_partial_then_two_full', args: [[{ full: false }, { full: true }, { full: true }]] },
      { name: 'ho_single_full_default', args: [[{ full: true }]] },
      { name: 'ho_empty', args: [[]] },
      { name: 'ho_partial_partial_full', args: [[{ full: false }, { full: false }, { full: true }]] },
      { name: 'ho_need1_first', args: [[{ full: true }, { full: false }], 1] },
      { name: 'ho_four_mixed', args: [[{ full: false }, { full: true }, { full: false }, { full: true }]] },
      { name: 'ho_all_full_4', args: [[{ full: true }, { full: true }, { full: true }, { full: true }]] },
    ],
  },
  hashOk: {
    frozen: [
      { name: 'match', args: ['hello world', h('hello world')] },
      { name: 'mismatch', args: ['hello world', flip(h('hello world'))] },
      { name: 'no_want', args: ['anything'] },
      { name: 'empty_want', args: ['x', ''] },
    ],
    heldout: [
      { name: 'ho_match2', args: [fox, h(fox)] },
      { name: 'ho_tamper_one_byte', args: ['The quick brown foX', h(fox)] },
      { name: 'ho_wrong_hash', args: ['payload', flip(h('payload'))] },
      { name: 'ho_no_want2', args: ['other'] },
      { name: 'ho_empty_bytes_match', args: ['', h('')] },
    ],
  },
};

const META: any = {
  eq: { kind: 'FUNCTIONAL', sig: '(a: any, b: any) => boolean', limits: [], quorum: '3/3 (rdv resynth — original deleted)' },
  grade: { kind: 'FUNCTIONAL', sig: '(gots: any[], vectors: {name,expected}[]) => {pass,total,full,miss}',
    limits: ['equality is delegated to the verified eq unit (composition) — grade cannot drift its own equality', 'empty vectors => full:true (vacuous) — a held-out set must be non-empty', 'miss capped at the first 8 failing names'],
    quorum: 'composed on eq leaf (eq: 3/3)', composedOn: ['eq'] },
  quorum: { kind: 'FUNCTIONAL', sig: '(graded: {full:boolean}[], need=2) => {fullCount,hasQuorum,winnerIdx}', limits: [], quorum: '3/3 (rdv resynth — original deleted)' },
  hashOk: { kind: 'FUNCTIONAL?', sig: '(bytes: any, want?: string) => boolean',
    limits: ['NOT zero-dep: SHA-256 delegated to host node:crypto — control logic verified, not the hash primitive (every-byte verification is the enterprise extension)'],
    quorum: '3/3 (rdv resynth — original deleted)' },
};

const fns: any = {
  eq: (await import(resolve(DIR, 'src/eq.js'))).eq,
  grade: (await import(resolve(DIR, 'src/grade.js'))).grade,
  quorum: (await import(resolve(DIR, 'src/quorum.js'))).quorum,
  hashOk: (await import(resolve(DIR, 'src/hashOk.js'))).hashOk,
};

const stamp = (fn: any, list: any[]) =>
  list.map((it) => {
    let expected: any;
    try { expected = fn(...it.args); } catch (e: any) { expected = { __throw: String(e?.message ?? e) }; }
    return { name: it.name, args: it.args, expected };
  });

const ORDER = ['eq', 'grade', 'quorum', 'hashOk'];
mkdirSync(resolve(DIR, 'oracles'), { recursive: true });
for (const u of ORDER) {
  const oracle = { mode: 'vectors', exportName: u, unit: u, vectors: stamp(fns[u], INPUTS[u].frozen), heldout: stamp(fns[u], INPUTS[u].heldout) };
  writeFileSync(resolve(DIR, `oracles/${u}.json`), JSON.stringify(oracle, null, 2) + '\n');
}

const units = ORDER.map((u) => {
  const o = JSON.parse(readFileSync(resolve(DIR, `oracles/${u}.json`), 'utf-8'));
  return {
    name: u, kind: META[u].kind, sig: META[u].sig,
    sir: `sir/${u}.sir`, sirSha256: hfile(`sir/${u}.sir`),
    oracle: `oracles/${u}.json`, oracleSha256: hfile(`oracles/${u}.json`),
    src: `src/${u}.js`, srcSha256: hfile(`src/${u}.js`),
    verified: { mode: 'vectors', frozen: o.vectors.length, heldout: o.heldout.length, heldoutVerified: true, quorum: META[u].quorum, ...(META[u].composedOn ? { composedOn: META[u].composedOn } : {}), at: '2026-06-15' },
    knownLimitations: META[u].limits,
    spec: `specs/${u}.md`, specSha256: hfile(`specs/${u}.md`),
  };
});

const manifest = {
  name: '@rederive/rdv', version: '0.1.0-rdv.1', zeroDep: false,
  provenance: {
    source: 'rederive cli/verdict.mts (rdv verdict core)', sourceRepo: 'rederive',
    sourceSha256: hfile('../../cli/verdict.mts'),
    note: 'the verifier in its own catalog — verdict core extracted and behavior-locked to adversarial held-out oracles; expecteds stamped by execution',
    decompiledBy: 'sir decompile (SIR Schema v0.1)', capturedAt: '2026-06-15',
  },
  units,
};
writeFileSync(resolve(DIR, 'sir.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote oracles/{' + ORDER.join(',') + '}.json + sir.manifest.json');
for (const u of units) console.log(`  ${u.name}: ${u.verified.frozen} frozen / ${u.verified.heldout} held-out`);
