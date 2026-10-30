// The gates that FAILED OPEN (rederive's self re-derivation, Tier 1, 2026-10-26: selfhost/FINDINGS.md #3 #5 #14 #15 #22).
// Each case below passed the old code — a bundle it should have halted, a feature it should have refused, a quorum with no
// winner. Run: npm run build && npx tsx --test cli/gates.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cmpVer, isVersion, languagesOf, detectFeatures, specVersionFor, checkCapabilities, capabilities } from './features.mjs';
import { check as treeShaCheck } from '../selfhost/seams/tree_sha.mjs';
import { quorum } from './verdict.mts';

const ROOT = new URL('..', import.meta.url).pathname;
const check = (dir: string) => { const r = spawnSync(process.execPath, [ROOT + 'dist/cli.cjs', 'check', dir], { encoding: 'utf8' }); return { status: r.status, out: (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '') }; };

test('#14 cmp_ver: a version is digits and dots — anything else throws, and rdv HALTS on it (it used to read as 0 and pass)', () => {
  for (const v of ['0.5-rc1', 'v1.0', '0.٥', '0.05', ' 0.5', '', '1.', '0x5']) assert.equal(isVersion(v), false, JSON.stringify(v));
  assert.throws(() => cmpVer('0.5-rc1', '0.4'), /not a version/);
  assert.equal(cmpVer('0.10', '0.9'), 1); assert.equal(cmpVer('0.5', '0.5.0'), 0); assert.equal(cmpVer('0.9007199254740993', '0.9007199254740992'), 1, 'segments beyond 2^53 compare exactly');
  for (const sv of ['0.5-rc1', 'v1.0', true]) {
    const d = mkdtempSync(join(tmpdir(), 'gate-ver-')); cpSync(ROOT + 'packages/bytes', d, { recursive: true });
    const p = join(d, 'sir.manifest.json'); const m = JSON.parse(readFileSync(p, 'utf8')); m.specVersion = sv; writeFileSync(p, JSON.stringify(m));
    const r = check(d); assert.equal(r.status, 1, String(sv)); assert.match(r.out, /HALTED — malformed specVersion/);
  }
});

test('#15 languages_of: a language-shaped file name the old pattern skipped now names a language, or the bundle is malformed', () => {
  assert.deepEqual([...languagesOf({ sirFiles: ['x\\y\\z.rust.sir', 'x.ts.sir '] })], ['rust', 'ts']);
  // round 4 (#63): unit names have no dots — a SIR file is <unit>.sir or <unit>.<lang>.sir, every segment read
  for (const f of ['units/a.b.ts.sir', 'x.go.ts.sir']) assert.throws(() => languagesOf({ sirFiles: [f] }), /dotted segments/, f);
  for (const f of ['x.TS.sir', 'x.Rust.sir', 'x.carried.sir']) assert.throws(() => languagesOf({ sirFiles: [f] }), /closed language registry/, f);
  assert.throws(() => languagesOf({ sirFiles: 'x.ts.sir' as any }), /must be a list/);
  assert.throws(() => languagesOf({ variants: ['lang:ts'] as any }), /must be a map/);
  assert.throws(() => languagesOf({ variants: { 'lang:rust': { lang: 'ts' } } }), /name different languages/);
  // round 5 (#77): a variant key is `package` or `lang:<id>` — the only keys any manifest writes; any other key halts the bundle
  assert.throws(() => languagesOf({ variants: { native: { sir: 'sir/x.rust.sir' } } }), /a variant key is/);
  // the A6 hole, end to end: a lang:rust variant renamed to `native` used to be graded through the JS harness
  const d = mkdtempSync(join(tmpdir(), 'gate-lang-')); cpSync(ROOT + 'experiments/v05-f2-lang-variant/bundle', d, { recursive: true });
  const p = join(d, 'sir.manifest.json'); const m = JSON.parse(readFileSync(p, 'utf8')); const u = m.units[0];
  u.variants.native = u.variants['lang:rust']; delete u.variants['lang:rust']; renameSync(join(d, 'sir/bytes.rust.sir'), join(d, 'sir/bytes.RUST.sir')); u.variants.native.sir = 'sir/bytes.RUST.sir';
  writeFileSync(p, JSON.stringify(m));
  const r = check(d); assert.equal(r.status, 1); assert.match(r.out, /HALTED — malformed bundle: .*(RUST|a variant key is)/);
});

test('#22 detect_features: features come from directives — a primary\'s own TRACE-SEAM / CARRIED are stamped, prose and comments are not', () => {
  assert.ok(detectFeatures({ sirText: 'UNIT u\nTRACE-SEAM http\n' }).includes('trace-seam'));
  assert.ok(detectFeatures({ sirText: 'UNIT u\nCARRIED TABLE FROM x\n' }).includes('carried-data'));
  assert.ok(!detectFeatures({ sirText: 'DESCRIPTION runs\n  PAR is not used here\n' }).includes('par-interleaving'));
  assert.ok(!detectFeatures({ sirText: '# RING in a comment\nUNIT u\n' }).includes('ring'));
  assert.ok(!detectFeatures({ sirText: 'ANCHOR ref(https://example.com)\n' }).includes('cross-lang-anchor'), 'only a registered language id anchors cross-language');
  assert.ok(detectFeatures({ sirText: 'UNIT u\nDESCRIPTION clock.setTimer(fn, ms) -> handle\n' }).includes('lifecycle'), 'v0.4 lifecycle units declare the timer in prose: still stamped');
  assert.throws(() => detectFeatures({ carriedData: {} as any }), /must be a list/);
});

test('#5 spec_version_for: inherited object member names are unknown features (they used to pass)', () => {
  for (const n of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.throws(() => specVersionFor([n]), /unknown feature/, n);
  assert.equal(specVersionFor(['vectors', 'ring']), '0.4');
});

test('#3 quorum: need is an integer >= 1 — there is no quorum without a winner', () => {
  for (const need of [0, -1, 1.5, NaN]) assert.throws(() => quorum([], need), /need must be an integer >= 1/, String(need));
  assert.deepEqual(quorum([{ full: false }, { full: true }, { full: true }], 2), { fullCount: 2, hasQuorum: true, winnerIdx: 1 });
  assert.deepEqual(quorum([{ full: 1 as any }], 1), { fullCount: 0, hasQuorum: false, winnerIdx: -1 }, 'only a boolean true counts as full');
});

test('#15 round 2: every way a bundle names a language must agree, or the gate halts', () => {
  const t = (x: any) => () => languagesOf(x);
  assert.throws(t({ variants: { 'lang:rust': { sir: 'sir/x.ts.sir' } } }), /name different languages/, 'a key and a sir path that disagree');
  assert.throws(t({ variants: { 'lang:ts': { lang: 5 } } }), /lang must be text/);
  assert.throws(t({ variants: { 'lang:ts': 'rust' } }), /a variant is a map/);
  assert.throws(t({ variants: { 'lang:ts': { sir: 'sir/x.sir' } } }), /names no language/, 'a lang:ts variant must point at a .ts.sir');
  assert.throws(t({ variants: { 'lang:ts': { lang: 'ts' }, package: { lang: 'ts' } } }), /both claim language 'ts'/);
  assert.throws(t({ sirFiles: ['x..sir'] }), /empty language segment/);
  assert.throws(t([] as any), /takes a map/);
  assert.deepEqual([...languagesOf({ variants: { package: { sir: 'sir/x.sir' }, 'lang:ts': { lang: 'ts', sir: 'sir/x.ts.sir' }, 'lang:rust': { sir: 'sir/x.rust.sir' } } })], ['rust', 'ts']);
});

test('#40 round 3: a .sir name with an invisible tail is malformed; other names in a sir/ listing stay ignored', () => {
  for (const f of ['x.ts.sir\u0085', 'x.ts.sir​', 'x.ts.sir\u001c', 'x.sir ']) assert.throws(() => languagesOf({ sirFiles: [f] }), /followed by invisible or non-ASCII characters/, JSON.stringify(f));
  assert.throws(() => languagesOf({ variants: { 'lang:ts': { sir: 'sir/x.ts.sir​' } } }), /invisible or non-ASCII characters/);
  assert.deepEqual([...languagesOf({ sirFiles: ['u.inputs.mjs', 'carried.json', 'u.sir', 'u.ts.sir\t'] })], ['ts'], 'pack passes the whole sir/ listing');
});

test('#41 round 3: cross-lang-anchor is EVERY ref( of an anchor: the ANCHOR directive or a FIDELITY/VARIANT attribute (§12), never prose', () => {
  const has = (t: string, f: string) => detectFeatures({ sirText: t }).includes(f);
  assert.ok(has('ANCHOR ref(lodash:x) ref(js:y)\n', 'cross-lang-anchor'), 'a later registered ref counts');
  assert.ok(has('ANCHOR x\n  ref(js:y)\n', 'cross-lang-anchor'), 'a wrapped ref counts');
  assert.ok(!has('NOTE x CITED ANCHOR ref(js:y)\n', 'cross-lang-anchor'), 'an ANCHOR attribute in prose anchors no variant');
  assert.ok(!has('UNIT u\n  prose ANCHOR ref(rust:x)\n', 'cross-lang-anchor'));
  assert.ok(has('VARIANT spec ANCHOR ref(js:y) ref(rust:z)\n', 'cross-lang-anchor') && !has('VARIANT spec ANCHOR ref(lodash:y)\n', 'cross-lang-anchor'), 'the §14 variant form anchors');
});

test('#41 round 3: lifecycle/scheduler tokens are read per physical line — leading prose and ` # ` tails in, wraps and whole-line comments out', () => {
  const f = (t: string) => detectFeatures({ sirText: t });
  assert.ok(f('setTimer(1) schedule(x)\nUNIT a\n').includes('lifecycle') && f('setTimer(1) schedule(x)\nUNIT a\n').includes('scheduler'), 'prose before the first directive');
  assert.ok(f('NOTE x # setTimer\n').includes('lifecycle'), 'a literal tail the legacy parser cut as a comment');
  assert.ok(!f('DESCRIPTION a virtual CITED time\n').includes('scheduler') && !f('DESCRIPTION on virtual\n  time\n').includes('scheduler'), 'no token spans an attribute or a wrap');
  assert.ok(!f('UNIT u\n# setTimer\n  # schedule(x)\n').some((x) => x === 'lifecycle' || x === 'scheduler'), 'whole-line comments are unread');
  assert.ok(!f('setTimer(1)\n  PAR\nUNIT a\n').includes('par-interleaving'), 'leading prose never stamps a directive feature');
});

test('#45 tree_sha seam: every path is checked before any is written — the error never depends on entry order', () => {
  const err = (files: Record<string, string>) => { try { treeShaCheck(files); return null; } catch (e: any) { return e.message; } };
  assert.equal(err({ '/x': '1', '': '2' }), err({ '': '2', '/x': '1' }), 'entry order does not pick the error');
  assert.match(err({ 'a\u0000b': '1' })!, /a NUL in path/);
  assert.match(err({ a: '1', 'a/b': '2', '/x': '3' })!, /not a relative path "\/x"/, 'the invalid path is reported, not the host EEXIST');
  assert.match(err({ a: '1', 'a/b': '2' })!, /a file is also a directory/);
  assert.match(err({ '\ud800': '1' })!, /not well-formed text: path/);
  assert.match(err({ a: '\udc00' })!, /not well-formed text: content/);
  assert.match(err({ A: '1', a: '2' })!, /case-insensitive/);
  assert.equal(err({ 'src/lib.rs': 'x', 'Cargo.toml': '' }), null);
});

test('#46 cmp_ver: the error names a BigInt without JSON.stringify throwing its own TypeError', () => {
  assert.throws(() => cmpVer(1n as any, '1'), /not a version: 1 \(/);
  assert.throws(() => specVersionFor([1n as any]), /unknown feature 1 /);
});

test('#47 quorum: need is required — omitted and null throw the same error', () => {
  assert.throws(() => (quorum as any)([{ full: true }, { full: true }]), /need must be an integer >= 1 \(got undefined\)/);
  assert.throws(() => (quorum as any)([{ full: true }], null), /need must be an integer >= 1 \(got null\)/);
});

test('#49 capabilities.json is checked at load: a malformed entry fails now, not when a bundle first uses it', () => {
  assert.equal(checkCapabilities(capabilities), capabilities);
  const bad = (edit: (c: any) => void) => { const c = structuredClone(capabilities); edit(c); return () => checkCapabilities(c); };
  assert.throws(bad((c) => { c.features.ring.since = '0.4-rc'; }), /feature ring: since "0.4-rc" is not a version/);
  assert.throws(bad((c) => { delete c.features.vectors.generable; }), /implemented and generable must be booleans/);
  assert.throws(bad((c) => { c.features.envelope.rungs = []; }), /rungs must be a non-empty list/);
  assert.throws(bad((c) => { c.toolchain.languages.push('go'); }), /'go', which is not in languageRegistry/);
  assert.throws(bad((c) => { c.toolchain.maxSpecVersion = 'v0.4'; }), /maxSpecVersion "v0.4" is not a version/);
});
