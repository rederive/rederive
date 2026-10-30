// Round 5 of rederive's self re-derivation (selfhost/FINDINGS.md #74–#97): what the round-4 re-cuts and the first Tier 2/3 cuts
// found, one test per finding fixed, each FAILING on the round-4 kernel (rederive@978444f3baf3). Prove that with:
//   RDV_KERNEL=selfhost/.authority/978444f3baf3 npx tsx --test cli/round5.test.mts     (expect failures)
//   npx tsx --test cli/round5.test.mts                                                  (expect all pass)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(new URL('..', import.meta.url).pathname, process.env.RDV_KERNEL ?? '');
const load = (p: string) => import(pathToFileURL(join(ROOT, p)).href);
const P = await load('cli/sir/sir-parse.mjs'), V = await load('cli/sir/v05.mjs'), C = await load('cli/sir/canon.mjs'), F = await load('cli/features.mjs');
const T = await load('cli/lang-ts.mts'), A = await load('cli/lib/adopt.mts'), PR = await load('cli/lib/profile.mts'), R = await load('cli/lang/rust.mjs'), VD = await load('cli/verdict.mts');
const nest = (n: number, leaf: any = 'x') => { let v = leaf; for (let i = 0; i < n; i++) v = [v]; return v; };

test('#74 #79 union coverage is structural, and json covers tuples and records of json parts', () => {
  for (const t of ['list[json] | list[text]', 'map[text, json] | map[text, text]', 'tuple[json] | tuple[text]', 'record[a: text] | record[a: text, b: none]', 'json | tuple[text]', 'json | record[a: text]'])
    assert.throws(() => C.parseType(t), /unreachable|twice/, t);
  for (const t of ['list[text] | list[json]', 'record[a: text, b: none] | record[a: text]']) assert.doesNotThrow(() => C.parseType(t), t);
});

test('#78 one value-depth model: 100 values encode, 101 throw; a 16-deep type is itself a carriable value; no host stack overflow', () => {
  assert.equal(C.encode(nest(100), { k: 'json' }).t, 'list');
  assert.throws(() => C.encode(nest(101), { k: 'json' }), /nests deeper than 100/);
  let ty = 'text'; for (let i = 0; i < 16; i++) ty = `record[f: ${ty} | none]`;
  const tree = C.parseType(ty); assert.doesNotThrow(() => C.canonicalString(C.encode(tree, { k: 'json' })), 'the deepest legal type is a value the codec carries');
  let m: any = 'a'; for (let i = 0; i < 1600; i++) m = { a: m };
  assert.throws(() => C.canonicalString(m), /nests deeper than/, 'a cap message, never a RangeError');
});

test('#81 escapeMarkers descends into a Map', () => {
  const e = C.encode(C.escapeMarkers(new Map([['a', { __throw: 'boom' }]])), { k: 'map', key: { k: 'text' }, val: { k: 'json' } });
  assert.equal(e.t, 'map'); assert.equal(e.v[0][1].t, 'map', 'the marker-shaped value is a map, not a throw');
});

test('#75 #76 #83 #84 #85 parser: wider token-start openers, adjacent literals, a BOM after the indent, glued colons and invisible leads reported', () => {
  assert.deepEqual(P.splitTrailingComment('SIG a|"b # c"'), ['SIG a|"b # c"', null]);
  assert.deepEqual(P.splitTrailingComment('R3 "a""b # c" d'), ['R3 "a""b # c" d', null]);
  assert.deepEqual(P.splitTrailingComment('PINNED regex Q = /"/ # c "x"'), ['PINNED regex Q = /"/', 'c "x"'], '`/` stays a non-opener');
  assert.deepEqual(P.sirLines('a\n  ﻿"b"'), ['a', '  "b"']);
  const sep = (t: string) => P.parse(t).warnings.filter((w: any) => w.code === 'W_NAME_SEPARATOR').map((w: any) => w.msg);
  assert.equal(sep('UNIT u\nR1:​x').length, 1, 'a NAME: glued by U+200B');
  assert.equal(sep('UNIT u\n⁠KIND k').length, 1, 'an invisible lead');
  assert.match(sep('UNIT u\nCITED x')[0], /not an attribute/);
  assert.equal(sep('UNIT u\nKIND⁥k').length, 0, 'U+2065 is unassigned in the pinned set (Unicode 17.0), on every host');
});

test('#77 a variant key is package or lang:<id>; a unit name has no invisible or space characters; a variant sir names a .sir file', () => {
  for (const k of [' lang:ts', 'lang​:ts', 'lаng:ts', 'native']) assert.throws(() => F.languagesOf({ variants: { [k]: {} } }), /a variant key is/, k);
  assert.throws(() => F.languagesOf({ sirFiles: ['x y.ts.sir'] }), /unit name/);
  assert.throws(() => F.languagesOf({ variants: { package: { sir: '/' } } }), /a path to a .sir file/);
});

test('#86 a quoted literal or a citation never stamps a feature', () => {
  for (const t of ['NOTE we never call "setTimer"', 'EFFECT "microtask"', 'NOTE x CITED virtual time', 'ANCHOR see "ref(js:x)" for the syntax'])
    assert.deepEqual(F.detectFeatures({ sirText: t }), ['vectors'], t);
  assert.ok(F.detectFeatures({ sirText: 'DESCRIPTION clock.setTimer(fn, ms)' }).includes('lifecycle'), 'prose tokens still count');
});

test('#87 the any-ban is a lexer: real escapes hit, strings and comments do not', () => {
  for (const s of ['type T = any;', 'let r: Record<string, any>;', 'let y = x!', 'x![0]', 'const s = "src/*.ts"; let a: any = 1; const h = "x*/";', 'const re = /\\//; const x: any = 1;', '// @ts-nocheck', '`${x as any}`'])
    assert.ok(T.anyBanHits(s).length > 0, s);
  for (const s of ['const s = "@ts-ignore"', '`\nx: any\n`', 'if (!x) return !y;', 'a !== b && c != d', 'function f(any: string) { return o.any; }', 'const r = /"/; const s = "x: any";'])
    assert.deepEqual(T.anyBanHits(s), [], s);
});

test('#88 a ts SIG is one type, held to the any-ban', () => {
  for (const s of ['export function f(a: string): string = impl as never; //', 'export function f(): any', 'export function f(...a: never[]): unknown']) assert.throws(() => T.sigOf(s), /more than one declaration|any or never/, s);
  assert.equal(T.sigOf('export function f<T extends (x: number) => void>(a: T): T').fnType, '<T extends (x: number) => void>(a: T) => T');
  assert.equal(T.sigOf('export function f(a: ")"): string').fnType, '(a: ")") => string');
});

test('#89 a hash pin is a pin: any falsy non-absent want throws, lone surrogates throw', () => {
  for (const w of ['', 0, false, NaN]) assert.throws(() => VD.hashOk('abc', w as any), /a pin is 64 lowercase hex/, String(w));
  assert.equal(VD.hashOk('abc', undefined), true, 'absent is "not pinned"');
  assert.throws(() => VD.hashOk('\ud800', 'a'.repeat(64)), /lone surrogate/);
});

test('#90 divergenceOf: a vote has no miss, one artifact counts once, an empty error is an error, an unknown slice throws', () => {
  const miss = { slice: 'heldout', name: 'v8', args: [], expected: 'x' };
  const two = V.divergenceOf(1, [{ artifact: 'a', rungs: ['harness-verified'], _misses: [miss] }, { artifact: 'b', rungs: ['harness-verified'], _misses: [miss] }]);
  assert.equal(two.verdict, 'no-quorum');
  const dup = V.divergenceOf(1, [{ artifact: 'a', rungs: [], _misses: [miss, miss, miss] }, { artifact: 'b', rungs: ['harness-verified'] }]);
  assert.deepEqual(dup.heldoutDisagree[0].failedBy, ['a']); assert.equal(dup.heldoutDisagree[0].passedBy, 1);
  assert.equal(V.divergenceOf(1, [{ artifact: 'e', error: '', rungs: [] }, { artifact: 'f', rungs: ['harness-verified'] }]).quorum, '1/1');
  assert.throws(() => V.divergenceOf(1, [{ artifact: 'a', rungs: [], _misses: [{ ...miss, slice: 'Frozen' }] }]), /slice/);
});

test('#91 --adopt never deletes or drops the giver\'s text', () => {
  const section = '## Hard rules\n- Use the tools/lab scripts for every step\n- Never edit generated oracles by hand\n## Commands\nrun the verifier with node tools/x.mjs\n';
  const existing = '## Hard rules\n- Use the tools/lab scripts for every step\n## Giver only section\nmy own rule that is mine\n## Commands\n- Never edit generated oracles by hand\nrun the verifier with node tools/x.mjs\n## After\n';
  const b = A.findUnmanagedDuplicate(existing, section);
  assert.ok(!b || !existing.split('\n').slice(b.startLine, b.endLine).includes('my own rule that is mine'), 'a giver section between matched headings is never inside the block');
  assert.deepEqual(A.extractKeptContent('1. Never deploy on Friday. Ask Lane first.\n- Merge freely. Ask Lane first.', 'Merge freely. Ask Lane first.'), ['1. Never deploy on Friday. Ask Lane first.'], 'kept whole, condition included');
  assert.deepEqual(A.extractKeptContent('### Never deploy on Fridays\n- Run tests.', 'Run tests.'), ['### Never deploy on Fridays'], 'a heading is a rule too');
  const out = A.replaceUnmanagedBlock('# Top  \n\n## Block\nx\n\n    indented code after\n', { heading: '## Block', startLine: 2, endLine: 4 }, 'M');
  assert.equal(out, '# Top  \n\nM\n\n    indented code after\n', 'trailing spaces, indentation and the file ending survive');
  assert.throws(() => A.replaceUnmanagedBlock('a\nb\n', { heading: 'x', startLine: 2, endLine: 1 }, 'M'), /not a range/);
});

test('#92 rust reshape follows only an option union and never reshapes a wrong-length result into a record', () => {
  assert.deepEqual(R.reshape([1, 99], C.parseType('record[x: f64] | list[f64]')), [1, 99]);
  assert.deepEqual(R.reshape([1, 'x', 99], C.parseType('record[a: i64, b: text]')), [1, 'x', 99]);
  assert.deepEqual(R.reshape({ k: [1, 2] }, C.parseType('map[text, record[x: i64, y: i64]]')), { k: { x: 1, y: 2 } });
});

test('#93 the rust wire narrows what serde_json cannot carry, and its reader is immune to the Node 24.16 JSON.parse key bug', () => {
  const S = (t: string) => C.parseSig(t);
  for (const [v, t] of [[new Uint8Array([1]), 'f(a: json) -> text'], [NaN, 'f(a: text | f64) -> text'], [[1, , 3], 'f(a: list[i64]) -> text'], ['\ud800', 'f(a: text) -> text']] as any[])
    assert.ok(R.wireLine([v], S(t)).__narrowed, t);
  R.parseWire('{"é":1,"\\\\":2}'); assert.deepEqual(Object.keys(R.parseWire('{"é":1,"\\u0041":2}')), ['é', 'A']);
});

test('#94 carried data: the block is the CARRIED directive, a malformed line is refused, an assertion reads an own key, pins are pins', () => {
  const sha = 'b'.repeat(64);
  assert.equal(V.carriedDeclared(`CARRIED t FROM x\nORACLE o\n  CANONICAL-SHA256 ${sha}`).sha, null, 'the ORACLE\'s hash is not the table\'s');
  assert.throws(() => V.carriedDeclared(`CARRIED t FROM x\n  CANONICAL-SHA256 ${'A'.repeat(64)}`), /64 lowercase hex/);
  assert.throws(() => V.carriedDeclared('CARRIED t FROM x\n  AUTHORITY { equals: 1, expr: "a" }'), /AUTHORITY must read/);
  assert.equal(V.checkCarried({ sha: null, assertions: [{ expr: '__proto__', equals: {} }] }, { a: 1 }).attested, false);
  assert.deepEqual(V.pinLint('UNIT u\nPINNED x = 1 # not cited\nPINNED y\n  CITED R1\nEARNED round-2 heldout v3').hits.map((h: any) => h.line), [2]);
  assert.deepEqual(V.schemaLint('DEPENDS-ON tbl, none\nDEPENDS-ON none\n  colorNames', 'colorNames').hits.map((h: any) => h.line), [2]);
  assert.equal(V.carriedShapeType('record[u8: text, b: u8]').fields[0][0], 'u8', 'a field named u8 keeps its name');
  assert.throws(() => V.rustCarriedTable('&[("a", 255 as i8)]', 't.rs'), /changes the value/);
  assert.deepEqual(V.rustCarriedTable('const MAX: u64 = 18446744073709551615; const T: &[(&str, u8)] = &[("a", 1)];', 't.rs'), { a: 1 }, 'exactness is per entry, not per file');
});

test('#95 display tells values apart; diffHint reports a missing line and escapes its window', () => {
  assert.equal(C.display({ t: 'record', v: [['a:1, b', { t: 'i64', v: '2' }]] }), '{"a:1, b":2}');
  assert.equal(C.display({ t: 'bigint', v: '12' }), '12n');
  assert.match(PR.diffHint(Buffer.from('a\n'), Buffer.from('a')), /no line 2/);
  assert.match(PR.diffHint(Buffer.from('a\r\n'), Buffer.from('a\n')), /\\r/);
});
