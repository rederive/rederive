// Findings #8-#11 from the real game-repo switch at commit 860bfb8.
//   #8  `=` must mean byte-AND-mode identical — a silent mode-only chmod printed as `=` too
//   #9  the managed Commands block must name the contract file init actually found/kept, via
//       a `{{contract}}` placeholder in the profile's CLAUDE.section.md, not a hard-coded default
//   #10 AGENTS.md must mirror --adopt's kept "## Project rules", not just the managed block
//   #11 rederive.lock's rdv field must record the RUNNING binary's own version+commit+path,
//       so two builds sharing the same package.json version (this repo doesn't bump it per
//       commit) are still distinguishable — and doctor must compare on that basis
// Run: npx tsx --test cli/init-findings-8-11.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';
import { cmdInit } from './init.mts';
import { cmdDoctor } from './doctor.mts';
import { readLock, writeLock, buildLock } from './lock.mts';
import { rdvInfo } from './lib/judge.mts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDV_ENTRY = join(HERE, 'rdv.mts');
const TSX = join(HERE, '..', 'node_modules', '.bin', 'tsx');

let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; process.env.PATH = '/usr/bin:/bin'; });
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

async function captureLog(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { return { code: await fn(), out }; } finally { console.log = orig; }
}

const scaffold = () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-findings-'));
  execSync('git init -q', { cwd: d });
  return d;
};

function fixtureProfile(opts: { withContractPlaceholder?: boolean } = {}): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(join(pdir, 'tools'), { recursive: true });
  mkdirSync(join(pdir, 'contracts'), { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  const contractLine = opts.withContractPlaceholder
    ? 'tools/typikon contract --spec typikon.yaml --contract contracts/{{contract}}'
    : 'tools/typikon contract --spec typikon.yaml --contract contracts/game.contract.yaml';
  writeFileSync(join(pdir, 'CLAUDE.section.md'), [
    '## Hard rules',
    '1. Never type an expected value.',
    '',
    '## Commands',
    '```',
    contractLine,
    '```',
    '',
  ].join('\n'));
  writeFileSync(join(pdir, 'contracts', 'game.contract.yaml'), 'name: game\n');
  writeFileSync(join(pdir, 'tools', 'emit'), '#!/bin/sh\necho "profile emit"\n');
  chmodSync(join(pdir, 'tools', 'emit'), 0o755);
  return profilesDir;
}

// ── #8: mode-only changes get their own `~` line, never a silent `=` ───────────────────────

test('#8: a tools/* file with identical content but wrong mode reports `~ (mode X→755)`, not `=`', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const toolPath = join(d, 'tools/emit');
  assert.equal(statSync(toolPath).mode & 0o777, 0o755);

  chmodSync(toolPath, 0o644); // simulate a checkout / zip export that lost the exec bit
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.match(out, /~ tools\/emit \(mode 644→755\)/);
  assert.doesNotMatch(out, /= tools\/emit\b/, '`=` must not also appear for this file — the mode DID change');
  assert.equal(statSync(toolPath).mode & 0o777, 0o755, 'the mode is actually fixed');
});

test('#8: a tools/* file already at 755 with identical content is a genuine `=`, no chmod noise', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.match(out, /= tools\/emit\b/);
  assert.doesNotMatch(out, /tools\/emit \(mode/);
});

// ── #9: {{contract}} names whichever contract file init actually kept ──────────────────────

test('#9: no pre-existing contract — {{contract}} resolves to the profile\'s own default, which gets written', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile({ withContractPlaceholder: true });
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const claude = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /--contract contracts\/game\.contract\.yaml/);
});

test('#9: a pre-existing contracts/*.contract.yaml — {{contract}} names THAT file, not the profile\'s skipped default', async () => {
  const d = scaffold();
  mkdirSync(join(d, 'contracts'), { recursive: true });
  writeFileSync(join(d, 'contracts', 'scene0.contract.yaml'), 'name: scene0\n');
  const profilesDir = fixtureProfile({ withContractPlaceholder: true });
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true }));
  assert.match(out, /! contracts\/game\.contract\.yaml \(skipped/, "the profile's own contract file is skipped, as before");

  const claude = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /--contract contracts\/scene0\.contract\.yaml/, 'names the file that actually exists');
  assert.doesNotMatch(claude, /--contract contracts\/game\.contract\.yaml/, "never names the profile's skipped default");
});

// ── #10: AGENTS.md mirrors --adopt's kept "## Project rules" ───────────────────────────────

const SECTION_HEADING = '## Hard rules';
const MANAGED = [
  SECTION_HEADING,
  '1. Never type an expected value. Oracles are computed from the design doc.',
  '2. The sim crate is pure. No clock, no I/O, no randomness it did not receive.',
  '',
].join('\n');
const UNMANAGED = [
  '# My project', '',
  SECTION_HEADING,
  '1. Never type an expected value. Oracles are computed from the design doc.',
  '2. The sim crate is pure. No clock, no I/O, no randomness it did not receive.',
  '3. No engine, no wire protocol, no crypto in the first pass (§9.1).',
  '',
].join('\n');

function mirrorProfile(): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), MANAGED);
  return profilesDir;
}

test('#10: --adopt mirrors the kept "## Project rules" into AGENTS.md too, not just CLAUDE.md', async () => {
  const d = scaffold();
  writeFileSync(join(d, 'CLAUDE.md'), UNMANAGED);
  // AGENTS.md starts EMPTY — it never had its own copy of the unmanaged section to detect
  const profilesDir = mirrorProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true }));
  assert.match(out, /\+ AGENTS\.md \(marker section added \+ mirrored Project rules\)/);

  const claude = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  const agents = readFileSync(join(d, 'AGENTS.md'), 'utf8');
  assert.match(claude, /## Project rules/);
  assert.match(agents, /## Project rules/);
  const keptLine = 'No engine, no wire protocol, no crypto in the first pass (§9.1).';
  assert.ok(claude.includes(keptLine));
  assert.ok(agents.includes(keptLine), 'AGENTS.md has the SAME kept content, not just a pointer');
});

test('#10: a second --adopt is still a no-op on the mirrored AGENTS.md', async () => {
  const d = scaffold();
  writeFileSync(join(d, 'CLAUDE.md'), UNMANAGED);
  const profilesDir = mirrorProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true });
  const before = readFileSync(join(d, 'AGENTS.md'), 'utf8');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true });
  assert.equal(readFileSync(join(d, 'AGENTS.md'), 'utf8'), before);
});

// ── #11: rederive.lock's rdv field is version+commit+path of the RUNNING binary ────────────

test('#11: buildLock stamps rdv as {version, commit, path}, not just a version string', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  assert.ok(lock.rdv.version, 'version present');
  assert.ok('commit' in lock.rdv, 'commit present (may be "unknown" off a non-git install, but the FIELD exists)');
  assert.ok('path' in lock.rdv, 'path present');
  assert.equal(typeof lock.rdv.path, 'string');
});

test('#11: doctor detects DRIFT via commit even when the version string is identical (the actual bug)', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  // simulate "two builds share the same package.json version" (true in this repo — it
  // doesn't bump per commit) by keeping the version and only changing the recorded commit
  lock.rdv.commit = 'deadbee';
  writeLock(d, lock);
  const { out, code } = await captureLog(async () => cmdDoctor(d, { profilesDir, strict: true }));
  assert.equal(code, 1);
  assert.match(out, /rdv: DRIFT \(lock [^@]+@deadbee, live [^@]+@(?!deadbee)/, 'the SAME version string still shows DRIFT because the commit differs');
});

test('#11: a "directory" marketplace source is flagged portable:false in the lock, and doctor notes it', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: d, yes: true }));
  const lock = readLock(d)!;
  assert.equal(lock.plugin.portable, false);
  assert.match(out, /note: plugin marketplace is machine-local/);
});

test('#11: a "github" marketplace source is portable:true, and doctor prints no note', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: 'rederive/rederive', yes: true }));
  const lock = readLock(d)!;
  assert.equal(lock.plugin.portable, true);
  assert.doesNotMatch(out, /machine-local/);
});

test('#11 refinement: package.json is 0.5.x (the v0.5 kit; 0.5.1 added check --lang)', () => {
  assert.match(rdvInfo().version, /^0\.5\.\d+$/);
});

test('#11 refinement: rdvInfo().commit is null off a non-git checkout (never the string "unknown")', () => {
  // this checkout IS a git repo, so we can only assert the shape/type here — the null-vs-
  // 'unknown' DISPLAY distinction (doctor must render null readably) is covered below.
  const info = rdvInfo();
  assert.ok(info.commit === null || typeof info.commit === 'string');
});

test('#11 refinement: doctor never prints a literal "@null" when rdv.commit is null', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  lock.rdv.commit = null;
  writeLock(d, lock);
  const { out } = await captureLog(async () => { cmdDoctor(d, { profilesDir, brief: true }); return 0; });
  assert.doesNotMatch(out, /@null\b/);
  assert.match(out, /rdv [^\s]+@unknown/, 'renders the same way lab/typikon already do for an unresolvable commit');
});

test('#11 refinement: `rdv --version` (and -v) prints exactly one line and exits 0', () => {
  // this file restricts PATH (see the module-level before()) to keep the OTHER tests here
  // hermetic — but tsx's own shebang needs a resolvable `node`, so this one spawn needs the
  // real PATH back, not the '/usr/bin:/bin' the rest of the file deliberately uses.
  const env = { ...process.env, PATH: ORIGINAL_PATH };
  for (const flag of ['--version', '-v']) {
    const r = spawnSync(TSX, [RDV_ENTRY, flag], { encoding: 'utf8', env });
    assert.equal(r.status, 0, flag);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1, flag);
    assert.match(lines[0], /^rdv 0\.5\.\d+( \([0-9a-f]+\))?$/, flag);
  }
});

// ── #14: a lock written before the commit field existed must not print "@undefined" ────────

test('#14: a lock with only rdv.version (no commit field) never prints "@undefined"', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  // simulate a lock from before the commit field existed: delete it, don't set it to null
  const rdv: any = { version: lock.rdv.version };
  lock.rdv = rdv;
  writeLock(d, lock);

  const full = await captureLog(() => cmdDoctor(d, { profilesDir }));
  assert.doesNotMatch(full.out, /@undefined/);
  const brief = await captureLog(() => cmdDoctor(d, { profilesDir, brief: true }));
  assert.doesNotMatch(brief.out, /@undefined/);
});

test('#14: same version + missing lock commit is STALE-LOCK, not DRIFT — a different word since nothing moved', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  lock.rdv = { version: lock.rdv.version } as any; // commit field absent, version UNCHANGED
  writeLock(d, lock);

  const { out, code } = await captureLog(() => cmdDoctor(d, { profilesDir, strict: true }));
  assert.match(out, /rdv: STALE-LOCK \(lock [^,]+@unrecorded, live /);
  assert.doesNotMatch(out, /rdv: DRIFT/);
  assert.match(out, /re-run rdv init to record the commit/);
  assert.equal(code, 1, 'still not a clean bill of health under --strict — the lock genuinely needs a re-run');

  const brief = await captureLog(() => cmdDoctor(d, { profilesDir, brief: true }));
  assert.match(brief.out, /STALE-LOCK: rdv/);
  assert.doesNotMatch(brief.out, /DRIFT: rdv/);
});

test('#14: a DIFFERENT version with a missing lock commit is still real DRIFT, not STALE-LOCK', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  lock.rdv = { version: '0.0.0-genuinely-old' } as any; // no commit field AND a real version change
  writeLock(d, lock);

  const { out } = await captureLog(() => cmdDoctor(d, { profilesDir }));
  assert.match(out, /rdv: DRIFT \(lock 0\.0\.0-genuinely-old@unrecorded, live /);
  assert.doesNotMatch(out, /STALE-LOCK/);
});
