#!/usr/bin/env node
// The rust-game profile's tools/{lab,emit,typikon} on a machine WITHOUT sir-factory or typikon. They once defaulted to a
// maintainer's private checkouts (the private v0.5 lab, $HOME/typikon) and failed with a raw node/python error; now tools/lab
// and tools/emit drive sir-factory, resolved from $SIR_FACTORY / the repo's node_modules / PATH only, say plainly what is
// missing (and how to install it), and the ADVISORY typikon Stop hook passes. With a sir-factory present (a stub), the
// wrapper forwards each subcommand to it with the unit resolved under units/. Run: node plugins/rederive/tests/profile-tools.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TOOLS = join(dirname(dirname(fileURLToPath(import.meta.url))), 'profiles', 'rust-game', 'tools');
const bare = { PATH: '/usr/bin:/bin', HOME: '/nonexistent' };   // no sir-factory, no typikon, no SIR_FACTORY / TYPIKON
const run = (tool, args) => spawnSync('/bin/sh', [join(TOOLS, tool), ...args], { encoding: 'utf8', env: bare });

test('tools/lab and tools/emit name the missing sir-factory (with the npm install) and exit 3 — never a raw node error', () => {
  for (const [tool, args] of [['lab', ['status']], ['lab', ['validate', 'x']], ['lab', ['grade', 'x', '--round', '1']], ['emit', ['x', 'js', '1']]]) {
    const r = run(tool, args);
    assert.equal(r.status, 3, `${tool} ${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stdout + r.stderr, /sir-factory was not found — npm i -D sir-factory@\^0\.4\.0 \(or -g\), or set SIR_FACTORY to a sir-factory checkout/);
    assert.doesNotMatch(r.stdout + r.stderr, /sir-lab|SIR_LAB|@rederive\/lab/);
    assert.doesNotMatch(r.stdout + r.stderr, /Cannot find module|MODULE_NOT_FOUND/);
  }
  const d = run('lab', ['doctor']);
  assert.match(d.stdout, /^FAIL  sir-factory was not found/m);
  assert.match(d.stdout, /role sir-unit-runner/, 'doctor checks the renamed runner role');
});

test('tools/typikon: the advisory stop-hook passes with a note; any other subcommand fails plainly', () => {
  const s = run('typikon', ['stop-hook', '--spec', 'typikon.yaml']);
  assert.equal(s.status, 0);
  assert.match(s.stdout, /typikon not installed — the typikon Stop hook is inactive/);
  const r = run('typikon', ['route', '--all']);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /typikon not found — put it on PATH or set TYPIKON/);
});

test('no profile tool defaults to a private checkout path', () => {
  for (const t of ['lab', 'emit', 'typikon']) assert.doesNotMatch(readFileSync(join(TOOLS, t), 'utf8'), /\$HOME\/(sir-lab|typikon)|~\/(sir-lab|typikon|endgame)/, t);
});

// tools/lab is a thin wrapper: every subcommand goes to sir-factory (prepare/grade/void/checkpoint/validate with the unit
// resolved to <repo>/units/<unit>; status as status-v05 over <repo>/units), from the repo root, with the observer feed set.
// A stub sir-factory records what it was asked; SIR_FACTORY pointing at a factory.mjs is one of the three resolutions.
test('tools/lab forwards to sir-factory: the unit resolved under units/, status -> status-v05, the feed set, exit code kept', () => {
  const repo = mkdtempSync(join(tmpdir(), 'rg-lab-'));
  mkdirSync(join(repo, 'tools')); mkdirSync(join(repo, 'units'));
  copyFileSync(join(TOOLS, 'lab'), join(repo, 'tools', 'lab')); chmodSync(join(repo, 'tools', 'lab'), 0o755);
  const stub = join(repo, 'stub-factory.mjs');
  writeFileSync(stub, 'console.log(JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), feed: process.env.SIR_FACTORY_EVENTS_FILE })); process.exit(process.argv[2] === "grade" ? 3 : 0);\n');
  const env = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, HOME: '/nonexistent', SIR_FACTORY: stub };
  const lab = (...args) => { const r = spawnSync('/bin/sh', [join(repo, 'tools', 'lab'), ...args], { encoding: 'utf8', env }); return { status: r.status, ...JSON.parse(r.stdout.trim().split('\n').pop()) }; };
  const real = (p) => p.replace(/^\/private/, '');
  const p = lab('prepare', 'u1', '--n', '2');
  assert.deepEqual(p.argv, ['prepare', join(repo, 'units', 'u1'), '--n', '2']);
  assert.equal(real(p.cwd), real(repo)); assert.equal(p.feed, join(repo, 'observer', 'events.jsonl')); assert.equal(p.status, 0);
  const g = lab('grade', '/abs/u2', '--round', '1');
  assert.deepEqual(g.argv, ['grade', '/abs/u2', '--round', '1']); assert.equal(g.status, 3, "sir-factory's exit code is the wrapper's");
  assert.deepEqual(lab('validate', 'u1').argv, ['validate', join(repo, 'units', 'u1')]);
  assert.deepEqual(lab('status', '--json').argv, ['status-v05', '--json', join(repo, 'units')]);
  assert.deepEqual(lab('checkpoint', 'u1', '--step', 'emit:spawned').argv, ['checkpoint', join(repo, 'units', 'u1'), '--step', 'emit:spawned']);
  rmSync(repo, { recursive: true, force: true });
});
