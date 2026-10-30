/**
 * rederive judge probes — how `rdv init` and `rdv doctor` see the versions of the
 * non-rdv tools a rederive project depends on (the "judge": sir-factory + typikon + plugin +
 * toolchain). Both commands must agree on what "live" means, so this is the ONE place
 * that knows how to ask each tool its version — `doctor` compares live-vs-locked using
 * exactly these functions, never a second implementation.
 *
 * Every probe is best-effort and fails soft to 'unknown' — a missing tool is reported
 * as a MISSING row by the caller, never a crash. Zero network; PATH + local checkouts only.
 */
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Two different runtimes read this module: real ESM (`tsx cli/rdv.mts`, and every direct
// import in the test files) has `import.meta.url` but no `__dirname`; the esbuild CJS
// bundle (dist/cli.cjs — what the published `rdv`/`rederive` bins actually run) has a real
// `__dirname` from the CJS module wrapper but EMPTIES `import.meta` at build time (esbuild
// can't polyfill it for a cjs target). `typeof` is safe on an undeclared identifier — it
// never throws — so this picks whichever one actually exists instead of guessing the format.
function computeModuleDir(): string {
  if (typeof __dirname !== 'undefined') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}
const MODULE_DIR = computeModuleDir();

/** Absolute path to the nearest ancestor directory holding a package.json — this
 * package's own root, resolved from the MODULE's location, never from cwd, so it
 * works the same whether rdv runs from a dev checkout or a global npm install. */
export function packageRoot(): string {
  let d = MODULE_DIR;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, 'package.json'))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  return process.cwd();
}

export function defaultProfilesDir(): string {
  return join(packageRoot(), 'plugins', 'rederive', 'profiles');
}

/** Is `cmd` resolvable on PATH? Uses `which`/`where` rather than executing the target,
 * so it works even for tools with no `--version` (typikon) or side effects. */
export function which(cmd: string): string | null {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(finder, [cmd], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout) { const line = r.stdout.split('\n')[0].trim(); return line || null; }
  return null;
}

function gitShortHead(dir: string): string {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'unknown';
}

export interface FactoryInfo { version: string; commit: string }
/** The pre-sir-factory judge component (@rederive/lab) as an OLD rederive.lock recorded it under `lab` — read, never probed. */
export type LabInfo = FactoryInfo;

/** sir-factory's identity from its package root: version from package.json (only when it IS sir-factory's), commit
 * from git when the root is a checkout ('unknown' for an npm install, which ships no .git). null when it is not one. */
function factoryAt(dir: string): FactoryInfo | null {
  const pj = join(dir, 'package.json');
  if (!existsSync(pj)) return null;
  let pkg: any;
  try { pkg = JSON.parse(readFileSync(pj, 'utf8')); } catch { return null; }
  if (pkg?.name !== 'sir-factory') return null;
  return { version: pkg.version || 'unknown', commit: existsSync(join(dir, '.git')) ? gitShortHead(dir) : 'unknown' };
}

/** sir-factory, the v0.5 verifier (npm `sir-factory`; its judge is rederive's own), resolved in the SAME order the
 * rust-game profile's tools/lab resolves it: $SIR_FACTORY (a checkout dir, or its factory.mjs), else the project's
 * node_modules/sir-factory, else the `sir-factory` on PATH (its package root, through the bin symlink; a bin that is not
 * under a sir-factory package root is asked `--version`). None of them -> both 'unknown'. */
export function probeFactory(env: NodeJS.ProcessEnv = process.env, root: string = process.cwd()): FactoryInfo {
  const unknown = { version: 'unknown', commit: 'unknown' };
  if (env.SIR_FACTORY) {
    const p = resolve(env.SIR_FACTORY);
    return factoryAt(existsSync(join(p, 'factory.mjs')) ? p : dirname(p)) ?? unknown;   // set but wrong: MISSING, never a fallback
  }
  const local = factoryAt(join(root, 'node_modules', 'sir-factory'));
  if (local) return local;
  const bin = which('sir-factory');
  if (!bin) return unknown;
  let d = dirname(realOrResolved(bin));
  for (let i = 0; i < 4; i++) { const f = factoryAt(d); if (f) return f; const up = dirname(d); if (up === d) break; d = up; }
  const r = spawnSync(bin, ['--version'], { encoding: 'utf8' });
  const m = r.status === 0 ? r.stdout.match(/(\d+\.\d+\.\d+)/) : null;
  return m ? { version: m[1], commit: 'unknown' } : unknown;
}

export interface TypikonInfo { commit: string; version: string }
/** typikon has no --version flag, so identity comes from its CHECKOUT: TYPIKON env var,
 * else ~/typikon. Commit = short HEAD; version = pyproject.toml's [project].version. */
export function probeTypikon(env: NodeJS.ProcessEnv = process.env): TypikonInfo {
  const candidates = [env.TYPIKON, env.HOME ? join(env.HOME, 'typikon') : undefined].filter((d): d is string => !!d && existsSync(d));
  const checkout = candidates[0];
  if (!checkout) return { commit: 'unknown', version: 'unknown' };
  const commit = existsSync(join(checkout, '.git')) ? gitShortHead(checkout) : 'unknown';
  let version = 'unknown';
  const pyproj = join(checkout, 'pyproject.toml');
  if (existsSync(pyproj)) {
    const m = readFileSync(pyproj, 'utf8').match(/^version\s*=\s*"([^"]+)"/m);
    if (m) version = m[1];
  }
  return { commit, version };
}

export interface ToolchainInfo { node: string; cargo: string }
export function probeToolchain(): ToolchainInfo {
  const node = process.version.replace(/^v/, '');
  const r = spawnSync('cargo', ['--version'], { encoding: 'utf8' });
  const cargo = r.status === 0 ? (r.stdout.trim().split(/\s+/)[1] || r.stdout.trim()) : 'unknown';
  return { node, cargo };
}

export function rdvVersion(): string {
  try { return JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')).version || 'unknown'; } catch { return 'unknown'; }
}

export interface RdvInfo { version: string; commit: string | null; path: string }
/** Identity of the rdv binary actually RUNNING this process — never "whatever rdv happens to
 * be on PATH." package.json's version doesn't bump per commit in this dev workflow, so two
 * different checkouts/builds can both report the same version string; without a commit, a
 * lock or doctor run can't tell a fresh build from a stale global install that happens to
 * share that version. `path` is packageRoot() itself (from the RUNNING module's own file
 * location, dist/cli.cjs's __dirname or this file's import.meta.url — see computeModuleDir
 * above — never cwd), so it's the checkout that ran, not a guess. `commit` is `null` — not
 * the string 'unknown' sir-factory/typikon use — when this ISN'T a git checkout at all (a real npm
 * install, which ships no .git); it falls back to gitShortHead's own 'unknown' only if `.git`
 * exists but the git command itself fails, an unrelated failure mode. */
export function rdvInfo(): RdvInfo {
  const root = packageRoot();
  const version = rdvVersion();
  const commit = existsSync(join(root, '.git')) ? gitShortHead(root) : null;
  return { version, commit, path: root };
}

/** realpath, falling back to a plain resolve when the path can't be stat'd (deleted,
 * permissions) — used only for COMPARISON, so a best-effort fallback is fine. */
function realOrResolved(p: string): string {
  try { return realpathSync(resolve(p)); } catch { return resolve(p); }
}

export interface PluginInfo { version: string }
/** Whether the plugin is actually INSTALLED AND ENABLED for this project — not a manifest
 * file's version, which says nothing about whether `claude` has the plugin wired at all
 * (writing extraKnownMarketplaces/enabledPlugins into settings.json by hand does NOT
 * install a plugin; a fresh session sees no rederive:* agents). The only source of truth
 * is `claude plugin list --json`, scoped to THIS project (scope "project" with a matching
 * projectPath, realpath'd since /tmp-style symlinks make plain string compare unreliable)
 * or scope "user" (installed globally). 'unknown' — MISSING to the caller — when `claude`
 * isn't on PATH, the command fails, or no ENABLED entry matches. */
export function probeInstalledPlugin(root: string, pluginId = 'rederive@rederive'): PluginInfo {
  if (!which('claude')) return { version: 'unknown' };
  const r = spawnSync('claude', ['plugin', 'list', '--json'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0 || !r.stdout) return { version: 'unknown' };
  let list: any[];
  try { list = JSON.parse(r.stdout); } catch { return { version: 'unknown' }; }
  if (!Array.isArray(list)) return { version: 'unknown' };
  const rootReal = realOrResolved(root);
  const match = list.find((p: any) => p && p.id === pluginId && p.enabled === true &&
    (p.scope === 'user' || (p.scope === 'project' && p.projectPath && realOrResolved(p.projectPath) === rootReal)));
  return { version: match?.version ? String(match.version) : 'unknown' };
}

export function listProfiles(profilesDir: string): string[] {
  if (!existsSync(profilesDir)) return [];
  return readdirSync(profilesDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export function readProfileMeta(profilesDir: string, lang: string, type: string): any | null {
  const p = join(resolve(profilesDir), `${lang}-${type}`, 'profile.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
