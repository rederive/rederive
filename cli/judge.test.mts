// One judge (selfhost/FINDINGS.md #162–#164): the js/ts driver calls exactly the SIG's export, and the js envelope extension is
// graded by rdv with the lab's own rules. Each test fails on rederive@7f015c4d1023 (no cli/lang/native.mjs or extension.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { exportOf, resolveExport, nativeCaller } from './lang/native.mjs';
import { extensionCases, gradeExtension } from './lang/extension.mjs';
import { parseSig } from './sir/canon.mjs';

test('#162 the artifact is called through exactly the export its SIG names — never the default or "the first function"', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-')); const f = join(dir, 'a.mjs');
  writeFileSync(f, 'export function helper() { return "helper"; }\nexport function cmpVer() { return "named"; }\nexport default function () { return "default"; }\n');
  assert.equal((await resolveExport(f, 'export function cmpVer(a: string, b: string): number'))(), 'named');
  assert.equal((await resolveExport(f, 'export default function cmpVer(a: string): number'))(), 'default');
  assert.equal((await resolveExport(f, 'export const cmpVer = (a, b) => number'))(), 'named');
  await assert.rejects(resolveExport(f, 'export function missing(): number'), /no export named missing/);
  assert.deepEqual(exportOf('min_indent(input: string): number'), { name: 'min_indent', orDefault: true });
});

test('#164 the js extension: expected values escaped like results, Map/Set graded, an un-encodable expected is a verifier fault', async () => {
  const sig = parseSig('f(x: json) -> json');
  const ex = { frozen: [{ name: 'v1', args: [{ __t: 'map', entries: [['k', { __t: 'obj', v: { __threw: 'x' } }]] }], expected: { __t: 'map', entries: [['k', { __t: 'obj', v: { __threw: 'x' } }]] } }], heldout: [] };
  const ok = await gradeExtension({ typeCheck: { applicable: false }, callBatch: nativeCaller((m: Map<string, unknown>) => m) }, extensionCases(ex, sig), sig);
  assert.equal(ok.exact, true, 'an identity artifact passes a Map holding a marker-keyed map');
  const wrong = await gradeExtension({ typeCheck: { applicable: false }, callBatch: nativeCaller(() => new Map([['k', { y: 1 }]])) }, extensionCases(ex, sig), sig);
  assert.equal(wrong.exact, false);
  let deep: any = 1; for (let i = 0; i < 120; i++) deep = [deep];
  assert.throws(() => extensionCases({ frozen: [{ name: 'd', args: [1], expected: deep }], heldout: [] }, sig), (e: any) => e.verifierFault === true);
});

test('the driver hands an artifact the argument the oracle was stamped from: a Buffer stays a Buffer (escape_property v61)', async () => {
  const call = nativeCaller((v: any, m: any, s: any) => [Buffer.isBuffer(v), String(v), m instanceof Map, s instanceof Set]);
  const buf = Buffer.from('a:b,é');
  const [r] = await call([[buf, new Map([[1, 'x']]), new Set([2])]]);
  assert.deepEqual(r, [true, 'a:b,é', true, true]);
  const [u] = await call([[Uint8Array.from([1, 2])]]); assert.deepEqual(u, [false, '1,2', false, false], 'a plain Uint8Array stays plain');
  const arg = [1, 2]; await nativeCaller((a: any) => { a.push(3); return a.length; })([[arg]]); assert.deepEqual(arg, [1, 2], 'a mutating artifact never corrupts the next case');
});
