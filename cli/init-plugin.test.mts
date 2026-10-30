// Tests for the ACTUAL plugin-install mechanics of `rdv init --lang/--type`
// (cli/lib/plugin.mts's wirePlugin) — measured live that hand-writing
// extraKnownMarketplaces/enabledPlugins does NOT install a plugin, so `rdv init` must
// run `claude plugin marketplace add … --scope project` + `claude plugin install
// rederive@rederive --scope project` when `claude` is on PATH. These tests mock
// `claude` (a Node script) so they run offline and deterministically: real network
// calls to a real `claude` binary are covered by the exit test, not CI.
//
// The no-claude fallback (hand-written nested `{source:{...}}` form) is covered in
// cli/init-profile.test.mts, which runs its whole file with `claude` off PATH.
// Run: npx tsx --test cli/init-plugin.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';
import { readLock } from './lock.mts';

let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; });
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

const scaffold = () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-init-plugin-'));
  execSync('git init -q', { cwd: d });
  return d;
};
const read = (d: string, f: string) => readFileSync(join(d, f), 'utf8');

function fixtureProfile(lang: string, type: string): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, `${lang}-${type}`);
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang, type, version: '0.9.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), '## fixture profile\n');
  writeFileSync(join(pdir, 'typikon.yaml'), 'aspects: []\n');
  return profilesDir;
}

/** A Node-scripted `claude` mock: records every invocation's {cwd, args} as a JSON line
 * in `logPath`, and fakes the exact settings.json / `plugin list --json` side effects the
 * real CLI produces — so `wirePlugin` and `probeInstalledPlugin` both see a believable
 * "it worked" world, without a real `claude` binary or network. `marketplaceFails`/
 * `installFails` let a test force the failure branch. */
function mockClaude(binDir: string, logPath: string, opts: { marketplaceFails?: boolean; installFails?: boolean } = {}) {
  // an absolute shebang to THIS node, not `#!/usr/bin/env node` — the tests deliberately
  // restrict PATH to exclude the real `claude`, which would also hide `node` itself
  const script = `#!${process.execPath}
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
try { fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ cwd: process.cwd(), args }) + '\\n'); } catch {}

const settingsPath = path.join(process.cwd(), '.claude', 'settings.json');
function readSettings() { try { return JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch { return {}; } }
function writeSettings(s) { fs.mkdirSync(path.dirname(settingsPath), { recursive: true }); fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\\n'); }

if (args[0] === 'plugin' && args[1] === 'marketplace' && args[2] === 'add') {
  if (${JSON.stringify(!!opts.marketplaceFails)}) { console.error('mock: marketplace add failed'); process.exit(1); }
  const arg = args[3];
  const s = readSettings();
  s.extraKnownMarketplaces = s.extraKnownMarketplaces || {};
  s.extraKnownMarketplaces.rederive = { source: { source: 'directory', path: arg } };
  writeSettings(s);
  console.log("Adding marketplace…\\u2714 Marketplace 'rederive' added");
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'install') {
  if (${JSON.stringify(!!opts.installFails)}) { console.error('mock: install failed'); process.exit(1); }
  const s = readSettings();
  s.enabledPlugins = s.enabledPlugins || {};
  s.enabledPlugins['rederive@rederive'] = true;
  writeSettings(s);
  console.log('Installing plugin "rederive@rederive"...\\u2714 Successfully installed plugin: rederive@rederive (scope: project)');
  process.exit(0);
}
if (args[0] === 'plugin' && args[1] === 'list' && args.includes('--json')) {
  const installed = !${JSON.stringify(!!opts.installFails)} && !${JSON.stringify(!!opts.marketplaceFails)};
  console.log(JSON.stringify(installed ? [{ id: 'rederive@rederive', version: '9.9.9-mock', scope: 'project', enabled: true, projectPath: process.cwd() }] : []));
  process.exit(0);
}
console.error('mock claude: unrecognized args ' + JSON.stringify(args));
process.exit(1);
`;
  const p = join(binDir, 'claude');
  writeFileSync(p, script);
  chmodSync(p, 0o755);
  return p;
}

function withMockClaude(opts: { marketplaceFails?: boolean; installFails?: boolean } = {}) {
  const binDir = mkdtempSync(join(tmpdir(), 'rdv-mock-claude-bin-'));
  const logPath = join(mkdtempSync(join(tmpdir(), 'rdv-mock-claude-log-')), 'log.jsonl');
  mockClaude(binDir, logPath, opts);
  process.env.PATH = `${binDir}:/usr/bin:/bin`;
  const readLog = () => readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { readLog };
}

test('claude on PATH: init invokes marketplace add + install with --scope project, and does NOT hand-write settings', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const { readLog } = withMockClaude();

  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: '/some/local/checkout' });

  const log = readLog();
  const adds = log.filter((e) => e.args[1] === 'marketplace');
  const installs = log.filter((e) => e.args[1] === 'install');
  assert.equal(adds.length, 1, 'marketplace add invoked exactly once');
  assert.equal(installs.length, 1, 'install invoked exactly once');
  assert.deepEqual(adds[0].args, ['plugin', 'marketplace', 'add', '/some/local/checkout', '--scope', 'project']);
  assert.deepEqual(installs[0].args, ['plugin', 'install', 'rederive@rederive', '--scope', 'project']);
  assert.equal(adds[0].cwd, installs[0].cwd, 'both run with cwd = the target repo');

  // the mock claude wrote these keys itself — init must NOT also hand-write them
  const settings = JSON.parse(read(d, '.claude/settings.json'));
  assert.deepEqual(settings.extraKnownMarketplaces.rederive, { source: { source: 'directory', path: '/some/local/checkout' } });
  assert.equal(settings.enabledPlugins['rederive@rederive'], true);

  const lock = readLock(d)!;
  assert.equal(lock.plugin.version, '9.9.9-mock', "lock's plugin version comes from `claude plugin list --json`, not a manifest");
  assert.deepEqual(lock.plugin.marketplace, { source: { source: 'directory', path: '/some/local/checkout' } });
});

test('claude on PATH: "next:" guidance says installed, not "not installed"', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  withMockClaude();
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { await cmdInit(d, { lang: 'rust', type: 'game', profilesDir }); } finally { console.log = orig; }
  assert.match(out, /plugin is installed and enabled/);
  assert.doesNotMatch(out, /Plugin not installed/);
});

test('claude on PATH but marketplace add fails: falls back to the nested hand-write, does not attempt install', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const { readLog } = withMockClaude({ marketplaceFails: true });

  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: 'rederive/rederive' });

  const log = readLog();
  assert.equal(log.filter((e) => e.args[1] === 'marketplace').length, 1, 'marketplace add was attempted once');
  assert.equal(log.filter((e) => e.args[1] === 'install').length, 0, 'install is never attempted after marketplace add fails');

  const settings = JSON.parse(read(d, '.claude/settings.json'));
  assert.deepEqual(settings.extraKnownMarketplaces.rederive, { source: { source: 'github', repo: 'rederive/rederive' } });
});

test('claude on PATH but install fails: falls back to the nested hand-write', async () => {
  const d = scaffold();
  const profilesDir = fixtureProfile('rust', 'game');
  const { readLog } = withMockClaude({ installFails: true });

  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, marketplace: 'rederive/rederive' }); } finally { console.log = orig; }

  const log = readLog();
  assert.equal(log.filter((e) => e.args[1] === 'marketplace').length, 1, 'marketplace add was attempted once');
  assert.equal(log.filter((e) => e.args[1] === 'install').length, 1, 'install was attempted once, and failed');
  assert.match(out, /claude plugin install failed — falling back/);
  assert.match(out, /Plugin not installed/);

  const settings = JSON.parse(read(d, '.claude/settings.json'));
  // marketplace add itself SUCCEEDED (only install failed), so its settings.json write
  // survives untouched — "never clobber" means our fallback fills in only what's
  // actually missing, which here is just enabledPlugins (install never got to write it)
  assert.deepEqual(settings.extraKnownMarketplaces.rederive, { source: { source: 'directory', path: 'rederive/rederive' } });
  assert.equal(settings.enabledPlugins['rederive@rederive'], true, 'the fallback still fills in the missing enabledPlugins key');
});
