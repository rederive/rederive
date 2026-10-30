// Finding #7: `--adopt` replacing the unmanaged block with the profile's genericized section
// was silently dropping project-specific content the profile never generalized — an entire
// numbered rule the profile doesn't have anymore, a citation-bearing clause inside a rule
// that otherwise matches. --adopt must never do that: anything with no counterpart in the
// managed section is kept verbatim in a new "## Project rules" section, and dropping it at
// all requires the explicit --force-adopt.
// Run: npx tsx --test cli/init-adopt-keep.test.mts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { cmdInit } from './init.mts';

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

// The MANAGED (profile) section: three matching subsections, rules 1-3 only.
const MANAGED_SECTION = [
  '## The loop (per named rule of the sim)',
  'Every rule of the sim with a name worth saying and a number in the design doc is a UNIT.',
  '',
  '## Hard rules',
  '1. Never type an expected value. Oracles are computed from the design doc.',
  '2. The sim crate is pure. No clock, no I/O, no randomness it did not receive.',
  '3. Seams are injected at the edge.',
  '',
  '## Commands',
  '```',
  'tools/lab validate <unit>',
  '```',
  '',
].join('\n');

// The UNMANAGED (existing, hand-pasted) CLAUDE.md: matches all three sections above, PLUS
// (a) an extra citation-bearing sentence tacked onto rule 3, and (b) an entirely extra
// numbered rule 4 the profile doesn't have at all. "What this is" and a trailing section
// must survive untouched on either side.
const UNMANAGED_CLAUDE_MD = [
  '# My project', '',
  '## What this is', 'Some intro text unrelated to the profile.', '',
  '## The loop (per named rule of the sim)',
  'Every rule of the sim with a name worth saying and a number in the design doc is a UNIT.', '',
  '## Hard rules',
  '1. Never type an expected value. Oracles are computed from the design doc.',
  '2. The sim crate is pure. No clock, no I/O, no randomness it did not receive.',
  '3. Seams are injected at the edge. No color, no splat (§9.4).',
  '4. No engine, no wire protocol, no crypto in the first pass (§9.1, §14.11).',
  '',
  '## Commands',
  '```',
  'tools/lab validate <unit>',
  '```', '',
  '## Trailing section', 'Unrelated trailing content that must survive.', '',
].join('\n');

function fixtureProfile(): string {
  const profilesDir = mkdtempSync(join(tmpdir(), 'rdv-profiles-'));
  const pdir = join(profilesDir, 'rust-game');
  mkdirSync(pdir, { recursive: true });
  writeFileSync(join(pdir, 'profile.json'), JSON.stringify({ lang: 'rust', type: 'game', version: '1.0.0' }));
  writeFileSync(join(pdir, 'CLAUDE.section.md'), MANAGED_SECTION);
  return profilesDir;
}

function unmanagedRepo(): string {
  const d = mkdtempSync(join(tmpdir(), 'rdv-adopt-keep-'));
  execSync('git init -q', { cwd: d });
  writeFileSync(join(d, 'CLAUDE.md'), UNMANAGED_CLAUDE_MD);
  return d;
}

test('dry-run names both the extra rule and the extra citation-bearing sentence', async () => {
  const d = unmanagedRepo();
  const profilesDir = fixtureProfile();
  const before = porcelain(d);
  const { code, out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, dryRun: true }));
  assert.equal(code, 0);
  assert.match(out, /! --adopt would keep 2 project-specific line\(s\) in "## Project rules":/);
  assert.match(out, /No color, no splat \(§9\.4\)/, 'the extra citation-bearing sentence is named');
  assert.match(out, /4\. No engine, no wire protocol, no crypto/, 'the extra numbered rule is named');
  assert.equal(porcelain(d), before, 'dry-run changed no git status at all');
});

test('--adopt produces one managed block + a Project rules section containing exactly those two lines', async () => {
  const d = unmanagedRepo();
  const profilesDir = fixtureProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true }));
  assert.match(out, /! --adopt kept 2 project-specific line\(s\) in "## Project rules":/);

  const c = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.equal(c.split('rederive:begin').length - 1, 1, 'exactly one managed block');
  assert.equal(c.split('## Project rules').length - 1, 1, 'exactly one Project rules section');
  assert.ok(c.includes('## What this is'), '"What this is" survives');
  assert.ok(c.includes('Some intro text unrelated to the profile.'));
  assert.ok(c.includes('## Trailing section'), 'the trailing section survives');
  assert.ok(c.includes('Unrelated trailing content that must survive.'));
  assert.ok(c.indexOf('## What this is') < c.indexOf('rederive:begin'), '"What this is" stays above the managed block');
  assert.ok(c.indexOf('rederive:end') < c.indexOf('## Project rules'), '"## Project rules" comes after the managed block');
  assert.ok(c.indexOf('## Project rules') < c.indexOf('## Trailing section'), '"## Project rules" comes before the trailing section');

  const projectRules = c.slice(c.indexOf('## Project rules'), c.indexOf('## Trailing section'));
  assert.match(projectRules, /No color, no splat \(§9\.4\)\.?$/m);
  assert.match(projectRules, /^4\. No engine, no wire protocol, no crypto in the first pass \(§9\.1, §14\.11\)\.?$/m);
  // exactly those two lines — nothing else got swept in
  const contentLines = projectRules.split('\n').map((l) => l.trim()).filter((l) => l && l !== '## Project rules (kept by `rdv init --adopt` — review and merge)');
  assert.equal(contentLines.length, 2, `expected exactly 2 kept lines, got: ${JSON.stringify(contentLines)}`);
});

test('a second --adopt is a no-op', async () => {
  const d = unmanagedRepo();
  const profilesDir = fixtureProfile();
  await cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true });
  const before = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, adopt: true }));
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), before, 'byte-identical after a second --adopt');
  assert.doesNotMatch(out, /Project rules/, 'no keep/drop chatter on the second run — nothing to detect once markers exist');
  assert.match(out, /= CLAUDE\.md \(unchanged\)/);
});

test('--force-adopt drops the kept content instead, and prints what it drops', async () => {
  const d = unmanagedRepo();
  const profilesDir = fixtureProfile();
  const { out } = await captureLog(() => cmdInit(d, { lang: 'rust', type: 'game', profilesDir, forceAdopt: true }));
  assert.match(out, /! --force-adopt dropped 2 project-specific line\(s\):/);
  assert.match(out, /No color, no splat \(§9\.4\)/);
  assert.match(out, /4\. No engine, no wire protocol, no crypto/);
  const c = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.ok(!c.includes('## Project rules'), '--force-adopt does not create a Project rules section');
  assert.ok(!c.includes('§9.4'), 'the dropped content is really gone from the file');
  assert.ok(!c.includes('No engine, no wire protocol'));
});
