// Tests for `rdv init --lang L --type T` — profile scaffolding, marker discipline,
// settings.json marketplace/plugin/Stop-hook wiring, and the rederive.lock it writes.
// The real plugin's profiles may or may not exist yet when this runs, so every test
// builds its own minimal fixture profile in a temp dir and points --profiles-dir at it.
//
// These tests all run with `claude` deliberately OFF PATH (see the module-level
// before/after below), so `wirePlugin` (cli/lib/plugin.mts) takes its no-CLI FALLBACK
// path deterministically and with no network calls. The claude-present success/failure
// paths (mocked `claude`, argv assertions) live in cli/init-plugin.test.mts. The bare-init
// confirmation gate (--yes/--dry-run/no-TTY) itself lives in cli/init-safety.test.mts —
// the couple of bare-init calls here pass { yes: true } to keep testing APPLY behavior.
// Run: npx tsx --test cli/init-profile.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, chmodSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';
import { readLock } from './lock.mts';
import { defaultProfilesDir } from './lib/judge.mts';

let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; process.env.PATH = '/usr/bin:/bin'; }); // no `claude`, no `cargo`; `git`/`which` still resolve
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

async function captureLog(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { return { code: await fn(), out }; } finally { console.log = orig; }
}

const scaffold = () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-init-profile-'));
  execSync('git init -q', { cwd: d });
  return d;
};
const read = (d: string, f: string) => readFileSync(join(d, f), 'utf8');

/** A minimal fixture profile — enough to exercise every marker-discipline / settings /
 * lock code path without depending on the real plugins/rederive/profiles/<lang>-<type>. */
function fixtureProfile(lang: string, type: string, version = '0.9.0'): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, `${lang}-${type}`);
  mkdirSync(join(pdir, 'tools'), { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang, type, version, description: 'fixture', requires: {} }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), '## fixture profile\nProfile-specific rules go here.\n');
  writeFileSync(join(pdir, 'typikon.yaml'), 'aspects: []\n');
  writeFileSync(join(pdir, 'Cargo.toml'), '[workspace]\nmembers = []\n');
  writeFileSync(join(pdir, 'tools', 'lab'), '#!/bin/sh\necho lab "$@"\n');
  chmodSync(join(pdir, 'tools', 'lab'), 0o755);
  return profilesDir;
}

test('init --lang/--type scaffolds profile files, the marker section, settings, and rederive.lock', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const code = await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: 'rederive/rederive' });
  assert.equal(code, 0);

  assert.ok(existsSync(join(d, 'Cargo.toml')), 'profile file copied');
  assert.ok(existsSync(join(d, 'typikon.yaml')), 'profile file copied');
  assert.ok(existsSync(join(d, 'tools/lab')), 'profile file copied, tools/ made executable');
  assert.ok(!existsSync(join(d, 'profile.json')), 'profile.json is metadata, not copied into the repo');

  const claude = read(d, 'CLAUDE.md');
  assert.ok(claude.includes('fixture profile'), "profile's CLAUDE.section.md became the marker section");
  assert.ok(claude.includes('rederive:begin'), 'still wrapped in the managed markers');
  assert.ok(read(d, 'AGENTS.md').includes('fixture profile'));

  const settings = JSON.parse(read(d, '.claude/settings.json'));
  // measured shape from the real `claude plugin marketplace add`: a DOUBLE "source"
  // nesting, not the flat {source,repo} this fallback used to write
  assert.deepEqual(settings.extraKnownMarketplaces.rederive, { source: { source: 'github', repo: 'rederive/rederive' } });
  assert.equal(settings.enabledPlugins['rederive@rederive'], true);
  const stopCmds = settings.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
  assert.ok(stopCmds.some((c: string) => c.includes('typikon" stop-hook')), 'typikon Stop hook wired (profile ships typikon.yaml)');
  assert.ok(stopCmds.some((c: string) => c.includes('verify-changed.mjs')), 'the generic rdv-check Stop hook is still present too');

  const lock = readLock(d)!;
  assert.equal(lock.lock, 1);
  assert.equal(lock.profile.lang, 'rust');
  assert.equal(lock.profile.type, 'game');
  assert.equal(lock.profile.version, '0.9.0');
  assert.equal(lock.plugin.name, 'rederive');
  assert.deepEqual(lock.plugin.marketplace, { source: { source: 'github', repo: 'rederive/rederive' } });
  assert.ok(lock.rdv.version, 'rdv version stamped');
  assert.ok(lock.toolchain.node, 'node version stamped');
  assert.ok(lock.lockedAt, 'lockedAt stamped');
  assert.ok(lock.factory && lock.factory.package === 'sir-factory' && 'commit' in lock.factory, 'sir-factory shape present even when unresolvable');
  assert.equal('lab' in lock, false, 'the retired lab is never locked');
  assert.ok('commit' in lock.typikon, 'typikon shape present even when unresolvable');
});

test('second init --lang/--type is a no-op on profile files (= not ~)', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const before = { cargo: read(d, 'Cargo.toml'), lab: read(d, 'tools/lab'), settings: read(d, '.claude/settings.json'), claude: read(d, 'CLAUDE.md') };
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  assert.equal(read(d, 'Cargo.toml'), before.cargo);
  assert.equal(read(d, 'tools/lab'), before.lab);
  assert.equal(read(d, '.claude/settings.json'), before.settings);
  assert.equal(read(d, 'CLAUDE.md'), before.claude);
});

test('existing extraKnownMarketplaces/enabledPlugins survive the merge; ours added, not clobbering', async () => {
  const d = scaffold();
  mkdirSync(join(d, '.claude'), { recursive: true });
  writeFileSync(join(d, '.claude/settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(npm test)'] },
    extraKnownMarketplaces: { other: { source: 'github', repo: 'someone/else' } },
    enabledPlugins: { 'other@other': true },
  }));
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const s = JSON.parse(read(d, '.claude/settings.json'));
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'] }, 'unrelated settings preserved');
  assert.deepEqual(s.extraKnownMarketplaces.other, { source: 'github', repo: 'someone/else' }, "another marketplace isn't clobbered");
  assert.equal(s.enabledPlugins['other@other'], true);
  assert.equal(s.enabledPlugins['rederive@rederive'], true);
  assert.ok(s.extraKnownMarketplaces.rederive);
});

test('a profile file that already exists with different content is never overwritten', async () => {
  const d = scaffold();
  writeFileSync(join(d, 'Cargo.toml'), "the user's own workspace\n");
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  assert.equal(read(d, 'Cargo.toml'), "the user's own workspace\n");
});

test('--lang without --type (or vice versa) errors without writing anything', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const code = await cmdInit(d, { lang: 'rust', profilesDir });
  assert.equal(code, 1);
  assert.ok(!existsSync(join(d, 'rederive.lock')));
});

test('--lang/--type with no matching profile errors and lists the available ones', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  let logged = '';
  const orig = console.error;
  console.error = (s: any) => { logged += String(s) + '\n'; };
  let code: number;
  try { code = await cmdInit(d, { lang: 'python', type: 'web', profilesDir }); } finally { console.error = orig; }
  assert.equal(code, 1);
  assert.ok(logged.includes('rust-game'), 'available profiles listed');
  assert.ok(!existsSync(join(d, 'rederive.lock')));
});

test('init creates the git-cannot-carry-empty-dirs scaffold (units/, observer/, .typikon/rulings/) with .gitkeep', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  assert.ok(existsSync(join(d, 'units/.gitkeep')));
  assert.ok(existsSync(join(d, 'observer/.gitkeep')));
  assert.ok(existsSync(join(d, '.typikon/rulings/.gitkeep')));
});

test('the scaffold dirs are left alone (no re-write) once they already exist — a unit landing in units/ is not clobbered', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  mkdirSync(join(d, 'units/my_unit'), { recursive: true });
  writeFileSync(join(d, 'units/my_unit/marker.txt'), 'real work');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  assert.equal(read(d, 'units/my_unit/marker.txt'), 'real work');
});

test('copied tools/* scripts are executable, and re-init re-asserts the bit if it was lost', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  const toolPath = join(d, 'tools/lab');
  assert.equal(statSync(toolPath).mode & 0o777, 0o755, 'executable right after init');

  chmodSync(toolPath, 0o644); // simulate a checkout that lost the exec bit
  assert.equal(statSync(toolPath).mode & 0o777, 0o644);
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir });
  assert.equal(statSync(toolPath).mode & 0o777, 0o755, 're-init restores the exec bit on byte-identical content');
});

test('--lang/--type writes no legacy per-project agent files when none exist yet', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.ok(!existsSync(join(d, '.claude/agents/sir-reemitter.md')));
  assert.ok(!existsSync(join(d, '.claude/agents/sir-reemitter-cr.md')));
  assert.match(out, /- \.claude\/agents\/sir-\*\.md \(skipped/);
});

test('a legacy agent file from a PRIOR no-profile init is flagged (not deleted) on a later --lang/--type init', async () => {
  const d = scaffold();
  await cmdInit(d, { yes: true }); // no profile — writes the legacy roster
  const before = read(d, '.claude/agents/sir-reemitter.md');
  const profilesDir = fixtureProfile('rust', 'game');
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.equal(read(d, '.claude/agents/sir-reemitter.md'), before, 'not deleted, not rewritten');
  assert.match(out, /! \.claude\/agents\/sir-reemitter\.md present — the plugin's rederive:sir-\* roster is authoritative; remove with --prune-agents/);
  assert.match(out, /! \.claude\/agents\/sir-reemitter-cr\.md present/);
});

test('--prune-agents deletes only sir-*.md files/symlinks in .claude/agents/, leaving other files alone', async () => {
  const d = scaffold();
  await cmdInit(d, { yes: true }); // writes sir-reemitter.md + sir-reemitter-cr.md
  mkdirSync(join(d, '.claude/agents'), { recursive: true });
  writeFileSync(join(d, '.claude/agents/my-own-agent.md'), 'keep me');
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, pruneAgents: true });
  assert.ok(!existsSync(join(d, '.claude/agents/sir-reemitter.md')), 'pruned');
  assert.ok(!existsSync(join(d, '.claude/agents/sir-reemitter-cr.md')), 'pruned');
  assert.ok(existsSync(join(d, '.claude/agents/my-own-agent.md')), "a non-sir-*.md file isn't touched");
  assert.equal(read(d, '.claude/agents/my-own-agent.md'), 'keep me');
});

test('without --lang/--type the legacy per-project agent roster IS still written', async () => {
  const d = scaffold();
  await cmdInit(d, { yes: true });
  assert.ok(existsSync(join(d, '.claude/agents/sir-reemitter.md')));
  assert.ok(existsSync(join(d, '.claude/agents/sir-reemitter-cr.md')));
});

test('--marketplace expands ~ to an absolute path (not a literal ~/… segment under cwd)', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: '~/rederive' });
  const settings = JSON.parse(read(d, '.claude/settings.json'));
  assert.equal(settings.extraKnownMarketplaces.rederive.source.source, 'directory');
  assert.equal(settings.extraKnownMarketplaces.rederive.source.path, join(process.env.HOME || '', 'rederive'));
});

test('the "next:" guidance differs with vs. without a profile, and names the plugin (not sir-toolkit)', async () => {
  const withProfile = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const r1 = await captureLog(() => cmdInit(withProfile, { lang: 'rust', type: 'game', profilesDir, marketplace: 'rederive/rederive' }));
  // claude is off PATH for this whole file, so wirePlugin took the fallback path —
  // guidance says "not installed", not "installed and enabled"
  assert.match(r1.out, /Plugin not installed — open Claude Code here and run:/);
  assert.match(r1.out, /\/plugin marketplace add rederive\/rederive/);
  assert.match(r1.out, /\/plugin install rederive@rederive/);
  assert.doesNotMatch(r1.out, /sir-toolkit/);

  const noProfile = scaffold();
  const r2 = await captureLog(() => cmdInit(noProfile, { yes: true }));
  assert.match(r2.out, /\/plugin marketplace add rederive\/rederive/);
  assert.match(r2.out, /\/plugin install rederive@rederive/);
  assert.doesNotMatch(r2.out, /sir-toolkit/);
});

test('plain `rdv init` (no --lang/--type) with --yes is unaffected — no lock, no profile files', async () => {
  const d = scaffold();
  const code = await cmdInit(d, { yes: true });
  assert.equal(code, 0);
  assert.ok(!existsSync(join(d, 'rederive.lock')));
  assert.ok(read(d, 'CLAUDE.md').includes('Building with rederive'), 'generic FRAME_SECTION still used');
});

// ── against the REAL plugin profile, not just the fixture ──────────────────────────────
// plugins/rederive/profiles/rust-game landed in this repo mid-development; these tests run
// against it directly (default --profiles-dir) whenever it's present, and skip cleanly
// (rather than fail) in a checkout/fork where it isn't.
const REAL_PROFILES_DIR = defaultProfilesDir();
const HAS_REAL_RUST_GAME = existsSync(join(REAL_PROFILES_DIR, 'rust-game'));

test('[real profile] rust-game: tools/* are executable, empty dirs scaffolded, legacy roster skipped', async (t) => {
  if (!HAS_REAL_RUST_GAME) { t.skip(`no plugins/rederive/profiles/rust-game at ${REAL_PROFILES_DIR}`); return; }
  const d = scaffold();
  const { code, out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game' }));
  assert.equal(code, 0);

  for (const tool of ['lab', 'install', 'typikon', 'emit']) {
    const p = join(d, 'tools', tool);
    if (existsSync(p)) assert.equal(statSync(p).mode & 0o777, 0o755, `tools/${tool} is 0755`);
  }
  assert.ok(existsSync(join(d, 'units/.gitkeep')));
  assert.ok(existsSync(join(d, 'observer/.gitkeep')));
  assert.ok(existsSync(join(d, '.typikon/rulings/.gitkeep')));
  assert.ok(!existsSync(join(d, '.claude/agents/sir-reemitter.md')), 'legacy roster not written when the plugin is wired');
  assert.doesNotMatch(out, /sir-toolkit/);

  const lock = readLock(d)!;
  assert.equal(lock.profile.lang, 'rust');
  assert.equal(lock.profile.type, 'game');
});

test('[real profile] rust-game: second init is all `=` (including tools/* mode + scaffold dirs)', async (t) => {
  if (!HAS_REAL_RUST_GAME) { t.skip(`no plugins/rederive/profiles/rust-game at ${REAL_PROFILES_DIR}`); return; }
  const d = scaffold();
  await cmdInit(d, { lang: 'rust', type: 'game' });
  // simulate a checkout that lost the exec bit on one script, to prove re-init restores it
  const labPath = join(d, 'tools/lab');
  if (existsSync(labPath)) chmodSync(labPath, 0o644);
  await cmdInit(d, { lang: 'rust', type: 'game' });
  if (existsSync(labPath)) assert.equal(statSync(labPath).mode & 0o777, 0o755, 'exec bit restored on re-init');
});
