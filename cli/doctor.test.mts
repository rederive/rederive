// Tests for `rdv doctor` — live-judge-vs-rederive.lock comparison, --brief, --strict,
// and the no-lockfile fallback. Uses the same disposable fixture-profile pattern as
// cli/init-profile.test.mts so it never depends on the real plugin's profiles existing.
// Run: npx tsx --test cli/doctor.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';
import { cmdDoctor } from './doctor.mts';
import { readLock, writeLock } from './lock.mts';
import { probeFactory } from './lib/judge.mts';

// claude off PATH: these tests build their lock via cmdInit's --lang/--type path, which
// (since cli/lib/plugin.mts) tries the real `claude plugin marketplace add`/`install`
// when claude IS on PATH — slow, network-dependent, and it would register a real
// "rederive/rederive" marketplace in this machine's global plugin cache. Doctor's own
// comparison logic doesn't care which path produced the lock, so keep it hermetic.
let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; process.env.PATH = '/usr/bin:/bin'; });
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

const scaffold = () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-doctor-'));
  execSync('git init -q', { cwd: d });
  return d;
};

function fixtureProfile(lang: string, type: string): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, `${lang}-${type}`);
  mkdirSync(join(pdir, 'tools'), { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang, type, version: '0.9.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), '## fixture\n');
  writeFileSync(join(pdir, 'typikon.yaml'), 'aspects: []\n');
  writeFileSync(join(pdir, 'tools', 'lab'), '#!/bin/sh\necho lab\n');
  chmodSync(join(pdir, 'tools', 'lab'), 0o755);
  return profilesDir;
}

test('doctor with no rederive.lock prints one line and exits 0', () => {
  const d = scaffold();
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  let code: number;
  try { code = cmdDoctor(d); } finally { console.log = orig; }
  assert.equal(code, 0);
  assert.equal(out.trim(), 'no rederive.lock — run rdv init');
});

test('doctor without --strict exits 0 even when rows are DRIFT/MISSING', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const code = cmdDoctor(d, { profilesDir });
  assert.equal(code, 0, 'plain doctor never gates on drift, only --strict does');
});

test('doctor detects a deterministic DRIFT (rdv version) and --strict exits 1', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });

  // rdv's own version is always a concrete, known value (this package's package.json),
  // unlike sir-factory/typikon which may legitimately be 'unknown' on a machine without them
  // installed — so mutating it is the deterministic way to force a real DRIFT row.
  const lock = readLock(d)!;
  lock.rdv.version = '0.0.0-drift-test';
  writeLock(d, lock);

  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  let code: number;
  try { code = cmdDoctor(d, { profilesDir, strict: true }); } finally { console.log = orig; }
  assert.equal(code, 1);
  assert.match(out, /rdv: DRIFT \(lock 0\.0\.0-drift-test@.*, live /);
});

test('doctor without --strict still exits 0 after the same drift', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const lock = readLock(d)!;
  lock.rdv.version = '0.0.0-drift-test';
  writeLock(d, lock);
  const code = cmdDoctor(d, { profilesDir });
  assert.equal(code, 0);
});

test('doctor --brief prints exactly one line, of the documented shape', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { cmdDoctor(d, { profilesDir, brief: true }); } finally { console.log = orig; }
  const lines = out.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^rederive: plugin .* · sir-factory .* · typikon .* · rdv .* — (OK|DRIFT: .+)$/);
});

test('doctor --brief with no lock is still exactly one line', () => {
  const d = scaffold();
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { cmdDoctor(d, { brief: true }); } finally { console.log = orig; }
  assert.equal(out.trim().split('\n').length, 1);
});

// v0.5 audit: a lock stamped by an npm install (no .git → commit null) and a live git checkout of the SAME version
// are indistinguishable — the commit is compared only when both sides have one; the version still decides.
test('doctor: same version, one side without a commit (npm install vs checkout) is OK, not DRIFT', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const lock = readLock(d)!;
  for (const c of [null, 'unknown']) {
    lock.rdv.commit = c as any; writeLock(d, lock);
    let out = '';
    const orig = console.log;
    console.log = (s: any) => { out += String(s) + '\n'; };
    try { cmdDoctor(d, { profilesDir }); } finally { console.log = orig; }
    assert.match(out, /^  rdv: OK$/m, `lock commit ${c}: ${out}`);
  }
  lock.rdv.version = '0.0.0-other'; lock.rdv.commit = null; writeLock(d, lock);
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { cmdDoctor(d, { profilesDir }); } finally { console.log = orig; }
  assert.match(out, /rdv: DRIFT/, 'a version change is still DRIFT when a commit is unknown');
});

// the lab is retired: an OLD rederive.lock records `lab` (@rederive/lab) and no `factory`. Reading it never crashes; doctor
// reports the verifier row as LEGACY-LOCK (what the old lock recorded + what is live), the brief names it, --strict gates on it,
// and a fresh init re-locks sir-factory (no `lab` key written any more).
test('doctor: a legacy lock with a `lab` key and no `factory` -> LEGACY-LOCK, never a crash; re-init locks sir-factory', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const fresh = readLock(d)!;
  assert.equal(fresh.factory?.package, 'sir-factory', 'a new lock records sir-factory');
  assert.ok('version' in fresh.factory! && 'commit' in fresh.factory!, 'factory shape present even when unresolvable');
  assert.equal('lab' in fresh, false, 'a new lock writes no lab key');

  const legacy: any = { ...fresh, lab: { package: '@rederive/lab', version: '0.5.0', commit: 'abc1234' } };
  delete legacy.factory;
  writeLock(d, legacy);
  const capture = (fn: () => number) => { let out = ''; const orig = console.log; console.log = (x: any) => { out += String(x) + '\n'; }; let code: number; try { code = fn(); } finally { console.log = orig; } return { out, code: code! }; };

  const full = capture(() => cmdDoctor(d, { profilesDir }));
  assert.equal(full.code, 0);
  assert.match(full.out, /  sir-factory: LEGACY-LOCK \(the lock records the retired lab, @rederive\/lab 0\.5\.0@abc1234; live sir-factory .+\) — re-run rdv init to lock sir-factory/);
  assert.doesNotMatch(full.out, /^\s+lab:/m, 'no lab row');
  const brief = capture(() => cmdDoctor(d, { profilesDir, brief: true }));
  assert.equal(brief.out.trim().split('\n').length, 1);
  assert.match(brief.out, /^rederive: plugin .* · sir-factory \(legacy lab 0\.5\.0@abc1234\) · typikon .* — .*LEGACY-LOCK: sir-factory/);
  assert.equal(capture(() => cmdDoctor(d, { profilesDir, strict: true })).code, 1, '--strict gates on a legacy lock');
});

test('probeFactory: $SIR_FACTORY (a checkout dir or its factory.mjs), else ./node_modules/sir-factory; a non-sir-factory package is unknown', () => {
  const ck = mkdtempSync(join(tmpdir(), 'rdv-sf-'));
  writeFileSync(join(ck, 'package.json'), JSON.stringify({ name: 'sir-factory', version: '0.4.0' }));
  writeFileSync(join(ck, 'factory.mjs'), '');
  assert.deepEqual(probeFactory({ SIR_FACTORY: ck }, '/nonexistent'), { version: '0.4.0', commit: 'unknown' });
  assert.deepEqual(probeFactory({ SIR_FACTORY: join(ck, 'factory.mjs') }, '/nonexistent'), { version: '0.4.0', commit: 'unknown' });
  const proj = mkdtempSync(join(tmpdir(), 'rdv-sf-proj-'));
  mkdirSync(join(proj, 'node_modules', 'sir-factory'), { recursive: true });
  writeFileSync(join(proj, 'node_modules', 'sir-factory', 'package.json'), JSON.stringify({ name: 'sir-factory', version: '0.4.1' }));
  assert.deepEqual(probeFactory({}, proj), { version: '0.4.1', commit: 'unknown' });
  const other = mkdtempSync(join(tmpdir(), 'rdv-sf-other-'));
  writeFileSync(join(other, 'package.json'), JSON.stringify({ name: '@rederive/lab', version: '0.5.0' }));
  writeFileSync(join(other, 'factory.mjs'), '');
  assert.deepEqual(probeFactory({ SIR_FACTORY: other }, proj), { version: 'unknown', commit: 'unknown' }, 'SIR_FACTORY set but wrong: MISSING, never a silent fallback');
});
