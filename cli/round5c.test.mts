// Round 5c of rederive's self re-derivation (selfhost/FINDINGS.md #123–#136): the round-5b re-cuts' findings. Each test FAILS
// on rederive@6199e2cc8b75:
//   RDV_KERNEL=selfhost/.authority/6199e2cc8b75 npx tsx --test cli/round5c.test.mts     (expect failures)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = join(new URL('..', import.meta.url).pathname, process.env.RDV_KERNEL ?? '');
const load = (p: string) => import(pathToFileURL(join(ROOT, p)).href);
const F = await load('cli/features.mjs'), T = await load('cli/lang-ts.mts'), A = await load('cli/lib/adopt.mts');

test('#123 a begin marker wrapped over lines is still a begin marker', () => {
  const sec = '## Rules\n- Never deploy on Friday.\n- Ask before merging.\n';
  assert.equal(A.findUnmanagedDuplicate(`<!--\u00a0rederive:begin\n v1 -->\n${sec}<!-- rederive:end -->\n`, sec), null, 'the managed block is never an unmanaged copy');
});

test('#129 a quoted none is still carried data', () => {
  assert.ok(F.detectFeatures({ sirText: 'CARRIED-DATA "none"' }).includes('carried-data'));
});

test('#134 the any-ban reads a word next to non-ASCII code and a line comment ends at any terminator', () => {
  for (const src of ['const x: any = 1;', 'const y = 1 as any;', 'let z:\u200bany;', '// c\u2028const w: any = 1;']) assert.ok(T.anyBanHits(src).length > 0, JSON.stringify(src));
});

test('#135 adopt keeps code in a nested fence, sentence order, span boundaries and a bare asterisk', () => {
  const K = A.extractKeptContent;
  assert.deepEqual(K('~~~md\n```\nrm -s .env\n```\n~~~', 'RM -S .ENV'), ['~~~md\n```\nrm -s .env\n```\n~~~']);
  assert.deepEqual(K('- Back up the database. Drop the table.', '- Drop the table. Back up the database.'), ['- Back up the database. Drop the table.']);
  assert.deepEqual(K('Sort with `ls` -S.', 'Sort with `ls -s`.'), ['Sort with `ls` -S.']);
  assert.deepEqual(K('Never commit *.env files.', 'Never commit `.env` files.'), ['Never commit *.env files.']);
  assert.deepEqual(K('**Never** deploy on Friday.', 'Never deploy on Friday.'), ['**Never** deploy on Friday.'], '#144: emphasis is kept, never guessed');
});

test('#136 the SIG check resolves types the artifact declares, and still refuses a wrong signature', () => {
  const tsc = T.findTsc([process.cwd(), ROOT]); if (!tsc) return;
  const dir = mkdtempSync(join(tmpdir(), 'r5c-')); const sig = 'export function parse_type(s: string): TypeNode';
  const check = (src: string) => { const p = join(dir, `a${Math.random().toString(36).slice(2)}.ts`); writeFileSync(p, src); const r = T.prepareTs(tsc, p, sig); r.cleanup(); return r.typeCheck.ok; };
  assert.equal(check('type TypeNode = { k: string };\nexport function parse_type(s: string): TypeNode { return { k: s }; }\n'), true);
  assert.equal(check('type TypeNode = { k: string };\nexport function parse_type(s: number): TypeNode { return { k: String(s) }; }\n'), false);
});

test('#139 a CARRIED-DATA value behind an attribute keyword still declares carried data', () => {
  for (const t of ['CARRIED-DATA ANCHOR sbox.json', 'CARRIED-DATA CITED sbox.json', 'CARRIED-DATA none\n  EARNED sbox.json']) assert.ok(F.detectFeatures({ sirText: t }).includes('carried-data'), t);
  assert.ok(!F.detectFeatures({ sirText: 'CARRIED-DATA none' }).includes('carried-data'));
});

test('#142 the any-ban: U+0085 separates, a Unicode-cased directive counts, a line-start `/` after an operand is also read as code', () => {
  assert.ok(T.anyBanHits('export let x:\u0085any = 1;').length > 0);
  assert.ok(T.anyBanHits('// @ts-nochec\u212A\nlet a: number = "x";').length > 0);
  assert.ok(T.anyBanHits('const a = 4, b = 2, g = 1\nexport const z = a\n/ b; export let y: any = 1; export const w = 1 /g').length > 0);
  assert.deepEqual(T.anyBanHits('const o = { any\u00a0: 1 };'), [], 'an NBSP before the colon is still a key');
});

test('#144 adopt: nested fence lines are content, no bold guessing, raw NUL text, contiguous sentences', () => {
  const K = A.extractKeptContent;
  assert.equal(K('~~~md\n```bash\nrm -rf build\n```\n~~~', '```sh\nrm -rf build\n```').length, 1);
  assert.equal(K('Skip **/node_modules/** always.', 'Skip /node_modules/ always.').length, 1);
  assert.equal(K('x\u0000 Run `ls -S. Then` now.', 'x\u0000 run `ls -s. Then` NOW.').length, 1);
  assert.equal(K('Never deploy. Ask first.', 'Never deploy. Except today. Ask first.').length, 1);
  assert.deepEqual(K('Never deploy. Ask first.', 'Never deploy. Ask first. Ship.'), []);
  assert.deepEqual(K('```\nnpm test\n```', '```\nnpm test\n```'), []);
});

test('#146 adopt: a fence keys with its opener, and an unclosed fence is always kept', () => {
  const K = A.extractKeptContent;
  assert.deepEqual(K('Rule.\n\n```bash', 'Other.\n```bash'), ['Rule.', '```bash']);
  assert.equal(K('```bash\nls\n```', '```py\nls\n```').length, 1);
  assert.deepEqual(K('```\nnpm test\n```', '```\nnpm test\n```'), []);
});

test('#148 the any-ban: a regex body is also read as code, and the key test never crosses a line', () => {
  for (const t of ['type C<T> = T extends string ?\n  any\n  : never;', 'let n = 1; const b = 2, g = 3;\nexport const z = n++\n/ b; export let y: any = 1; export const w = 1 /g',
    'const a = 4, b = 2, g = 1;\nexport const z = a /*\n*/ / b; export let y: any = 1; export const w = 1 /g', 'x = o.in\n/ b; let y: any = 1; /g']) assert.ok(T.anyBanHits(t).length > 0, JSON.stringify(t));
  assert.deepEqual(T.anyBanHits('interface I {\n  a: string\n  any: number\n}'), []);
});

test('#149 a line-start slash is read both ways: a misread divide never hides the rest of the file', () => {
  for (const t of ['const a = 4, b = 2;\nexport const z = a /*\n*/ / b; export const c = "x/"; export let y: any = 1;',
    'let n = 1; const b = 2;\nexport const z = n++\n/ b; export const c = `x/`; export let y: any = 1;\nexport const t = `\n`;',
    'declare const o: { in: number }; const b = 2;\nexport const z = o.in\n/ b; export const c = "/"; export let y: any = 1;']) assert.deepEqual(T.anyBanHits(t), [': any@3'], JSON.stringify(t));
  assert.deepEqual(T.anyBanHits('const r = /[a-z]+/g;\nconst q = "ok";'), []);
});

test('#150 every regex is read both ways: a keyword-spelt identifier before a divide hides nothing', () => {
  assert.deepEqual(T.anyBanHits('const of = 4, b = 2;\nexport const z = of / b; export const c = "x/"; export let y: any = 1;'), [': any@2']);
  assert.deepEqual(T.anyBanHits('declare const o: { in: number }; const b = 2;\nexport const z = o.in / b; export const c = "x/"; export let y: any = 1;'), [': any@2']);
});

test('#152 the js-native codec encodes a Map and a Set (insertion order); the neutral codec still refuses them', async () => {
  const C = await load('cli/sir/canon.mjs'); const t = C.parseType('json');
  assert.equal(C.encodeJsNative(new Map([['b', 1], ['a', 2]]), t).t, 'jsmap');
  assert.notEqual(C.canonicalString(C.encodeJsNative(new Map([['b', 1], ['a', 2]]), t)), C.canonicalString(C.encodeJsNative(new Map([['a', 2], ['b', 1]]), t)));
  assert.equal(C.encodeJsNative(new Set([1]), t).t, 'jsset');
  assert.throws(() => C.encode(new Map(), t), /envelope fact/);
});

test('#153 escapeMarkers descends a Set: a marker-shaped member never grades as a tag', async () => {
  const C = await load('cli/sir/canon.mjs'); const t = C.parseType('json'); const g = (v: unknown) => C.canonicalString(C.encodeJsNative(C.escapeMarkers(v), t));
  assert.notEqual(g(new Set([{ __t: 'bigint', v: '1' }])), g(new Set([1n])));
});

test('#158 a SIG may return an object type with ; separators; a top-level ; is still a second declaration', () => {
  assert.equal(T.sigOf('export default function q(a: number): { b: number; c: boolean }').exportName, null);
  assert.throws(() => T.sigOf('export function f(a: number): number; export const x = 1'), /more than one declaration/);
  assert.throws(() => T.sigOf('export function f(a: { b: string }): number } ; const y = 2'), /more than one declaration/);
});
