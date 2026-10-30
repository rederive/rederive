#!/usr/bin/env node
// Fixture test for the rust-game profile's v0.5-aware hooks. Run: node plugins/rederive/tests/profile-hooks.test.mjs
//
// Lives at the PLUGIN level, not inside the profile: `rdv init` copies everything under profiles/rust-game/
// verbatim into a consumer repo, so a test file that lived there (finding #15) landed as a stray
// tests/profile-hooks.test.mjs in every real consumer — a plugin fixture is not a consumer file. Nothing
// under profiles/rust-game/ should be a test from here on; this directory (plugins/rederive/tests/, sibling
// to session-start.test.mjs and plugin-version.test.mjs) is where the plugin's own tests belong instead.
//
// Builds a throwaway rust-game repo under the OS temp dir from a couple of hand-placed files (not the full
// `rdv init` scaffold — this test targets the two hook scripts directly, byte-for-byte as this profile ships
// them) and drives them the way Claude Code and git actually would: guard-contracts.mjs gets the real
// PreToolUse JSON shape on stdin and its exit code + stderr are asserted; verify-changed.mjs is run as a
// child process against a real (uncommitted) git repo.
//
// verify-changed.mjs shells out to `tools/lab validate <unit>` to check binding currency — reimplementing the
// judge's canonical-sha algorithm here would duplicate (and could silently drift from) the real one. So this
// fixture supplies its OWN tiny `tools/lab` stub that only understands `validate`, making the "stale binding"
// case deterministic and hermetic (no dependency on a real sir-factory being installed on the test machine).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(HERE); // plugins/rederive
const PROFILE = join(PLUGIN_ROOT, 'profiles', 'rust-game');
const GUARD = join(PROFILE, '.rederive', 'guard-contracts.mjs');
const VERIFY = join(PROFILE, '.rederive', 'verify-changed.mjs');

function write(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// A repo with one recognized unit "x": units/x/sir/x.sir exists (the unit-root marker), an oracle file, and a
// landed emission at index 1 in each language shape — a DIRECTORY for rust, single FILES for js/ts — so
// "existing" vs "new" has something real to compare against for both emission shapes.
function scaffold() {
  const repo = mkdtempSync(join(tmpdir(), 'rederive-profile-hooks-'));
  write(join(repo, 'units/x/sir/x.sir'), 'UNIT x\nKIND FUNCTIONAL\nFIDELITY spec\n');
  write(join(repo, 'units/x/oracles/x.json'), '{"unit":"x","vectors":[]}\n');
  write(join(repo, 'units/x/runs/rust/emit_1/src/lib.rs'), 'pub fn x() {}\n');
  write(join(repo, 'units/x/runs/js/emit_1.mjs'), 'export function x() {}\n');
  return repo;
}

const CLOSED_HOME = mkdtempSync(join(tmpdir(), 'guard-home-'));   // a home with no maintainer window

function runGuard(repo, toolName, filePath) {
  const input = JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } });
  return spawnSync('node', [GUARD], {
    input,
    encoding: 'utf8',
    // HOME too, not just the env var: the guard also opens on ~/.sir-allow-toolkit-edits, so a maintainer running
    // this suite with their window open saw every "must deny" test fail. The tests must not read the real home.
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, SIR_ALLOW_TOOLKIT_EDITS: '', HOME: CLOSED_HOME },
  });
}

test('guard: Edit to an EXISTING oracle file is blocked (exit 2, names the door)', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Edit', join(repo, 'units/x/oracles/x.json'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED.*oracles/s);
  assert.match(r.stderr, /oracle\/gen\.mjs/); // names the door
  rmSync(repo, { recursive: true, force: true });
});

test('guard: Write to a NEW emission index (not yet on disk) is allowed', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Write', join(repo, 'units/x/runs/rust/emit_4/src/lib.rs'));
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  rmSync(repo, { recursive: true, force: true });
});

test('guard: Write to an EXISTING landed emission is blocked', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Write', join(repo, 'units/x/runs/rust/emit_1/src/lib.rs'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED.*emit_1/s);
  rmSync(repo, { recursive: true, force: true });
});

test('guard: Edit of an EXISTING js emission FILE (not a directory) is blocked', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Edit', join(repo, 'units/x/runs/js/emit_1.mjs'));
  assert.equal(r.status, 2, 'a single-file (js/ts) emission must be covered, not just directory-shaped rust emissions');
  assert.match(r.stderr, /BLOCKED.*emit_1/s);
  rmSync(repo, { recursive: true, force: true });
});

test('guard: Write of a NEW js emission file (not yet on disk) is allowed', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Write', join(repo, 'units/x/runs/js/emit_4.mjs'));
  assert.equal(r.status, 0);
  rmSync(repo, { recursive: true, force: true });
});

test('guard: Write of a NEW ts emission file is allowed, then an Edit of it is denied', () => {
  const repo = scaffold();
  const p = join(repo, 'units/x/runs/ts/emit_2.ts');
  let r = runGuard(repo, 'Write', p);
  assert.equal(r.status, 0, 'a brand-new ts emission file must be allowed');
  write(p, 'export function x(): void {}\n'); // the write the guard just allowed actually happens
  r = runGuard(repo, 'Edit', p);
  assert.equal(r.status, 2, 'the same file, now landed, must be denied on a further touch');
  assert.match(r.stderr, /BLOCKED.*emit_2/s);
  rmSync(repo, { recursive: true, force: true });
});

test('guard: a two-write Rust emitter (Cargo.toml then src/lib.rs) lands both writes into a FRESH emit index, only a later touch of either is denied', () => {
  const repo = scaffold(); // emit_1 already exists; emit_7 is a fresh index nothing has touched yet
  const cargo = join(repo, 'units/x/runs/rust/emit_7/Cargo.toml');
  const lib = join(repo, 'units/x/runs/rust/emit_7/src/lib.rs');

  // First write: emit_7/Cargo.toml. This is the write that would CREATE the emit_7/ directory — a
  // directory-level "does emit_7/ exist" rule would already be wrong to deny here, but confirm it's allowed.
  let r = runGuard(repo, 'Write', cargo);
  assert.equal(r.status, 0, 'first file of a fresh emission index must be allowed');
  write(cargo, '[package]\nname = "x"\n'); // the tool call the hook just allowed actually happens

  // Second write: emit_7/src/lib.rs, into the SAME emit_7/ directory that now exists on disk. A dir-level
  // rule would deny this (the directory exists); the per-file rule must still allow it (this exact file does
  // not exist yet) — this is the regression the two-write Rust emitter shape depends on.
  r = runGuard(repo, 'Write', lib);
  assert.equal(r.status, 0, 'second file of the SAME fresh emission, into an existing dir, must still be allowed');
  write(lib, 'pub fn x() {}\n');

  // Now emit_7/src/lib.rs exists: any further Edit/Write of it is a landed-emission rewrite and is denied.
  r = runGuard(repo, 'Write', lib);
  assert.equal(r.status, 2, 'a THIRD write to the now-existing emit_7/src/lib.rs is a rewrite of a landed emission');
  assert.match(r.stderr, /BLOCKED.*emit_7/s);

  rmSync(repo, { recursive: true, force: true });
});

test('guard: a brand-new oracle file (not yet on disk) is allowed — same per-file rule as emissions', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Write', join(repo, 'units/x/oracles/new-unit.json'));
  assert.equal(r.status, 0);
  rmSync(repo, { recursive: true, force: true });
});

test('guard: Edit to sir/x.sir (the contract itself) is allowed — advisory door, not this hook', () => {
  const repo = scaffold();
  const r = runGuard(repo, 'Edit', join(repo, 'units/x/sir/x.sir'));
  assert.equal(r.status, 0);
  assert.equal(r.stderr, '');
  rmSync(repo, { recursive: true, force: true });
});

test('guard: the maintainer window bypasses every denial', () => {
  const repo = scaffold();
  const input = JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: join(repo, 'units/x/oracles/x.json') } });
  const r = spawnSync('node', [GUARD], {
    input, encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo, SIR_ALLOW_TOOLKIT_EDITS: '1' },
  });
  assert.equal(r.status, 0);
  rmSync(repo, { recursive: true, force: true });
});

test('guard: crates/<u>/** is blocked once INSTALLED.json exists', () => {
  const repo = scaffold();
  write(join(repo, 'crates/x/INSTALLED.json'), '{"unit":"x"}\n');
  const r = runGuard(repo, 'Write', join(repo, 'crates/x/src/lib.rs'));
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED.*crates\/x/s);
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed: an accepted-but-STALE unit prints a FAIL line and (Stop mode) still exits 0', () => {
  const repo = scaffold();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
  write(join(repo, 'units/x/runs/decision.json'), JSON.stringify({ unit: 'x', round: 3, next: 'accept' }));

  // A stub `tools/lab` that only understands `validate <unit>` and reports unit "x" as stale (nonzero exit) —
  // deterministic and hermetic, independent of whether a real sir-factory is installed on this machine.
  const labStub = '#!/usr/bin/env node\n' +
    'const [, , cmd, unit] = process.argv;\n' +
    'if (cmd === "validate" && unit === "x") { process.stderr.write("E_STALE_BINDING: primary changed since bind\\n"); process.exit(1); }\n' +
    'process.exit(0);\n';
  write(join(repo, 'tools/lab'), labStub);
  chmodSync(join(repo, 'tools/lab'), 0o755);

  const r = spawnSync('node', [VERIFY], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
  });
  assert.equal(r.status, 0, 'Stop-hook mode is advisory: it always exits 0');
  assert.match(r.stdout, /FAIL\s+x:.*STALE binding/s);
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed --precommit: the same STALE unit exits 1', () => {
  const repo = scaffold();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
  write(join(repo, 'units/x/runs/decision.json'), JSON.stringify({ unit: 'x', round: 3, next: 'accept' }));
  const labStub = '#!/usr/bin/env node\nprocess.exit(1);\n';
  write(join(repo, 'tools/lab'), labStub);
  chmodSync(join(repo, 'tools/lab'), 0o755);
  execFileSync('git', ['add', '-A'], { cwd: repo }); // --precommit reads the STAGED diff

  const r = spawnSync('node', [VERIFY, '--precommit'], {
    cwd: repo, encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: repo },
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /FAIL\s+x:/);
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed: tools/lab cannot find sir-factory (exit 3) -> a FAIL that says so, never "STALE binding"', () => {
  const repo = scaffold();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  write(join(repo, 'units/x/runs/decision.json'), JSON.stringify({ unit: 'x', round: 2, next: 'accept' }));
  write(join(repo, 'tools/lab'), '#!/bin/sh\necho "tools/lab: sir-factory was not found — npm i -D sir-factory@^0.4.0" >&2\nexit 3\n');
  chmodSync(join(repo, 'tools/lab'), 0o755);
  const r = spawnSync('node', [VERIFY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
  assert.equal(r.status, 0, 'Stop-hook mode is advisory');
  assert.match(r.stdout, /FAIL\s+x: accepted round 2 but the binding could NOT be checked — tools\/lab: sir-factory was not found/);
  assert.doesNotMatch(r.stdout, /STALE binding/);
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed: nothing under units/ or crates/ changed -> no-op, exit 0, no output', () => {
  const repo = scaffold();
  execFileSync('git', ['init', '-q'], { cwd: repo });
  write(join(repo, 'README.md'), '# not a unit\n');
  // Remove the units/ tree entirely so ONLY an unrelated file is untracked.
  rmSync(join(repo, 'units'), { recursive: true, force: true });
  const r = spawnSync('node', [VERIFY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed: a changed PRODUCT crate (no units/sim, no INSTALLED.json) is not this hook\'s business — no FAIL, no output', () => {
  const repo = scaffold(); // units/x exists but nothing about it changes in this test
  execFileSync('git', ['init', '-q'], { cwd: repo });
  write(join(repo, 'crates/sim/src/lib.rs'), 'pub fn placeholder() {}\n');
  // The only untracked thing should be crates/sim — remove the unit's own files so this test isolates the
  // crate-classification behavior (a real init'ed repo also has units/x, but that is not what's under test).
  rmSync(join(repo, 'units'), { recursive: true, force: true });

  const r = spawnSync('node', [VERIFY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /FAIL/);
  assert.equal(r.stdout, '', 'crates/sim has no units/sim/ and no INSTALLED.json — this hook has nothing to say about it');
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed: a unit crate with NO INSTALLED.json (never installed) is a FAIL, distinct from a product crate', () => {
  const repo = scaffold(); // units/x/sir/x.sir exists — crates/x IS a real unit
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repo });
  execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo });
  execFileSync('git', ['add', '-A'], { cwd: repo });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: repo }); // units/x is now committed — not "changed"

  write(join(repo, 'crates/x/src/lib.rs'), 'pub fn x() {}\n'); // no INSTALLED.json alongside it — the one new change

  const r = spawnSync('node', [VERIFY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
  assert.equal(r.status, 0, 'Stop-hook mode is advisory');
  assert.match(r.stdout, /FAIL\s+x:.*no INSTALLED\.json/s);
  assert.doesNotMatch(r.stdout, /no runs\/decision\.json/, 'only the crate finding is under test here, not an unrelated units/x finding');
  rmSync(repo, { recursive: true, force: true });
});

test('verify-changed: an INSTALLED unit crate runs tools/install --check', () => {
  // A bare repo, not scaffold() — scaffold's own unit "x" has no decision.json, which would add an unrelated
  // FAIL to stdout and defeat the "no FAIL" assertion below. This test is only about the crate-check path.
  const repo = mkdtempSync(join(tmpdir(), 'rederive-profile-hooks-'));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  write(join(repo, 'crates/y/INSTALLED.json'), '{"unit":"y"}\n');
  write(join(repo, 'crates/y/src/lib.rs'), 'pub fn y() {}\n');

  // A stub `tools/install` that only understands `--check <unit>` and confirms it was actually invoked with
  // the right unit name — the check itself is the real tool's job, not reimplemented here.
  const installStub = '#!/usr/bin/env node\n' +
    'const [, , flag, unit] = process.argv;\n' +
    'if (flag === "--check" && unit === "y") { console.log("y: BYTE-EXACT + CURRENT"); process.exit(0); }\n' +
    'process.exit(1);\n';
  write(join(repo, 'tools/install'), installStub);
  chmodSync(join(repo, 'tools/install'), 0o755);

  const r = spawnSync('node', [VERIFY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo } });
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.stdout, /FAIL/);
  assert.match(r.stdout, /ok\s+y:.*byte-exact/is);
  rmSync(repo, { recursive: true, force: true });
});
