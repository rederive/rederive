// What the published `rederive` tarball carries (v0.5 release audit). `rdv init --lang/--type` reads
// <pkgroot>/plugins/rederive/profiles (cli/lib/judge.mts defaultProfilesDir) — it was not shipped; NOTICE was not shipped;
// and every cli/ test file and fixture was, including one that embeds a private absolute path and a private CLAUDE.md.
// Run: npx tsx --test cli/package-files.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;

test('npm pack ships NOTICE + the profiles rdv init reads, and no test file or fixture', () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const files: string[] = JSON.parse(r.stdout)[0].files.map((f: any) => f.path);
  for (const want of ['NOTICE', 'LICENSE', 'README.md', 'STEWARDSHIP.md', 'dist/cli.cjs', 'cli/features.mjs', 'cli/capabilities.json', 'cli/tree-sha.mjs',
    'cli/sir/validate.mjs', 'cli/sir/v05.mjs', 'cli/lang/native.mjs', 'plugins/rederive/profiles/rust-game/profile.json'])
    assert.ok(files.includes(want), `ships ${want}`);
  assert.deepEqual(files.filter((f) => /\.test\./.test(f) || f.startsWith('cli/sir/fixtures/')), [], 'no tests or fixtures');
  assert.ok(!files.some((f) => f.startsWith('plugins/rederive/tests/')), 'the plugin tests stay home too');
});

test('engines.node admits only Nodes with import attributes (cli/features.mjs `with { type: \'json\' }`)', () => {
  const pj = JSON.parse(readFileSync(ROOT + 'package.json', 'utf8'));
  assert.equal(pj.engines.node, '>=18.20');
});
