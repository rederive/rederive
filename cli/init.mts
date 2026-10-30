/**
 * rdv init — install the rederive frame into a TARGET project, so the methodology
 * enforces itself on whatever agent works there next.
 *
 * The cold-agent problem this solves (observed live, 2026-07-31): an agent told
 * "build using rederive" invents its own spec format, refuses to decompose
 * ("too big"), refuses determinism ("it's non-deterministic"), and never reaches
 * for isolated re-emitters. Prose can't fix that — the model's prior wins a
 * vacuum. So the frame ships as FILESYSTEM ARTIFACTS the agent's own first
 * action installs: voluntary once, structural thereafter.
 *
 * Three layers (the proven prompt / hook / seal stack):
 *   prompt — CLAUDE.md + AGENTS.md marker-managed section (objections pre-empted
 *            verbatim, named-leaves rule, the workflow) + .claude/agents roster
 *            (Write-only re-emitters: independence-as-evidence, standing invitation)
 *   hook   — .claude/settings.json: a PreToolUse guard denying hand-edits to
 *            contract artifacts (sir/**, oracles/**, specs/**, sir.manifest.json)
 *            and a Stop hook refusing "done" while a touched unit fails rdv check
 *   seal   — .git/hooks/pre-commit + a GitHub Action running rdv check: the only
 *            harness-agnostic layer — git is the chokepoint every agent passes
 *
 * Idempotent: marker-managed sections are replaced in place; JSON settings are
 * merged (never clobbered); existing non-rederive files are left alone with a
 * printed instruction instead of an edit.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync, readdirSync, lstatSync, unlinkSync, statSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { findProfileDir, applyProfile, ensureScaffoldDirs, readProfileFile, walk as walkProfileDir, sha256, diffHint } from './lib/profile.mts';
import { findUnmanagedDuplicate, replaceUnmanagedBlock, extractKeptContent } from './lib/adopt.mts';
import { defaultProfilesDir, listProfiles } from './lib/judge.mts';
import { wirePlugin, PluginWireResult } from './lib/plugin.mts';
import { buildLock, writeLock, readLock } from './lock.mts';
import { cmdDoctor } from './doctor.mts';

export const MARK_BEGIN = '<!-- rederive:begin (managed by `rdv init` — edits between markers are overwritten on re-init) -->';
export const MARK_END = '<!-- rederive:end -->';

export interface InitOptions {
  /** Profile language, e.g. "rust". Requires `type` too. */
  lang?: string;
  /** Profile type, e.g. "game". Requires `lang` too. */
  type?: string;
  /** Override where profiles/<lang>-<type>/ is looked up. Default: <package root>/plugins/rederive/profiles. */
  profilesDir?: string;
  /** Marketplace source written to .claude/settings.json's extraKnownMarketplaces.rederive.
   * Accepts a raw JSON object string, an "owner/repo" GitHub shorthand, or a local path/file:// URL.
   * Default: {source:"github", repo:"rederive/rederive"}. */
  marketplace?: string;
  /** Skip the confirmation gate for a BARE (no --lang/--type) init and apply immediately.
   * Ignored (and unnecessary) when --lang/--type is given — choosing a profile IS the ask. */
  yes?: boolean;
  /** Compute and print the plan for EITHER path (bare or --lang/--type); write nothing;
   * always exits 0. Takes priority over `yes` and over an interactive confirmation. */
  dryRun?: boolean;
  /** Replace an UNMANAGED duplicate of the profile's CLAUDE.md/AGENTS.md section (pasted
   * in by hand before markers existed for this project) with the managed marker block,
   * instead of the default "leave it alone, don't duplicate" behavior. Never drops content:
   * any line of the unmanaged block with no counterpart in the managed section is kept
   * verbatim in a new "## Project rules" section below it. */
  adopt?: boolean;
  /** Like --adopt, but DROPS whatever --adopt would have kept in "## Project rules" instead
   * of preserving it — prints what it drops. The explicit, loud opt-in to the old (and
   * dangerous) "replace wholesale" behavior; --adopt alone never does this. */
  forceAdopt?: boolean;
  /** Delete .claude/agents/sir-*.md (files/symlinks only) — the plugin's roster (--lang/
   * --type) is authoritative over any such project copy, but removal is never automatic. */
  pruneAgents?: boolean;
  /** Force-sync these profile-relative paths (files, or a directory like "tools/" — expanded
   * to every file the profile ships under it) FROM the profile, overriding the normal
   * write-only-if-absent rule for just these. Refused (a `!` line) when the repo's copy has
   * diverged from the profile version rederive.lock recorded at the last init — i.e. it's
   * been locally edited since — unless `force` is also given. Repeatable. */
  refresh?: string[];
  /** Overrides `refresh`'s local-edit refusal, printing what it overwrites. Has no effect
   * without `refresh`. */
  force?: boolean;
}

/** A bare `rdv init` (no --lang/--type) is a blind, opinionated mutation of whatever
 * directory happens to be cwd — CLAUDE.md, hooks, a committed git pre-commit hook — and a
 * real second consumer ran `init --help` expecting help and got exactly that applied to
 * their Rust repo with the wrong (npm-flavored) frame, silently. y/N only asked on a real
 * TTY; a script/agent gets a firm "no" (dryRun) rather than a hang on stdin. */
async function confirmYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(question)).trim().toLowerCase();
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

function expandHome(p: string): string {
  if (p === '~') return process.env.HOME || p;
  if (p.startsWith('~/')) return join(process.env.HOME || '', p.slice(2));
  return p;
}

/** Parses --marketplace into the INNER descriptor claude itself uses (measured live:
 * `{source:"github", repo}` or `{source:"directory", path}` — NOT `{source:"local", path}`).
 * The caller wraps this one more level (`{source: <this>}`) only for the fallback
 * hand-write into settings.json; the `claude plugin marketplace add` path never needs
 * the wrapping since the real CLI produces it. */
function parseMarketplaceArg(value?: string): unknown {
  const DEFAULT = { source: 'github', repo: 'rederive/rederive' };
  if (!value) return DEFAULT;
  const v = value.trim();
  if (v.startsWith('{')) { try { return JSON.parse(v); } catch { /* not JSON — fall through to the shorthands below */ } }
  if (v.startsWith('file://')) return { source: 'directory', path: v.slice('file://'.length) };
  if (v.startsWith('.') || v.startsWith('/') || v.startsWith('~')) return { source: 'directory', path: resolve(expandHome(v)) };
  if (/^[\w.-]+\/[\w.-]+$/.test(v)) return { source: 'github', repo: v };
  return { source: v };
}

/** The `{{contract}}` template's actual value: the CLAUDE.section.md Commands block used to
 * hard-code `contracts/game.contract.yaml` literally — the very file `rdv init` had just
 * SKIPPED because a consumer's own `contracts/scene0.contract.yaml` already existed, so the
 * printed command named a file that was never written. Names whichever contract file is
 * ACTUALLY there: the repo's own pre-existing one wins, else whatever the profile ships, else
 * (nothing anywhere — a degenerate case) a `<type>.contract.yaml` literal as a placeholder. */
function firstContractFile(dir: string): string | null {
  const p = join(dir, 'contracts');
  if (!existsSync(p)) return null;
  try {
    const files = readdirSync(p).filter((f) => f.endsWith('.contract.yaml')).sort();
    return files[0] ?? null;
  } catch { return null; }
}
function resolveContractName(root: string, profileDir: string | null, type: string | undefined): string {
  return (profileDir && firstContractFile(root))
    || (profileDir && firstContractFile(profileDir))
    || `${type ?? 'default'}.contract.yaml`;
}

/** `--refresh <path>` targets, expanded to concrete profile-relative FILE paths: a file
 * target names itself; a directory target (e.g. "tools/", or "tools" — trailing slash
 * optional) expands to every file the profile ships under it. A target the profile doesn't
 * ship at all (neither a file nor a directory there) expands to nothing — the refresh step
 * reports that itself, per-target, so the caller doesn't need to check existence twice. */
function expandRefreshTargets(profileDir: string, targets: string[]): Set<string> {
  const found = new Set<string>();
  for (const raw of targets) {
    const rel = raw.replace(/\/+$/, '');
    const abs = join(profileDir, rel);
    if (!existsSync(abs)) continue; // unresolvable — reported by the refresh step itself
    if (statSync(abs).isDirectory()) {
      for (const f of walkProfileDir(abs)) found.add(join(rel, f));
    } else {
      found.add(rel);
    }
  }
  return found;
}

/** The string a person would actually type into `/plugin marketplace add …` for a given
 * parsed marketplace value — used in the post-init "next:" guidance. */
function marketplaceAddArg(m: unknown): string {
  if (m && typeof m === 'object') {
    const o = m as any;
    if (typeof o.repo === 'string') return o.repo;
    if (typeof o.path === 'string') return o.path;
    if (typeof o.source === 'string') return o.source;
  }
  return String(m);
}

// ── prompt layer ────────────────────────────────────────────────────────────

const FRAME_SECTION = `${MARK_BEGIN}
## Building with rederive — the verified path

This project uses rederive (https://rederive.ai): code ships as a CONTRACT — a SIR
spec plus a held-out oracle — and implementations are verified against the contract
or re-derived from it. The contract, not the source text, is the truth.

**The workflow for new code:**
1. Decompose the feature into NAMED leaves — behaviors with names worth saying out
   loud (the kind npm packages, RFCs, or algorithm literature already name). Glue
   stays thin and obvious.
2. Per leaf: derive the SIR and a held-out oracle. Expected outputs are stamped by
   EXECUTING a reference — never hand-authored.
3. Implement, or better, re-emit blind: spawn 2–3 ISOLATED re-emitters (see
   .claude/agents/) and accept only on quorum. One passing build is luck;
   independent agreement is evidence.
4. \`rdv check <unitdir>\` must be green on every touched unit before you are done.

**Pre-empted objections — you will think these; here are the answers:**
- "This is too big to spec." → Decompose further. A leaf too big to contract is two leaves.
- "This is non-deterministic." → The nondeterminism (clock, network, randomness,
  model calls) lives at the EFFECT BOUNDARY as injected inputs; the core stays
  deterministic and oracle-testable. A wrapper around an LLM is still deterministic
  plumbing around a nondeterministic input.
- "I'll build a small internal spec/compiler for this." → No. The spec format
  exists: https://rederive.ai/spec.html. Do not invent a shadow version of it.

**Hard rules (hooks enforce these — do not argue with the hooks):**
- Never hand-edit \`sir/**\`, \`oracles/**\`, \`specs/**\`, or \`sir.manifest.json\`.
  Contracts change only through the toolchain (\`rdv resynth --apply\`, \`sir-factory\`).
  If a contract seems wrong, HALT and REPORT — a divergence is a finding, not a nuisance.
- "Done" requires \`rdv check\` green on every touched unit; the Stop hook re-runs it.
- In Claude Code, install the paved road once per machine:
  \`/plugin marketplace add rederive/rederive\` then \`/plugin install rederive@rederive\`
  (skills: sir-verify, greenfield-quorum, preflight — they drive this loop for you).
${MARK_END}
`;

const AGENT_REEMITTER = `---
name: sir-reemitter
description: "Isolated re-emitter for the SIR verified-recompose fleet. Reconstructs a single code unit from a spec + a frozen oracle that are provided INLINE, and writes the implementation to a given path. Deliberately tool-restricted to Write ONLY — it cannot Read, so it physically cannot open the original source: 'original deleted' is enforced at the tool layer, not by instruction. Spawn 2-3 of these independently and accept only on quorum."
tools: Write
---

You are an isolated RE-EMITTER in a verified-recompose fleet — one of several INDEPENDENT emitters whose outputs are compared for quorum.

Your only inputs are the spec and the frozen behavioral oracle in your prompt. You have NO Read tool by design: there is no original source you can consult, and you must not try. Reconstruct the unit's behavior purely from the spec + the worked examples / properties given to you.

Rules:
- Match the oracle EXACTLY, including any quirks it demonstrates. The oracle is authoritative over your prior about "how this kind of code usually works" — where they conflict, the oracle wins.
- You will be scored on FRESH held-out inputs you cannot see, so fit the underlying behavior, not the literal examples.
- Emit a self-contained module (no third-party deps; language/runtime builtins are fine) exporting exactly what the prompt specifies.
- Write the implementation to the exact file path given in the prompt using the Write tool. Then report the path and byte size. Do nothing else.
`;

const AGENT_REEMITTER_CR = `---
name: sir-reemitter-cr
description: "Clean-room re-emitter — the large-SIR variant of sir-reemitter. READS the contract files (the SIR, optionally a carried-data module, and a frozen oracle) from a clean-room directory it is pointed at, then writes the reconstructed implementation. Tool-restricted to Read + Write ONLY (no Bash/Glob/Grep/WebFetch/WebSearch), so it cannot search for or fetch the original source. Spawn 2-3 independently and accept only on quorum."
tools: Read, Write
---

You are a CLEAN-ROOM RE-EMITTER in a verified-recompose fleet — one of several INDEPENDENT emitters whose outputs are compared for quorum.

Your inputs are CONTRACT FILES whose absolute paths are given in your prompt: the SIR (the full behavioral contract), a frozen oracle (worked input→output examples), and optionally a carried-data module of constant tables your emission must IMPORT (not re-derive).

You have ONLY the Read and Write tools — no Bash, no search, no network — and the original implementation is NOT present. Read ONLY the contract files named in your prompt; do not probe other paths. Reconstruct the unit purely from the contract.

Rules:
- Implement the SIR EXACTLY, including every documented quirk, branch, and edge case. Where the frozen oracle conflicts with your prior, the oracle wins.
- You will be scored on FRESH held-out inputs you cannot see — fit the documented behavior, not the literal examples.
- If the prompt names a carried-data module, import its constants by name; do NOT transcribe the tables.
- Emit a self-contained ES module exporting exactly what the SIR/prompt specifies, to the exact output path given. Then report the path and byte size. Do nothing else.
`;

// ── hook layer ──────────────────────────────────────────────────────────────

const GUARD_SCRIPT = `#!/usr/bin/env node
// rederive project guard (installed by \`rdv init\`) — PreToolUse hook.
// Contract artifacts are IMMOVABLE from the seat of the party being verified: an
// agent that can edit the oracle can make anything pass. Hand-edits (Edit/Write)
// to sir/**, oracles/**, specs/**, or sir.manifest.json under any unit that has a
// sir.manifest.json are DENIED. The toolchain's own updates (rdv resynth --apply,
// sir-factory — which run via Bash) are unaffected: this guard watches the file
// tools only. Maintainer window (human-authorized): export SIR_ALLOW_TOOLKIT_EDITS=1
// or \`touch ~/.sir-allow-toolkit-edits\`.
import { existsSync } from 'node:fs';
import { resolve, dirname, basename, sep } from 'node:path';

const HOME = process.env.HOME || '';
const windowOpen = () => process.env.SIR_ALLOW_TOOLKIT_EDITS === '1' || existsSync(HOME + '/.sir-allow-toolkit-edits');

function protectedPath(p) {
  let abs; try { abs = resolve(p); } catch { return false; }
  // find the nearest ancestor holding sir.manifest.json (the unit root)
  let d = basename(abs) === 'sir.manifest.json' ? dirname(abs) : abs;
  for (let i = 0; i < 15 && d !== '/' && d !== HOME; i++) {
    if (existsSync(d + '/sir.manifest.json')) {
      if (basename(abs) === 'sir.manifest.json') return true;
      const rel = abs.slice(d.length + 1);
      return ['sir', 'oracles', 'specs'].includes(rel.split(sep)[0]);
    }
    d = dirname(d);
  }
  return false;
}

let buf = '';
process.stdin.on('data', (c) => (buf += c)).on('end', () => {
  let j = {}; try { j = JSON.parse(buf); } catch {}
  const ti = j.tool_input || {};
  if (windowOpen()) process.exit(0);
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(j.tool_name) && ti.file_path && protectedPath(ti.file_path)) {
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'BLOCKED — contract artifacts (sir/**, oracles/**, specs/**, sir.manifest.json) are immutable by hand: ' +
        'an agent that can edit the oracle can make anything pass. Change contracts only through the toolchain ' +
        '(rdv resynth --apply / sir-factory). If the contract itself looks wrong, HALT and REPORT the divergence ' +
        '— it is a finding, not a nuisance.' } }));
  }
  process.exit(0);
});
`;

const VERIFY_SCRIPT = `#!/usr/bin/env node
// rederive verify-changed (installed by \`rdv init\`) — Stop hook + pre-commit.
// "Done" means rdv check is green on every TOUCHED unit. Finds changed files via
// git, maps each to its nearest sir.manifest.json unit root, runs \`rdv check\` on
// each unique unit. Stop-hook mode blocks the agent from finishing while red;
// --precommit mode exits 1 for git. Fail-safe: no git / no rdv / no units → allow.
import { existsSync, readFileSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';

const precommit = process.argv.includes('--precommit');
const sh = (c) => { try { return execSync(c, { encoding: 'utf8' }); } catch { return ''; } };

// stop-hook loop protection: if a previous block already fired, allow the stop
if (!precommit) {
  let buf = ''; try { buf = readFileSync(0, 'utf8'); } catch {}
  try { if (JSON.parse(buf || '{}').stop_hook_active) process.exit(0); } catch {}
}

// -uall: without it git collapses untracked trees to the shallowest dir
// ("?? vendor/"), which sits ABOVE the unit roots we need to find
const raw = precommit
  ? sh('git diff --cached --name-only')
  : sh('git status --porcelain -uall').split('\\n').map((l) => l.slice(3)).join('\\n');
const changed = raw.split('\\n').filter(Boolean);

const units = new Set();
for (const f of changed) {
  // walk from the path ITSELF: untracked dirs arrive as "vendor/colors/" and
  // dirname-first would step over the unit root
  let d = resolve(f);
  for (let i = 0; i < 15 && d !== '/'; i++) {
    if (existsSync(d + '/sir.manifest.json')) { units.add(d); break; }
    d = dirname(d);
  }
}
if (!units.size) process.exit(0);

const rdv = sh('command -v rdv').trim();
if (!rdv) { console.error('rederive: rdv not on PATH — cannot verify touched units (npm i -g rederive)'); process.exit(0); }

const failed = [];
for (const u of units) {
  const r = spawnSync(rdv, ['check', u], { encoding: 'utf8' });
  if (r.status !== 0) failed.push(u + '\\n' + (r.stdout || '').split('\\n').slice(-6).join('\\n'));
}
if (!failed.length) process.exit(0);

if (precommit) {
  console.error('rederive pre-commit: rdv check FAILED on touched unit(s):\\n' + failed.join('\\n'));
  process.exit(1);
}
process.stdout.write(JSON.stringify({ decision: 'block',
  reason: 'rdv check FAILED on touched unit(s) — you are not done while a contract is red. Fix the ' +
          'implementation (never the oracle) or report the divergence as a finding. Failures:\\n' + failed.join('\\n') }));
process.exit(0);
`;

// ── seal layer ──────────────────────────────────────────────────────────────

const GH_ACTION = `# Installed by \`rdv init\` — the harness-agnostic seal: whatever agent (or human)
# builds here, unverified contract units cannot merge. Re-proves every vendored
# unit deterministically; no tokens, no AI, no network beyond npm install.
name: rederive verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm i -g rederive
      - name: rdv check every unit
        run: |
          set -e
          units=$(git ls-files | grep 'sir\\.manifest\\.json$' | grep -v node_modules || true)
          if [ -z "$units" ]; then
            echo "no rederive units yet — the gate is armed, nothing to verify"
            exit 0
          fi
          for m in $units; do
            dir=$(dirname "$m")
            echo "== rdv check $dir"
            rdv check "$dir"
          done
`;

const PRECOMMIT_MARK = '# rederive-verify (managed by rdv init)';
const PRECOMMIT_GENERIC_BODY = 'node "$(git rev-parse --show-toplevel)/.rederive/verify-changed.mjs" --precommit\n';

// ── writers ─────────────────────────────────────────────────────────────────

function markerMerge(existing: string, section: string): string {
  const b = existing.indexOf(MARK_BEGIN);
  const e = existing.indexOf(MARK_END);
  if (b >= 0 && e > b) return existing.slice(0, b) + section.trimEnd() + existing.slice(e + MARK_END.length);
  return (existing.trimEnd() + '\n\n' + section).trimStart();
}

function hookEntry(matcher: string | null, script: string) {
  const h = { type: 'command', command: `node "$CLAUDE_PROJECT_DIR/.rederive/${script}"` };
  return matcher === null ? { hooks: [h] } : { matcher, hooks: [h] };
}

interface ProfileSettings {
  /** The `{source: <descriptor>}` value to hand-write into extraKnownMarketplaces.rederive
   * — set ONLY on the fallback path. Undefined means "the claude CLI already wrote these
   * keys correctly; leave them alone," so this never clobbers what `claude plugin install`
   * itself produced. */
  marketplace?: unknown;
  hasTypikonYaml: boolean;
}

function mergeSettings(existing: any, profile?: ProfileSettings): any {
  const s = existing && typeof existing === 'object' ? existing : {};
  s.hooks = s.hooks || {};
  const ensure = (event: string, entry: any) => {
    s.hooks[event] = s.hooks[event] || [];
    const sig = JSON.stringify(entry.hooks[0].command);
    if (!s.hooks[event].some((e: any) => (e.hooks || []).some((h: any) => JSON.stringify(h.command) === sig)))
      s.hooks[event].push(entry);
  };
  ensure('PreToolUse', hookEntry('Edit|Write|MultiEdit|NotebookEdit', 'guard-contracts.mjs'));
  ensure('Stop', hookEntry(null, 'verify-changed.mjs'));
  if (profile) {
    if (profile.marketplace !== undefined) {
      // merge, never clobber: a value the consumer (or a prior init) already set wins
      s.extraKnownMarketplaces = s.extraKnownMarketplaces || {};
      if (s.extraKnownMarketplaces.rederive === undefined) s.extraKnownMarketplaces.rederive = profile.marketplace;
      s.enabledPlugins = s.enabledPlugins || {};
      if (s.enabledPlugins['rederive@rederive'] === undefined) s.enabledPlugins['rederive@rederive'] = true;
    }
    if (profile.hasTypikonYaml) {
      const cmd = '"$CLAUDE_PROJECT_DIR/tools/typikon" stop-hook --spec typikon.yaml --repo "$CLAUDE_PROJECT_DIR"';
      ensure('Stop', { hooks: [{ type: 'command', command: cmd }] });
    }
  }
  return s;
}

export async function cmdInit(targetDir: string, opts: InitOptions = {}): Promise<number> {
  const root = resolve(targetDir);
  const out: string[] = [];

  // --lang/--type profile scaffolding (ECOSYSTEM_KIT.md v0.2) — resolved up front so a
  // missing profile halts before anything is written, and so its CLAUDE.section.md (if
  // any) can supersede the generic FRAME_SECTION below.
  if ((opts.lang || opts.type) && !(opts.lang && opts.type)) {
    console.error('rdv init: --lang and --type must both be given');
    return 1;
  }
  const useProfile = !!(opts.lang && opts.type);
  const profilesDir = opts.profilesDir ? resolve(opts.profilesDir) : defaultProfilesDir();
  let profileDir: string | null = null;
  if (useProfile) {
    profileDir = findProfileDir(profilesDir, opts.lang!, opts.type!);
    if (!profileDir) {
      const available = listProfiles(profilesDir);
      console.error(`rdv init: no profile '${opts.lang}-${opts.type}' in ${profilesDir}`);
      console.error(available.length ? `  available: ${available.join(', ')}` : '  (no profiles found there)');
      return 1;
    }
  }

  // SAFETY GATE (2026-09-28 incident): a bare `rdv init` — no --lang/--type — is a blind,
  // opinionated mutation of whatever directory happens to be cwd. `init --help` printed no
  // help and instead silently wrote the generic npm-flavored frame into a Rust repo. --dry-run
  // always wins (plan only, exit 0, either path). --lang/--type is EXEMPT from the gate below
  // — choosing a profile is itself the explicit ask, same as before this fix.
  let dryRun = !!opts.dryRun;
  let confirmationDeclined = false;
  if (!dryRun && !useProfile && !opts.yes) {
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const proceed = await confirmYesNo(
        'rdv init will write the generic rederive frame into this directory (CLAUDE.md/AGENTS.md ' +
        'section, .rederive/* hooks, a Stop + PreToolUse hook in .claude/settings.json, a git ' +
        'pre-commit hook). Proceed? [y/N] ');
      if (!proceed) { dryRun = true; confirmationDeclined = true; }
    } else {
      dryRun = true; // non-interactive (a script, an agent, CI) and no --yes: plan, don't touch
    }
  }

  const write = (rel: string, content: string, wopts: { exec?: boolean; skipIfExists?: boolean; label?: string } = {}) => {
    const p = join(root, rel);
    const tag = wopts.label ? ` [${wopts.label}]` : '';
    if (wopts.skipIfExists && existsSync(p)) { out.push(`  = ${rel} (exists, left alone)`); return; }
    const prev = existsSync(p) ? readFileSync(p, 'utf8') : null;
    if (prev === content) { out.push(`  = ${rel} (unchanged)${tag}`); return; }
    if (!dryRun) {
      mkdirSync(join(root, rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '.'), { recursive: true });
      writeFileSync(p, content);
      if (wopts.exec) chmodSync(p, 0o755);
    }
    out.push(`  ${prev === null ? '+' : '~'} ${rel}${tag}`);
  };

  // --refresh: resolve targets and read the PRIOR lock (the baseline for the local-edit
  // check) before anything below touches the filesystem or the lock.
  const refreshTargets = (useProfile && profileDir && opts.refresh?.length) ? expandRefreshTargets(profileDir, opts.refresh) : new Set<string>();
  const priorLock = refreshTargets.size ? readLock(root) : null;

  const applied = profileDir ? applyProfile(root, profileDir, dryRun, refreshTargets.size ? refreshTargets : undefined) : null;

  // prompt layer — a profile's CLAUDE.section.md, if shipped, IS the marker-managed
  // section (it supersedes the generic FRAME_SECTION; it is profile-specific by design).
  // `{{contract}}` names whichever contract file init actually left in place — never a
  // profile default that a pre-existing contract caused applyProfile to skip.
  const contractName = useProfile ? resolveContractName(root, profileDir, opts.type) : '';
  const claudeSectionResolved = applied?.claudeSection?.replaceAll('{{contract}}', contractName) ?? null;
  const section = claudeSectionResolved
    ? (claudeSectionResolved.includes(MARK_BEGIN) ? claudeSectionResolved : `${MARK_BEGIN}\n${claudeSectionResolved.trim()}\n${MARK_END}\n`)
    : FRAME_SECTION;
  // AGENTS.md mirrors only the managed block by default — a non-Claude agent reading it would
  // never see a Project-rules line CLAUDE.md's own --adopt kept, since AGENTS.md rarely has
  // the SAME unmanaged duplicate to detect on its own. Whatever CLAUDE.md's adopt (processed
  // first, below) keeps is mirrored into AGENTS.md's normal marker-merge too — mirroring is
  // cheap, and a pointer-only line would be one more place for the two files to drift apart.
  let sharedKeptLines: string[] = [];
  for (const f of ['CLAUDE.md', 'AGENTS.md']) {
    const p = join(root, f);
    const prev = existsSync(p) ? readFileSync(p, 'utf8') : '';
    // Duplication guard: only relevant before a marker block exists here — once one does,
    // this IS the managed section and the normal update-in-place merge below is correct.
    const dup = !prev.includes(MARK_BEGIN) ? findUnmanagedDuplicate(prev, section) : null;
    if (dup) {
      // --adopt must never SILENTLY drop content: a genericized profile section rewrites
      // almost every sentence, so replacing the unmanaged block wholesale would steamroll
      // whatever project-specific substance (a rule the profile no longer has, a citation
      // into the project's own design doc) the managed section doesn't represent. Compute
      // what would be lost regardless of whether --adopt was even passed, so a plain plan
      // shows it too — the trunc60/quote/list formatting is shared by both message shapes.
      const unmanagedText = prev.split('\n').slice(dup.startLine, dup.endLine).join('\n');
      const keptLines = extractKeptContent(unmanagedText, section);
      const trunc60 = (s: string) => (s.length > 60 ? s.slice(0, 60) + '…' : s);
      const quoted = keptLines.map((k) => `"${trunc60(k)}"`).join(', ');
      const adopting = !!opts.adopt || !!opts.forceAdopt;

      if (adopting) {
        const applying = !dryRun;
        if (opts.forceAdopt) {
          if (!dryRun) writeFileSync(p, replaceUnmanagedBlock(prev, dup, section));
          out.push(`  ~ ${f} (--force-adopt: replaced the unmanaged '${dup.heading}' block with the managed section)`);
          if (keptLines.length) out.push(`  ! --force-adopt ${applying ? 'dropped' : 'would drop'} ${keptLines.length} project-specific line(s): ${quoted}`);
        } else {
          if (!dryRun) writeFileSync(p, replaceUnmanagedBlock(prev, dup, section, keptLines));
          out.push(`  ~ ${f} (--adopt: replaced the unmanaged '${dup.heading}' block with the managed section${keptLines.length ? ' + a Project rules section' : ''})`);
          if (keptLines.length) out.push(`  ! --adopt ${applying ? 'kept' : 'would keep'} ${keptLines.length} project-specific line(s) in "## Project rules": ${quoted}`);
          sharedKeptLines = keptLines;
        }
      } else {
        out.push(`  ! ${f} already carries this section unmanaged — not duplicated; use --adopt to replace the unmanaged block with the managed one`);
        if (keptLines.length) out.push(`  ! --adopt would keep ${keptLines.length} project-specific line(s) in "## Project rules": ${quoted}`);
      }
      continue;
    }
    let next = markerMerge(prev, section);
    const mirroring = !!opts.adopt && !opts.forceAdopt && sharedKeptLines.length > 0 && !next.includes('## Project rules');
    if (mirroring) {
      const projectRules = `## Project rules (kept by \`rdv init --adopt\` — review and merge)\n\n${sharedKeptLines.join('\n\n')}`;
      next = next.trim() + '\n\n' + projectRules + '\n';
    }
    if (prev !== next) {
      if (!dryRun) writeFileSync(p, next);
      out.push(`  ${prev ? '~' : '+'} ${f} (marker section ${prev.includes(MARK_BEGIN) ? 'updated' : 'added'}${mirroring ? ' + mirrored Project rules' : ''})`);
    } else out.push(`  = ${f} (unchanged)`);
  }
  // Legacy per-project agent roster. NO-profile path: write the generic Write-only re-
  // emitters exactly as before. --lang/--type path: the plugin ships the current v0.5
  // roster as rederive:sir-*, so NOTHING here is written — but any `sir-*.md` ALREADY
  // present (files or symlinks; ours from a prior no-profile init, or anyone's) shadows or
  // drifts from the plugin's roster and is flagged, never silently deleted, unless the
  // consumer explicitly asked for that with --prune-agents.
  if (useProfile) {
    const agentsDir = join(root, '.claude/agents');
    const staleAgents = existsSync(agentsDir) ? readdirSync(agentsDir).filter((f) => /^sir-.*\.md$/.test(f)).sort() : [];
    for (const f of staleAgents) {
      const rel = `.claude/agents/${f}`;
      const abs = join(root, rel);
      if (opts.pruneAgents) {
        const st = lstatSync(abs);
        if (st.isFile() || st.isSymbolicLink()) {
          if (!dryRun) unlinkSync(abs);
          out.push(`  - ${rel} (--prune-agents: removed — the plugin's rederive:sir-* roster is authoritative)`);
        } else {
          out.push(`  ! ${rel} is a directory — --prune-agents only removes files/symlinks, left alone`);
        }
      } else {
        out.push(`  ! ${rel} present — the plugin's rederive:sir-* roster is authoritative; remove with --prune-agents`);
      }
    }
    if (!staleAgents.length) out.push('  - .claude/agents/sir-*.md (skipped — the rederive plugin ships this roster as rederive:sir-*)');
  } else {
    write('.claude/agents/sir-reemitter.md', AGENT_REEMITTER, { skipIfExists: true });
    write('.claude/agents/sir-reemitter-cr.md', AGENT_REEMITTER_CR, { skipIfExists: true });
  }

  // profile scaffolding: everything except CLAUDE.section.md/profile.json, write-only-if-absent
  if (applied) {
    out.push(...applied.lines);
    // git can't carry empty dirs, so the profile's own file list never creates units/,
    // observer/, .typikon/rulings/ — do it here, once, only when they're not already there.
    out.push(...ensureScaffoldDirs(root, undefined, dryRun));
  }

  // --refresh: force-sync specific profile-shipped paths init's normal write-only-if-absent
  // rule would otherwise never touch again. applyProfile skipped these paths entirely (no
  // line, no write) above — this is the ONLY place that decides and reports on them, using
  // the PRIOR lock's profileFiles as the "unchanged since last init" baseline.
  if ((refreshTargets.size || opts.refresh?.length) && applied) {
    for (const raw of opts.refresh ?? []) {
      const rel = raw.replace(/\/+$/, '');
      if (!profileDir || !existsSync(join(profileDir, rel))) {
        out.push(`  ! --refresh ${raw}: not shipped by this profile`);
      }
    }
    // profileFileShas here records what's ACTUALLY on disk after THIS decision, same
    // discipline as applyProfile — never the profile's bytes unconditionally, or the very
    // next profile update would make an untouched file look "locally edited" on its own.
    for (const rel of [...refreshTargets].sort()) {
      const src = join(profileDir!, rel);
      const profileContent = readFileSync(src);
      const profileSha = sha256(profileContent);
      const dest = join(root, rel);
      const isTool = rel.startsWith('tools/');
      if (!existsSync(dest)) {
        if (!dryRun) { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, profileContent); if (isTool) chmodSync(dest, 0o755); }
        out.push(`  + ${rel} (created via --refresh)`);
        applied.profileFileShas[rel] = profileSha;
        continue;
      }
      const existingContent = readFileSync(dest);
      const existingSha = sha256(existingContent);
      if (existingSha === profileSha) {
        if (isTool && !dryRun) { try { chmodSync(dest, 0o755); } catch { /* best-effort */ } }
        out.push(`  = ${rel} (already the current profile version)`);
        applied.profileFileShas[rel] = existingSha;
        continue;
      }
      const recordedSha = priorLock?.profileFiles?.[rel];
      const unchangedSinceInit = recordedSha !== undefined && existingSha === recordedSha;
      if (!unchangedSinceInit && !opts.force) {
        out.push(`  ! ${rel} (local edits since last init — refusing to refresh; use --refresh --force to overwrite and lose them)`);
        // deliberately do NOT record a baseline here: this run's normal applyProfile walk
        // also skips this path (it's a refresh target), so if we recorded existingSha now,
        // the VERY NEXT --refresh attempt — even with nothing else touching the file in
        // between — would see "unchanged since [this now-updated] init" and silently
        // succeed, legitimizing the refusal it just gave. Leaving it unrecorded means the
        // next attempt sees no baseline at all, which correctly refuses again too, keeping
        // the refusal stable until either --force is used or a NORMAL (non-refresh) init
        // re-confirms the file's current state as the new trusted baseline.
        continue;
      }
      const hint = diffHint(existingContent, profileContent);
      if (!dryRun) { writeFileSync(dest, profileContent); if (isTool) chmodSync(dest, 0o755); }
      out.push(unchangedSinceInit
        ? `  ~ ${rel} (refreshed from profile; was: ${hint})`
        : `  ! ${rel} (--refresh --force: overwrote local edits; was: ${hint})`);
      applied.profileFileShas[rel] = profileSha; // now the profile's version (or would be, post-dry-run)
    }
  }

  // hook layer — a profile's OWN guard-contracts.mjs/verify-changed.mjs, when it ships one,
  // installs INSTEAD of the generic npm-era frame scripts (which look for sir.manifest.json
  // and run `rdv check` — i.e. enforce nothing on a v0.5 Rust repo that has neither).
  // applyProfile excludes these paths from its own walk so they are resolved exactly once,
  // here, never copied-then-immediately-overwritten by the generic template.
  const hookSource = (relPath: string, generic: string): { content: string; fromProfile: boolean } => {
    const fromProfile = profileDir ? readProfileFile(profileDir, relPath) : null;
    return fromProfile ? { content: fromProfile.toString('utf8'), fromProfile: true } : { content: generic, fromProfile: false };
  };
  const guardHook = hookSource('.rederive/guard-contracts.mjs', GUARD_SCRIPT);
  const verifyHook = hookSource('.rederive/verify-changed.mjs', VERIFY_SCRIPT);
  write('.rederive/guard-contracts.mjs', guardHook.content, { exec: true, label: guardHook.fromProfile ? 'profile hook' : 'generic frame' });
  write('.rederive/verify-changed.mjs', verifyHook.content, { exec: true, label: verifyHook.fromProfile ? 'profile hook' : 'generic frame' });

  // Plugin wiring: measured live that hand-writing extraKnownMarketplaces/enabledPlugins
  // does NOT install a plugin — a fresh session saw no rederive:* agents. The real
  // mechanism is the `claude` CLI itself, run at PROJECT scope (never touches the user's
  // global install). Falls back to a best-effort settings.json write only when `claude`
  // isn't on PATH or the commands fail. In dry-run, never invokes `claude` at all — even
  // `marketplace add` mutates real state, so there is no side-effect-free way to "preview" it.
  const marketplaceDescriptor = useProfile ? parseMarketplaceArg(opts.marketplace) : undefined;
  let pluginWire: PluginWireResult | null = null;
  if (useProfile) {
    pluginWire = wirePlugin(root, marketplaceDescriptor, marketplaceAddArg(marketplaceDescriptor), dryRun);
    out.push(...pluginWire.lines);
  }

  const settingsPath = join(root, '.claude/settings.json');
  let settings = {};
  if (existsSync(settingsPath)) { try { settings = JSON.parse(readFileSync(settingsPath, 'utf8')); } catch { console.error(`  ! .claude/settings.json is not valid JSON — hooks NOT installed; fix it and re-run`); settings = null as any; } }
  if (settings !== null) {
    const merged = JSON.stringify(mergeSettings(settings, useProfile ? { marketplace: pluginWire?.settingsMarketplace, hasTypikonYaml: !!applied?.hasTypikonYaml } : undefined), null, 2) + '\n';
    write('.claude/settings.json', merged);
  }

  // seal layer — same profile-vs-generic resolution as the hook layer, for the same reason.
  const ghAction = hookSource('.github/workflows/rederive-verify.yml', GH_ACTION);
  write('.github/workflows/rederive-verify.yml', ghAction.content, { label: ghAction.fromProfile ? 'profile hook' : 'generic frame' });

  // the pre-commit BODY (what actually runs) comes from the profile's .rederive/pre-commit
  // when shipped; that source file is also copied into the repo as a tracked reference,
  // exactly like guard-contracts.mjs/verify-changed.mjs, so it's reviewable and committed —
  // not just a black box inside .git/. PRECOMMIT_MARK is always OUR wrapper's own header
  // line (never the body's), so "already wired" detection works regardless of body source.
  const precommitProfileBuf = profileDir ? readProfileFile(profileDir, '.rederive/pre-commit') : null;
  if (precommitProfileBuf) write('.rederive/pre-commit', precommitProfileBuf.toString('utf8'), { exec: true, label: 'profile hook' });
  // a profile's .rederive/pre-commit is a COMPLETE, self-contained script (its own shebang,
  // its own "managed by rdv init" comment) — install it verbatim. The generic body is just
  // the action line, so it still needs our shebang + mark wrapped around it. Either way
  // PRECOMMIT_MARK appears as a substring somewhere near the top, so "already wired"
  // detection below works unchanged regardless of which source this came from.
  const precommitContent = precommitProfileBuf
    ? precommitProfileBuf.toString('utf8')
    : `#!/bin/sh\n${PRECOMMIT_MARK}\n${PRECOMMIT_GENERIC_BODY}`;
  const hookPath = join(root, '.git/hooks/pre-commit');
  if (existsSync(join(root, '.git'))) {
    if (!existsSync(hookPath)) write('.git/hooks/pre-commit', precommitContent, { exec: true, label: precommitProfileBuf ? 'profile hook' : 'generic frame' });
    else if (readFileSync(hookPath, 'utf8').includes(PRECOMMIT_MARK)) out.push('  = .git/hooks/pre-commit (already wired)');
    else out.push(`  ! .git/hooks/pre-commit exists and is not ours — add this line yourself:\n      node "$(git rev-parse --show-toplevel)/.rederive/verify-changed.mjs" --precommit`);
  } else out.push('  ! no .git here — pre-commit seal skipped (CI workflow still written)');

  // judge lockfile — only when a profile was requested; a plain `rdv init` (no --lang/--type)
  // has no judge (lab/typikon/plugin) to lock, so it stays exactly as before. plugin.version
  // is a LIVE `claude plugin list --json` check (probeInstalledPlugin), not a manifest read —
  // marketplace is re-read from the settings.json (a plain read, safe even in dry-run) just
  // written, so the lock records exactly what's on disk whether the CLI wrote it or we did.
  if (useProfile) {
    const hadLock = existsSync(join(root, 'rederive.lock'));
    let marketplaceForLock: unknown = pluginWire?.settingsMarketplace ?? marketplaceDescriptor;
    try {
      const s = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
      if (s?.extraKnownMarketplaces?.rederive !== undefined) marketplaceForLock = s.extraKnownMarketplaces.rederive;
    } catch { /* keep the computed fallback above */ }
    const lock = buildLock({ root, lang: opts.lang!, type: opts.type!, profilesDir, marketplace: marketplaceForLock, profileFiles: applied?.profileFileShas });
    if (!dryRun) writeLock(root, lock);
    out.push(`  ${hadLock ? '~' : '+'} rederive.lock${dryRun ? ' (would be re-locked to the current judge)' : ' (re-locked to the current judge)'}`);
  }

  console.log(dryRun ? 'rdv init — PLAN (nothing written yet):' : 'rederive init — the frame is installed (prompt / hook / seal):');
  for (const l of out) console.log(l);

  if (dryRun) {
    console.log('');
    if (opts.dryRun) { console.log('DRY RUN — nothing was written.'); return 0; }
    console.log(confirmationDeclined
      ? 'Declined — nothing was written. Re-run and answer y, or pass --yes, to apply.'
      : 'PLAN ONLY — nothing was written (no TTY and no --yes). Re-run with --yes to apply.');
    return 1;
  }

  if (useProfile) {
    const arg = marketplaceAddArg(marketplaceDescriptor);
    if (pluginWire?.installed) {
      console.log(`
next:
  1. The rederive plugin is installed and enabled (scope: project, marketplace ${arg}) —
     just open Claude Code here: rederive:sir-* agents and /rederive:* commands are ready.
  2. Commit the scaffold. The CI seal arms itself on the first push.
  3. Build. The agent reads CLAUDE.md, the hooks enforce the contracts, and
     git refuses unverified units — argue with none of them.`);
    } else {
      console.log(`
next:
  1. Plugin not installed — open Claude Code here and run:
       /plugin marketplace add ${arg}
       /plugin install rederive@rederive
     (or install the \`claude\` CLI so \`rdv init\` can do this for you next time).
  2. Commit the scaffold. The CI seal arms itself on the first push.
  3. Build. The agent reads CLAUDE.md, the hooks enforce the contracts, and
     git refuses unverified units — argue with none of them.`);
    }
  } else {
    console.log(`
next:
  1. In Claude Code, also install the paved road (skills + full roster):
       /plugin marketplace add rederive/rederive
       /plugin install rederive@rederive
  2. Commit the scaffold. The CI seal arms itself on the first push.
  3. Build. The agent reads CLAUDE.md, the hooks enforce the contracts, and
     git refuses unverified units — argue with none of them.`);
  }

  if (useProfile) {
    console.log('');
    cmdDoctor(root, { profilesDir });
  }
  return 0;
}
