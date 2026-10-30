// rdv check --lang: the first-run scar (2026-10-30). The homepage demo — `npm i @rederive/colors`, `rdv check` in a temp
// dir — HALTED for anyone without cargo (and without TypeScript in that dir): @rederive/colors 0.2.0 carries js, ts and rust,
// and a missing toolchain halts the whole check (fail closed, correct for CI). --lang is the explicit PARTIAL check: the named
// languages graded in full, every other lang: variant reported NOT CHECKED — never "verified". Fixture: the shipped colors bundle.
// Run: npx tsx --test cli/check-lang.test.mts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const RDV = join(ROOT, 'dist/cli.cjs');
const check = (dir: string, extra: string[] = [], env: NodeJS.ProcessEnv = process.env) => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', RDV, 'check', dir, ...extra], { encoding: 'utf8', cwd: ROOT, env: { ...env, NO_COLOR: '1' } });
  return { status: r.status, out: (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '') };
};
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'rdv-lang-')); cpSync(join(ROOT, 'packages/colors'), d, { recursive: true }); return d; };
// a PATH with no cargo and an empty cwd with no TypeScript: the stranger's machine
const cargo = spawnSync('sh', ['-c', 'command -v cargo'], { encoding: 'utf8' }).stdout.trim();
const NO_CARGO = { ...process.env, PATH: (process.env.PATH || '').split(':').filter((p) => !cargo || p !== dirname(cargo)).join(':') };

test('precondition: cargo is off the reduced PATH', () => {
  assert.notEqual(spawnSync('sh', ['-c', 'command -v cargo'], { encoding: 'utf8', env: NO_CARGO }).status, 0);
});

test('without --lang a missing toolchain still HALTS (fail closed) — and now names the partial check you can run', () => {
  const r = check(scratch(), [], NO_CARGO);
  assert.equal(r.status, 1);
  assert.match(r.out, /HALTED — carries lang:rust/);
  assert.match(r.out, /Or check only the languages you have: rdv check .* --lang js/);
  assert.doesNotMatch(r.out, /held-out/);
});

test('--lang js on a machine without cargo: js graded in full, ts and rust NOT CHECKED, exit 0, never "ALL UNITS VERIFIED"', () => {
  const r = check(scratch(), ['--lang', 'js'], NO_CARGO);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /✓ lang:js .*held-out 8\/8/s);
  assert.match(r.out, /– lang:rust {2}NOT CHECKED/);
  assert.match(r.out, /– lang:ts {2}NOT CHECKED/);
  assert.match(r.out, /VERIFIED FOR lang:js ONLY — lang:(rust|ts), lang:(rust|ts) NOT CHECKED/);
  assert.doesNotMatch(r.out, /ALL UNITS VERIFIED/);
});

test('--lang js still FAILS a tampered js variant (the partial check is a real check)', () => {
  const d = scratch(); const f = join(d, 'src/strip.mjs');
  writeFileSync(f, readFileSync(f, 'utf8').replace(/\/g([,;)])/, '/$1'));   // drop the g flag — the homepage tamper
  const r = check(d, ['--lang', 'js'], NO_CARGO);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /VERIFICATION FAILED/);
  assert.doesNotMatch(r.out, /VERIFIED FOR/);
});

test('--lang naming a language the bundle does not carry HALTS — no silent zero-language pass', () => {
  const r = check(scratch(), ['--lang', 'python']);
  assert.equal(r.status, 1);
  assert.match(r.out, /HALTED — --lang python: this bundle carries no lang:python/);
});

test('--lang rust with cargo missing still HALTS: a named language is never skipped', () => {
  const r = check(scratch(), ['--lang', 'rust'], NO_CARGO);
  assert.equal(r.status, 1);
  assert.match(r.out, /HALTED — carries lang:rust, whose toolchain is not on this machine/);
});

test('--lang with no value is a usage error', () => {
  const r = check(scratch(), ['--lang']);
  assert.equal(r.status, 2);
});
