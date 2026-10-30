// Round 4 of rederive's self re-derivation (selfhost/FINDINGS.md #55–#68): one assertion per finding fixed, each of which
// FAILS on the round-3 kernel (rederive@31803f408bef). Prove that with:
//   RDV_KERNEL=selfhost/.authority/31803f408bef npx tsx --test cli/round4.test.mts     (expect failures)
//   npx tsx --test cli/round4.test.mts                                                  (expect all pass)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(new URL('..', import.meta.url).pathname, process.env.RDV_KERNEL ?? '');
const load = (p: string) => import(pathToFileURL(join(ROOT, p)).href);
const P = await load('cli/sir/sir-parse.mjs'), V = await load('cli/sir/v05.mjs'), C = await load('cli/sir/canon.mjs'), F = await load('cli/features.mjs');
const names = (t: string) => P.parse(t).ast.map((d: any) => d.name);

test('#59 an escape pair is a backslash and ANY one code point (U+2028 too): the pairing holds and the comment splits', () => {
  assert.deepEqual(P.splitTrailingComment('SIG "a\\ " # b "c"'), ['SIG "a\\ "', 'b "c"']);
  assert.ok(!F.detectFeatures({ sirText: 'EFFECT "\\ " # " microtask' }).includes('scheduler'), 'a commented-out token stamps nothing');
});

test('#60 a quote opens only at a token start; a quoted CITED is data', () => {
  assert.deepEqual(P.splitTrailingComment('SIG pipe 12" wide # note "q'), ['SIG pipe 12" wide', 'note "q'], 'an inch mark opens nothing');
  assert.deepEqual(P.splitTrailingComment('PINNED regex Q = /"/ # c "x"'), ['PINNED regex Q = /"/', 'c "x"'], 'a quote inside a pattern opens nothing');
  const d = P.parse('R1 "a CITED b" null').ast[0];
  assert.equal(d.args, '"a CITED b" null'); assert.deepEqual(d.attrList, []);
});

test('#61 a name glued by an invisible format character is reported, never silent prose', () => {
  for (const sep of ['​', '⁠', '᠎', '\u0085'])
    assert.ok(P.parse(`UNIT x\nBEHAVIOR${sep}y`).warnings.some((w: any) => w.code === 'W_NAME_SEPARATOR'), `U+${sep.codePointAt(0)!.toString(16)}`);
  assert.ok(V.leakLint(`LANG ts\nBEHAVIOR​x`, { isPrimary: false }).hits.length > 0, 'the leak lint reads the same glued rule');
});

test('#62 a column-0 CITED is a citation everywhere; `CITED:` reports no colon fix it never applied; directive() refuses CITED', () => {
  assert.equal(V.leakLint('UNIT x\nCITED null\n', { isPrimary: true }).hits.length, 0, 'the lint ignores what the parser attaches as a citation');
  assert.ok(!P.parse('UNIT x\nCITED: y').warnings.some((w: any) => w.code === 'W_LEGACY_COLON'));
  assert.throws(() => V.directive('SIG a\nCITED x', 'CITED'), /attribute/);
});

test('#63 one .sir fold, every dotted segment read, a pinned hidden set, one claim rule however a variant is keyed', () => {
  assert.deepEqual([...F.languagesOf({ sirFiles: ['x.ts.ſir'] })], [], 'U+017F is not s');
  assert.throws(() => F.languagesOf({ sirFiles: ['x.go.ts.sir'] }), /dotted segments/);
  assert.throws(() => F.languagesOf({ sirFiles: ['x.sir'] }), /invisible or non-ASCII/, 'a private-use tail is hidden by the pinned set');
  assert.throws(() => F.languagesOf({ variants: { 'Lang:ts': {} } }), /a variant key is/);
  assert.throws(() => F.languagesOf({ variants: { package: { sir: '' } } }), /a path to a .sir file/);
  assert.throws(() => F.languagesOf({ variants: { package: { lang: 'ts', sir: 'u.sir' } } }), /names no language/);
});

test('#64 the detector reads the parser whitespace rule, and an ANCHOR citation is never an anchor', () => {
  assert.ok(F.detectFeatures({ sirText: 'CARRIED-DATA  none　' }).includes('carried-data'), 'NBSP / U+3000 are content');
  assert.ok(!F.detectFeatures({ sirText: 'ANCHOR x CITED ref(php:y)' }).includes('cross-lang-anchor'));
  assert.ok(!F.detectFeatures({ sirText: 'ANCHOR ref(　js:y)' }).includes('cross-lang-anchor'));
  assert.ok(F.detectFeatures({ envelope: '　' }).includes('envelope'));
});

test('#65 duplicate union alternatives are compared as types, and an alternative an earlier json covers is unreachable', () => {
  for (const t of ['list[text|none] | list[none|text]', 'record[a: text, b: i64] | record[b: i64, a: text]', 'json | text', 'json | list[bool]'])
    assert.throws(() => C.parseType(t), /twice|unreachable/, t);
  for (const t of ['text | json', 'i64 | u64', 'json | i64', 'none | text']) assert.doesNotThrow(() => C.parseType(t), t);
});

test('#66 decode: one spelling per value, own-key tags, a value-depth cap; legacy num underflow refused in both signs', () => {
  assert.throws(() => C.decode({ t: 'text', v: 'plain', cu: 'utf16' }), /well-formed/);
  assert.throws(() => C.decode({ t: 'constructor' }), /unknown tag/);
  assert.throws(() => C.decode({ t: 'record', v: [['\ud800', { t: 'none' }]] }), /well-formed/);
  let d: any = { t: 'none' }; for (let i = 0; i < 5000; i++) d = { t: 'list', v: [d] };
  assert.throws(() => C.decode(d), /nests deeper/, 'a grammar error, not the host stack');
  let v: any = []; for (let i = 0; i < 5000; i++) v = [v];
  assert.throws(() => C.encode(v, { k: 'json' }), /nests deeper/);
  assert.throws(() => C.encode({ __t: 'num', v: '1e-400' }, { k: 'f64' }), /underflows/);
  assert.throws(() => C.encode({ __t: 'num', v: '-1e-400' }, { k: 'f64' }), /underflows/);
});

test('#55 #58 a throw marker is exactly one own key; a returned marker-keyed map is escaped and grades as a map', () => {
  assert.equal(C.encode({ __threw: 'x', y: 1 }, { k: 'json' }).t, 'map', 'not a throw: other keys');
  assert.equal(C.encode(C.escapeMarkers({ __threw: 'x' }), { k: 'json' }).t, 'map', 'an escaped user map');
  assert.equal(C.encode(C.escapeMarkers([{ a: { __t: 'num', v: 'NaN' } }]), { k: 'json' }).v[0].v[0][1].t, 'map', 'at any depth');
  assert.equal(C.encode({ __threw: 'x' }, { k: 'json' }).t, 'throw', "a driver's own catch is still a throw");
});

test('#68 indexed assignment includes the compound forms, never an arrow', () => {
  const what = (l: string) => V.transcriptionLint(l).hits.map((h: any) => h.what);
  assert.ok(what('BEHAVIOR a[i] += 1').includes('indexed assignment')); assert.ok(what('BEHAVIOR a[i] ||= x').includes('indexed assignment'));
  assert.ok(!what('BEHAVIOR x[0] => y').includes('indexed assignment'));
});

test('#51 (part) a Rust carried integer past 2^53 throws rather than round', () => {
  assert.throws(() => V.rustCarriedTable('const T: &[(&str, u64)] = &[("max", 18446744073709551615)];', 't.rs'), /no exact JSON number/);
  assert.deepEqual(V.rustCarriedTable('const T: &[(&str, u64)] = &[("ok", 9007199254740991)];', 't.rs'), { ok: 9007199254740991 });
});
