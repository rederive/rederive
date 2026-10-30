// Tests for `rdv claude` — the exec wrapper. Spawns the real CLI (via the local tsx
// binary) with a fake `claude` executable prepended to PATH, so the ANTHROPIC_API_KEY
// refusal and the exec-and-passthrough path are both observed at the process boundary
// exactly as a real invocation would see them (spawn()'s PATH resolution, stdio, exit code).
// Run: npx tsx --test cli/claude.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { MARK_BEGIN } from './init.mts';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDV_ENTRY = join(HERE, 'rdv.mts');
const TSX = join(HERE, '..', 'node_modules', '.bin', 'tsx');

function fixture() {
  const projectDir = mkdtempSync(join(tmpdir(), 'rdv-claude-project-'));
  const binDir = mkdtempSync(join(tmpdir(), 'rdv-claude-bin-'));
  const fakeClaude = join(binDir, 'claude');
  writeFileSync(fakeClaude, '#!/bin/sh\necho FAKE_CLAUDE_CALLED "$@"\nexit 0\n');
  chmodSync(fakeClaude, 0o755);
  return { projectDir, binDir };
}

function runRdvClaude(args: string[], projectDir: string, binDir: string, envOverrides: Record<string, string | undefined> = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${binDir}:${process.env.PATH}` };
  for (const [k, v] of Object.entries(envOverrides)) { if (v === undefined) delete env[k]; else env[k] = v; }
  return spawnSync(TSX, [RDV_ENTRY, 'claude', ...args], { cwd: projectDir, encoding: 'utf8', env });
}

test('rdv claude refuses to launch when ANTHROPIC_API_KEY is set', () => {
  const { projectDir, binDir } = fixture();
  const r = runRdvClaude(['--foo'], projectDir, binDir, { ANTHROPIC_API_KEY: 'sk-ant-test' });
  assert.match(r.stdout, /refusing to launch/i);
  assert.doesNotMatch(r.stdout, /FAKE_CLAUDE_CALLED/);
  assert.equal(r.status, 1);
});

test('rdv claude execs and passes args through when ANTHROPIC_API_KEY is not set', () => {
  const { projectDir, binDir } = fixture();
  const r = runRdvClaude(['--foo', 'bar', 'baz'], projectDir, binDir, { ANTHROPIC_API_KEY: undefined });
  assert.match(r.stdout, /FAKE_CLAUDE_CALLED --foo bar baz/);
  assert.equal(r.status, 0);
});

test('rdv claude with --allow-api-key execs even when ANTHROPIC_API_KEY is set', () => {
  const { projectDir, binDir } = fixture();
  const r = runRdvClaude(['--allow-api-key', 'ping'], projectDir, binDir, { ANTHROPIC_API_KEY: 'sk-ant-test' });
  assert.match(r.stdout, /FAKE_CLAUDE_CALLED ping/);
  assert.equal(r.status, 0);
});

test('rdv claude strips its own flags (--init, --install, --allow-api-key) from the passthrough args', () => {
  const { projectDir, binDir } = fixture();
  const r = runRdvClaude(['--allow-api-key', '--init', '--install', '-p', 'hello'], projectDir, binDir, { ANTHROPIC_API_KEY: 'sk-ant-test' });
  assert.match(r.stdout, /FAKE_CLAUDE_CALLED -p hello/);
  assert.doesNotMatch(r.stdout, /--init|--install|--allow-api-key/);
  assert.equal(r.status, 0);
});

test('rdv claude with no rederive.lock and no --init just says so, and still execs claude', () => {
  const { projectDir, binDir } = fixture();
  const r = runRdvClaude([], projectDir, binDir, { ANTHROPIC_API_KEY: undefined });
  assert.match(r.stdout, /no rederive\.lock/);
  assert.match(r.stdout, /FAKE_CLAUDE_CALLED/);
  assert.equal(r.status, 0);
});

// v0.5 audit #6: a bare `rdv init --yes` writes the managed CLAUDE.md section but no lock — `rdv claude --init` must see the repo
// as initialized instead of re-running init on every launch.
test('rdv claude --init does not re-run init when CLAUDE.md already carries the managed section', () => {
  const { projectDir, binDir } = fixture();
  writeFileSync(join(projectDir, 'CLAUDE.md'), `# proj\n\n${MARK_BEGIN}\nframe\n<!-- rederive:end -->\n`);
  const r = runRdvClaude(['--init'], projectDir, binDir, { ANTHROPIC_API_KEY: undefined });
  assert.doesNotMatch(r.stdout, /running rdv init|no rederive\.lock/);
  assert.match(r.stdout, /FAKE_CLAUDE_CALLED/);
  assert.equal(r.status, 0);
});

// v0.5 audit #8: --install must never reach npm/uv for packages that do not exist publicly (@rederive/lab, rederive/typikon)
test('rdv claude --install installs nothing and names no 404 install target', () => {
  const { projectDir, binDir } = fixture();
  for (const t of ['npm', 'uv']) { writeFileSync(join(binDir, t), `#!/bin/sh\necho ${t.toUpperCase()}_CALLED "$@"\nexit 0\n`); chmodSync(join(binDir, t), 0o755); }
  const r = runRdvClaude(['--install'], projectDir, binDir, { ANTHROPIC_API_KEY: undefined, PATH: `${binDir}:${dirname(process.execPath)}:/usr/bin:/bin` });
  assert.doesNotMatch(r.stdout, /NPM_CALLED|UV_CALLED|@rederive\/lab|github\.com\/rederive\/typikon/);
  assert.match(r.stdout, /installs nothing/);
  assert.match(r.stdout, /FAKE_CLAUDE_CALLED/);
});

// the lab is retired (Lane, 2026-10-29): the optional verifier rdv claude reports is sir-factory, found the way tools/lab
// finds it ($SIR_FACTORY, ./node_modules/sir-factory, PATH) — and its absence names the npm install, never the lab
test('rdv claude reports sir-factory (not the lab) as the optional verifier: absent -> the npm hint; on PATH -> not reported', () => {
  const { projectDir, binDir } = fixture();
  symlinkSync(process.execPath, join(binDir, 'node'));   // node alone, not its bin dir (a global sir-factory may be linked there)
  const PATH = `${binDir}:/usr/bin:/bin`;
  const none = runRdvClaude([], projectDir, binDir, { ANTHROPIC_API_KEY: undefined, SIR_FACTORY: undefined, PATH });
  assert.match(none.stdout, /rdv claude: sir-factory and typikon not found — optional \(the v0\.5 unit loop \/ the typikon Stop hook stay inactive; npm i -D sir-factory@\^0\.4\.0\)/);
  assert.doesNotMatch(none.stdout, /sir-lab|@rederive\/lab/);
  writeFileSync(join(binDir, 'sir-factory'), '#!/bin/sh\necho "sir-factory 0.4.0"\n');
  chmodSync(join(binDir, 'sir-factory'), 0o755);
  const found = runRdvClaude([], projectDir, binDir, { ANTHROPIC_API_KEY: undefined, SIR_FACTORY: undefined, PATH });
  assert.match(found.stdout, /rdv claude: typikon not found — optional \(the typikon Stop hook stays inactive\)/);
  assert.doesNotMatch(found.stdout, /sir-factory[^\n]*not found/);
});
