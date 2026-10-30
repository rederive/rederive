// Tests for the "existing consumer" findings (#2-#5): a repo that already has SOME of what
// a profile would scaffold — an unmanaged copy of the CLAUDE.md section pasted in by hand,
// a hand-edited tools/emit, a stale .claude/agents/sir-*.md symlink, and its own
// contracts/*.contract.yaml — must get PLAN LINES for all of it, never silent clobbering or
// silent duplication. Also covers (#2/#3): a profile that ships its own hook scripts /
// workflow / pre-commit body installs THOSE instead of the generic npm-era frame scripts.
// Run: npx tsx --test cli/init-existing-consumer.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, existsSync, chmodSync, symlinkSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';

// claude off PATH: these use --lang/--type, which would otherwise try the real `claude`
// plugin CLI — irrelevant to what this file tests, and slow/network-dependent if it ran.
let ORIGINAL_PATH: string | undefined;
before(() => { ORIGINAL_PATH = process.env.PATH; process.env.PATH = '/usr/bin:/bin'; });
after(() => { if (ORIGINAL_PATH !== undefined) process.env.PATH = ORIGINAL_PATH; });

async function captureLog(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const orig = console.log;
  console.log = (s: any) => { out += String(s) + '\n'; };
  try { return { code: await fn(), out }; } finally { console.log = orig; }
}
const porcelain = (d: string): string => execSync('git status --porcelain', { cwd: d, encoding: 'utf8' });

const DISTINCTIVE_1 = 'This distinctive line marks the profile section content uniquely for matching.';
const DISTINCTIVE_2 = 'A second distinctive line that should not appear anywhere else by coincidence.';
const SECTION_HEADING = '## The existing-consumer test loop';

/** A fixture profile that ships EVERYTHING findings #2-#5 are about: its own hook scripts
 * (guard/verify/pre-commit/workflow), a tools/emit a consumer might have diverged from, and
 * a contracts/*.contract.yaml. */
function existingConsumerProfile(): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(join(pdir, 'tools'), { recursive: true });
  mkdirSync(join(pdir, 'contracts'), { recursive: true });
  mkdirSync(join(pdir, '.rederive'), { recursive: true });
  mkdirSync(join(pdir, '.github/workflows'), { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), [SECTION_HEADING, DISTINCTIVE_1, DISTINCTIVE_2, ''].join('\n'));
  writeFileSync(join(pdir, 'typikon.yaml'), 'aspects: []\n');
  writeFileSync(join(pdir, 'tools/emit'), '#!/bin/sh\necho "profile emit v2"\n');
  chmodSync(join(pdir, 'tools/emit'), 0o755);
  writeFileSync(join(pdir, 'contracts/game.contract.yaml'), 'name: game\n');
  writeFileSync(join(pdir, '.rederive/guard-contracts.mjs'), '#!/usr/bin/env node\nconsole.log("profile guard");\n');
  writeFileSync(join(pdir, '.rederive/verify-changed.mjs'), '#!/usr/bin/env node\nconsole.log("profile verify");\n');
  // a REAL profile's .rederive/pre-commit is a complete, self-contained script — its own
  // shebang and its own "managed by rdv init" comment, not just an action one-liner.
  writeFileSync(join(pdir, '.rederive/pre-commit'), '#!/bin/sh\n# rederive-verify (managed by rdv init) — fixture profile variant.\necho "profile pre-commit body"\n');
  writeFileSync(join(pdir, '.github/workflows/rederive-verify.yml'), 'name: profile-ci\non: [push]\n');
  return profilesDir;
}

/** A repo that already has: an unmanaged copy of the profile's CLAUDE.md section (pasted by
 * hand, no markers), a hand-edited tools/emit that diverges from the profile's, a stale
 * .claude/agents/sir-decomposer.md SYMLINK, and its own contracts/x.contract.yaml. */
function existingConsumerRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'rdv-existing-consumer-'));
  execSync('git init -q', { cwd: d });
  writeFileSync(join(d, 'CLAUDE.md'), [
    '# My own project notes', '',
    SECTION_HEADING, DISTINCTIVE_1, DISTINCTIVE_2, '',
    '## Unrelated section after', 'Some other content here.', '',
  ].join('\n'));
  mkdirSync(join(d, 'tools'), { recursive: true });
  writeFileSync(join(d, 'tools/emit'), '#!/bin/sh\necho "MY OWN emit script"\n');
  chmodSync(join(d, 'tools/emit'), 0o755);
  mkdirSync(join(d, '.claude/agents'), { recursive: true });
  const linkTarget = join(d, 'somewhere-else.md');
  writeFileSync(linkTarget, 'symlink target\n');
  symlinkSync(linkTarget, join(d, '.claude/agents/sir-decomposer.md'));
  mkdirSync(join(d, 'contracts'), { recursive: true });
  writeFileSync(join(d, 'contracts/x.contract.yaml'), 'name: x\n');
  return d;
}

test('existing consumer: --dry-run surfaces every manual-step warning and changes nothing', async () => {
  const d = existingConsumerRepo();
  const profilesDir = existingConsumerProfile();
  const before = porcelain(d);
  const { code, out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, dryRun: true }));
  assert.equal(code, 0);
  assert.match(out, /! CLAUDE\.md already carries this section unmanaged — not duplicated; use --adopt/);
  assert.match(out, /! tools\/emit differs from the profile \(kept\) — diff:/);
  assert.match(out, /! \.claude\/agents\/sir-decomposer\.md present — the plugin's rederive:sir-\* roster is authoritative; remove with --prune-agents/);
  assert.match(out, /! contracts\/game\.contract\.yaml \(skipped — contracts\/ already has a \*\.contract\.yaml of its own\)/);
  assert.equal(porcelain(d), before, 'dry-run changed no git status at all');
});

test('existing consumer: apply WITHOUT --adopt leaves the unmanaged CLAUDE.md untouched', async () => {
  const d = existingConsumerRepo();
  const profilesDir = existingConsumerProfile();
  const claudeBefore = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), claudeBefore, 'byte-identical — not duplicated, not touched');
  assert.match(out, /! CLAUDE\.md already carries this section unmanaged/);
  assert.equal(readFileSync(join(d, 'tools/emit'), 'utf8'), '#!/bin/sh\necho "MY OWN emit script"\n', "the consumer's tools/emit survives too");
  assert.ok(existsSync(join(d, '.claude/agents/sir-decomposer.md')), 'the symlink is not removed without --prune-agents');
  assert.equal(readFileSync(join(d, 'contracts/x.contract.yaml'), 'utf8'), 'name: x\n');
  assert.ok(!existsSync(join(d, 'contracts/game.contract.yaml')), "the profile's own contract file was never created");
});

test('existing consumer: --adopt replaces the unmanaged block with exactly one managed block, preserving the rest', async () => {
  const d = existingConsumerRepo();
  const profilesDir = existingConsumerProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true }));
  assert.match(out, /~ CLAUDE\.md \(--adopt: replaced the unmanaged '## The existing-consumer test loop' block/);
  const c = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.equal(c.split('rederive:begin').length - 1, 1, 'exactly one managed marker block');
  assert.equal((c.match(new RegExp(DISTINCTIVE_1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1, 'the section text appears exactly once, now inside the managed block');
  assert.ok(c.includes('# My own project notes'), 'unrelated content before the block is preserved');
  assert.ok(c.includes('## Unrelated section after'), 'unrelated content after the block is preserved');
  assert.ok(c.includes('Some other content here.'));
});

test('existing consumer: --prune-agents removes the sir-decomposer.md symlink (and only sir-*.md)', async () => {
  const d = existingConsumerRepo();
  const profilesDir = existingConsumerProfile();
  const link = join(d, '.claude/agents/sir-decomposer.md');
  assert.ok(lstatSync(link).isSymbolicLink(), 'fixture sanity: it really is a symlink');
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, pruneAgents: true }));
  assert.match(out, /- \.claude\/agents\/sir-decomposer\.md \(--prune-agents: removed/);
  assert.ok(!existsSync(link), 'the symlink itself is gone');
});

test('existing consumer: profile-shipped hooks install instead of the generic frame, and settings.json still references them by the same paths', async () => {
  const d = existingConsumerRepo();
  const profilesDir = existingConsumerProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.match(out, /\.rederive\/guard-contracts\.mjs \[profile hook\]/);
  assert.match(out, /\.rederive\/verify-changed\.mjs \[profile hook\]/);
  assert.match(out, /\.github\/workflows\/rederive-verify\.yml \[profile hook\]/);
  assert.match(out, /\.rederive\/pre-commit \[profile hook\]/);

  assert.ok(readFileSync(join(d, '.rederive/guard-contracts.mjs'), 'utf8').includes('profile guard'));
  assert.ok(readFileSync(join(d, '.rederive/verify-changed.mjs'), 'utf8').includes('profile verify'));
  assert.ok(readFileSync(join(d, '.github/workflows/rederive-verify.yml'), 'utf8').includes('profile-ci'));
  assert.ok(readFileSync(join(d, '.rederive/pre-commit'), 'utf8').includes('profile pre-commit body'), 'the pre-commit source is also copied as a tracked file');
  assert.ok(readFileSync(join(d, '.git/hooks/pre-commit'), 'utf8').includes('profile pre-commit body'), 'and its content is the installed hook body');

  const settings = JSON.parse(readFileSync(join(d, '.claude/settings.json'), 'utf8'));
  const preToolCmds = settings.hooks.PreToolUse.flatMap((e: any) => e.hooks.map((h: any) => h.command));
  const stopCmds = settings.hooks.Stop.flatMap((e: any) => e.hooks.map((h: any) => h.command));
  assert.ok(preToolCmds.some((c: string) => c.includes('.rederive/guard-contracts.mjs')), 'settings.json still points at the same fixed path');
  assert.ok(stopCmds.some((c: string) => c.includes('.rederive/verify-changed.mjs')));

  const precommit = readFileSync(join(d, '.git/hooks/pre-commit'), 'utf8');
  assert.equal(precommit.match(/^#!/gm)?.length, 1, "the profile's own shebang is installed verbatim, not double-wrapped with ours");
  const second = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.match(second.out, /= \.git\/hooks\/pre-commit \(already wired\)/, '"already wired" detection still works against a profile-sourced hook body');
});

test('a profile shipping NO hook files falls back to the generic frame, labeled as such', async () => {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), '## bare fixture\n');
  const d = mkdtempSync(join(tmpdir(), 'rdv-init-bare-profile-'));
  execSync('git init -q', { cwd: d });
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  assert.match(out, /\.rederive\/guard-contracts\.mjs \[generic frame\]/);
  assert.match(out, /\.rederive\/verify-changed\.mjs \[generic frame\]/);
  assert.match(out, /\.github\/workflows\/rederive-verify\.yml \[generic frame\]/);
  assert.match(out, /\.git\/hooks\/pre-commit \[generic frame\]/);
});

test('tools/* diff hint shows the first differing CHARACTER, not a truncated-from-the-start prefix that looks identical', async () => {
  // both lines share an 80+ char common prefix — the old (buggy) "truncate from column 0"
  // hint would have printed the SAME 40-char prefix on both sides and looked like a
  // false-positive ("existing X vs profile X"). The fix must show where they actually differ.
  const commonPrefix = '# tools/emit <unit> <lang> <i> [<i> ...] — a very long shared comment prefix here';
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(join(pdir, 'tools'), { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), '## fixture\n');
  writeFileSync(join(pdir, 'tools/emit'), `#!/bin/sh\n${commonPrefix} (profile ending)\n`);

  const d = mkdtempSync(join(tmpdir(), 'rdv-diff-hint-'));
  execSync('git init -q', { cwd: d });
  mkdirSync(join(d, 'tools'), { recursive: true });
  writeFileSync(join(d, 'tools/emit'), `#!/bin/sh\n${commonPrefix} (existing ending)\n`);

  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir }));
  const m = out.match(/! tools\/emit differs from the profile \(kept\) — diff: (.+)/);
  assert.ok(m, 'diff hint line present');
  assert.match(m![1], /^line 2, col \d+: existing "…?.*existing ending\)…?" vs profile "…?.*profile ending\)…?"$/);
  // the two shown strings must NOT be identical — that was the bug
  const quoted = [...m![1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  assert.equal(quoted.length, 2);
  assert.notEqual(quoted[0], quoted[1], 'the two sides must show their actual divergence, not an identical shared prefix');
});
