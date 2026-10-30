/**
 * `rdv claude [args…]` — the no-CLI-required on-ramp (ECOSYSTEM_KIT.md v0.2 item 4): report
 * whether the optional tools (sir-factory, typikon) are reachable, make sure the repo is
 * initialized (a rederive.lock or a managed CLAUDE.md section), then hand off to the real `claude`
 * binary with argv/stdio passed through untouched. This wrapper never installs anything
 * (`--install` is accepted for old scripts but installs nothing: sir-factory is installed with npm by the
 * user, typikon is not a published package yet) and never launches with API-key billing on an emitter fleet (rederive
 * policy) unless the caller explicitly overrides it — a judgment call a human made, not one this
 * tool should make quietly on their behalf.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { which, probeFactory } from './lib/judge.mts';
import { readLock } from './lock.mts';
import { cmdInit, MARK_BEGIN } from './init.mts';

const OWN_FLAGS = new Set(['--init', '--install', '--allow-api-key']);

// A bare `rdv init --yes` writes the managed CLAUDE.md section but no rederive.lock (the lock records a PROFILE's judge, and a
// bare init has no profile). Either one means the repo is initialized — checking the lock alone re-ran init on every launch.
const isInitialized = (cwd: string) => !!readLock(cwd) || (() => { const p = join(cwd, 'CLAUDE.md'); try { return existsSync(p) && readFileSync(p, 'utf8').includes(MARK_BEGIN); } catch { return false; } })();

export async function cmdClaude(cwd: string, rawArgs: string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const hasFlag = (f: string) => rawArgs.includes(f);
  const passthrough = rawArgs.filter((a) => !OWN_FLAGS.has(a));

  if (env.ANTHROPIC_API_KEY && !hasFlag('--allow-api-key')) {
    console.log(
      'rdv claude: refusing to launch — ANTHROPIC_API_KEY is set. Emitter fleets never run on API-key ' +
      "billing (rederive policy): unset ANTHROPIC_API_KEY, or pass --allow-api-key to override.",
    );
    return 1;
  }

  // sir-factory (the v0.5 unit-loop verifier) and typikon (the Stop-hook harness) are OPTIONAL: say what is missing and what
  // still works, never auto-install (the old @rederive/lab and github.com/rederive/typikon targets were both 404s; sir-factory
  // is the user's own `npm i`, found the way tools/lab finds it — $SIR_FACTORY, ./node_modules, PATH)
  if (hasFlag('--install')) console.log('rdv claude: the install flag installs nothing — install sir-factory yourself (npm i -D sir-factory@^0.4.0); typikon is not a published package yet, put it on PATH if you have it.');
  const absent = [
    ...(probeFactory(env, cwd).version === 'unknown' ? ['sir-factory'] : []),
    ...(which('typikon') ? [] : ['typikon']),
  ];
  const what: Record<string, string> = { 'sir-factory': 'the v0.5 unit loop', typikon: 'the typikon Stop hook' };
  if (absent.length) console.log(`rdv claude: ${absent.join(' and ')} not found — optional (${absent.map((t) => what[t]).join(' / ')} ${absent.length > 1 ? 'stay' : 'stays'} inactive${absent.includes('sir-factory') ? '; npm i -D sir-factory@^0.4.0' : ''}); rdv check, init and doctor work without ${absent.length > 1 ? 'them' : 'it'}.`);

  if (!isInitialized(cwd)) {
    if (hasFlag('--init')) {
      console.log('rdv claude: repo not initialized (no rederive.lock or managed CLAUDE.md section) — running rdv init...');
      // --init IS the explicit consent a bare `rdv init` otherwise requires (--yes) —
      // the user already opted in by passing this flag to `rdv claude`.
      await cmdInit(cwd, { yes: true });
    } else {
      console.log('rdv claude: no rederive.lock in this repo — run `rdv init --yes` (or `rdv init --lang <lang> --type <type>`), or pass --init, first.');
    }
  }

  return new Promise<number>((res) => {
    const child = spawn('claude', passthrough, { cwd, env, stdio: 'inherit' });
    child.on('error', (e: any) => {
      console.error(`rdv claude: failed to launch claude: ${e?.message ?? e}`);
      res(1);
    });
    child.on('exit', (code, signal) => res(code ?? (signal ? 1 : 0)));
  });
}
