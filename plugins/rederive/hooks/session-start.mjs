#!/usr/bin/env node
// rederive plugin — SessionStart hook (finding #12). Prints EXACTLY ONE line and always exits 0.
//
// The old hooks.json entry was `command -v rdv >/dev/null && rdv doctor --brief || true`: it trusted
// whatever `rdv` PATH resolved to, by name alone. On a machine with a stale global install (no `doctor`
// subcommand — this plugin needs one newer than 0.4.0), that command's own usage/help text gets printed
// into EVERY session's context: the tool-surfacing job fails, and it fails NOISILY instead of silently.
// This script never trusts a resolved binary by name or version string — it PROBES it by actually running
// `doctor --brief` and inspecting the result.
//
// Resolution order for `rdv` (most-local wins, so a project's own pinned copy is never shadowed by a global):
//   1. <repo>/node_modules/.bin/rdv
//   2. the path recorded in <repo>/rederive.lock under `rdv.path` — OPTIONAL: the current lock schema
//      (cli/lock.mts) does not write this field yet (a separate, later fix adds it); its absence is normal,
//      not an error, and just falls through to the next step.
//   3. `rdv` on PATH
//
// "Too old for this plugin" is detected, not assumed: the probe's exit code is non-zero, or its first
// output line starts with "usage:" (Commander's own help block for an unrecognized/missing `doctor`
// subcommand) — either means print the mismatch line, never the raw usage text.
import { existsSync, readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// CLAUDE_PLUGIN_ROOT is set by Claude Code when it runs this hook; the fallback (this file's own
// grandparent directory: <plugin>/hooks/session-start.mjs -> <plugin>/) makes the script self-sufficient
// for a direct `node` invocation too — real usage and this profile's own tests both work unmodified.
const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || dirname(dirname(fileURLToPath(import.meta.url)));

function pluginVersion() {
  try {
    const j = JSON.parse(readFileSync(join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
    return j.version || '0.5.0';
  } catch {
    return '0.5.0';
  }
}

function firstLine(s) {
  const line = String(s || '').split('\n').find((x) => x.trim() !== '');
  return line ? line.trim() : '';
}

function resolveRdv() {
  const local = join(REPO, 'node_modules', '.bin', 'rdv');
  if (existsSync(local)) return local;
  try {
    const lock = JSON.parse(readFileSync(join(REPO, 'rederive.lock'), 'utf8'));
    const fromLock = lock && lock.rdv && lock.rdv.path;
    if (fromLock && existsSync(fromLock)) return fromLock;
  } catch {}
  try {
    const found = execSync('command -v rdv', { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {}
  return null;
}

const lockPath = join(REPO, 'rederive.lock');
if (!existsSync(lockPath)) {
  // Nothing to compare a judge against yet — don't even try to resolve or probe rdv.
  console.log('rederive: no rederive.lock — run rdv init --lang <l> --type <t>');
  process.exit(0);
}

const version = pluginVersion();
const rdvPath = resolveRdv();

if (!rdvPath) {
  console.log(`rederive: no \`rdv\` found (checked node_modules/.bin, rederive.lock, PATH) — run ` +
    `\`npm i -g rederive@${version}\` or \`npm link\` in your rederive checkout`);
  process.exit(0);
}

const r = spawnSync(rdvPath, ['doctor', '--brief'], { encoding: 'utf8', cwd: REPO });
const out = firstLine(r.stdout);
const tooOld = Boolean(r.error) || r.status !== 0 || /^usage:/i.test(out);

if (tooOld) {
  console.log(`rederive: rdv on PATH (${rdvPath}) is older than this plugin needs (no \`doctor\`) — run ` +
    `\`npm i -g rederive@${version}\` or \`npm link\` in your rederive checkout`);
} else {
  console.log(out || 'rederive: rdv doctor --brief produced no output');
}
process.exit(0);
