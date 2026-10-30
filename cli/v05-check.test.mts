// v0.5 release audit — the CLI behaviors a v0.5 consumer hits first. Each test is a scar: the old rdv crashed (resynth on a
// v0.5 bundle: TypeError on u.spec), let a strict-rule violation through (`check` never ran the v0.5 lint), printed a raw
// ENOENT stack (`check` on a dir with no manifest), exited 2 on `--help`, or mis-described why it halted.
// Run: npm run build && npx tsx --test cli/v05-check.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { canonicalSha } from './sir/sir-parse.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const BUNDLE = ROOT + 'experiments/v05-p2-lang/bundle';
const rdv = (...args: string[]) => { const r = spawnSync(process.execPath, [ROOT + 'dist/cli.cjs', ...args], { encoding: 'utf8' }); return { status: r.status, out: (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '') }; };
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');

// the v05-p2-lang bundle cut to its lang:js variant (no tsc / cargo needed), with `edit` applied to the primary and the
// family RE-BOUND to the edited primary — so the binding and every hash are honest and only the v0.5 lint can object
function jsOnlyBundle(edit: (primary: string) => string) {
  const d = mkdtempSync(join(tmpdir(), 'rdv-v05-')); cpSync(BUNDLE, d, { recursive: true });
  for (const f of ['sir/min_indent.ts.sir', 'sir/min_indent.rust.sir', 'src/min_indent.ts', 'src/min_indent-rs']) rmSync(join(d, f), { recursive: true, force: true });
  const mp = join(d, 'sir.manifest.json'); const m = JSON.parse(readFileSync(mp, 'utf8')); const u = m.units[0];
  u.variants = { 'lang:js': u.variants['lang:js'] };
  const pp = join(d, u.sir); const oldSha = canonicalSha(readFileSync(pp, 'utf8'));
  writeFileSync(pp, edit(readFileSync(pp, 'utf8'))); const newSha = canonicalSha(readFileSync(pp, 'utf8'));
  const lp = join(d, u.variants['lang:js'].sir); writeFileSync(lp, readFileSync(lp, 'utf8').split(oldSha).join(newSha));
  u.sirSha256 = newSha; Object.assign(u.variants['lang:js'], { primarySha256: newSha, langSha256: sha(lp) });
  writeFileSync(mp, JSON.stringify(m, null, 2));
  return d;
}

test('rdv check on a v0.5 bundle runs the strict v0.5 lint: control re-bound bundle verifies', () => {
  const r = rdv('check', jsOnlyBundle((t) => t));
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /v0\.5 lint strict OK/);
});

test('rdv check FAILS a v0.5 unit whose primary carries a # comment (E_COMMENT), even though it grades and binds', () => {
  const r = rdv('check', jsOnlyBundle((t) => t.replace(/\n?$/, '\n# reviewed by hand\n')));
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /✗ FAILED\s+min_indent/);
  assert.match(r.out, /E_COMMENT @primary/);
  assert.match(r.out, /binding bound to primary/, 'the re-bound binding is valid — the lint alone failed the unit');
  assert.match(r.out, /held-out 13\/13/);
});

test('rdv resynth on a v0.5 bundle HALTS with the way forward instead of a TypeError (prepare and --apply)', () => {
  for (const extra of [[], ['--apply']]) {
    const d = mkdtempSync(join(tmpdir(), 'rdv-v05-rs-')); cpSync(BUNDLE, d, { recursive: true });
    const r = rdv('resynth', d, ...extra);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /HALTED — resynth of v0\.5 language variants is not supported in this rdv yet — re-derive with sir-factory \(prepare → emit → grade → pack-v05\); `rdv check` verifies it/);
    assert.doesNotMatch(r.out, /TypeError|rdv error/);
    assert.equal(existsSync(join(d, '.resynth')), false, 'nothing written');
  }
});

test('rdv check / vis / resynth on a dir with no sir.manifest.json: one friendly line, no stack', () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-empty-'));
  for (const cmd of ['check', 'vis', 'resynth']) {
    const r = rdv(cmd, d);
    assert.equal(r.status, 1, cmd);
    assert.match(r.out, /^rdv: no sir\.manifest\.json in .* — point rdv at a rederive package directory/, cmd);
    assert.doesNotMatch(r.out, /ENOENT|\n\s+at |rdv error/, cmd);
  }
});

test('rdv --help exits 0 and names every command; no command is a usage error (exit 2)', () => {
  for (const h of ['--help', '-h', 'help']) {
    const r = rdv(h);
    assert.equal(r.status, 0, h);
    for (const c of ['init', 'doctor', 'claude', 'check', 'vis', 'audit', 'resynth', 'guard']) assert.match(r.out, new RegExp(`^  rdv ${c}\\b`, 'm'), `${h}: ${c}`);
  }
  assert.equal(rdv().status, 2);
  const u = rdv('frobnicate'); assert.equal(u.status, 2); assert.match(u.out, /unknown command 'frobnicate'/);
});

test('a spec-ahead bundle with no declared features halts naming the feature gate, not "understands ≤ v0.4"', () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-ahead-')); cpSync(ROOT + 'packages/bytes', d, { recursive: true });
  const p = join(d, 'sir.manifest.json'); const m = JSON.parse(readFileSync(p, 'utf8')); m.specVersion = '0.5'; delete m.features; writeFileSync(p, JSON.stringify(m));
  const r = rdv('check', d);
  assert.equal(r.status, 1);
  assert.match(r.out, /HALTED — built against SIR spec v0\.5 and declares no `features`.*feature gate/);
  assert.doesNotMatch(r.out, /understands ≤/);
});
