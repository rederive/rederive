// Tests for the `rdv init` SAFETY gate (incident 2026-09-28): a second consumer ran
// `init --help` in their Rust repo expecting help, and instead got no help — init ran
// silently on cwd with the generic npm-flavored frame, added a Stop + PreToolUse hook to
// .claude/settings.json, and installed a git pre-commit hook. They reverted by hand.
//
// Three guarantees, tested at the REAL CLI ENTRY POINT (spawning cli/rdv.mts via tsx, not
// calling cmdInit directly) since the bug lived in argv parsing in main(), not in cmdInit:
//   (a) --help/-h print usage and exit 0 (asking for help isn't an error); any unknown flag
//       prints an error and exits 2 — either way, touching NOTHING
//   (b) a bare `rdv init` (no --lang/--type) never writes on its own: it prints the PLAN and
//       needs --yes (or a TTY y/N this suite doesn't exercise) — non-TTY + no --yes = exit 1, no writes
//   (c) --dry-run always plans and exits 0 writing nothing, for either form
// (d, no code change) --lang/--type keeps applying immediately without --yes — covered
// already by cli/init-profile.test.mts and cli/init-plugin.test.mts.
// Run: npx tsx --test cli/init-safety.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDV_ENTRY = join(HERE, 'rdv.mts');
const TSX = join(HERE, '..', 'node_modules', '.bin', 'tsx');
const REAL_RUST_GAME = join(HERE, '..', 'plugins', 'rederive', 'profiles', 'rust-game');

function gitRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'rdv-init-safety-'));
  execSync('git init -q', { cwd: d });
  return d;
}

const porcelain = (d: string): string => execSync('git status --porcelain', { cwd: d, encoding: 'utf8' });
const nonGitFiles = (d: string): string[] => readdirSync(d).filter((f) => f !== '.git');

// `input: ''` gives the child a closed, non-TTY stdin — deterministic even if this test
// process itself ever runs attached to a real terminal.
function runInit(args: string[], cwd: string) {
  return spawnSync(TSX, [RDV_ENTRY, 'init', ...args], { cwd, encoding: 'utf8', input: '' });
}

test('init --help prints usage, exits 0 (asking for help is not an error), and touches nothing', () => {
  const d = gitRepo();
  const r = runInit(['--help'], d);
  assert.equal(r.status, 0, 'exits 0 — scripts/shells expect this for --help');
  assert.match(r.stdout, /usage: rdv init/);
  assert.equal(porcelain(d), '', 'git status is clean');
  assert.deepEqual(nonGitFiles(d), [], 'no files created');
});

test('init -h prints usage, exits 0, and touches nothing', () => {
  const d = gitRepo();
  const r = runInit(['-h'], d);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: rdv init/);
  assert.equal(porcelain(d), '');
  assert.deepEqual(nonGitFiles(d), []);
});

test('init --bogus (unknown flag) errors, exits non-zero, and touches nothing', () => {
  const d = gitRepo();
  const r = runInit(['--bogus'], d);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /unknown flag '--bogus'/);
  assert.equal(porcelain(d), '');
  assert.deepEqual(nonGitFiles(d), []);
});

test('a single-dash token is a flag, never the target dir — no literal "-x" directory', () => {
  const d = gitRepo();
  const r = runInit(['-x'], d);
  assert.notEqual(r.status, 0);
  assert.ok(!existsSync(join(d, '-x')));
  assert.equal(porcelain(d), '');
  assert.deepEqual(nonGitFiles(d), []);
});

test('bare `rdv init` (no --lang/--type), non-TTY, no --yes: prints the PLAN and writes nothing, exit 1', () => {
  const d = gitRepo();
  const r = runInit([], d);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PLAN/);
  assert.match(r.stdout, /\.git\/hooks\/pre-commit/, "the plan names the pre-commit hook it would install");
  assert.match(r.stdout, /\.claude\/settings\.json/, 'the plan names the settings.json it would touch (Stop + PreToolUse hooks)');
  assert.match(r.stdout, /PLAN ONLY.*--yes/, 'tells the caller how to actually apply it');
  assert.equal(porcelain(d), '', 'git status is clean');
  assert.deepEqual(nonGitFiles(d), [], 'no files created');
});

test('bare `rdv init --yes` actually writes the frame', () => {
  const d = gitRepo();
  const r = runInit(['--yes'], d);
  assert.equal(r.status, 0);
  assert.ok(existsSync(join(d, 'CLAUDE.md')));
  assert.ok(existsSync(join(d, '.git/hooks/pre-commit')));
  assert.ok(porcelain(d).length > 0, 'files were actually created this time');
});

test('--dry-run on a bare init: plans, exits 0, writes nothing', () => {
  const d = gitRepo();
  const r = runInit(['--dry-run'], d);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /DRY RUN/);
  assert.equal(porcelain(d), '');
  assert.deepEqual(nonGitFiles(d), []);
});

test('--dry-run with --lang/--type against the REAL profile: plans, exits 0, writes nothing', (t) => {
  if (!existsSync(REAL_RUST_GAME)) { t.skip(`no plugins/rederive/profiles/rust-game at ${REAL_RUST_GAME}`); return; }
  const d = gitRepo();
  const r = runInit(['--lang', 'rust', '--type', 'game', '--dry-run'], d);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /DRY RUN/);
  assert.match(r.stdout, /Cargo\.toml/, 'the plan lists profile files it would copy');
  assert.equal(porcelain(d), '', 'git status is clean');
  assert.deepEqual(nonGitFiles(d), [], 'no files created, no rederive.lock');
});

test('--dry-run wins even if --yes is also passed', () => {
  const d = gitRepo();
  const r = runInit(['--yes', '--dry-run'], d);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /DRY RUN/);
  assert.equal(porcelain(d), '');
  assert.deepEqual(nonGitFiles(d), []);
});
