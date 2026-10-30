// Finding #16: init's marker discipline never overwrites an existing file (correct by
// default), but that left NO way to actually TAKE an updated profile file — once
// tools/emit or tools/lab changed upstream, a consumer's copy stayed the Monday version
// forever, with a `!` diff hint on every init, until someone manually `rm`'d it.
// `rdv init --refresh <path>` force-syncs a NAMED profile file/directory, but refuses when
// the repo's copy has diverged from what rederive.lock recorded at the LAST init (a real
// local edit) unless --force is also given.
// Run: npx tsx --test cli/init-refresh.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';
import { readLock } from './lock.mts';

let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; process.env.PATH = '/usr/bin:/bin'; });
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

async function captureLog(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { return { code: await fn(), out }; } finally { console.log = orig; }
}
const sha256 = (buf: Buffer | string): string => createHash('sha256').update(buf).digest('hex');

const scaffold = () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-refresh-'));
  execSync('git init -q', { cwd: d });
  return d;
};

/** A profile whose tools/emit content can be rewritten BETWEEN cmdInit calls, to simulate
 * an upstream profile update within a single test. Returns the profilesDir and a setter. */
function refreshFixtureProfile(): { profilesDir: string; setEmit: (content: string) => void } {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(join(pdir, 'tools'), { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), '## fixture\n');
  const emitPath = join(pdir, 'tools', 'emit');
  const setEmit = (content: string) => { writeFileSync(emitPath, content); chmodSync(emitPath, 0o755); };
  setEmit('#!/bin/sh\necho "emit v1"\n');
  return { profilesDir, setEmit };
}

test('rederive.lock records profileFiles shas after a normal init', async () => {
  const d = scaffold();
  const { profilesDir } = refreshFixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const lock = readLock(d)!;
  assert.ok(lock.profileFiles, 'profileFiles present');
  assert.equal(lock.profileFiles!['tools/emit'], sha256(readFileSync(join(d, 'tools/emit'))));
});

test('--refresh tools/emit replaces an untouched (but now stale) copy with the profile\'s current version', async () => {
  const d = scaffold();
  const { profilesDir, setEmit } = refreshFixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "emit v1"\n');

  setEmit('#!/bin/sh\necho "emit v2 - renamed agent"\n');

  // a normal init reproduces the ORIGINAL bug: it refuses to touch the diverged file
  const normal = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true }));
  assert.match(normal.out, /! tools\/emit differs from the profile \(kept\)/);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "emit v1"\n', 'still the old copy');

  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true, refresh: ['tools/emit'] }));
  assert.match(out, /~ tools\/emit \(refreshed from profile; was: /);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "emit v2 - renamed agent"\n');

  const lock = readLock(d)!;
  assert.equal(lock.profileFiles!['tools/emit'], sha256(readFileSync(join(d, 'tools/emit'))), 'lock updated to match the refreshed content');
});

test('--refresh refuses a locally-edited file without --force, and stays refused on repeat attempts', async () => {
  const d = scaffold();
  const { profilesDir, setEmit } = refreshFixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });

  writeFileSync(join(d, 'tools/emit'), '#!/bin/sh\necho "MY OWN hand edit"\n');
  setEmit('#!/bin/sh\necho "emit v2"\n');

  const attempt1 = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true, refresh: ['tools/emit'] }));
  assert.match(attempt1.out, /! tools\/emit \(local edits since last init — refusing to refresh; use --refresh --force/);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "MY OWN hand edit"\n');

  // repeating WITHOUT --force, with nothing else touching the file, must refuse AGAIN — a
  // refused attempt must not silently "legitimize" the hand-edit as the new baseline
  const attempt2 = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true, refresh: ['tools/emit'] }));
  assert.match(attempt2.out, /! tools\/emit \(local edits since last init — refusing to refresh/);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "MY OWN hand edit"\n', 'still refused, still the hand edit');
});

test('--refresh --force overwrites local edits and prints what it drops', async () => {
  const d = scaffold();
  const { profilesDir, setEmit } = refreshFixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });

  writeFileSync(join(d, 'tools/emit'), '#!/bin/sh\necho "MY OWN hand edit"\n');
  setEmit('#!/bin/sh\necho "emit v2"\n');

  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true, refresh: ['tools/emit'], force: true }));
  assert.match(out, /! tools\/emit \(--refresh --force: overwrote local edits; was: /);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "emit v2"\n');

  const lock = readLock(d)!;
  assert.equal(lock.profileFiles!['tools/emit'], sha256(readFileSync(join(d, 'tools/emit'))), 'lock records the shas after refresh too');
});

test('--refresh tools/ (a directory) expands to every file under it', async () => {
  const d = scaffold();
  const { profilesDir, setEmit } = refreshFixtureProfile();
  writeFileSync(join(profilesDir, 'rust-game', 'tools', 'install'), '#!/bin/sh\necho "install v1"\n');
  chmodSync(join(profilesDir, 'rust-game', 'tools', 'install'), 0o755);
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });

  setEmit('#!/bin/sh\necho "emit v2"\n');
  writeFileSync(join(profilesDir, 'rust-game', 'tools', 'install'), '#!/bin/sh\necho "install v2"\n');

  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true, refresh: ['tools/'] }));
  assert.match(out, /~ tools\/emit \(refreshed from profile/);
  assert.match(out, /~ tools\/install \(refreshed from profile/);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "emit v2"\n');
  assert.equal(readFileSync(join(d, 'tools/install'), 'utf8'), '#!/bin/sh\necho "install v2"\n');
});

test('--refresh on a path the profile doesn\'t ship reports it, changes nothing', async () => {
  const d = scaffold();
  const { profilesDir } = refreshFixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true, refresh: ['tools/does-not-exist'] }));
  assert.match(out, /! --refresh tools\/does-not-exist: not shipped by this profile/);
});

test('--dry-run --refresh plans the refresh but writes nothing', async () => {
  const d = scaffold();
  const { profilesDir, setEmit } = refreshFixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, yes: true });
  setEmit('#!/bin/sh\necho "emit v2"\n');

  const { out, code } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, dryRun: true, refresh: ['tools/emit'] }));
  assert.equal(code, 0);
  assert.match(out, /~ tools\/emit \(refreshed from profile/);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "emit v1"\n', 'dry-run wrote nothing');
});
