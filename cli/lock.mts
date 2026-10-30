/**
 * rederive.lock (schema v1, ECOSYSTEM_KIT.md v0.2) — the judge lockfile. `rdv init --lang
 * --type` stamps what it found on the machine at scaffold time; `rdv doctor` re-probes the
 * SAME judge (cli/lib/judge.mts) and reports drift. Reproducible verdicts only hold under
 * a fixed judge, so this file exists to make "which judge produced this report.json" a
 * checked fact instead of an assumption.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { probeFactory, probeTypikon, probeToolchain, rdvInfo, probeInstalledPlugin, readProfileMeta, FactoryInfo, LabInfo, TypikonInfo, ToolchainInfo, PluginInfo, RdvInfo } from './lib/judge.mts';

export const LOCK_FILE = 'rederive.lock';

export interface Lock {
  lock: 1;
  plugin: { name: string; version: string; marketplace: unknown; portable?: boolean };
  /** the v0.5 verifier, `sir-factory` (npm). Absent in a lock written before it replaced the lab. */
  factory?: { package: string } & FactoryInfo;
  /** LEGACY, read-only: the @rederive/lab a lock written before sir-factory recorded. Never written now; doctor reports
   * a lock that has only this as LEGACY-LOCK (re-run `rdv init` to lock sir-factory). */
  lab?: { package: string } & LabInfo;
  typikon: TypikonInfo;
  rdv: RdvInfo;
  toolchain: ToolchainInfo;
  profile: { lang: string; type: string; version: string };
  /** sha256 of the PROFILE's OWN content for every file it ships that init walked, as of THIS
   * init — the baseline `rdv init --refresh <path>` compares a file's current on-disk sha
   * against, so "unchanged since init" (safe to refresh) is decidable from "locally edited"
   * (refused without --force). See cli/lib/profile.mts's applyProfile. */
  profileFiles?: Record<string, string>;
  lockedAt: string;
}

export interface LiveJudge {
  plugin: PluginInfo;
  factory: { package: string } & FactoryInfo;
  typikon: TypikonInfo;
  rdv: RdvInfo;
  toolchain: ToolchainInfo;
}

/** The live judge, probed fresh — the exact same functions `rdv init` stamps from, so a
 * `doctor` run compares like-for-like. `root` is the consumer project's directory: the
 * plugin check is PROJECT-SCOPED (or user-scoped), so it needs to know which project. */
export function liveJudge(root: string, profilesDir: string, env: NodeJS.ProcessEnv = process.env): LiveJudge {
  return {
    plugin: probeInstalledPlugin(root),
    factory: { package: 'sir-factory', ...probeFactory(env, root) },
    typikon: probeTypikon(env),
    rdv: rdvInfo(),
    toolchain: probeToolchain(),
  };
}

/** A `directory` marketplace source is an absolute filesystem path — it only resolves on
 * THIS machine. Fine for a local test bed; a release blocker for anyone who clones the repo
 * elsewhere. Not fixed here (just flagged): the lock records it, doctor prints it. */
export function isPortableMarketplace(marketplace: unknown): boolean {
  const m = marketplace as any;
  return m?.source?.source !== 'directory';
}

export function buildLock(opts: { root: string; lang: string; type: string; profilesDir: string; marketplace: unknown; profileFiles?: Record<string, string> }): Lock {
  const live = liveJudge(opts.root, opts.profilesDir);
  const meta = readProfileMeta(opts.profilesDir, opts.lang, opts.type);
  return {
    lock: 1,
    plugin: { name: 'rederive', version: live.plugin.version, marketplace: opts.marketplace, portable: isPortableMarketplace(opts.marketplace) },
    factory: live.factory,
    typikon: live.typikon,
    rdv: live.rdv,
    toolchain: live.toolchain,
    profile: { lang: opts.lang, type: opts.type, version: meta?.version ?? 'unknown' },
    profileFiles: opts.profileFiles,
    lockedAt: new Date().toISOString(),
  };
}

export function writeLock(root: string, lock: Lock): void {
  writeFileSync(join(root, LOCK_FILE), JSON.stringify(lock, null, 2) + '\n');
}

export function readLock(root: string): Lock | null {
  const p = join(root, LOCK_FILE);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}
