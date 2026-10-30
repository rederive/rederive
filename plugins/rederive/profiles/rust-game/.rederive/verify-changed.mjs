#!/usr/bin/env node
// rederive rust-game profile verify (installed by `rdv init --lang rust --type game`) — Stop hook + pre-commit.
//
// Same second-consumer finding as guard-contracts.mjs: the frame's generic verify-changed.mjs finds units by
// sir.manifest.json (npm layout) and runs `rdv check`, so under a v0.5 profile it finds nothing and always
// allows while CLAUDE.section.md claims enforcement. This is the profile's own verify, keyed off the real
// v0.5 layout.
//
// "Verified" for a changed unit means: units/<u>/runs/decision.json exists with next=="accept", AND the
// unit's language file(s) are CURRENTLY bound to the primary. Binding is checked by shelling out to this
// repo's OWN `tools/lab validate <unit>` (never reimplemented here — `sir-factory validate` recomputes the primary's
// canonical sha with rederive's own sir-parse and compares it to each language file's stamped PRIMARY-SHA256; a primary
// edited after the accepted grade without a re-bind + re-grade fails this, which is the point: `next=accept`
// alone only proves SOME past round was accepted, not that it still matches the CURRENT contract.
// "Verified" for a changed installed crate means: crates/<u>/INSTALLED.json exists AND `tools/install --check
// <u>` exits 0 (byte-exact to the recorded emission, and the recorded primary sha matches the current one).
// NOT every crates/<name>/ is a unit: crates/sim (and shell, bots, tube) are the PRODUCT, composing verified
// units by path — they carry no INSTALLED.json and correspond to no units/<name>/, so a change there is not
// this hook's business at all (no line printed, doesn't count toward the early "nothing changed" exit either).
// A changed crates/<name>/ is only ever checked when INSTALLED.json exists (install-drift check) or when
// units/<name>/ is a real unit that has a crate but was never installed (a FAIL — that's the one crate-shaped
// finding worth surfacing for a non-installed name).
//
// No tokens, no network: every check here is a local, deterministic command (or its absence, reported as a
// WARN rather than assumed passing). Finds changed files via git — `git status --porcelain -uall` normally,
// `git diff --cached --name-only` in --precommit mode (`-uall` matters: without it git collapses an untracked
// tree to its shallowest directory, which sits ABOVE a unit root).
//
// Stop-hook mode is ADVISORY (the Tier-1 ruling, typikon.yaml#integrity.protected): it always exits 0,
// printing a clear FAIL line per failing unit so the agent (and the transcript) see it, but never blocking
// "done". --precommit mode is the one exit that matters: it exits 1 on any FAIL, same as the frame's seal.
import { existsSync, readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { resolve, join, relative, sep } from 'node:path';

const precommit = process.argv.includes('--precommit');
const REPO = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sh = (c) => { try { return execSync(c, { encoding: 'utf8', cwd: REPO }); } catch { return ''; } };

// stop-hook loop protection: if a previous block already fired, allow the stop (mirrors the frame's guard;
// harmless here since this hook never blocks, but keeps the protocol identical for a reader who knows it)
if (!precommit) {
  let buf = '';
  try { buf = readFileSync(0, 'utf8'); } catch {}
  try { if (JSON.parse(buf || '{}').stop_hook_active) process.exit(0); } catch {}
}

const raw = precommit
  ? sh('git diff --cached --name-only')
  : sh('git status --porcelain -uall').split('\n').map((l) => l.slice(3)).join('\n');
const changed = raw.split('\n').filter(Boolean);

const unitsRoot = join(REPO, 'units');
const cratesRoot = join(REPO, 'crates');
const units = new Set();      // unit names whose units/<u>/** tree changed
const crateUnits = new Set(); // crate names to check: either installed, or a real unit missing its install

for (const f of changed) {
  let abs; try { abs = resolve(REPO, f); } catch { continue; }
  if ((abs + sep).startsWith(unitsRoot + sep)) {
    const unit = relative(unitsRoot, abs).split(sep)[0];
    if (unit && existsSync(join(unitsRoot, unit, 'sir', `${unit}.sir`))) units.add(unit);
  } else if ((abs + sep).startsWith(cratesRoot + sep)) {
    const name = relative(cratesRoot, abs).split(sep)[0];
    if (!name) continue;
    const isInstalled = existsSync(join(cratesRoot, name, 'INSTALLED.json'));
    const isUnit = existsSync(join(unitsRoot, name, 'sir', `${name}.sir`));
    if (isInstalled || isUnit) crateUnits.add(name); // else: a product crate (sim, shell, bots, tube, …) — skip, not a unit
  }
}

if (!units.size && !crateUnits.size) process.exit(0);

const lines = [];
let bad = false;

for (const unit of [...units].sort()) {
  const unitDir = join(unitsRoot, unit);
  const decisionPath = join(unitDir, 'runs', 'decision.json');
  if (!existsSync(decisionPath)) { lines.push(`FAIL  ${unit}: no runs/decision.json (never graded)`); bad = true; continue; }
  let dec;
  try { dec = JSON.parse(readFileSync(decisionPath, 'utf8')); } catch { lines.push(`FAIL  ${unit}: runs/decision.json unreadable`); bad = true; continue; }
  if (dec.next !== 'accept') { lines.push(`FAIL  ${unit}: decision.json next=${dec.next}, not accept`); bad = true; continue; }
  const labWrapper = join(REPO, 'tools', 'lab');
  if (!existsSync(labWrapper)) { lines.push(`WARN  ${unit}: accepted (round ${dec.round}) but tools/lab is missing here — binding NOT re-verified`); continue; }
  const r = spawnSync(labWrapper, ['validate', unit], { cwd: REPO, encoding: 'utf8' });
  if (r.status === 0) {
    lines.push(`ok    ${unit}: accepted round ${dec.round}, binding current`);
  } else if (r.status === 3) {
    // exit 3 = tools/lab could not find its verifier (sir-factory) — say THAT, not "stale"; still a FAIL (the binding is unchecked)
    lines.push(`FAIL  ${unit}: accepted round ${dec.round} but the binding could NOT be checked — ${`${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').pop()}`);
    bad = true;
  } else {
    const tail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-4).join('\n      ');
    lines.push(`FAIL  ${unit}: accepted round ${dec.round} but tools/lab validate failed — STALE binding (the ` +
      `primary changed since the accepted grade; re-bind and re-grade before this counts as done):\n      ${tail}`);
    bad = true;
  }
}

for (const unit of [...crateUnits].sort()) {
  const installedPath = join(cratesRoot, unit, 'INSTALLED.json');
  if (!existsSync(installedPath)) {
    // getting here means the collection filter above already confirmed units/<unit>/ IS a real unit (that's
    // the only other reason a name lands in crateUnits) — so this is a unit whose crate exists but was never
    // installed via tools/install, not a product crate like sim/shell/bots/tube.
    lines.push(`FAIL  ${unit}: unit ${unit} has a crate but no INSTALLED.json (crates/${unit}/** changed but was never installed via tools/install)`);
    bad = true;
    continue;
  }
  const installer = join(REPO, 'tools', 'install');
  if (!existsSync(installer)) { lines.push(`WARN  ${unit}: crate changed but tools/install is missing here — drift NOT re-verified`); continue; }
  const r = spawnSync(installer, ['--check', unit], { cwd: REPO, encoding: 'utf8' });
  if (r.status === 0) {
    lines.push(`ok    ${unit}: crates/${unit}/ byte-exact + current`);
  } else {
    const tail = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-4).join('\n      ');
    lines.push(`FAIL  ${unit}: tools/install --check ${unit} failed:\n      ${tail}`);
    bad = true;
  }
}

const report = lines.join('\n');

if (precommit) {
  console.error(report);
  process.exit(bad ? 1 : 0);
}

console.log(report); // Stop hook is ADVISORY (the Tier-1 ruling): report plainly, never block "done"
process.exit(0);
