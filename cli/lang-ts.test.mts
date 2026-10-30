// Phase 2a gate (SIR_V05_PLAN Phase 2, `@fixture/lang`, TypeScript half): rdv verifies a lang:ts variant through its own
// driver. Every control fails on exactly ONE thing, and says which.
// Run: npm run build && npx tsx --test cli/lang-ts.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, mkdirSync, symlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sigOf, anyBanHits, findTsc } from './lang-ts.mts';

const ROOT = new URL('..', import.meta.url).pathname;
const FX = ROOT + 'experiments/v05-p2-lang-ts/';
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const check = (dir: string, cwd = ROOT, cli = 'dist') => {
  const r = cli === 'dist' ? spawnSync('node', [ROOT + 'dist/cli.cjs', 'check', dir], { cwd, encoding: 'utf8' })
    : spawnSync('npx', ['tsx', ROOT + 'cli/rdv.mts', 'check', dir], { cwd, encoding: 'utf8' });
  return { status: r.status, out: plain(r.stdout + r.stderr) };
};
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
/** A scratch copy of the good bundle with src/bytes.ts rewritten (and its srcSha256 re-stamped, as a publisher would). */
function mutated(edit: (src: string) => string) {
  const dir = mkdtempSync(join(tmpdir(), 'rdv-p2a-')); cpSync(FX + 'bundle', dir, { recursive: true });
  const srcPath = join(dir, 'src/bytes.ts'); const before = readFileSync(srcPath, 'utf8'); const after = edit(before);
  assert.notEqual(after, before, 'the mutation must change the source');
  writeFileSync(srcPath, after);
  const mp = join(dir, 'sir.manifest.json'); const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.units[0].variants['lang:ts'].srcSha256 = sha(srcPath); writeFileSync(mp, JSON.stringify(m, null, 2));
  return dir;
}

test('sigOf reads default, named, generic and callback-typed SIGs as function types', () => {
  assert.deepEqual(sigOf('export default function bytes(value: unknown, options?: unknown): string | number | null'),
    { exportName: null, fnType: '(value: unknown, options?: unknown) => string | number | null' });
  assert.deepEqual(sigOf('export function pick<T>(xs: readonly T[], f: (x: T) => boolean): T | null'),
    { exportName: 'pick', fnType: '<T>(xs: readonly T[], f: (x: T) => boolean) => T | null' });
  assert.throws(() => sigOf('export const x = 1'), /not an exported function/);
  assert.throws(() => sigOf('export default function f(a: string)'), /no return type/);
});

test('the any-ban lints code, not comments or strings', () => {
  assert.deepEqual(anyBanHits('// rows 7-8: any callable\nconst s = "x: any";\n'), []);
  assert.deepEqual(anyBanHits('const a = (1 as any);\n'), ['as any@1']);
  assert.deepEqual(anyBanHits('const n = m.get(k)!.size;\n'), ['non-null assertion@1']);
  assert.deepEqual(anyBanHits('// @ts-ignore\nconst x: number = "s";\n'), ['@ts-ignore@1']);
});

test('gate: the correct lang:ts variant VERIFIES at harness-verified (dist and tsx)', () => {
  for (const cli of ['dist', 'tsx']) {
    const r = check(FX + 'bundle', ROOT, cli);
    assert.equal(r.status, 0, `${cli}: ${r.out}`);
    assert.match(r.out, /✓ lang:ts\s+held-out 43\/43/);
    assert.match(r.out, /rung harness-verified\s+binding bound to primary 41de3c55a395…\s+tsc \S+ --strict ok, conforms to SIG/);
  }
});

test('gate: a widened return type FAILS at type-checked alone (held-out still 43/43)', () => {
  const r = check(FX + 'controls/widened');
  assert.equal(r.status, 1);
  assert.match(r.out, /✗ lang:ts\s+held-out 43\/43\s+hashes match/);
  assert.match(r.out, /rung none .*tsc \S+ --strict FAILED: conforms\.ts.*TS2322/);
  assert.match(r.out, /✓ package\s+held-out 43\/43/, 'the package variant is untouched by the ts verdict');
});

test('gate: a primary edited after the language file was bound FAILS on the binding alone', () => {
  const r = check(FX + 'controls/stale');
  assert.equal(r.status, 1);
  assert.match(r.out, /✗ lang:ts\s+held-out 43\/43\s+hashes match/);
  assert.match(r.out, /rung none .*binding STALE: bound to 41de3c55a395…, primary is [0-9a-f]{12}…\s+tsc \S+ --strict ok/);
});

test('control: a behavior change that still type-checks FAILS on held-out, earning type-checked only', () => {
  const r = check(mutated((s) => s.replace('kb: 1024,', 'kb: 1000,')));
  assert.equal(r.status, 1);
  assert.match(r.out, /✗ lang:ts\s+held-out (\d+)\/43 miss=/);
  assert.match(r.out, /rung type-checked .*--strict ok, conforms to SIG/);
});

test('control: an otherwise-correct artifact using `as any` FAILS the type-checked rung', () => {
  const r = check(mutated((s) => s.replace('export default function bytes(', 'const escape = (1 as any);\nexport default function bytes(')));
  assert.equal(r.status, 1);
  assert.match(r.out, /✗ lang:ts\s+held-out 43\/43/);
  assert.match(r.out, /--strict ok, conforms to SIG; any-ban: as any@\d+/);
});

test('control: a tampered src (hash not re-stamped) FAILS on hashes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rdv-p2a-')); cpSync(FX + 'bundle', dir, { recursive: true });
  writeFileSync(join(dir, 'src/bytes.ts'), readFileSync(join(dir, 'src/bytes.ts'), 'utf8') + '\n// tampered\n');
  const r = check(dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /✗ lang:ts .*hashes MISMATCH \(src:false/);
});

test('no TypeScript on this machine: the bundle HALTS with the install hint, before grading anything', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rdv-p2a-notsc-')); cpSync(FX + 'bundle', dir, { recursive: true });
  assert.equal(findTsc([dir]), null, 'precondition: no typescript resolvable from the scratch dir');
  const r = check(dir, dir);
  assert.equal(r.status, 1);
  assert.match(r.out, /needs a ts toolchain/);
  assert.match(r.out, /HALTED — carries lang:ts, whose toolchain is not on this machine \(npm i -D typescript @types\/node\)\. Install it to verify\./);
  assert.doesNotMatch(r.out, /held-out/);
});

test('a ts artifact importing a Node built-in verifies where @types/node is installed', () => {
  const r = check(mutated((src) => "import { createHash } from 'node:crypto';\nvoid createHash;\n" + src));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /rung harness-verified .*tsc \S+ --strict ok, conforms to SIG/);
});

test('...and without Node type definitions it reports the missing toolchain, never a type error in the artifact', () => {
  const dir = mutated((src) => "import { createHash } from 'node:crypto';\nvoid createHash;\n" + src);
  const host = mkdtempSync(join(tmpdir(), 'rdv-p2a-notypes-')); mkdirSync(join(host, 'node_modules'));   // typescript here, @types/node not
  symlinkSync(ROOT + 'node_modules/typescript', join(host, 'node_modules', 'typescript'));
  const b = join(host, 'bundle'); cpSync(dir, b, { recursive: true });
  const r = check(b, host);
  assert.equal(r.status, 1);
  assert.match(r.out, /no Node type definitions are installed here \(npm i -D @types\/node\) — not checked/);
  assert.doesNotMatch(r.out, /TS2591/);
});

test('a ts artifact using an ES2024 built-in (String.prototype.isWellFormed) type-checks where Node runs it (22+)', () => {
  // the scar (selfhost encode_value round 2, ts emit_3): --target es2022 rejected it (TS2550) though Node 24 runs it
  const r = check(mutated((src) => "const wellFormed: boolean = 'a'.isWellFormed();\nvoid wellFormed;\n" + src));
  if (Number(process.versions.node.split('.')[0]) < 22) { assert.equal(r.status, 1); return; }
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /rung harness-verified .*tsc \S+ --strict ok, conforms to SIG/);
  assert.doesNotMatch(r.out, /TS2550/);
});
