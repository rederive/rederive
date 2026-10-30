/**
 * `rdv doctor` — compares the live judge (cli/lib/judge.mts) against what `rdv init`
 * locked in rederive.lock, one row per component. This is the ONLY place that renders
 * that comparison; the SessionStart hook the plugin installs is expected to shell out to
 * `rdv doctor --brief`, so the one-liner format here is load-bearing, not cosmetic.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readLock, liveJudge, Lock } from './lock.mts';
import { defaultProfilesDir, which } from './lib/judge.mts';

export interface DoctorOptions { brief?: boolean; strict?: boolean; profilesDir?: string }

type Status = 'OK' | 'DRIFT' | 'MISSING' | 'STALE-LOCK' | 'LEGACY-LOCK';
interface Row { label: string; status: Status; lock: string; live: string }

const isUnknown = (v: unknown) => v === undefined || v === null || v === 'unknown' || v === 'unknown@unknown';
// rdv.commit is `null` in the lock/live judge itself (a real npm install ships no .git — see
// rdvInfo) — never interpolate that raw into a display string ("rdv 0.5.0@null"); render it
// the same way sir-factory/typikon's own 'unknown' already reads.
const dispCommit = (c: string | null | undefined): string => c ?? 'unknown';
// a lock written before the commit field existed has it `undefined` (the key is simply
// absent), a DIFFERENT case from `null` (recorded, deliberately, as "no commit to report") —
// rendered differently too, so "unrecorded" never gets confused with a real "unknown" result.
const dispLockCommit = (c: string | null | undefined): string => (c === undefined ? 'unrecorded' : c ?? 'unknown');

function row(label: string, lockVal: string, liveVal: string): Row {
  if (isUnknown(liveVal)) return { label, status: 'MISSING', lock: lockVal, live: liveVal };
  if (isUnknown(lockVal)) return { label, status: 'DRIFT', lock: lockVal, live: liveVal }; // lock predates this row / was stamped 'unknown'
  return { label, status: lockVal === liveVal ? 'OK' : 'DRIFT', lock: lockVal, live: liveVal };
}

/** rdv gets its own row logic (not the generic `row()`): a lock from before the commit field
 * existed has `rdv.commit === undefined`. Printing that as DRIFT is a lie — the version
 * MATCHES, nothing moved, the lock is just missing information `rdv init` would happily add.
 * STALE-LOCK says that plainly; an actual version mismatch is still DRIFT either way. */
function rdvRow(lock: Lock, live: { version: string; commit: string | null }): Row {
  const lockVersion = String(lock.rdv?.version);
  const liveVersion = String(live.version);
  const lockCommit = lock.rdv?.commit;
  const lockStr = `${lockVersion}@${dispLockCommit(lockCommit)}`;
  const liveStr = `${liveVersion}@${dispCommit(live.commit)}`;

  if (isUnknown(liveVersion)) return { label: 'rdv', status: 'MISSING', lock: lockStr, live: liveStr };
  if (isUnknown(lockVersion)) return { label: 'rdv', status: 'DRIFT', lock: lockStr, live: liveStr };
  if (lockCommit === undefined) {
    return { label: 'rdv', status: lockVersion === liveVersion ? 'STALE-LOCK' : 'DRIFT', lock: lockStr, live: liveStr };
  }
  // a commit is only comparable when BOTH sides have one: a git checkout and an npm install of the same version (no .git, commit
  // null) are the same rdv as far as anyone can tell — calling that DRIFT sent consumers chasing a difference nobody can see
  const same = lockVersion === liveVersion && (isUnknown(lockCommit) || isUnknown(live.commit) || lockCommit === live.commit);
  return { label: 'rdv', status: same ? 'OK' : 'DRIFT', lock: lockStr, live: liveStr };
}

/** The verifier row. A lock written before sir-factory replaced the lab records `lab` (@rederive/lab) and no `factory`:
 * that is not drift between two versions of one tool, it is a retired component — LEGACY-LOCK, shown with what the old
 * lock recorded and what is live now, so a re-run `rdv init` (which locks sir-factory) is the obvious fix. Never a crash. */
function factoryRow(lock: Lock, live: { version: string; commit: string }): Row {
  const liveStr = `${live.version}@${live.commit}`;
  if (!lock.factory && lock.lab) {
    return { label: 'sir-factory', status: 'LEGACY-LOCK', lock: `${lock.lab.package ?? '@rederive/lab'} ${lock.lab.version}@${lock.lab.commit}`, live: liveStr };
  }
  return row('sir-factory', `${lock.factory?.version}@${lock.factory?.commit}`, liveStr);
}

const lockedFactory = (lock: Lock): string =>
  lock.factory ? `${lock.factory.version}@${lock.factory.commit}` : lock.lab ? `(legacy lab ${lock.lab.version}@${lock.lab.commit})` : 'unrecorded';

function buildRows(lock: Lock, dir: string, profilesDir: string): Row[] {
  const live = liveJudge(dir, profilesDir);
  return [
    row('plugin', String(lock.plugin?.version), String(live.plugin.version)),
    factoryRow(lock, live.factory),
    row('typikon', `${lock.typikon?.version}@${lock.typikon?.commit}`, `${live.typikon.version}@${live.typikon.commit}`),
    rdvRow(lock, live.rdv),
    row('node', String(lock.toolchain?.node), String(live.toolchain.node)),
    row('cargo', String(lock.toolchain?.cargo), String(live.toolchain.cargo)),
  ];
}

function briefLine(lock: Lock, rows: Row[]): string {
  const drifted = rows.filter((r) => r.status === 'DRIFT' || r.status === 'MISSING');
  const stale = rows.filter((r) => r.status === 'STALE-LOCK');
  const legacy = rows.filter((r) => r.status === 'LEGACY-LOCK');
  const parts: string[] = [];
  if (drifted.length) parts.push(`DRIFT: ${drifted.map((r) => r.label).join(', ')}`);
  if (stale.length) parts.push(`STALE-LOCK: ${stale.map((r) => r.label).join(', ')}`);
  if (legacy.length) parts.push(`LEGACY-LOCK: ${legacy.map((r) => r.label).join(', ')}`);
  const tail = parts.length ? parts.join('; ') : 'OK';
  return `rederive: plugin ${lock.plugin?.version} · sir-factory ${lockedFactory(lock)} · ` +
    `typikon ${lock.typikon?.commit} · rdv ${lock.rdv?.version}@${dispLockCommit(lock.rdv?.commit)} — ${tail}`;
}

export function cmdDoctor(dir: string, opts: DoctorOptions = {}): number {
  const lock = readLock(dir);
  if (!lock) {
    console.log('no rederive.lock — run rdv init');
    return 0;
  }
  const profilesDir = opts.profilesDir ? opts.profilesDir : defaultProfilesDir();
  const rows = buildRows(lock, dir, profilesDir);
  const bad = rows.filter((r) => r.status !== 'OK');

  if (opts.brief) {
    console.log(briefLine(lock, rows));
    return opts.strict && bad.length ? 1 : 0;
  }

  console.log(`rdv doctor  ${lock.profile?.lang}-${lock.profile?.type}  (locked ${lock.lockedAt})`);
  for (const r of rows) {
    if (r.status === 'OK') { console.log(`  ${r.label}: OK`); continue; }
    if (r.status === 'STALE-LOCK') { console.log(`  ${r.label}: STALE-LOCK (lock ${r.lock}, live ${r.live}) — re-run rdv init to record the commit`); continue; }
    if (r.status === 'LEGACY-LOCK') { console.log(`  ${r.label}: LEGACY-LOCK (the lock records the retired lab, ${r.lock}; live sir-factory ${r.live}) — re-run rdv init to lock sir-factory`); continue; }
    console.log(`  ${r.label}: ${r.status}${r.status === 'DRIFT' ? ` (lock ${r.lock}, live ${r.live})` : ''}`);
  }
  const toolDirs = ['lab', 'install', 'typikon', 'emit'].filter((t) => existsSync(join(dir, 'tools', t)));
  const factoryLive = rows.find((r) => r.label === 'sir-factory')?.live;
  console.log(`  commands: tools/{${toolDirs.join(',') || 'none'}}  ·  typikon ${which('typikon') ? 'on PATH' : 'MISSING'}  ·  sir-factory ${factoryLive && !isUnknown(factoryLive) ? 'found' : 'MISSING (npm i -D sir-factory@^0.4.0)'}`);
  if (lock.plugin?.portable === false) {
    console.log('  note: plugin marketplace is machine-local (a "directory" source, an absolute path) — not portable to another machine (release blocker, not fixed here)');
  }

  return opts.strict && bad.length ? 1 : 0;
}
