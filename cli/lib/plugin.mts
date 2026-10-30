/**
 * Actually wiring the rederive plugin into a project — not just editing JSON.
 *
 * Measured live (2026-09-28 exit test): hand-writing `extraKnownMarketplaces` +
 * `enabledPlugins` into .claude/settings.json does NOT install a plugin. A fresh headless
 * session in a repo whose settings.json had those keys listed NO rederive:* agents. The
 * actual mechanism is the `claude plugin` CLI itself:
 *
 *   claude plugin marketplace add <path-or-repo> --scope project
 *   claude plugin install rederive@rederive --scope project
 *
 * `--scope project` writes the SAME settings.json keys as before, but through the real
 * product code path, and it never touches the user's global (~/.claude/settings.json)
 * install. Measured shape it writes for a local checkout:
 *   { "extraKnownMarketplaces": { "rederive": { "source": { "source": "directory", "path": "/abs/path" } } } }
 * (note the DOUBLE "source" nesting — not the `{source:"local",path}` shape this module
 * used to hand-write). When `claude` isn't on PATH (or the commands fail), `rdv init`
 * falls back to hand-writing that same nested shape itself — best-effort, not a real
 * install — and says so.
 */
import { spawnSync } from 'node:child_process';
import { which } from './judge.mts';

export interface PluginWireResult {
  /** true only if both `claude plugin marketplace add` and `claude plugin install`
   * exited 0 — i.e. the plugin is actually installed and enabled for this project. */
  installed: boolean;
  /** Printable lines for cmdInit's diff-style output (the commands run + their output,
   * or the fallback notice). */
  lines: string[];
  /** Set ONLY on the fallback path (claude absent, or a command failed): the nested
   * `{source: <descriptor>}` shape to hand-write into extraKnownMarketplaces.rederive.
   * Left undefined when `installed` is true, so mergeSettings leaves those keys alone —
   * the real CLI already wrote them correctly. */
  settingsMarketplace?: unknown;
}

const splitLines = (s: string | undefined) => (s || '').trim().split('\n').filter(Boolean);

/** Try to install the plugin for real via the `claude` CLI at project scope; fall back to
 * a hand-written (best-effort) settings.json entry when that isn't possible. `marketplaceArg`
 * is the string a person would type into `/plugin marketplace add …` (an owner/repo shorthand
 * or a local path); `marketplaceDescriptor` is the parsed `{source, repo|path}` object used
 * only by the fallback write. `dryRun`: describe the intended action without running `claude`
 * at all — even `marketplace add` mutates global/project state, so a PLAN preview must not
 * invoke it "to see what would happen." Always returns a settingsMarketplace preview in that
 * case, so the settings.json plan line is a complete, honest picture either way. */
export function wirePlugin(root: string, marketplaceDescriptor: unknown, marketplaceArg: string, dryRun = false): PluginWireResult {
  const lines: string[] = [];
  if (dryRun) {
    lines.push(which('claude')
      ? `  → (dry-run) would run: claude plugin marketplace add ${marketplaceArg} --scope project, then claude plugin install rederive@rederive --scope project`
      : '  ! (dry-run) claude not on PATH — would hand-write extraKnownMarketplaces.rederive + enabledPlugins directly');
    return { installed: false, lines, settingsMarketplace: { source: marketplaceDescriptor } };
  }
  if (which('claude')) {
    const addR = spawnSync('claude', ['plugin', 'marketplace', 'add', marketplaceArg, '--scope', 'project'], { cwd: root, encoding: 'utf8' });
    lines.push(`  → claude plugin marketplace add ${marketplaceArg} --scope project`);
    for (const l of splitLines(addR.stdout || addR.stderr)) lines.push(`      ${l}`);
    if (addR.status === 0) {
      const installR = spawnSync('claude', ['plugin', 'install', 'rederive@rederive', '--scope', 'project'], { cwd: root, encoding: 'utf8' });
      lines.push('  → claude plugin install rederive@rederive --scope project');
      for (const l of splitLines(installR.stdout || installR.stderr)) lines.push(`      ${l}`);
      if (installR.status === 0) return { installed: true, lines };
      lines.push('  ! claude plugin install failed — falling back to writing the settings keys directly');
    } else {
      lines.push('  ! claude plugin marketplace add failed — falling back to writing the settings keys directly');
    }
  }
  lines.push('  ! plugin not installed — open Claude Code here and run /plugin install rederive@rederive, or install the CLI');
  return { installed: false, lines, settingsMarketplace: { source: marketplaceDescriptor } };
}
