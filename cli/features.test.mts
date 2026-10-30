// Tests for the ONE feature detector + the capability model (SIR_V05_PLAN W.0c).
// Run: npx tsx --test cli/features.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { capabilities, detectFeatures, specVersionFor, implementedFeatures, supportedSpec, cmpVer, languagesOf, harnessedLanguages } from './features.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const sir = (p: string) => readFileSync(ROOT + p, 'utf8');

test('v0.2/v0.3 detection is unchanged from the old pack.featuresFor', () => {
  assert.deepEqual(detectFeatures({ mode: 'vectors' }), ['vectors']);
  assert.equal(specVersionFor(detectFeatures({ mode: 'vectors' })), '0.2');
  const f = detectFeatures({ carriedData: [{ file: 'x' }], envelope: 'ascii only', mode: 'trace' });
  assert.deepEqual(f, ['vectors', 'carried-data', 'envelope', 'trace-seam']);
  assert.equal(specVersionFor(f), '0.3');
  assert.deepEqual(detectFeatures({ carriedData: [] }), ['vectors'], 'an empty carriedData array is not carried data');
});

test('a PAR unit stamps par-interleaving at 0.4 — from the SIR alone AND from the oracle mode alone', () => {
  const text = sir('experiments/v04-phase3-par/boundedMap.sir');
  for (const input of [{ sirText: text }, { mode: 'par' }, { sirText: text, mode: 'par' }]) {
    const f = detectFeatures(input);
    assert.ok(f.includes('par-interleaving'), JSON.stringify(input).slice(0, 40));
    assert.equal(specVersionFor(f), '0.4');
  }
});

test('a RING unit stamps ring at 0.4', () => {
  const f = detectFeatures({ sirText: sir('experiments/v04-phase4-ring/ringToken.sir'), mode: 'ring' });
  assert.ok(f.includes('ring'));
  assert.equal(specVersionFor(f), '0.4');
});

test('an unknown feature refuses to be stamped (never silently dropped)', () => {
  assert.throws(() => specVersionFor(['vectors', 'teleportation']), /unknown feature "teleportation"/);
});

test('maxSpecVersion is honest: every feature at or below it is implemented', () => {
  const max = supportedSpec();
  const gaps = Object.entries(capabilities.features as Record<string, any>)
    .filter(([, v]) => cmpVer(v.since, max) <= 0 && !v.implemented).map(([k]) => k);
  assert.deepEqual(gaps, [], `maxSpecVersion ${max} claims features rdv cannot check`);
});

test('generable implies implemented (a payload can never teach what rdv cannot check)', () => {
  for (const [k, v] of Object.entries(capabilities.features as Record<string, any>))
    if (v.generable) assert.ok(v.implemented, k);
});

test('rdv has no hand-kept feature list or version left', () => {
  const src = readFileSync(ROOT + 'cli/rdv.mts', 'utf8');
  assert.doesNotMatch(src, /IMPLEMENTED_FEATURES\s*=\s*new Set\(\[/);
  assert.doesNotMatch(src, /SUPPORTED_SPEC\s*=\s*'/);
  assert.equal(implementedFeatures().size, Object.values(capabilities.features as Record<string, any>).filter((v) => v.implemented).length);
});

test('negative control: a bundle declaring a feature rdv lacks HALTS and names it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rdv-w0c-'));
  cpSync(ROOT + 'experiments/v04-phase3-par', dir, { recursive: true });
  const mp = join(dir, 'sir.manifest.json');
  const m = JSON.parse(readFileSync(mp, 'utf8'));
  m.features = [...m.features, 'cross-lang-anchor'];   // still unimplemented (lang-variant was, until Phase 2a)
  writeFileSync(mp, JSON.stringify(m, null, 2));
  const r = spawnSync('node', [ROOT + 'dist/cli.cjs', 'check', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /HALTED — requires cross-lang-anchor/);
});

test('the v0.4 fixtures verify on THIS rdv (source and bundle)', () => {
  for (const fx of ['experiments/v04-phase3-par', 'experiments/v04-phase4-ring']) {
    execFileSync('npx', ['tsx', 'cli/rdv.mts', 'check', fx], { cwd: ROOT, stdio: 'pipe' });
    execFileSync('node', ['dist/cli.cjs', 'check', fx], { cwd: ROOT, stdio: 'pipe' });
  }
});

// ── F.2: the language capability model ─────────────────────────────────────────────────────────────────────────
const LANG_FX = 'experiments/v05-f2-lang-variant/bundle';

test('F.2: language files and lang:<id> keys detect lang-variant at 0.5; a lone <unit>.sir does not', () => {
  assert.ok(!detectFeatures({ sirFiles: ['bytes.sir', 'bytes.carried.json'] }).includes('lang-variant'));
  for (const shape of [{ sirFiles: ['bytes.sir', 'bytes.rust.sir'] }, { sirFiles: ['sir/bytes.js.sir'] }, { variants: { package: {}, 'lang:ts': {} } }]) {
    const f = detectFeatures(shape);
    assert.ok(f.includes('lang-variant'), JSON.stringify(shape));
    assert.equal(specVersionFor(f), '0.5');
  }
  assert.deepEqual([...languagesOf({ sirFiles: ['a.rust.sir'], variants: { 'lang:ts': {} } })].sort(), ['rust', 'ts']);
});

test('F.2: the language registry is closed — an unknown suffix is malformed, not a new language', () => {
  assert.throws(() => languagesOf({ sirFiles: ['bytes.cobol.sir'] }), /'cobol' is not in the closed language registry/);
  assert.throws(() => languagesOf({ variants: { 'lang:go': {} } }), /'go' is not in the closed language registry/);
});

test('F.2: ANCHOR ref(<lang>:…) detects cross-lang-anchor; package ANCHORs in shipped SIRs do not', () => {
  assert.ok(detectFeatures({ sirText: 'ANCHOR ref(python:boto3.auth.SigV4Auth)\n' }).includes('cross-lang-anchor'));
  assert.ok(detectFeatures({ sirText: 'FIDELITY spec ANCHOR ref(rust:aws-sigv4)\n' }).includes('cross-lang-anchor'));
  assert.ok(!detectFeatures({ sirText: 'ANCHOR slugify@1.6.9 slugify.js — the exported function\n' }).includes('cross-lang-anchor'));
});

test('Phase 2: rdv harnesses js, ts and rust; lang-variant is implemented (for those), cross-lang-anchor is not; neither is generable', () => {
  assert.deepEqual([...harnessedLanguages()], ['js', 'ts', 'rust']);
  assert.equal(capabilities.features['lang-variant'].implemented, true);
  assert.equal(capabilities.features['cross-lang-anchor'].implemented, false);
  for (const k of ['lang-variant', 'cross-lang-anchor']) assert.equal(capabilities.features[k].generable, false, k);
  assert.equal(supportedSpec(), '0.4', 'the scalar stays 0.4 while any 0.5 feature is unimplemented — the fine gate carries 0.5 bundles');
});

// The A6 fixture carries lang:rust, which rdv harnesses since Phase 2b. The gate it guards — a language rdv cannot harness halts
// by name, even under-stamped — is kept on a copy relabelled to python (in the registry, not harnessed).
function unharnessedCopy({ understamp = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rdv-f2-'));
  cpSync(ROOT + LANG_FX, dir, { recursive: true });
  renameSync(join(dir, 'sir/bytes.rust.sir'), join(dir, 'sir/bytes.python.sir'));
  const mp = join(dir, 'sir.manifest.json');
  const m = JSON.parse(readFileSync(mp, 'utf8')); const u = m.units[0];
  u.variants['lang:python'] = { ...u.variants['lang:rust'], sir: 'sir/bytes.python.sir' }; delete u.variants['lang:rust'];
  if (understamp) { delete m.features; delete m.specVersion; }
  writeFileSync(mp, JSON.stringify(m, null, 2));
  return dir;
}

test('F.2 gate (A6 fixture, as lang:python): a language rdv does not harness HALTS, naming it', () => {
  const r = spawnSync('node', [ROOT + 'dist/cli.cjs', 'check', unharnessedCopy()], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /carries lang:python; this rdv harnesses js, ts, rust/);
});

test('F.2 gate: an UNDER-stamped bundle (no features, no specVersion) carrying an unharnessed language still halts — rdv reads the shape', () => {
  const r = spawnSync('node', [ROOT + 'dist/cli.cjs', 'check', unharnessedCopy({ understamp: true })], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /HALTED — carries lang:python/);
});
