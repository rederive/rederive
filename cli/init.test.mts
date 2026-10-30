// Tests for `rdv init` — idempotency, marker-merge preservation, settings merge.
// All calls pass { yes: true }: a bare (no --lang/--type) init now PLANS by default and
// needs explicit consent to write (see cli/init-safety.test.mts for that gate itself) —
// these tests are about the APPLY behavior once consent is given, unchanged otherwise.
// Run: npx tsx --test cli/init.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';

const scaffold = () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-init-'));
  execSync('git init -q', { cwd: d });
  return d;
};
const read = (d: string, f: string) => readFileSync(join(d, f), 'utf8');
const init = (d: string) => cmdInit(d, { yes: true });

test('init twice is byte-identical (idempotent)', async () => {
  const d = scaffold();
  await init(d);
  const files = ['CLAUDE.md', 'AGENTS.md', '.claude/settings.json',
    '.rederive/guard-contracts.mjs', '.rederive/verify-changed.mjs',
    '.github/workflows/rederive-verify.yml', '.git/hooks/pre-commit'];
  const first = files.map((f) => read(d, f));
  await init(d);
  files.forEach((f, i) => assert.equal(read(d, f), first[i], f));
});

test('user CLAUDE.md content is preserved; marker section replaced not duplicated', async () => {
  const d = scaffold();
  writeFileSync(join(d, 'CLAUDE.md'), '# My rules\n\nAlways use tabs.\n');
  await init(d);
  await init(d);
  const c = read(d, 'CLAUDE.md');
  assert.ok(c.startsWith('# My rules'));
  assert.ok(c.includes('Always use tabs.'));
  assert.equal(c.split('rederive:begin').length - 1, 1, 'exactly one marker section');
  assert.ok(c.includes('Pre-empted objections'));
});

test('existing user hooks in settings.json survive the merge, ours added once', async () => {
  const d = scaffold();
  mkdirSync(join(d, '.claude'), { recursive: true });
  writeFileSync(join(d, '.claude/settings.json'), JSON.stringify({
    permissions: { allow: ['Bash(npm test)'] },
    hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-guard.sh' }] }] },
  }));
  await init(d);
  await init(d);
  const s = JSON.parse(read(d, '.claude/settings.json'));
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'] });
  const cmds = s.hooks.PreToolUse.flatMap((e: any) => e.hooks.map((h: any) => h.command));
  assert.ok(cmds.includes('my-guard.sh'), 'user hook preserved');
  assert.equal(cmds.filter((c: string) => c.includes('guard-contracts')).length, 1, 'ours exactly once');
  assert.equal(s.hooks.Stop.length, 1, 'stop hook exactly once');
});

test('invalid settings.json is not clobbered', async () => {
  const d = scaffold();
  mkdirSync(join(d, '.claude'), { recursive: true });
  writeFileSync(join(d, '.claude/settings.json'), '{not json');
  await init(d);
  assert.equal(read(d, '.claude/settings.json'), '{not json', 'left untouched');
});

test('pre-existing foreign pre-commit hook is left alone', async () => {
  const d = scaffold();
  mkdirSync(join(d, '.git/hooks'), { recursive: true });
  writeFileSync(join(d, '.git/hooks/pre-commit'), '#!/bin/sh\nmy-own-checks\n');
  await init(d);
  assert.equal(read(d, '.git/hooks/pre-commit'), '#!/bin/sh\nmy-own-checks\n');
});

test('no .git: pre-commit skipped, CI workflow still written', async () => {
  const d = mkdtempSync(join(tmpdir(), 'rdv-init-nogit-'));
  await init(d);
  assert.ok(existsSync(join(d, '.github/workflows/rederive-verify.yml')));
  assert.ok(!existsSync(join(d, '.git/hooks/pre-commit')));
});

test('agent roster written once, never clobbered', async () => {
  const d = scaffold();
  await init(d);
  const p = join(d, '.claude/agents/sir-reemitter.md');
  writeFileSync(p, 'user-customized');
  await init(d);
  assert.equal(readFileSync(p, 'utf8'), 'user-customized');
});
