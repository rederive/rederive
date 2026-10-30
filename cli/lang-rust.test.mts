// Phase 2 gate (SIR_V05_PLAN Phase 2, `@fixture/lang`): one v0.5 bundle, three languages, one canonical oracle. rdv verifies
// lang:js, lang:ts and lang:rust each through its own driver; every control fails on exactly ONE thing.
// Run: npm run build && npx tsx --test cli/lang-rust.test.mts   (needs cargo; builds a Rust harness per check)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { treeSha } from './tree-sha.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const FX = ROOT + 'experiments/v05-p2-lang/';
const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const check = (dir: string, env: NodeJS.ProcessEnv = process.env) => {
  const r = spawnSync(process.execPath, [ROOT + 'dist/cli.cjs', 'check', dir], { cwd: ROOT, encoding: 'utf8', env });
  return { status: r.status, out: plain(r.stdout + r.stderr) };
};
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const row = (out: string, lang: string) => out.split('\n').slice(out.split('\n').findIndex((l) => l.includes(`lang:${lang} `))).slice(0, 3).join('\n');
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'rdv-p2-')); cpSync(FX + 'bundle', d, { recursive: true }); return d; };
const manifest = (d: string) => JSON.parse(readFileSync(join(d, 'sir.manifest.json'), 'utf8'));
const save = (d: string, m: any) => writeFileSync(join(d, 'sir.manifest.json'), JSON.stringify(m, null, 2));

test('gate: @fixture/lang VERIFIES in js, ts and rust on the one canonical oracle', () => {
  const r = check(FX + 'bundle');
  assert.equal(r.status, 0, r.out);
  for (const l of ['js', 'ts', 'rust']) assert.match(row(r.out, l), /✓ lang:\S+\s+held-out 13\/13\s+hashes match[\s\S]*rung harness-verified\s+binding bound to primary/, l);
  assert.match(row(r.out, 'ts'), /tsc \S+ --strict ok, conforms to SIG/);
  assert.match(row(r.out, 'rust'), /cargo check ok \(library crate\)/);
});

test('gate: a ts artifact with a widened return type FAILS at type-checked alone; js and rust unaffected', () => {
  const r = check(FX + 'controls/ts-widened');
  assert.equal(r.status, 1);
  assert.match(row(r.out, 'ts'), /✗ lang:ts\s+held-out 13\/13[\s\S]*rung none .*TS2322/);
  assert.match(row(r.out, 'js'), /✓ lang:js/); assert.match(row(r.out, 'rust'), /✓ lang:rust/);
});

test('gate: a rust artifact whose empty case wraps to 2^64-1 FAILS on the u64 comparison alone, all 64 bits intact', () => {
  const r = check(FX + 'controls/rust-wrap');
  assert.equal(r.status, 1);
  assert.match(row(r.out, 'rust'), /✗ lang:rust\s+held-out 9\/13 miss=[\s\S]*rung type-checked .*cargo check ok/);
  assert.match(r.out, /first miss \(""\) expected 0 got 18446744073709551615/, 'the full u64 crosses the harness: never rounded to 18446744073709552000');
});

test('gate: a rust artifact returning u32 for the SIG\'s u64 FAILS at type-checked alone, on the result pin', () => {
  const r = check(FX + 'controls/rust-narrowed');
  assert.equal(r.status, 1);
  assert.match(row(r.out, 'rust'), /✗ lang:rust[\s\S]*rung none .*the trait bound `u32: DeclaredResult<u64>` is not satisfied/);
  assert.match(row(r.out, 'ts'), /✓ lang:ts/);
});

test('control: one byte changed anywhere in the crate (hash not re-stamped) FAILS on the tree hash', () => {
  const d = scratch(); const lib = join(d, 'src/min_indent-rs/src/lib.rs');
  writeFileSync(lib, readFileSync(lib, 'utf8') + '\n// tampered\n');
  const r = check(d);
  assert.equal(r.status, 1);
  assert.match(row(r.out, 'rust'), /✗ lang:rust .*hashes MISMATCH \(src:false/);
  assert.equal(manifest(FX + 'bundle').units[0].variants['lang:rust'].srcSha256, treeSha(FX + 'bundle/src/min_indent-rs'), 'the stamped hash IS the tree hash');
});

test('control: an oracle edited after stamping (file sha re-stamped) is an ORACLE FAULT, never graded', () => {
  const d = scratch(); const op = join(d, 'oracles/min_indent.json'); const o = JSON.parse(readFileSync(op, 'utf8'));
  o.heldout[0].expected = { t: 'u64', v: '99' }; writeFileSync(op, JSON.stringify(o));
  const m = manifest(d); for (const v of Object.values(m.units[0].variants) as any[]) v.oracleSha256 = sha(op); save(d, m);
  const r = check(d);
  assert.equal(r.status, 1);
  for (const l of ['js', 'ts', 'rust']) assert.match(row(r.out, l), /rung none .*ORACLE FAULT: oracle vectors hash [0-9a-f]{12}…, the file declares/, l);
});

test('control: lang:rust on a legacy (untyped) oracle is refused, not graded', () => {
  const d = scratch(); copyFileSync(ROOT + 'experiments/v05-p2-lang-ts/bundle/oracles/bytes.json', join(d, 'oracles/legacy.json'));
  const m = manifest(d); Object.assign(m.units[0].variants['lang:rust'], { oracle: 'oracles/legacy.json', oracleSha256: sha(join(d, 'oracles/legacy.json')) }); save(d, m);
  const r = check(d);
  assert.equal(r.status, 1);
  assert.match(row(r.out, 'rust'), /rung none .*lang:rust needs a sir-canonical-v1 oracle; oracles\/legacy\.json is legacy/);
});

test('no cargo on this machine: the bundle HALTS with the install hint, before grading anything', () => {
  const cargo = spawnSync('sh', ['-c', 'command -v cargo'], { encoding: 'utf8' }).stdout.trim();
  const PATH = (process.env.PATH || '').split(':').filter((p) => p !== dirname(cargo)).join(':');
  assert.notEqual(spawnSync('sh', ['-c', 'command -v cargo'], { encoding: 'utf8', env: { ...process.env, PATH } }).status, 0, 'precondition: cargo not on the reduced PATH');
  const r = check(FX + 'bundle', { ...process.env, PATH });
  assert.equal(r.status, 1);
  assert.match(r.out, /HALTED — carries lang:rust, whose toolchain is not on this machine \(install Rust: https:\/\/rustup\.rs\)\. Install it to verify\./);
  assert.doesNotMatch(r.out, /held-out/);
});

test('a rust artifact returning Result<u64, String> (Err is a throw, as the pin allows) VERIFIES — the harness wires its Ok value', () => {
  // the scar (selfhost directive, 2026-10-26): a non-f64 Result result failed the harness BUILD — only the f64 wire knew Result
  const d = scratch(); const crate = join(d, 'src/min_indent-rs'); const lib = join(crate, 'src/lib.rs');
  writeFileSync(lib, readFileSync(lib, 'utf8').replace('pub fn min_indent(input: &str) -> u64 {', 'fn inner(input: &str) -> u64 {') +
    '\npub fn min_indent(input: &str) -> Result<u64, String> { Ok(inner(input)) }\n');
  const m = manifest(d); m.units[0].variants['lang:rust'].srcSha256 = treeSha(crate); save(d, m);
  const r = check(d);
  assert.equal(r.status, 0, r.out);
  assert.match(row(r.out, 'rust'), /✓ lang:rust\s+held-out 13\/13/);
});

test('round 4 (#55): a line is an {ok}/{throw} envelope — a returned json map {"throw": "x"} is a MAP, Err is the throw', async () => {
  const { callWith } = await import('./lang/rust.mjs'); const { encode } = await import('./sir/canon.mjs');
  const got = await callWith('throw_map(s: text) -> json', ROOT + 'experiments/round4-envelope/throw_map', [['map'], ['marker'], ['boom'], ['z']]);
  const t = (r: any) => encode(r, { k: 'json' }).t;
  assert.equal(t(got[0]), 'map', JSON.stringify(got[0])); assert.equal(t(got[1]), 'map', JSON.stringify(got[1]));
  assert.equal(t(got[2]), 'throw'); assert.equal(got[2].__threw, 'boom!'); assert.equal(t(got[3]), 'list');
});
