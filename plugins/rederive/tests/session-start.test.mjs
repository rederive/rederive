#!/usr/bin/env node
// Fixture test for the plugin's SessionStart hook (finding #12). Run: node plugins/rederive/tests/session-start.test.mjs
//
// The invariant under test, in every scenario: exactly one line of output, exit 0, never the raw usage/help
// text of a stale `rdv`. Each test builds a throwaway "repo" (CLAUDE_PROJECT_DIR) and puts a FAKE `rdv` first
// on PATH (via a scratch bin/ directory prepended to PATH) so the scenario is deterministic and hermetic —
// no dependency on whatever `rdv` (if any) is actually installed on the machine running this test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HERE); // plugins/rederive
const SCRIPT = join(PLUGIN_ROOT, 'hooks', 'session-start.mjs');
// Read the LIVE plugin version rather than hardcoding it: session-start.mjs's mismatch message embeds
// plugin.json's version, and a hardcoded expectation here goes stale on every version bump (as literally
// happened once already, in the 0.5.0 -> 0.5.1 bump for finding #13).
const PLUGIN_VERSION = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;

function write(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// A scratch repo with a fake `rdv` prepended to PATH (bin/rdv), plus optionally a rederive.lock.
function scaffold({ lock = true, fakeRdv } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'rederive-session-start-'));
  if (lock) write(join(repo, 'rederive.lock'), JSON.stringify({ lock: 1, plugin: { version: '0.5.0' } }));
  let path = process.env.PATH;
  if (fakeRdv) {
    const bin = join(repo, 'bin');
    mkdirSync(bin, { recursive: true });
    const rdv = join(bin, 'rdv');
    writeFileSync(rdv, fakeRdv);
    chmodSync(rdv, 0o755);
    path = bin + delimiter + process.env.PATH;
  }
  return { repo, path };
}

function run(repo, path) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, PATH: path },
  });
}

function assertOneLine(stdout) {
  const lines = stdout.split('\n').filter((l) => l !== '');
  assert.equal(lines.length, 1, `expected exactly one line, got: ${JSON.stringify(stdout)}`);
  return lines[0];
}

test('a stale rdv that prints Commander usage text and exits nonzero -> the one-line mismatch notice, not the usage text', () => {
  const fakeRdv = '#!/usr/bin/env node\n' +
    'console.log("Usage: rdv [options] [command]");\n' +
    'console.log("");\n' +
    'console.log("Options:");\n' +
    'console.log("  -h, --help  display help for command");\n' +
    'process.exit(1);\n';
  const { repo, path } = scaffold({ fakeRdv });
  const r = run(repo, path);
  assert.equal(r.status, 0, 'always exits 0');
  const line = assertOneLine(r.stdout);
  const escapedVersion = PLUGIN_VERSION.replace(/\./g, '\\.');
  assert.match(line, new RegExp(`^rederive: rdv on PATH \\(.*\\) is older than this plugin needs \\(no \`doctor\`\\) — run \`npm i -g rederive@${escapedVersion}\` or \`npm link\` in your rederive checkout$`));
  assert.doesNotMatch(r.stdout, /Usage:/, 'the raw Commander usage text must never reach stdout');
  rmSync(repo, { recursive: true, force: true });
});

test('a stale rdv that exits 0 but prints usage anyway (no recognized doctor subcommand) is still caught', () => {
  const fakeRdv = '#!/usr/bin/env node\nconsole.log("usage: rdv <command>");\nprocess.exit(0);\n';
  const { repo, path } = scaffold({ fakeRdv });
  const r = run(repo, path);
  assert.equal(r.status, 0);
  const line = assertOneLine(r.stdout);
  assert.match(line, /is older than this plugin needs/);
  rmSync(repo, { recursive: true, force: true });
});

test('a working rdv that prints a doctor brief -> that brief, verbatim', () => {
  const brief = 'rederive: plugin 0.5.6 · sir-factory 0.4.0@unknown · typikon abc1234 · rdv 0.5.0@unknown — OK';
  const fakeRdv = `#!/usr/bin/env node\nconsole.log(${JSON.stringify(brief)});\nprocess.exit(0);\n`;
  const { repo, path } = scaffold({ fakeRdv });
  const r = run(repo, path);
  assert.equal(r.status, 0);
  const line = assertOneLine(r.stdout);
  assert.equal(line, brief);
  rmSync(repo, { recursive: true, force: true });
});

test('no rederive.lock -> the init hint, and nothing else (rdv is never even resolved)', () => {
  // A poisoned fake `rdv` proves this branch never gets as far as invoking it: if it were spawned, this
  // test's own assertion on the line's exact text would fail immediately.
  const fakeRdv = '#!/usr/bin/env node\nconsole.log("Usage: rdv [options] [command]");\nprocess.exit(1);\n';
  const { repo, path } = scaffold({ lock: false, fakeRdv });
  const r = run(repo, path);
  assert.equal(r.status, 0);
  const line = assertOneLine(r.stdout);
  assert.equal(line, 'rederive: no rederive.lock — run rdv init --lang <l> --type <t>');
  rmSync(repo, { recursive: true, force: true });
});

test('no rdv resolvable anywhere (lock present, nothing on PATH, no node_modules/.bin) -> one-line notice, not a crash', () => {
  const repo = mkdtempSync(join(tmpdir(), 'rederive-session-start-'));
  write(join(repo, 'rederive.lock'), JSON.stringify({ lock: 1 }));
  // A PATH with no `rdv` anywhere on it (an empty scratch dir only).
  const emptyBin = join(repo, 'empty-bin');
  mkdirSync(emptyBin, { recursive: true });
  const r = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8', cwd: repo,
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, PATH: emptyBin },
  });
  assert.equal(r.status, 0);
  const line = assertOneLine(r.stdout);
  assert.match(line, /^rederive: no `rdv` found/);
  rmSync(repo, { recursive: true, force: true });
});

test('a local node_modules/.bin/rdv is preferred over PATH', () => {
  const { repo, path } = scaffold({ fakeRdv: '#!/usr/bin/env node\nconsole.log("PATH rdv: should not run");\nprocess.exit(1);\n' });
  const localBrief = 'rederive: local pinned rdv OK';
  write(join(repo, 'node_modules/.bin/rdv'), `#!/usr/bin/env node\nconsole.log(${JSON.stringify(localBrief)});\nprocess.exit(0);\n`);
  chmodSync(join(repo, 'node_modules/.bin/rdv'), 0o755);
  const r = run(repo, path);
  assert.equal(r.status, 0);
  const line = assertOneLine(r.stdout);
  assert.equal(line, localBrief);
  rmSync(repo, { recursive: true, force: true });
});
