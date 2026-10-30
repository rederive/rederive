/**
 * Profile scaffolding for `rdv init --lang X --type Y` (ECOSYSTEM_KIT.md v0.2).
 *
 * A profile (plugins/rederive/profiles/<lang>-<type>/, data — not code) is copied into
 * the target repo under the SAME marker discipline as the rest of `rdv init`: a file the
 * profile ships is written only if the target is absent; an existing target file is NEVER
 * overwritten, so a consumer's own edits (or a previous, different profile) always win.
 * `CLAUDE.section.md` and `profile.json` are handled specially by the caller (init.mts),
 * not copied verbatim — the former becomes the marker-managed CLAUDE.md/AGENTS.md section,
 * the latter is metadata (lang/type/version/requires), not a file the repo needs.
 */
import { GLUE } from '../sir/sir-parse.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, chmodSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative, resolve } from 'node:path';

export function findProfileDir(profilesDir: string, lang: string, type: string): string | null {
  const p = join(resolve(profilesDir), `${lang}-${type}`);
  return existsSync(p) ? p : null;
}

/** Every file under `dir`, relative to `base`. Exported for --refresh's own use (expanding a
 * directory target like `tools/` into the individual profile-relative paths it ships). */
export function walk(dir: string, base: string = dir): string[] {
  let out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

// Handled explicitly by init.mts (resolveHookFile below), not by the generic walk: each is
// either the profile's own version of a hook script or the generic frame's, decided once,
// so it is never copied here and then immediately overwritten by the hook layer.
export const HOOK_SOURCE_PATHS = new Set([
  '.rederive/guard-contracts.mjs', '.rederive/verify-changed.mjs',
  '.rederive/pre-commit', '.github/workflows/rederive-verify.yml',
]);
const SPECIAL = new Set(['profile.json', 'CLAUDE.section.md']);

export interface AppliedProfile {
  lines: string[];
  hasTypikonYaml: boolean;
  claudeSection: string | null;
  /** sha256 of the PROFILE's OWN content for every walked path (not the repo's on-disk
   * content) — recorded regardless of whether that file was written, left alone, or skipped.
   * This is what `rederive.lock`'s `profileFiles` stores: "what the profile had, as of the
   * last init" — the baseline --refresh compares a file's CURRENT on-disk sha against to
   * decide "still exactly the profile's version" (safe to refresh) vs "diverged" (refuse). */
  profileFileShas: Record<string, string>;
}

/** Read a profile-shipped file by its path relative to the profile root, or null if the
 * profile doesn't ship it. Used by init.mts to decide profile-vs-generic for hook files. */
export function readProfileFile(profileDir: string, relPath: string): Buffer | null {
  const p = join(profileDir, relPath);
  return existsSync(p) ? readFileSync(p) : null;
}

function hasAnyContractFile(root: string): boolean {
  const dir = join(root, 'contracts');
  if (!existsSync(dir)) return false;
  try { return readdirSync(dir).some((f) => f.endsWith('.contract.yaml')); } catch { return false; }
}

/** A short, single-line "what differs" hint for a tools/* script that already exists with
 * different content — the first line the two disagree on, truncated. Not a real diff (no
 * dependency for one), just enough to tell a human where to look. Exported for --refresh's
 * own "was: <diff hint>" line (init.mts). */
// the parser's PINNED glue set (White_Space + Cf, Unicode 17.0) plus DEL, the C1 controls, variation selectors and the Hangul
// fillers (round 5b, #115: a hand list without the u flag printed tag characters, U+FE0F, U+3164 raw)
const INVISIBLE = new RegExp(`[${GLUE}\\u007f-\\u009f\\u034f\\u115f\\u1160\\u180b-\\u180d\\u2800\\u3164\\ufe00-\\ufe0f\\uffa0\\u{e0100}-\\u{e01ef}]`, 'gu');
export function diffHint(existing: Buffer, profile: Buffer): string {
  // Round 5 (selfhost diff_hint): a line one side LACKS is a difference ("a\n" vs "a" said "whitespace-only"); the window is
  // cut at code points (an emoji was halved into two lone surrogates) and counted in characters; and it is ESCAPED as a JSON
  // string with invisible characters as \uXXXX — a raw CR in the window moved the cursor and hid the real cause (line endings).
  const a = existing.toString('utf8').split('\n');
  const b = profile.toString('utf8').split('\n');
  const show = (cps: string[], start: number, len = 80) => {
    const body = JSON.stringify(cps.slice(start, start + len).join('')).replace(INVISIBLE, (c) => (c.length > 1 || c.codePointAt(0)! > 0xffff ? `\\u{${c.codePointAt(0)!.toString(16)}}` : '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')));
    return '"' + (start > 0 ? '…' : '') + body.slice(1, -1) + (start + len < cps.length ? '…' : '') + '"';
  };
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i >= a.length) return `line ${i + 1}: existing has no line ${i + 1}, profile has ${show(Array.from(b[i]), 0)}`;
    if (i >= b.length) return `line ${i + 1}: profile has no line ${i + 1}, existing has ${show(Array.from(a[i]), 0)}`;
    if (a[i] === b[i]) continue;
    // truncating from the START of each line is useless when both share a long common prefix — they'd print identically and
    // look like a false positive. Find the first CHARACTER they disagree on and show ~80 characters from there instead.
    const ca = Array.from(a[i]), cb = Array.from(b[i]);
    let col = 0; while (col < Math.max(ca.length, cb.length) && ca[col] === cb[col]) col++;
    return `line ${i + 1}, col ${col + 1}: existing ${show(ca, col)} vs profile ${show(cb, col)}`;
  }
  return 'binary difference (the texts decode to the same UTF-8)';
}

/** Copy every file in `profileDir` except the special/hook ones into `root`, write-only-if-
 * absent. Returns the printable diff lines plus the facts init.mts needs to finish the job:
 * whether a typikon.yaml shipped (gates the Stop hook) and the raw CLAUDE.section.md text.
 * Two extra skip rules beyond plain write-only-if-absent:
 *   - a `contracts/*.contract.yaml` the profile ships is skipped (not just left alone, never
 *     even considered) when the repo ALREADY has any `contracts/*.contract.yaml` of its own —
 *     a consumer's own contract wins over the profile's default-named one, whatever it's called.
 *   - an existing tools/<x> that differs from the profile's gets a one-line diff hint instead
 *     of the generic "(exists, not overwritten by profile)".
 * `dryRun` computes and returns the exact same lines (existsSync + byte-compare needs no
 * write to answer) but performs no mkdirSync/writeFileSync/chmodSync — the PLAN preview.
 * `skipPaths`, when given, are left ENTIRELY alone here — no line, no write, no chmod, no
 * sha recorded — because init.mts's own --refresh step is handling them instead, with its
 * own local-edit check and its own line (and its own sha recording, merged back in after).
 *
 * profileFileShas records sha256 of whatever ends up ON DISK after THIS run's decision for
 * each path — the profile's own bytes for a fresh write, but the EXISTING (possibly quite
 * different) bytes for a skip — never the profile's bytes unconditionally. This matters: if
 * it always recorded "what the profile currently has," the very next time the PROFILE itself
 * changed (before any refresh), the recorded baseline would silently jump to the NEW profile
 * content even though the on-disk file never moved — making an untouched file look "locally
 * edited" through no fault of the consumer's. Recording what's actually on disk means
 * "unchanged since init" means exactly that: nothing touched this path since the last time
 * `rdv init` looked at it, regardless of whether the profile has moved on since. */
export function applyProfile(root: string, profileDir: string, dryRun = false, skipPaths?: Set<string>): AppliedProfile {
  const lines: string[] = [];
  const profileFileShas: Record<string, string> = {};
  const files = existsSync(profileDir) ? walk(profileDir).filter((f) => !SPECIAL.has(f) && !HOOK_SOURCE_PATHS.has(f)) : [];
  for (const rel of files.sort()) {
    if (skipPaths?.has(rel)) continue;
    const src = join(profileDir, rel);
    const dest = join(root, rel);
    const content = readFileSync(src);
    const isTool = rel.startsWith('tools/');
    const isContract = /^contracts\/.*\.contract\.yaml$/.test(rel);
    if (isContract && !existsSync(dest) && hasAnyContractFile(root)) {
      lines.push(`  ! ${rel} (skipped — contracts/ already has a *.contract.yaml of its own)`);
      continue; // nothing landed on disk at this path — nothing to record
    }
    if (!existsSync(dest)) {
      if (!dryRun) {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, content);
        if (isTool) chmodSync(dest, 0o755);
      }
      lines.push(`  + ${rel}`);
      profileFileShas[rel] = sha256(content); // what's there now (or would be, post-dry-run): the profile's own bytes
    } else {
      const existing = readFileSync(dest);
      profileFileShas[rel] = sha256(existing); // what's ACTUALLY there — written, or left alone, either way
      if (Buffer.compare(existing, content) === 0) {
        // byte-identical to our own copy — re-assert the exec bit every run: a fresh
        // checkout can lose it (core.filemode=false, a non-POSIX filesystem, a zip
        // export) even though the content is untouched, and `rdv init` is the one
        // place a consumer is guaranteed to run before trying `tools/lab` etc. `=` means
        // byte-AND-mode identical, though — silently flipping the mode while printing `=`
        // is a lie about what happened, so a mode-only change gets its own `~` line.
        const currentMode = isTool ? statSync(dest).mode & 0o777 : 0o755;
        if (isTool && currentMode !== 0o755) {
          if (!dryRun) { try { chmodSync(dest, 0o755); } catch { /* best-effort */ } }
          lines.push(`  ~ ${rel} (mode ${currentMode.toString(8)}→755)`);
        } else {
          lines.push(`  = ${rel}`);
        }
      } else if (isTool) {
        lines.push(`  ! ${rel} differs from the profile (kept) — diff: ${diffHint(existing, content)}`);
      } else {
        lines.push(`  ! ${rel} (exists, not overwritten by profile)`);
      }
    }
  }
  const claudeSectionPath = join(profileDir, 'CLAUDE.section.md');
  const claudeSection = existsSync(claudeSectionPath) ? readFileSync(claudeSectionPath, 'utf8') : null;
  const hasTypikonYaml = existsSync(join(profileDir, 'typikon.yaml'));
  return { lines, hasTypikonYaml, claudeSection, profileFileShas };
}

/** git cannot carry empty directories, so a profile's own file list (walked above) can
 * never create one — but the workflow a profile describes depends on some existing before
 * the first unit lands: `units/<unit>/…`, `observer/events.jsonl` (tools/lab, tools/emit),
 * and typikon.yaml's `queue: .typikon/rulings/`. Created only when ABSENT: once a unit (or
 * typikon) has put real content there, this is a no-op, never a clobber. */
export const SCAFFOLD_DIRS = ['units', 'observer', '.typikon/rulings'];

export function ensureScaffoldDirs(root: string, dirs: string[] = SCAFFOLD_DIRS, dryRun = false): string[] {
  const lines: string[] = [];
  for (const rel of dirs) {
    const dir = join(root, rel);
    if (existsSync(dir)) { lines.push(`  = ${rel}/`); continue; }
    if (!dryRun) {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '.gitkeep'), '');
    }
    lines.push(`  + ${rel}/.gitkeep`);
  }
  return lines;
}
