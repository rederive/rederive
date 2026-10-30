// Round 5b of rederive's self re-derivation (selfhost/FINDINGS.md #99–#120): what the round-5 re-cuts found in the round-5
// fixes themselves. Each test FAILS on rederive@bb8ded84fa50:
//   RDV_KERNEL=selfhost/.authority/bb8ded84fa50 npx tsx --test cli/round5b.test.mts     (expect failures)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(new URL('..', import.meta.url).pathname, process.env.RDV_KERNEL ?? '');
const load = (p: string) => import(pathToFileURL(join(ROOT, p)).href);
const P = await load('cli/sir/sir-parse.mjs'), V = await load('cli/sir/v05.mjs'), C = await load('cli/sir/canon.mjs'), F = await load('cli/features.mjs');
const T = await load('cli/lang-ts.mts'), A = await load('cli/lib/adopt.mts'), PR = await load('cli/lib/profile.mts'), R = await load('cli/lang/rust.mjs');

test('#99 canonicalText is idempotent again: every U+FEFF in the leading run goes', () => {
  for (const t of [' ﻿ ﻿', '﻿ ﻿x', 'SIG a\n ﻿ ﻿"b # c"']) { const a = P.canonicalText(t); assert.equal(P.canonicalText(a), a, JSON.stringify(t)); }
});

test('#101 union coverage is linear-ish: a 16-deep union pair parses or refuses in well under a second', () => {
  const fields = Array.from({ length: 200 }, (_, i) => `f${i}: text`).join(', '); let a = `record[${fields}] | f64`, b = `record[${fields}] | text`;
  for (let i = 0; i < 15; i++) { a = `list[${a} | none]`; b = `list[${b} | none]`; }
  const t0 = Date.now(); try { C.parseType(`${a} | ${b}`); } catch { /* refused or not: only the time matters */ } assert.ok(Date.now() - t0 < 1000);
});

test('#104 one citation rule: EARNED with its own text cites, an invisible value does not', () => {
  assert.equal(V.pinLint('EARNED round-2 heldout v3').hits.length, 0);
  assert.equal(V.pinLint('EARNED\n  round-1').hits.length, 0, 'continuation counts');
  assert.equal(V.pinLint('PINNED x CITED  ').hits.length, 1);
  assert.equal(V.pinLint('PINNED x CITED ""').hits.length, 1);
});

test('#105 #107 an invisible lead before # is reported; * + ? never open a quote', () => {
  assert.ok(P.parse('UNIT u\n​# hidden').warnings.some((w: any) => w.code === 'W_NAME_SEPARATOR'));
  assert.equal(V.pinLint('PINNED regex Q = /"(?:a|b)*"/g CITED R5').hits.length, 0);
});

test('#108 #109 #116 carried gates refuse malformed input and the smuggling lint over-reads', () => {
  assert.throws(() => V.checkCarried({ sha: 'A'.repeat(64), assertions: [] }, {}), /64 lowercase hex/);
  assert.throws(() => V.checkCarried({ sha: null, assertions: [{ expr: 'a', equals: -0 }] }, { a: 0 }));
  assert.equal(V.schemaLint('DEPENDS-ON none # carried table').hits.length, 1);
  assert.throws(() => V.carriedDeclared(`CARRIED t FROM x\n  CANONICAL-SHA256: ${'a'.repeat(64)}`), /malformed sub-field/);
  assert.throws(() => V.carriedDeclared(`CARRIED t FROM x\nCANONICAL-SHA256 ${'a'.repeat(64)}`), /not indented/);
});

test('#110 #111 #118 adopt: one fence rule, the giver\'s own line ending, one managed item represents', () => {
  assert.deepEqual(A.extractKeptContent('1. Never deploy on Friday. Ask Lane first.', '- Never deploy on Friday.\n- Merge freely. Ask Lane first.'), ['1. Never deploy on Friday. Ask Lane first.']);
  assert.deepEqual(A.extractKeptContent('```\nrm -s .env\n```', 'Rm -S *.env'), ['```\nrm -s .env\n```']);
  assert.deepEqual(A.extractKeptContent('Keep me.\n<!-- rederive:end -->\nAlso keep me.', '').length, 1);
  assert.equal(A.replaceUnmanagedBlock('A\n\n## B\r\nx\r\n\n## C\nD\n', { heading: '## B', startLine: 2, endLine: 5 }, 'M'), 'A\n\nM\n\n## C\nD\n');
});

test('#112 #114 the any-ban and the SIG shim close the round-5 escapes', () => {
  assert.ok(T.anyBanHits('type F<T> = T extends string ? any : number;').length > 0);
  assert.ok(T.anyBanHits('const r = n++ / 2; const q: any = r / 3;').length > 0);
  assert.throws(() => T.sigOf('export default function f(...a: Parameters<typeof impl>): ReturnType<typeof impl>'), /typeof/);
});

test('#115 diffHint escapes tag characters and variation selectors', () => {
  assert.match(PR.diffHint(Buffer.from('❤'), Buffer.from('❤️')), /\\ufe0f/);
});

test('#119 #120 the rust wire narrows absent values, holes and big whole numbers; parseWire takes text only', () => {
  const S = C.parseSig;
  assert.ok(R.wireLine([undefined], S('f(m: json) -> text')).__narrowed);
  assert.ok(R.wireLine([[1, , 3]], S('f(a: tuple[i64, i64 | none, i64]) -> text')).__narrowed);
  assert.ok(R.wireLine([2 ** 63], S('f(m: json) -> text')).__narrowed);
  assert.throws(() => R.parseWire(['[', ']'] as any), /not text/);
});

test('#117 decode refuses a throw node at the cap', () => {
  let d: any = { t: 'throw', msg: 'm' }; for (let i = 0; i < 100; i++) d = { t: 'list', v: [d] };
  assert.throws(() => C.decode(d), /nests deeper/);
});
