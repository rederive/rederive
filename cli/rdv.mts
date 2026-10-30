/**
 * rederive (CLI: rdv) — the trust-nothing package manager.
 *
 * A SIR package ships its CONTRACT (the SIR spec + a held-out oracle), not trusted bytes.
 * A consumer either VERIFIES the shipped implementation against that contract (`check`, deterministic,
 * free) or REBUILDS it locally from the spec (`resynth`, torches tokens, quorum-verified) — never
 * trusting the publisher's binary. The oracle is the independent source of truth nobody upstream can move.
 *
 *   rdv init    [dir]                install the rederive frame into a project: CLAUDE.md/AGENTS.md section,
 *                                      contract-guard + verify hooks, agent roster, pre-commit + CI seal
 *   rdv init --lang L --type T      also scaffold that profile (plugins/rederive/profiles/L-T), wire the
 *                                      plugin marketplace + enabledPlugins + typikon Stop hook into
 *                                      .claude/settings.json, write rederive.lock, then run `rdv doctor`
 *   rdv doctor  [--brief] [--strict] compare the live judge (sir-factory/typikon/rdv/toolchain) to rederive.lock
 *   rdv claude  [args…]              report sir-factory/typikon (optional), init if needed, exec `claude`
 *   rdv check   <pkgdir>             verify src/ against the held-out oracle + content hashes  (no tokens)
 *   rdv vis     <pkgdir>             (re)generate vis.html from the SIR + manifest             (no tokens)
 *   rdv audit   [dir] [--json]       declared vs delivered: the real dependency surface (lockfile / node_modules)
 *   rdv resynth <pkgdir> [--unit U]  PREPARE a local rebuild: write ready-to-spawn worker prompts + a plan
 *   rdv resynth <pkgdir> --apply     APPLY the workers' output: grade vs held-out, pick a quorum
 *                                      emission, update src/ + manifest, re-verify (deterministic)
 *   rdv guard <base-lock> <head-lock>  gate a PR's dependency ADDS (npm/pnpm) → green/yellow/red;
 *                                      RED = install hook on a non-established dep. [--reporter github|ado|json]
 *
 * The prepare/apply split is the wiring to the interactive sir-verify skill: a plain CLI cannot spawn
 * Claude Code subagents, so `resynth` (prepare) emits the prompts and the SKILL spawns N `sir-reemitter`
 * workers, then `resynth --apply` does the deterministic selection + manifest update.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync, statSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolve, relative, dirname, join } from 'node:path';
import { grade, quorum, hashHex, revive as reviveArg, pinMatches } from './verdict.mts';
import { cmdInit } from './init.mts';
import { cmdDoctor } from './doctor.mts';
import { cmdClaude } from './claude.mts';
import { rdvInfo } from './lib/judge.mts';
import { implementedFeatures, supportedSpec, cmpVer, isVersion, detectFeatures, languagesOf, harnessedLanguages, toolchainOf } from './features.mjs';
import { findTsc, prepareTs } from './lang-ts.mts';
import { parse as parseSir, get as sirGet, canonicalSha } from './sir/sir-parse.mjs';
import { parseSig, vectorSetSha, escapeMarkers, ENCODING as CANONICAL } from './sir/canon.mjs';
import { nativeCaller, resolveExport } from './lang/native.mjs';
import { extensionCases, gradeExtension } from './lang/extension.mjs';   // the ONE js/ts driver, shared with the lab (#162/#163)
import { gradeArtifact } from './lang/grade.mjs';
import * as rustDriver from './lang/rust.mjs';
import { treeSha } from './tree-sha.mjs';
import { validate as validateSir } from './sir/validate.mjs';

const sha256 = (path: string) => hashHex(readFileSync(path));
const C = { g: (s: string) => `\x1b[32m${s}\x1b[39m`, r: (s: string) => `\x1b[31m${s}\x1b[39m`,
  y: (s: string) => `\x1b[33m${s}\x1b[39m`, dim: (s: string) => `\x1b[90m${s}\x1b[39m`, b: (s: string) => `\x1b[1m${s}\x1b[22m` };

// a user error, not a crash: main() prints these as one line, never a stack (a missing manifest used to surface as a raw ENOENT trace)
const userError = (msg: string) => Object.assign(new Error(msg), { userFacing: true });
const loadManifest = (dir: string) => {
  const p = resolve(dir, 'sir.manifest.json');
  if (!existsSync(p)) throw userError(`no sir.manifest.json in ${relative(process.cwd(), dir).startsWith('..') ? dir : relative(process.cwd(), dir) || '.'} — point rdv at a rederive package directory (the one holding sir.manifest.json, sir/, oracles/, src/)`);
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch (e: any) { throw userError(`${relative(process.cwd(), p)} is not valid JSON: ${e.message}`); }
};
const saveManifest = (dir: string, m: any) => writeFileSync(resolve(dir, 'sir.manifest.json'), JSON.stringify(m, null, 2) + '\n');

// What this rdv can actually CHECK. A trust-nothing consumer must not verify against a
// contract format it doesn't fully understand, so anything beyond this halts.
//
// TWO GATES, coarse then fine (SIR_V04_PLAN F.1):
//   1. specVersion — the coarse gate, unchanged. Absent = pre-0.2 (v0.1) legacy, verifies
//      normally. NEWER than SUPPORTED_SPEC halts. This must keep working on its own, because
//      an rdv predating `features` sees only this and has to stay safe.
//   2. features    — the fine gate. A bundle may declare exactly which versioned features it
//      uses; if every one is implemented here, the bundle verifies even when its specVersion
//      is ahead. That turns a partially-built spec version from a cliff into a ramp.
//
// The rule the versions serve: both track what rdv can CHECK, never what the schema has published.
// Both are READ from cli/capabilities.json (via cli/features.mjs, compiled into the bundle) — rdv is a
// consumer of the capability model, not a second hand-kept copy of it. Marking a feature `implemented`
// there is a claim that this verifier implements it.
const SUPPORTED_SPEC: string = supportedSpec();
const IMPLEMENTED_FEATURES: Set<string> = implementedFeatures();
const HARNESSED_LANGUAGES: Set<string> = harnessedLanguages();

// The STRUCTURAL gate, before either declared gate: what the bundle's shape says it carries, read from the manifest
// itself (variant keys, per-language SIR paths), never from its self-declared `features`. A bundle that ships a
// lang:rust variant but under-stamps `features` (or stamps nothing at all) must still halt — otherwise rdv would
// grade a Rust variant through the JS harness, or skip it. Names the missing language AND the missing feature.
// A harnessed language is checkable only where its toolchain resolves (cli/capabilities.json toolchain.toolchains): rdv
// bundles no compiler. js needs nothing; ts needs the consumer's TypeScript. An unlisted language is never ready.
const toolchainReady = (lang: string, dir: string): boolean =>
  lang === 'js' ? true : lang === 'ts' ? findTsc([dir, process.cwd()]) !== null
    : lang === 'rust' ? spawnSync('cargo', ['--version'], { encoding: 'utf-8' }).status === 0 : false;
type Status = { ok: boolean; label: string; missing?: string[]; languages?: string[]; toolchains?: string[]; reason?: string };
// `only` (rdv check --lang): languages outside it are not graded here, so their toolchain is not required — every other gate stands.
const structuralStatus = (m: any, dir: string, only: Set<string> | null = null): Status => {
  try {
    const missing = new Set<string>(), languages = new Set<string>(), toolchains = new Set<string>();
    for (const u of m.units || []) {
      const shape = { variants: u.variants, sirFiles: [u.sir, ...Object.values(u.variants || {}).map((v: any) => v?.sir)].filter(Boolean) };
      for (const f of detectFeatures(shape)) if (!IMPLEMENTED_FEATURES.has(f)) missing.add(f);
      for (const l of languagesOf(shape)) {
        if (!HARNESSED_LANGUAGES.has(l)) languages.add(l);
        else if ((!only || only.has(l)) && !toolchainReady(l, dir)) toolchains.add(l);
      }
    }
    if (!missing.size && !languages.size && !toolchains.size) return { ok: true, label: '' };
    const parts = [...missing, ...[...languages].map((l) => `language ${l}`), ...[...toolchains].map((l) => `a ${l} toolchain`)];
    return { ok: false, missing: [...missing], languages: [...languages], toolchains: [...toolchains], label: C.r(`needs ${parts.join(', ')}`) };
  } catch (e: any) {
    return { ok: false, reason: `malformed bundle: ${e.message}`, label: C.r('malformed bundle') };
  }
};

const specStatus = (m: any, dir: string, only: Set<string> | null = null): Status => {
  const st = structuralStatus(m, dir, only);
  if (!st.ok) return st;
  const v = m.specVersion;
  if (v === undefined) return { ok: true, label: C.dim('spec v0.1 (legacy/unstamped)') };
  // fail CLOSED on a version this rdv cannot read: the old comparison read "0.5-rc1" or `true` as 0 and let it through
  if (!isVersion(v)) return { ok: false, reason: `malformed specVersion ${JSON.stringify(v)} (expected <digits>(.<digits>)*)`, label: C.r('malformed specVersion') };
  const declared: string[] = Array.isArray(m.features) ? m.features : [];
  const missing = declared.filter((f) => !IMPLEMENTED_FEATURES.has(f));
  if (declared.length) {
    // the fine gate: a declared feature set is authoritative over the version scalar,
    // so a bundle using only implemented features verifies even ahead of SUPPORTED_SPEC
    if (missing.length) return { ok: false, missing, label: C.r(`needs ${missing.join(', ')}`) };
    return { ok: true, label: C.dim(`spec v${v} (features: ${declared.join(', ')})`) };
  }
  if (cmpVer(v, SUPPORTED_SPEC) > 0) return { ok: false, label: C.r(`spec v${v} > rdv ${SUPPORTED_SPEC}`) };
  return { ok: true, label: C.dim(`spec v${v}`) };
};

async function resolveFn(srcAbs: string, name: string) {
  const mod: any = await import(srcAbs);
  return mod[name] ?? mod.run ?? mod.default ?? Object.values(mod).find((x) => typeof x === 'function');
}

// ── trace-oracle verification (mode: "trace") — the injected-boundary adapters live HERE, in the OSS CLI,
// not in the package: a trust-nothing verifier must not run publisher-shipped harness code to check
// publisher code. The package ships only the oracle (args incl. the scripted boundary + expected
// {emitted,result}) and src; the CLI rebuilds the fake boundary and grades. New boundary kinds are added
// to this adapter library. Today: the HTTP transport (net.request/write/end EMIT + injected response). ──
function makeFakeHttp(script: any) {
  const emitted: any[] = [];
  const http = {
    request(opts: any, cb: any) {
      emitted.push({ op: 'request', opts });
      const res: any = { statusCode: script.statusCode, setEncoding() {}, on(ev: string, h: any) { res['_' + ev] = h; return res; } };
      const req: any = {
        on(ev: string, h: any) { req['_' + ev] = h; return req; },
        write(d: any) { emitted.push({ op: 'write', data: String(d) }); return true; },
        end() {
          emitted.push({ op: 'end' });
          queueMicrotask(() => {
            if (script.error) { if (req._error) req._error(new Error(script.error)); return; }
            if (cb) cb(res);
            queueMicrotask(() => { for (const c of (script.chunks || [])) if (res._data) res._data(c); if (res._end) res._end(); });
          });
        },
      };
      return req;
    },
  };
  return { http, emitted };
}

// ── the SCHEDULER boundary (§20: timers + microtasks) + the LIFECYCLE channel (§21) ─────────
// A unit that arms a cancellable resource cannot be audited from outside: once setTimeout belongs to
// the runtime, nobody can tell whether the handle was ever cleared. So the harness owns the timer API
// and records every transition (armed / fired / cancelled), and time only moves when the script says
// `advance`. This is what makes a dropped clearTimer visible: it is a no-op on already-settled state,
// so value and trace stay byte-identical while the resource leaks.
// Proof it earns its keep: experiments/v04-phase2-lifecycle/.
function makeFakeTimers() {
  const events: any[] = [];
  const live = new Map<number, { due: number; fn: Function }>();
  let now = 0, nextId = 1;
  const micro: Function[] = [];
  const api = {
    setTimer(fn: Function, ms: number) { const id = nextId++; live.set(id, { due: now + ms, fn }); events.push({ op: 'armed', id, ms }); return id; },
    clearTimer(id: number) { if (!live.has(id)) return false; live.delete(id); events.push({ op: 'cancelled', id }); return true; },
    schedule(fn: Function) { micro.push(fn); },      // §20's microtask half
    now: () => now,
  };
  // Microtasks run to exhaustion BEFORE each timer callback and again AFTER it — real
  // event-loop semantics, made deterministic. Without this, "the reply's .then chain
  // settled before the timeout fired" would be a fact about machine load rather than
  // about the timeline the oracle scripted.
  function drain(cap = 10000) {
    let n = 0;
    while (micro.length) {
      if (++n > cap) throw new Error('microtask queue did not settle — a scheduling loop');
      (micro.shift() as Function)();
    }
  }
  function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      drain();
      const due = [...live.entries()].filter(([, t]) => t.due <= target).sort((a, b) => a[1].due - b[1].due || a[0] - b[0]);
      if (!due.length) { now = target; drain(); return; }
      const [id, t] = due[0]; now = t.due; live.delete(id); events.push({ op: 'fired', id }); t.fn(); drain();
    }
  }
  // the channel a contract asserts against: the ORDERED transitions plus what was left armed
  const channel = () => ({
    events: events.map((e: any) => (e.op === 'armed' ? `armed(${e.ms}ms)` : e.op)),
    leaked: live.size,
  });
  return { api, advance, channel };
}

// ── §19 PAR: verification over the SPACE of interleavings ────────────────────────────────────
// A concurrent unit's sub-traces settle in an order the runtime picks. To verify over
// interleavings the harness takes that choice away: every deferred completion goes through a
// `gate` the harness resolves, so a SCHEDULE is a list of decisions about which in-flight
// item settles next — and a run becomes a replayable function of that list.
//
// The COVERAGE LADDER is reported, never assumed (SIR_SCHEMA §19): `exhaustive` when the whole
// space was walked, `partial-order-reduction` when independence collapsed it to one
// representative per class, `sampled` when neither was possible. A truncated exploration says
// so — silently checking 500 of 10^12 schedules and printing a checkmark is the failure mode
// this whole channel exists to prevent.
// Proof the explorer is sound: experiments/v04-phase0-pmap/.
function makeGate() {
  const pending = new Map<number, Function>();
  const order: number[] = [];
  let nextId = 1, maxInFlight = 0;
  // §22 LIVENESS: the refinement check is a SAFETY property (the ring invents no
  // outcome the original couldn't). It says nothing about whether the ring keeps
  // moving, and a ring has exactly two ways to stop: the token is LOST (nobody
  // holds it -> the unit halts, producing no outcome at all, which an outcome-set
  // comparison reads as "no outcomes" rather than as a bug) or DUPLICATED (two
  // actors hold it -> the ring silently degenerates into the free unit and its
  // determinism was a coincidence). Both are invisible on the value channel —
  // proven in experiments/v04-phase4-ring/verify-live.mjs, where all three units
  // return the same correct output.
  const tokenEvents: any[] = [];
  const holders = new Set<any>();
  let maxHolders = 0;
  const mark = () => { if (holders.size > maxHolders) maxHolders = holders.size; };
  const api = {
    // the unit calls this for each concurrent slot; the harness decides when it settles
    open(value: any) {
      const id = nextId++;
      return new Promise((resolve) => {
        pending.set(id, () => resolve(value));
        if (pending.size > maxInFlight) maxInFlight = pending.size;
      });
    },
    inFlight: () => [...pending.keys()],
    token: {
      take(who: any) { holders.add(who); mark(); tokenEvents.push(`held(${who})`); },
      pass(from: any, to: any) { holders.delete(from); holders.add(to); mark(); tokenEvents.push(`passed(${from}->${to})`); },
      release(who: any) { holders.delete(who); tokenEvents.push(`released(${who})`); },
    },
  };
  function settle(id: number) { const r = pending.get(id); if (!r) return false; pending.delete(id); order.push(id); r(); return true; }
  const tokenChannel = () => (tokenEvents.length ? {
    events: tokenEvents, maxConcurrentHolders: maxHolders, stillHeld: [...holders],
    mutualExclusion: maxHolders <= 1, returned: holders.size === 0,
  } : null);
  return { api, settle, order, tokenChannel, stats: () => ({ maxInFlight }) };
}

async function runOneSchedule(fn: any, args: any[], decisions: number[]) {
  const gate = makeGate();
  const branches: number[] = [];
  let settledCall = false;
  const call = Promise.resolve(fn(...args, gate.api))
    .then((v: any) => { settledCall = true; return v; },
          (e: any) => { settledCall = true; return { __throw: String(e?.message ?? e) }; });
  let step = 0, halted = false;
  for (;;) {
    await new Promise((r) => setImmediate(r));
    const candidates = gate.api.inFlight();
    if (!candidates.length) {
      // No work in flight. Either the unit finished, or it is waiting on something
      // nobody will ever deliver — a deadlock, which is what a lost token looks
      // like from outside. Reporting it beats hanging on the await below.
      if (settledCall) break;
      halted = true; break;
    }
    branches.push(candidates.length);
    gate.settle(candidates[Math.min(decisions[step] ?? 0, candidates.length - 1)]);
    step++;
  }
  const result = halted ? { __halted: true } : await call;
  return { result, order: gate.order, branches, halted, token: gate.tokenChannel(), ...gate.stats() };
}

async function runPar(fn: any, args: any[], plan: any = {}) {
  const cap = plan.cap ?? 2000;
  const runs: any[] = [];
  let truncated = false;
  async function walk(prefix: number[]) {
    if (runs.length >= cap) { truncated = true; return; }
    const r = await runOneSchedule(fn, args, prefix);
    if (prefix.length >= r.branches.length) { runs.push(r); return; }
    for (let i = 0; i < r.branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  const outcomes = new Set(runs.map((r) => JSON.stringify([r.result, r.maxInFlight])));
  // POR: independent sub-traces collapse to one class — CHECKED, not assumed, before it is
  // used to justify a single representative
  const rung = truncated ? (outcomes.size === 1 ? 'partial-order-reduction' : 'sampled') : 'exhaustive';
  return {
    result: runs[0]?.result,
    par: { schedules: runs.length, exhaustive: !truncated, outcomeClasses: outcomes.size,
           maxInFlight: Math.max(...runs.map((r) => r.maxInFlight)), rung },
  };
}

// ── §22 RING: token-coordinated concurrency, checked as a REFINEMENT ─────────────────────────
// A ring is a single circulating permission — only the holder acts — which collapses the
// interleaving space to one schedule per token order. The property that makes that sound is a
// refinement relation: R_ring ⊆ R_free. A ring may DROP outcomes; it may never INVENT one.
//
// R_free is an ORACLE INPUT, not something rdv can compute here: it comes from the retained
// original at normalization time (§22's "recognize or impose"), stamped into the plan. rdv
// explores the RING unit's own space, then decides:
//   sound       — every ring outcome is a legal free outcome (else the "ring" changed behavior)
//   relation    — `preserving` when R_ring = R_free (a recognized ring),
//                 `refinement` when R_ring ⊂ R_free (an imposed one — which must be DOCUMENTED,
//                 because silently narrowing a unit's behavior is how a verifier lies politely)
// Proof: experiments/v04-phase4-ring/.
async function runRing(fn: any, args: any[], plan: any = {}) {
  const cap = plan.cap ?? 2000;
  const runs: any[] = [];
  let truncated = false;
  async function walk(prefix: number[]) {
    if (runs.length >= cap) { truncated = true; return; }
    const r = await runOneSchedule(fn, args, prefix);
    if (prefix.length >= r.branches.length) { runs.push(r); return; }
    for (let i = 0; i < r.branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  const outcomes = [...new Set(runs.map((r) => JSON.stringify(r.result)))].sort();
  const free: string[] = plan.freeOutcomes ?? [];
  const sound = free.length ? outcomes.every((o) => free.includes(o)) : null;
  const relation = !free.length ? 'unknown'
    : !sound ? 'NOT-A-REFINEMENT'
    : outcomes.length === free.length ? 'preserving' : 'refinement';
  // liveness: safety says the ring invents nothing; this says it keeps moving
  const tokens = runs.map((r) => r.token).filter(Boolean);
  const liveness = tokens.length ? {
    observed: true,
    mutualExclusion: tokens.every((t: any) => t.mutualExclusion),
    returned: tokens.every((t: any) => t.returned),
    halted: runs.some((r) => r.halted),
    events: tokens[0].events,
  } : { observed: false, halted: runs.some((r) => r.halted) };
  return {
    result: runs[0]?.result,
    ring: { outcomes, schedules: runs.length, exhaustive: !truncated,
            freeOutcomes: free.length, sound, relation,
            drops: free.length ? free.length - outcomes.length : null,
            liveness },
  };
}

async function runTrace(fn: any, args: any[]) {
  const [a0, a1, script] = args;                                  // last arg = the scripted boundary
  const { http, emitted } = makeFakeHttp(script || {});
  const timers = makeFakeTimers();
  // A unit that arms timers takes them from the boundary; one that doesn't never touches
  // `.timers`, and its lifecycle channel is simply empty — so this is additive, not a new
  // calling convention. `script.advance` drives virtual time after the call is launched.
  (http as any).timers = timers.api;
  let result: any;
  try {
    const call = Promise.resolve(fn(a0, a1, http));
    // drain pending macrotasks+microtasks (the scripted reply lands through nested
    // queueMicrotask) BEFORE moving virtual time, so a scripted "reply wins the race"
    // is exactly that and not a flush artifact
    for (const ms of (script?.advance || [])) {
      await new Promise((r) => setImmediate(r));
      timers.advance(ms);
    }
    result = await Promise.race([
      call,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: never resolved')), 800)),
    ]);
  } catch (e: any) { result = { __throw: String((e && e.message) || e) }; }
  const lifecycle = timers.channel();
  // omit the channel entirely for units that arm nothing, so existing trace oracles
  // grade byte-identically to before (no expectation appears where none was stamped)
  return lifecycle.events.length ? { emitted, result, lifecycle } : { emitted, result };
}

// Oracle args may carry non-JSON values the build encoded (RegExp/Set/Map/Uint8Array flatten under
// JSON.stringify; bigint THROWS; undefined/NaN/±Infinity -> null; boxed primitives lose class). A trust-nothing
// verifier must reconstruct the EXACT call, so revive them before grading. Tags: { __t:
// 'regex'|'bigint'|'num'|'undef'|'boxed'|'set'|'map'|'u8', ... } — kept in lockstep with the factory codec
// (orchestrator/lib/codec.mjs). Recursive + idempotent on plain values.
const reviveArgs = (args: any[]) => (args || []).map(reviveArg);
function dispArg(v: any): string {
  if (typeof v === 'bigint') return `${v.toString()}n`;
  if (v && typeof v === 'object') {
    if (v.__t === 'undef') return 'undefined';
    if (v.__t === 'regex') return `/${v.source}/${v.flags}`;
    if (v.__t === 'bigint') return `${v.v}n`;
    if (v.__t === 'num') return `${v.v}`;
    if (v.__t === 'boxed') return `new ${v.k}(${dispArg(v.v)})`;
    if (v.__t === 'set') return `new Set([${(v.values || []).map(dispArg).join(', ')}])`;
    if (v.__t === 'map') return `new Map([${(v.entries || []).map(([k, val]: any[]) => `[${dispArg(k)}, ${dispArg(val)}]`).join(', ')}])`;
    if (v.__t === 'u8') return `${v.buf ? 'Buffer' : 'Uint8Array'}.from([${(v.bytes || []).join(', ')}])`;
    if (v.__t === 'sparse') { const parts: string[] = []; let prev = 0; for (const [i, val] of (v.entries || [])) { if (i > prev) parts.push(`<${i - prev} empty>`); parts.push(dispArg(val)); prev = i + 1; } if (v.length > prev) parts.push(`<${v.length - prev} empty>`); return `[${parts.join(', ')}]`; }
  }
  if (Array.isArray(v)) return `[${v.map(dispArg).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).map((k) => JSON.stringify(k) + ': ' + dispArg(v[k])).join(', ')}}`;
  return JSON.stringify(v);
}

// `observe` (SIR v0.2 §11): how the call's behavior is read.
//   'value'        — the return value (default; legacy/back-compat — every pre-0.2 oracle)
//   'result+post'  — KIND STATE: { result, post } where post = the (mutated) args. Required for return≠post
//                    units (pullat-class) whose mutation is invisible to return-only grading; harmless-correct
//                    for mutate-and-return units (result===post). The oracle's expecteds are stamped to match.
//   trace mode is handled separately (injected boundary).
async function gradeVs(srcAbs: string, name: string, vectors: any[], mode = 'vectors', observe = 'value') {
  const fn = await resolveFn(srcAbs, name);
  const gots: any[] = [];
  for (const v of vectors) {
    const args = reviveArgs(v.args);                       // fresh per vector → one call's mutation can't poison the next
    try {
      if (mode === 'ring') gots.push(await runRing(fn, args.slice(0, -1), args[args.length - 1]));
      else if (mode === 'par') gots.push(await runPar(fn, args.slice(0, -1), args[args.length - 1]));
      else if (mode === 'trace') gots.push(await runTrace(fn, args));
      else if (observe === 'result+post') { const result = await fn(...args); gots.push({ result, post: args }); }
      else gots.push(await fn(...args));
    } catch (e: any) { gots.push({ __throw: String(e?.message ?? e) }); }
  }
  return grade(gots, vectors);
}

// Carried data (constant tables shipped verbatim): verify the content hash AND re-run the independent-authority
// assertions on the SHIPPED module — a trust-nothing consumer confirms the bytes match a PUBLISHED standard,
// not the publisher. A carried module with no assertions is NOT independently verifiable -> fails.
async function checkCarried(dir: string, carriedData: any[]) {
  if (!carriedData || !carriedData.length) return { ok: true, report: [] as any[] };
  const report: any[] = []; let ok = true;
  for (const cd of carriedData) {
    const p = resolve(dir, cd.file);
    const hashOk = pinMatches(sha256(p), cd.sha256);
    const assertions = cd.authority?.assertions || [];
    let authOk = false;
    if (assertions.length) {
      try {
        const m: any = await import(p);
        const names = Object.keys(m).filter((k) => k !== 'default');
        const vals = names.map((k) => m[k]);
        authOk = assertions.every((a: any) => {
          let got: any; try { got = Function(...names, '"use strict"; return (' + a.expr + ');')(...vals); } catch { return false; }
          return JSON.stringify(got) === JSON.stringify(a.equals);
        });
      } catch { authOk = false; }
    }
    ok = ok && hashOk && authOk;
    report.push({ file: cd.file, hashOk, authOk, attested: assertions.length > 0 });
  }
  return { ok, report };
}

// One fidelity variant (or the implicit single `package` variant): grade its src against its oracle + verify hashes.
async function checkVariant(dir: string, name: string, v: any) {
  const paths = { oracle: resolve(dir, v.oracle), src: resolve(dir, v.src), sir: resolve(dir, v.sir), spec: v.spec ? resolve(dir, v.spec) : '' };
  const shaOk = (file: string, want: string | undefined) => pinMatches(sha256(file), want);
  const oracle = JSON.parse(readFileSync(paths.oracle, 'utf-8'));
  // Grade the SAME export the oracle was stamped against. A unit whose graded seam is a NAMED export (its unit
  // name != exportName, or a data-object/builder seam exposed under a named export) won't resolve under the unit
  // name — gradeVs would fall through to the non-matching default export and mis-grade. Fall back to the unit
  // name when no exportName is recorded (the existing default-export units; back-compat).
  const g = await gradeVs(paths.src, oracle.exportName ?? name, oracle.heldout || oracle.vectors, oracle.mode, oracle.observe);
  const carried = await checkCarried(dir, v.carriedData);
  const sd = { src: shaOk(paths.src, v.srcSha256), oracle: shaOk(paths.oracle, v.oracleSha256), sir: shaOk(paths.sir, v.sirSha256), spec: !paths.spec || shaOk(paths.spec, v.specSha256) };
  return { frozen: (oracle.vectors || []).length, ...g, sd, hashes: sd.src && sd.oracle && sd.sir && sd.spec, carriedOk: carried.ok, carriedReport: carried.report };
}

// v0.5 §23b: a `lang:<id>` variant — the unit in a target language, graded against the SAME primary oracle through a
// verifier-owned driver. Before any grading: the language file must be BOUND to this unit's primary (its PRIMARY-SHA256 ==
// the canonical sha of the primary == the variant's primarySha256) and declare its own language. Rungs, honestly:
// type-checked (ts: tsc --strict + SIG conformance + the any-ban; js cannot earn it) -> harness-verified (held-out full).
// cross-verified / oracle-anchored are not checked by this rdv, so a claim of either is reported, never echoed as earned.
const srcSha = (p: string) => statSync(p).isDirectory() ? treeSha(p) : sha256(p);

// The SIG (and STATE) of the PRIMARY, in the abstract types every language's driver marshals from.
function primarySig(primaryText: string) {
  const ast = parseSir(primaryText).ast; const sigD = sirGet(ast, 'SIG');
  if (!sigD) throw new Error('the primary declares no SIG');
  const sig: any = parseSig([sigD.args, ...sigD.cont].join(' '));
  const st = sirGet(ast, 'STATE'); if (st) { const m = st.args.match(/^mutates\s+(\w+)/); const idx = m ? sig.args.findIndex((a: any) => a.name === m[1]) : -1;
    if (idx < 0) throw new Error(`STATE must read 'STATE mutates <arg>' naming a SIG argument: ${st.args}`); sig.state = { name: m![1], index: idx }; }
  return { sig, declaredOracle: (sirGet(ast, 'ORACLE')?.args ?? '').match(/CANONICAL-SHA256\s+([0-9a-f]{64})/)?.[1] ?? null };
}
// Grade a lang:<id> artifact on the CANONICAL oracle (sir-canonical-v1: typed values, f64 by bits, no tolerance) through the
// language's verifier-owned driver. Works in a scratch directory: rdv never writes into the bundle it checks.
async function gradeCanonical(lang: string, u: any, srcPath: string, sigLine: string, oracle: any, primaryText: string, ext: any = null) {
  const vsha = vectorSetSha(oracle); const { sig, declaredOracle } = primarySig(primaryText);
  if (vsha !== oracle.canonicalSha256) return { fault: `oracle vectors hash ${vsha.slice(0, 12)}…, the file declares ${String(oracle.canonicalSha256).slice(0, 12)}…` };
  if (declaredOracle && declaredOracle !== vsha) return { fault: `the primary's ORACLE declares ${declaredOracle.slice(0, 12)}…, the vectors hash ${vsha.slice(0, 12)}…` };
  const work = mkdtempSync(join(tmpdir(), `rdv-${lang}-`)); let prepared: any; let ts: any = null;
  try {
    if (lang === 'js') prepared = { typeCheck: { applicable: false, ok: null, report: '' }, callBatch: nativeCaller(await resolveExport(srcPath, sigLine)) };
    else if (lang === 'ts') {
      ts = prepareTs(findTsc([dirname(srcPath), process.cwd()])!, srcPath, sigLine);
      prepared = { typeCheck: { applicable: true, ...ts.typeCheck }, callBatch: ts.emitted ? nativeCaller(await resolveExport(ts.emitted, sigLine))
        : async () => { throw new Error('tsc emitted nothing'); } };
    } else if (lang === 'rust') {
      const crate = join(work, 'rust', 'emit'); cpSync(srcPath, crate, { recursive: true, filter: (p) => p !== join(srcPath, 'target') && !p.startsWith(join(srcPath, 'target') + '/') });   // the crate-root target/ only, as treeSha
      prepared = await rustDriver.prepare(crate, { unit: u.name, labRoot: work, sig, carried: null });
    } else throw new Error(`lang:${lang} has no driver in this rdv`);
    // a failed type-check can leave nothing runnable (no harness binary, no emitted JS): report the failed rung, never crash
    let g: any;
    try { g = await gradeArtifact(prepared, oracle, sig); }
    catch (e: any) { if (prepared.typeCheck.applicable && !prepared.typeCheck.ok) return { g: { pass: 0, total: oracle.heldout.length, full: false, miss: [], narrowed: 0, firstMiss: null },
      typeCheck: { ok: false, report: prepared.typeCheck.report } }; throw e; }
    const narrowed = g.counts.frozen.narrowed + g.counts.heldout.narrowed;
    // the js ENVELOPE EXTENSION (#164): graded through the SAME prepared artifact, its misses named, and `full` needs both slices
    let xg: any = null; if (ext) { try { xg = await gradeExtension(prepared, extensionCases(ext, sig), sig); } catch (e: any) { if (e.verifierFault) return { fault: e.message }; throw e; } }
    const allMisses = [...g.allMisses, ...(xg ? xg.allMisses.map((m: any) => ({ ...m, name: `${m.name} (js extension)` })) : [])];
    return { ext: xg ? { pass: xg.counts.heldout.pass + xg.counts.frozen.pass, ran: xg.counts.heldout.ran + xg.counts.frozen.ran, exact: xg.exact } : null,
      g: { pass: g.counts.heldout.pass, total: g.counts.heldout.ran, full: g.exact && (!xg || xg.exact), miss: allMisses.slice(0, 8).map((m: any) => m.name), narrowed,
      frozenTally: g.frozen, firstMiss: g.misses[0] ?? (xg?.misses?.[0] ?? null) }, typeCheck: prepared.typeCheck.applicable ? { ok: !!prepared.typeCheck.ok, report: prepared.typeCheck.report } : null };
  } finally { ts?.cleanup(); rmSync(work, { recursive: true, force: true }); }
}

async function checkLangVariant(dir: string, u: any, lang: string, v: any) {
  const shaOk = (file: string, want: string | undefined) => pinMatches(srcSha(file), want);
  const langPath = resolve(dir, v.sir), oraclePath = resolve(dir, v.oracle), srcPath = v.src ? resolve(dir, v.src) : '';
  const ast = parseSir(readFileSync(langPath, 'utf-8')).ast;
  const primaryText = readFileSync(resolve(dir, u.sir), 'utf-8'); const primaryCanon = canonicalSha(primaryText);
  const bound = sirGet(ast, 'PRIMARY-SHA256')?.args ?? null, declared = sirGet(ast, 'LANG')?.args ?? null;
  const binding = { ok: declared === lang && bound === primaryCanon && v.primarySha256 === primaryCanon,
    report: declared !== lang ? `LANG ${declared} ≠ ${lang}` : bound !== primaryCanon ? `STALE: bound to ${String(bound).slice(0, 12)}…, primary is ${primaryCanon.slice(0, 12)}…`
      : v.primarySha256 !== primaryCanon ? `manifest primarySha256 ${String(v.primarySha256).slice(0, 12)}… ≠ primary ${primaryCanon.slice(0, 12)}…` : `bound to primary ${primaryCanon.slice(0, 12)}…` };
  const oracle = JSON.parse(readFileSync(oraclePath, 'utf-8'));
  const canonical = oracle.encoding === CANONICAL;
  const held = oracle.heldout || oracle.vectors;
  const sd = { src: !srcPath || shaOk(srcPath, v.srcSha256), oracle: shaOk(oraclePath, v.oracleSha256), sir: shaOk(langPath, v.langSha256 ?? v.sirSha256), spec: true };
  const base = { lang, binding, claimed: v.verified?.rung ?? null, frozen: ((canonical ? oracle.frozen : oracle.vectors) || []).length, sd, hashes: sd.src && sd.oracle && sd.sir };
  // carried data reaches a JS artifact as an attested module; a typed artifact's binding to it (generated declarations) is not
  // built in rdv yet — refuse rather than grade a variant whose tables were never checked
  if (v.carriedData?.length) return { ...base, pass: 0, total: held.length, full: false, miss: [] as string[], typeCheck: null, rung: 'none',
    carriedOk: false, carriedReport: [], note: `carried data in lang:${lang} is not supported by this rdv yet` };
  if (!srcPath) return { ...base, pass: 0, total: 0, full: true, miss: [] as string[], typeCheck: null, rung: 'spec-only', carriedOk: true, carriedReport: [] };
  let typeCheck: { ok: boolean; report: string } | null = null, g: any;
  const sigD = sirGet(ast, 'SIG'); const sigLine = sigD ? [sigD.args, ...sigD.cont].join(' ') : '';
  if (canonical) {
    // the extension file is pinned by the manifest like the shared oracle: a variant that names one must ship it unaltered
    let ext: any = null; if (v.extensionOracle) { const ep = resolve(dir, v.extensionOracle); if (!existsSync(ep) || !shaOk(ep, v.extensionOracleSha256)) return { ...base, sd: { ...sd, oracle: false }, hashes: false, pass: 0, total: held.length, full: false, miss: [] as string[], typeCheck: null, rung: 'none', carriedOk: true, carriedReport: [], note: `extension oracle ${v.extensionOracle} missing or altered` }; ext = JSON.parse(readFileSync(ep, 'utf-8')); }
    const c: any = await gradeCanonical(lang, u, srcPath, sigLine, oracle, primaryText, ext);
    if (c.fault) return { ...base, pass: 0, total: held.length, full: false, miss: [] as string[], typeCheck: null, rung: 'none', carriedOk: true, carriedReport: [], note: `ORACLE FAULT: ${c.fault}` };
    g = c.g; typeCheck = c.typeCheck;
  } else if (lang === 'rust') {
    // a Rust artifact cannot be graded on untyped JS values: the shared oracle must be canonical (§10 sir-canonical-v1)
    return { ...base, pass: 0, total: held.length, full: false, miss: [] as string[], typeCheck: null, rung: 'none', carriedOk: true, carriedReport: [], note: `lang:rust needs a ${CANONICAL} oracle; ${v.oracle} is legacy` };
  } else if (lang === 'js') g = await gradeVs(srcPath, oracle.exportName ?? u.name, held, oracle.mode, oracle.observe);
  else if (lang === 'ts') {
    const tsc = findTsc([dir, process.cwd()]);
    if (!tsc) throw new Error('lang:ts reached grading without a TypeScript compiler');   // the structural gate halts first
    const prep = prepareTs(tsc, srcPath, sigLine);
    try {
      typeCheck = prep.typeCheck;
      g = prep.emitted ? await gradeVs(prep.emitted, oracle.exportName ?? u.name, held, oracle.mode, oracle.observe)
        : { pass: 0, total: held.length, full: false, miss: ['(tsc emitted nothing)'] };
    } finally { prep.cleanup(); }
  } else throw new Error(`lang:${lang} reached grading in an rdv that does not harness it`);
  // no rung on a broken binding: the artifact was graded against a contract its language file was not written for
  const rung = !binding.ok || (typeCheck && !typeCheck.ok) ? 'none' : g.full ? 'harness-verified' : typeCheck ? 'type-checked' : 'none';
  return { ...base, ...g, typeCheck, rung, carriedOk: true, carriedReport: [] };
}

// A v0.5 bundle (specVersion >= 0.5, or any unit carrying a lang: variant) is held to the STRICT v0.5 rules the lab lints at pack
// (cli/sir/validate.mjs: E_COMMENT, register, leak, pin, binding, oracle-sha …) — re-checked consumer-side, never trusted from pack.
const isV05 = (m: any) => (isVersion(m.specVersion) && cmpVer(m.specVersion, '0.5') >= 0) || (m.units || []).some((u: any) => Object.keys(u.variants || {}).some((k) => k.startsWith('lang:')));
const lintV05 = (dir: string, u: any) => validateSir(dir, { mode: 'strict', unit: u.name });

const variantOk = (x: any) => x.full && x.hashes && x.carriedOk && (x.typeCheck?.ok ?? true) && (x.binding?.ok ?? true);

// v0.2 §12: a unit may carry a `variants` map (package | spec | …), each independently verified against its own
// anchor. Absence ⇒ ONE implicit `package` variant from the unit's own fields (back-compat — the 218 shipped units).
async function checkUnit(dir: string, u: any, only: Set<string> | null = null) {
  const entries: [string, any][] = u.variants ? Object.entries(u.variants) : [['package', u]];
  const variants: any[] = [], skipped: string[] = [];
  for (const [vname, v] of entries) if (only && vname.startsWith('lang:') && !only.has(vname.slice(5))) skipped.push(vname); else variants.push({ variant: vname, anchor: v.anchor ?? null,
    ...(vname.startsWith('lang:') ? await checkLangVariant(dir, u, vname.slice(5), v) : await checkVariant(dir, u.name, v)) });
  return { name: u.name, kind: u.kind, sig: u.sig, variants, skipped, ok: variants.every(variantOk) };
}

// `only` = rdv check --lang js[,ts…]: an explicit, partial check — the named languages are graded in full and every other
// lang: variant is reported NOT CHECKED (never "verified"). Without it, a missing toolchain halts the whole check (fail closed).
async function cmdCheck(dir: string, only: Set<string> | null = null) {
  const m = loadManifest(dir);
  if (only) {
    const carried = new Set<string>((m.units || []).flatMap((u: any) => Object.keys(u.variants || {}).filter((k) => k.startsWith('lang:')).map((k) => k.slice(5))));
    const absent = [...only].filter((l) => !carried.has(l));
    if (!carried.size || absent.length) {
      console.log(`${C.b('rdv check')}  ${m.name}@${m.version}`);
      console.log(C.r(`\n  HALTED — --lang ${[...only].join(',')}: ${carried.size ? `this bundle carries no lang:${absent.join(', lang:')} (it carries ${[...carried].map((l) => 'lang:' + l).join(', ')})` : 'this bundle has no per-language variants'}.`)); return 1;
    }
  }
  const sv = specStatus(m, dir, only);
  console.log(`${C.b('rdv check')}  ${m.name}@${m.version}   ${C.dim('source: ' + m.provenance.source)}   ${sv.label}`);
  if (!sv.ok) {
    // name the missing FEATURE when the bundle declared one — "upgrade rdv" is not
    // actionable, "your rdv lacks par-interleaving" is
    const why = sv.languages?.length || sv.missing?.length || sv.toolchains?.length
      ? [sv.missing?.length ? `requires ${sv.missing.join(', ')}; this rdv implements ${[...IMPLEMENTED_FEATURES].join(', ')}` : '',
         sv.languages?.length ? `carries ${sv.languages.map((l) => 'lang:' + l).join(', ')}; this rdv harnesses ${[...HARNESSED_LANGUAGES].join(', ')}` : '',
         sv.toolchains?.length ? `carries ${sv.toolchains.map((l) => 'lang:' + l).join(', ')}, whose toolchain is not on this machine (${sv.toolchains.map((l) => toolchainOf(l)?.hint ?? l).join('; ')})` : '']
          .filter(Boolean).join('; ')
      : sv.reason ? sv.reason
      : `built against SIR spec v${m.specVersion} and declares no \`features\` — without a declared feature set this rdv accepts specVersion ≤ v${SUPPORTED_SPEC}; a newer bundle (v0.5 included) verifies through the feature gate when every feature it declares is implemented here (${[...IMPLEMENTED_FEATURES].join(', ')})`;
    const ready = sv.toolchains?.length && !sv.languages?.length && !sv.missing?.length
      ? [...new Set<string>((m.units || []).flatMap((u: any) => Object.keys(u.variants || {}).filter((k) => k.startsWith('lang:')).map((k) => k.slice(5))))].filter((l) => !sv.toolchains!.includes(l))
      : [];
    console.log(C.r(`\n  HALTED — ${why}. ${sv.toolchains?.length && !sv.languages?.length && !sv.missing?.length ? 'Install it to verify' : 'Upgrade rdv to verify'}.`) +
      (ready.length ? C.dim(`\n  Or check only the languages you have: rdv check ${relative(process.cwd(), dir) || '.'} --lang ${ready.join(',')}`) : '')); return 1;
  }
  let ok = true; const strict = isV05(m); const skippedAll = new Set<string>();
  for (const u of m.units) {
    const r = await checkUnit(dir, u, only);
    const lint = strict ? lintV05(dir, u) : null; if (lint && !lint.ok) r.ok = false;   // a lint error FAILS the unit, whatever it grades
    ok = ok && r.ok;
    const single = r.variants.length === 1 && r.variants[0].variant === 'package';   // back-compat: render exactly as v0.1
    console.log(`  ${r.ok ? C.g('✓ VERIFIED') : C.r('✗ FAILED')}  ${C.b(r.name)} ${C.dim(r.sig)}`);
    if (lint) console.log(`     v0.5 lint ${lint.ok ? C.g('strict OK') : C.r(`${lint.errors.length} ERROR(S)`)}` +
      lint.errors.slice(0, 8).map((e: any) => C.r(`\n       ${e.code} @${e.where}${e.line ? ':' + e.line : ''}${e.msg ? ' ' + e.msg : ''}`)).join('') + (lint.errors.length > 8 ? C.dim(`\n       … ${lint.errors.length - 8} more (sir-validate for the full list)`) : ''));
    for (const v of r.variants) {
      const vgood = variantOk(v);
      const vlabel = single ? '' : `${vgood ? C.g('✓ ') : C.r('✗ ')}${C.b(v.variant)}${v.anchor ? C.dim(` ⟂ ${v.anchor.kind}${v.anchor.ref ? ':' + v.anchor.ref : ''}`) : ''}  `;
      console.log(`     ${vlabel}held-out ${vgood ? C.g(`${v.pass}/${v.total}`) : C.r(`${v.pass}/${v.total}` + (v.miss.length ? ` miss=[${v.miss.join(',')}]` : ''))}` +
        `   hashes ${v.hashes ? C.g('match') : C.r(`MISMATCH (src:${v.sd.src} oracle:${v.sd.oracle} sir:${v.sd.sir} spec:${v.sd.spec})`)}` +
        `   ${C.dim(`(${v.frozen} frozen / ${v.total} held-out, ${r.kind})`)}`);
      if (v.lang) console.log(`     ${C.dim('rung')} ${v.rung === 'harness-verified' ? C.g(v.rung) : v.rung === 'spec-only' ? C.dim(v.rung) : C.r(v.rung)}` +
        (v.claimed && v.claimed !== v.rung ? C.dim(` (bundle claims ${v.claimed}${['cross-verified', 'oracle-anchored'].includes(v.claimed) ? '; this rdv checks up to harness-verified' : ''})`) : '') +
        `   binding ${v.binding.ok ? C.g(v.binding.report) : C.r(v.binding.report)}` +
        (v.typeCheck ? `   ${v.typeCheck.ok ? C.g(v.typeCheck.report) : C.r(v.typeCheck.report)}` : '') + (v.note ? `   ${C.r(v.note)}` : '') +
        (v.narrowed ? C.dim(`   ${v.narrowed} vector(s) narrowed (outside lang:${v.lang}'s envelope)`) : '') +
        (v.firstMiss ? C.r(`\n       first miss (${v.firstMiss.args.join(', ')}) expected ${v.firstMiss.expected} got ${v.firstMiss.got}`) : ''));
      if (v.carriedReport.length) console.log(`     carried-data ${v.carriedOk ? C.g('attested') : C.r('UNVERIFIED')}   ` +
        v.carriedReport.map((c: any) => `${c.file} [hash:${c.hashOk ? 'ok' : C.r('BAD')} authority:${c.authOk ? 'ok' : C.r(c.attested ? 'FAIL' : 'none')}]`).join(' '));
    }
    for (const s of r.skipped) { skippedAll.add(s); console.log(`     ${C.y('– ')}${C.b(s)}  ${C.y('NOT CHECKED')}${C.dim(' (--lang)')}`); }
  }
  if (only && skippedAll.size && ok) {
    console.log(C.y(`\n  VERIFIED FOR ${[...only].map((l) => 'lang:' + l).join(', ')} ONLY — ${[...skippedAll].join(', ')} NOT CHECKED. Drop --lang (with every toolchain installed) for the full check.`));
    return 0;
  }
  console.log(ok ? C.g(`\n  ALL UNITS VERIFIED — shipped src matches its contract.`)
                 : C.r(`\n  VERIFICATION FAILED — do not trust this src; ${isV05(m) ? 're-derive it from its contract with the sir-factory loop (sir-factory prepare → blind emitters → sir-factory grade → pack-v05)' : `rebuild with: rdv resynth ${relative(process.cwd(), dir) || '.'}`}`));   /* resynth halts on v0.5 bundles: never point a user at a command that refuses */
  return ok ? 0 : 1;
}

function buildPrompt(dir: string, u: any, outPath: string) {
  const spec = readFileSync(resolve(dir, u.spec ?? u.sir), 'utf-8').trim();   // a pre-0.2 unit may carry only its sir/
  const oracle = JSON.parse(readFileSync(resolve(dir, u.oracle), 'utf-8'));
  const worked = (oracle.vectors || []).map((v: any) =>
    `  ${u.name}(${(v.args || []).map(dispArg).join(', ')}) -> ${JSON.stringify(v.expected)}`).join('\n');
  return `Unit \`${u.name}\`  signature: ${u.sig}

Spec:
${spec}

Reconstruct an implementation from the spec + the FROZEN ORACLE below (worked input->output;
authoritative — reproduce quirks exactly). You will be scored on FRESH held-out inputs you cannot see.

FROZEN ORACLE:
${worked}

The original source is NOT available and you must NOT look for it (this is an original-deleted
re-emit). Write a self-contained module exporting \`${u.name}\` to EXACTLY: ${outPath}
Then report the path and byte size.`;
}

// v0.5 language variants (a primary sir/<unit>.sir + sir/<unit>.<lang>.sir, a canonical oracle, a driver per language) are not
// re-derivable by this resynth, which knows only the v0.1-v0.4 single-spec unit (u.spec + u.oracle, graded through gradeVs). HALT
// with the way forward rather than crash on the missing u.spec (or, worse, rebuild one language and stamp it as the unit).
const resynthHalt = (m: any): string | null => {
  if (isV05(m)) return 'resynth of v0.5 language variants is not supported in this rdv yet — re-derive with sir-factory (prepare → emit → grade → pack-v05); `rdv check` verifies it';
  const odd = (m.units || []).find((u: any) => !(u.spec ?? u.sir) || !u.oracle || !u.src);   // a variants-only unit: no single spec/oracle/src to rebuild
  return odd ? `unit '${odd.name}' has no single spec/oracle/src to rebuild (a variants-only unit) — resynth is not supported for it in this rdv; \`rdv check\` verifies it` : null;
};

function cmdResynthPrepare(dir: string, unitName: string | null, n: number) {
  const m = loadManifest(dir);
  const halt = resynthHalt(m); if (halt) { console.log(`${C.b('rdv resynth')}  ${m.name}\n${C.r(`\n  HALTED — ${halt}.`)}`); return 1; }
  const units = (unitName ? m.units.filter((u: any) => u.name === unitName) : m.units);
  if (!units.length) { console.log(C.r(`no unit '${unitName}' in ${m.name}`)); return 1; }
  const plan: any = { pkg: m.name, n, units: [] };
  for (const u of units) {
    const rdir = resolve(dir, '.resynth', u.name);
    mkdirSync(rdir, { recursive: true });
    const outs: string[] = [];
    for (let k = 1; k <= n; k++) {
      const outAbs = resolve(rdir, `emit_${k}.ts`);
      writeFileSync(resolve(rdir, `prompt_${k}.txt`), buildPrompt(dir, u, outAbs));
      outs.push(relative(dir, outAbs));
    }
    plan.units.push({ unit: u.name, sig: u.sig, n, promptDir: relative(dir, rdir), emits: outs, heldoutFrom: u.oracle });
  }
  writeFileSync(resolve(dir, '.resynth', 'plan.json'), JSON.stringify(plan, null, 2));
  console.log(`${C.b('rdv resynth (prepare)')}  ${m.name}   n=${n}`);
  for (const pu of plan.units) {
    console.log(`  ${C.dim('•')} ${C.b(pu.unit)} ${C.dim(pu.sig)} → ${n} prompts in ${C.y(pu.promptDir)}/prompt_{1..${n}}.txt`);
  }
  console.log(C.dim(`\n  AGENT (sir-verify skill): spawn one \`sir-reemitter\` per prompt_K.txt IN PARALLEL`));
  console.log(C.dim(`  (Write-only, original-deleted), each writing to its emit_K.ts path. Then:`));
  console.log(`     ${C.b(`rdv resynth ${relative(process.cwd(), dir) || '.'} --apply${unitName ? ' --unit ' + unitName : ''}`)}`);
  console.log(C.dim(`  which grades each emission on the HELD-OUT set, requires quorum (>=2 full), copies the`));
  console.log(C.dim(`  winner into src/, and updates the manifest srcSha256. plan: .resynth/plan.json`));
  return 0;
}

async function cmdResynthApply(dir: string, unitName: string | null) {
  const m = loadManifest(dir);
  const halt = resynthHalt(m); if (halt) { console.log(`${C.b('rdv resynth --apply')}  ${m.name}\n${C.r(`\n  HALTED — ${halt}.`)}`); return 1; }
  const units = (unitName ? m.units.filter((u: any) => u.name === unitName) : m.units);
  let ok = true;
  for (const u of units) {
    const rdir = resolve(dir, '.resynth', u.name);
    const emits = existsSync(rdir) ? readdirSync(rdir).filter((f) => /^emit_\d+\.ts$/.test(f)).sort() : [];
    if (!emits.length) { console.log(C.r(`  ${u.name}: no emissions in ${relative(dir, rdir)} — run prepare + spawn the workers first`)); ok = false; continue; }
    const oracle = JSON.parse(readFileSync(resolve(dir, u.oracle), 'utf-8'));
    const held = oracle.heldout || oracle.vectors;
    const graded: any[] = [];
    // Grade exactly as `rdv check` will: the oracle's stamped export, mode and observe channel. Grading by unit
    // NAME as plain vectors misgraded every named-export, trace, STATE, PAR and ring unit (W.0c) — the same bug
    // class checkVariant already fixed.
    for (const f of emits) graded.push({ f, ...(await gradeVs(resolve(rdir, f), oracle.exportName ?? u.name, held, oracle.mode, oracle.observe)) });
    const q = quorum(graded, 2);
    console.log(`  ${C.b(u.name)}: ` + graded.map((g) => `${g.f.replace('.ts', '')} ${g.full ? C.g(g.pass + '/' + g.total) : C.r(g.pass + '/' + g.total)}`).join('  '));
    if (!q.hasQuorum) { console.log(C.r(`     NO-QUORUM (${q.fullCount}/${graded.length} full) — not applied. Add coverage or escalate the worker tier.`)); ok = false; continue; }
    const winnerFile = graded[q.winnerIdx].f;
    const winner = resolve(rdir, winnerFile);
    const header = `// @rederive/${m.name.split('/').pop()} — verified-recompose of ${u.name} (${m.provenance.source}). ZERO-DEP.\n` +
      `// Rebuilt locally by 'rdv resynth': reconstructed from sir/ + oracles/ with the original deleted;\n` +
      `// quorum ${q.fullCount}/${graded.length}, ${held.length}/${held.length} held-out. Trust your own build, not the publisher's.\n`;
    writeFileSync(resolve(dir, u.src), header + readFileSync(winner, 'utf-8').replace(/^\s+/, ''));
    u.srcSha256 = sha256(resolve(dir, u.src));
    u.verified = { ...(u.verified || {}), mode: oracle.mode ?? 'vectors', frozen: (oracle.vectors || []).length, heldout: held.length, quorum: `${q.fullCount}/${graded.length}` };
    saveManifest(dir, m);
    console.log(C.g(`     QUORUM ${q.fullCount}/${graded.length} → applied ${winnerFile} to ${u.src}; manifest srcSha256 updated to ${u.srcSha256.slice(0, 12)}`));
  }
  console.log(C.dim(`\n  verifying the applied build...`));
  const code = await cmdCheck(dir);
  return ok && code === 0 ? 0 : 1;
}

function cmdVis(dir: string) {
  const m = loadManifest(dir);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const units = m.units.map((u: any) => ({ ...u, sirText: (() => { try { return readFileSync(resolve(dir, u.sir), 'utf-8'); } catch { return ''; } })() }));
  const out = renderVis(m, units, esc);
  writeFileSync(resolve(dir, 'vis.html'), out);
  console.log(`${C.g('wrote')} ${resolve(dir, 'vis.html')}  (${out.length} bytes)`);
  return 0;
}

function renderVis(m: any, units: any[], esc: (s: string) => string) {
  const unitCards = units.map((u) => `
    <div class="unit">
      <div class="uhead"><span class="badge ${u.verified ? 'ok' : 'no'}">${u.verified ? 'VERIFIED ' + u.verified.quorum : 'unverified'}</span>
        <code class="uname">${esc(u.name)}</code> <span class="sig">${esc(u.sig)}</span> <span class="kind">${u.kind}</span></div>
      <div class="meta">oracle: <b>${u.verified?.frozen ?? '?'}</b> frozen / <b>${u.verified?.heldout ?? '?'}</b> held-out · quorum <b>${u.verified?.quorum ?? '?'}</b> · zero-dep</div>
      ${(u.knownLimitations || []).map((l: string) => `<div class="limit">⚠ ${esc(l)}</div>`).join('')}
      <pre class="sir">${esc(u.sirText)}</pre>
      <div class="hashes">src <code>${(u.srcSha256 || '').slice(0, 16)}</code> · oracle <code>${(u.oracleSha256 || '').slice(0, 16)}</code> · spec <code>${(u.specSha256 || '').slice(0, 16)}</code></div>
    </div>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(m.name)} — SIR package</title><style>
:root{--bg:#f6f3ec;--paper:#fffdf8;--ink:#1b1a17;--muted:#6f6a60;--line:#e6ded0;--clay:#c8553d;--teal:#2f6f63;--teal-soft:#dcebe6;--clay-soft:#f0d9d1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:0 24px 64px}h1,h2{font-family:Georgia,ui-serif,serif;letter-spacing:-.01em}
header{padding:56px 0 22px;border-bottom:1px solid var(--line);background:radial-gradient(900px 240px at 15% -40%,var(--clay-soft),transparent 60%)}
h1{font-size:34px;margin:0 0 6px}.tag{display:inline-block;font:600 12px ui-sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--clay);background:var(--clay-soft);padding:6px 10px;border-radius:999px;margin-bottom:16px}
.lede{color:var(--muted);max-width:42em}code{font-family:ui-monospace,Menlo,monospace;font-size:.88em}
.prov{margin-top:18px;font-size:14px;color:var(--muted)}.prov b{color:var(--ink)}
h2{font-size:22px;margin:34px 0 6px}.kicker{font:600 12px ui-sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--teal);margin:0}
.unit{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:14px;box-shadow:0 8px 24px rgba(40,30,15,.05)}
.uhead{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.uname{font-size:17px;font-weight:700}.sig{color:var(--muted);font-family:ui-monospace,monospace;font-size:13px}
.kind{margin-left:auto;font:600 11px ui-monospace;color:var(--muted)}.badge{font:700 11px ui-sans-serif;padding:5px 9px;border-radius:999px}
.badge.ok{background:var(--teal-soft);color:var(--teal)}.badge.no{background:#f1e3df;color:var(--clay)}
.meta{margin-top:8px;font-size:13.5px;color:var(--muted)}.limit{margin-top:8px;font-size:13px;color:var(--clay);background:#fbeee9;border-radius:8px;padding:7px 10px}
pre.sir{margin:10px 0 6px;background:#fbf8f1;border:1px dashed var(--line);border-left:3px solid var(--teal);border-radius:0 8px 8px 0;padding:11px 13px;font-size:12.5px;overflow:auto;white-space:pre-wrap}
.hashes{font-size:11.5px;color:var(--muted)}.trust{background:var(--paper);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-top:14px}
.trust b{color:var(--teal)}.cmd{font-family:ui-monospace,monospace;background:#1b1a17;color:#f6f3ec;border-radius:8px;padding:10px 12px;font-size:13px;margin-top:8px;white-space:pre-wrap}
footer{margin-top:30px;color:var(--muted);font-size:12.5px}
</style></head><body>
<header><div class="wrap"><span class="tag">SIR package · trust-nothing</span>
<h1>${esc(m.name)} <code style="font-size:18px;color:var(--muted)">@${esc(m.version)}</code></h1>
<p class="lede">A verified-recompose of <b>${esc(m.provenance.source)}</b>. This package ships its <b>contract</b> — a SIR spec + a held-out oracle — not bytes you have to trust. Verify the shipped code against the contract, or rebuild it locally from the spec.</p>
<div class="prov">provenance: <b>${esc(m.provenance.source)}</b> · ${esc(m.provenance.sourceRepo || '')} · ${m.zeroDep ? '<b>zero dependency</b> · ' : ''}source sha256 <code>${(m.provenance.sourceSha256 || '').slice(0, 16)}…</code><br>${esc(m.provenance.note || '')}</div>
</div></header>
<div class="wrap">
<section><p class="kicker">What's in here</p><h2>${units.length} verified unit${units.length === 1 ? '' : 's'}</h2>
<p class="lede">Each is a quorum-verified, behavior-locked reconstruction with the original deleted — proven on a held-out set the implementation never saw.</p>
${unitCards}</section>
<section><p class="kicker">How to trust this</p><h2>Check it, or rebuild it</h2>
<div class="trust"><b>Verify the shipped code</b> against its contract — deterministic, no tokens. Fails loudly if the bytes don't match the held-out oracle or the recorded hashes.
<div class="cmd">rdv check .</div></div>
<div class="trust"><b>Rebuild it yourself</b> from the spec — torch some tokens, regenerate <code>src/</code> from <code>sir/</code> + <code>oracles/</code> via N isolated quorum workers. Trust your own build, not the publisher's.
<div class="cmd">rdv resynth .          # prepare worker prompts\nrdv resynth . --apply  # grade, pick quorum, update src/ + manifest</div></div>
</section>
<footer>Generated by <code>rdv vis</code> from <code>sir.manifest.json</code> + <code>sir/</code> + <code>oracles/</code>. The oracle is the source of truth; the source text is fungible.</footer>
</div></body></html>`;
}

// ── rdv audit — declared vs delivered: the REAL dependency surface of a project ─────────────────────────
// You reviewed the dependency choices in package.json; npm resolved an entire tree on your behalf, every node
// of it installable code, some of it with install-time execution rights. This command makes that visible:
//   declared (what you chose) vs delivered (what's actually on the rails), the runtime/dev split, how many
//   packages can run code at install (the worm vector), and how many ship a verifiable contract.
// Lockfile-first (package-lock v2/v3 carries exact dev + hasInstallScript flags); node_modules walk fallback.
function cmdAudit(dir: string, asJson: boolean): number {
  const pjPath = resolve(dir, 'package.json');
  if (!existsSync(pjPath)) { console.log(C.r(`rdv audit: no package.json in ${dir}`)); return 1; }
  const pj = JSON.parse(readFileSync(pjPath, 'utf-8'));
  const declared = { deps: Object.keys(pj.dependencies || {}).length, dev: Object.keys(pj.devDependencies || {}).length };

  type Entry = { name: string; dev: boolean; hook: boolean; diskPath: string };
  const entries: Entry[] = [];
  let source = '';
  const lockPath = resolve(dir, 'package-lock.json');
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf-8'));
    if (lock.packages) {
      source = 'package-lock.json';
      for (const [k, v] of Object.entries(lock.packages) as [string, any][]) {
        const idx = k.lastIndexOf('node_modules/');
        if (idx === -1) continue;
        entries.push({ name: k.slice(idx + 'node_modules/'.length), dev: !!v.dev, hook: !!v.hasInstallScript, diskPath: resolve(dir, k) });
      }
    }
  }
  if (!entries.length) {
    const nm = resolve(dir, 'node_modules');
    if (!existsSync(nm)) { console.log(C.r('rdv audit: no package-lock.json and no node_modules — run npm install (or npm i --package-lock-only) first')); return 1; }
    source = 'node_modules walk (no lockfile — runtime/dev split unavailable)';
    const top = readdirSync(nm).filter((d) => !d.startsWith('.'));
    for (const d of top) {
      if (d.startsWith('@')) { for (const s of readdirSync(resolve(nm, d))) entries.push({ name: `${d}/${s}`, dev: false, hook: false, diskPath: resolve(nm, d, s) }); }
      else entries.push({ name: d, dev: false, hook: false, diskPath: resolve(nm, d) });
    }
  }

  // augment from disk where installed: real scripts (the lockfile flag can lag) + verified-contract detection
  const hookKinds = ['preinstall', 'install', 'postinstall'];
  let verified = 0;
  const hookNames: string[] = [];
  for (const e of entries) {
    try {
      if (existsSync(resolve(e.diskPath, 'package.json'))) {
        const epj = JSON.parse(readFileSync(resolve(e.diskPath, 'package.json'), 'utf-8'));
        if (hookKinds.some((h) => epj.scripts && epj.scripts[h])) e.hook = true;
      }
      if (e.name.startsWith('@rederive/') || existsSync(resolve(e.diskPath, 'sir.manifest.json'))) verified++;
    } catch { /* unreadable package — count it, can't inspect it */ }
    if (e.hook) hookNames.push(e.name);
  }
  const delivered = entries.length;
  const devOnly = entries.filter((e) => e.dev).length;
  const runtime = delivered - devOnly;
  const hooks = hookNames.length;
  const splitKnown = source.startsWith('package-lock');

  if (asJson) {
    console.log(JSON.stringify({ name: pj.name, version: pj.version, declared, delivered, runtime: splitKnown ? runtime : null, devOnly: splitKnown ? devOnly : null, installHooks: hooks, hookPackages: hookNames.sort(), verified, source }, null, 2));
    return 0;
  }
  console.log(`${C.b('rdv audit')}  ${pj.name}@${pj.version}   ${C.dim(source)}`);
  console.log(`  you chose                 ${C.b(String(declared.deps))} dependenc${declared.deps === 1 ? 'y' : 'ies'} ${C.dim(`(+ ${declared.dev} dev)`)}`);
  console.log(`  npm delivered             ${C.y(C.b(String(delivered)))} packages${splitKnown ? `   ${C.dim(`(${runtime} runtime · ${devOnly} dev-only)`)}` : ''}`);
  console.log(`  install-time code rights  ${hooks ? C.r(C.b(String(hooks))) : C.g('0')} ${C.dim('packages carry preinstall/install/postinstall hooks')}`);
  if (hooks) console.log(`  ${C.dim('  → ' + hookNames.sort().slice(0, 8).join(', ') + (hooks > 8 ? `, +${hooks - 8} more` : ''))}`);
  console.log(`  ship a verifiable contract ${verified ? C.g(C.b(String(verified))) : C.r('0')} ${C.dim(`of ${delivered}`)}`);
  console.log('');
  if (!splitKnown) console.log(C.dim('  tip: `npm i --package-lock-only --package-lock=true` writes the exact tree (runtime/dev split) without installing.'));
  console.log(C.dim('  the verify leg needs none of this: `rdv check` runs offline — node + the in-repo bundles, no install.'));
  console.log(C.dim('  shrink the surface: https://rederive.ai/prompt.md  (verify · re-derive · de-dependency)'));
  return 0;
}

// ============================================================================
// guard — dependency-add gate: `rdv guard <base-lock> <head-lock>`
//
// Diffs the deps ADDED/BUMPED between two lockfiles (npm package-lock.json or
// pnpm-lock.yaml) and returns GREEN / YELLOW / RED for a PR gate (GitHub + ADO).
//
// CORE signals are ZERO-NETWORK — they work behind a private registry, which is
// where the target repos live: install hooks (npm lockfile flag / pnpm
// onlyBuiltDependencies grant), @rederive/* catalog membership, direct-vs-transitive.
// GitHub/npm metadata (contributor bus-factor, publish age) are best-effort GARNISH
// that degrade to "unknown" and NEVER block.
//
//   RED    = block. A hook on a NON-established package (worm/typosquat vector).
//   YELLOW = surface. A new direct dep we can't vouch for; a brand-new package.
//   GREEN  = pass. rederive-verified, or a clean add.
//
// Direct-vs-transitive: only NAG at the direct dep the developer chose; roll
// transitives up as a count — EXCEPT a transitive tripping a hard signal (hook)
// is escalated individually. Catches the worm-in-transitives without a wall of text.
// ============================================================================

type GLevel = 'green' | 'yellow' | 'red';
const GLEVELS: Record<GLevel, number> = { green: 0, yellow: 1, red: 2 };
const gworse = (a: GLevel, b: GLevel): GLevel => (GLEVELS[a] >= GLEVELS[b] ? a : b);
interface GDep { name: string; version: string; direct: boolean; hasInstallScript: boolean; from?: string }
interface GGarnish { known: boolean; created: Date | null; contributors: number | null }
interface GEval { level: GLevel; flags: string[] }

// Native-binary / known-good packages whose install hook is a COMPILE STEP, not a worm.
// Offline escape hatch: teams extend this via .dep-guard.json for their private hook-deps.
const GUARD_ALLOWLIST = new Set(['esbuild', 'fsevents', 'sharp', 'node-sass', 'node-gyp', '@swc/core',
  'better-sqlite3', 'canvas', 'bufferutil', 'utf-8-validate', 'deasync', 'ssh2', 'cpu-features',
  '@parcel/watcher', 'lightningcss', '@tailwindcss/oxide', 'playwright', 'puppeteer', 'electron', 'cypress']);
const GUARD_CONTRIB_MIN = 5; // GitHub contributors above which real eyes are on the code (bus factor, not popularity)

function guardKeyToName(key: string): string | null {
  const i = key.lastIndexOf('node_modules/');
  return i === -1 ? null : key.slice(i + 'node_modules/'.length);
}

function guardParseNpm(path: string): Map<string, GDep> {
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  const pkgs = lock.packages || {};
  const root = pkgs[''] || {};
  const direct = new Set<string>([...Object.keys(root.dependencies || {}), ...Object.keys(root.devDependencies || {}), ...Object.keys(root.optionalDependencies || {})]);
  const byName = new Map<string, GDep>();
  for (const [key, v] of Object.entries<any>(pkgs)) {
    if (key === '') continue;
    const name = guardKeyToName(key);
    if (!name) continue;
    if (!byName.has(name) || key === 'node_modules/' + name)
      byName.set(name, { name, version: v.version || '', hasInstallScript: !!v.hasInstallScript, direct: direct.has(name) });
  }
  return byName;
}

function guardParsePnpm(path: string): Map<string, GDep> {
  const lines = readFileSync(path, 'utf8').split('\n');
  const byName = new Map<string, GDep>();
  const directNames = new Set<string>();
  let section = '';
  for (const line of lines) {
    if (/^[a-zA-Z]/.test(line)) { section = line.split(':')[0]; continue; }
    if (section === 'packages' && line.startsWith('  ') && line[2] !== ' ' && line.trimEnd().endsWith(':')) {
      const k = line.trim().replace(/:$/, '').replace(/^['"]|['"]$/g, '');
      const at = k.lastIndexOf('@');
      if (at > 0) { const name = k.slice(0, at); if (!byName.has(name)) byName.set(name, { name, version: k.slice(at + 1), direct: false, hasInstallScript: false }); }
    } else if (section === 'importers' && line.startsWith('      ') && line[6] !== ' ' && line.trimEnd().endsWith(':')) {
      const name = line.trim().replace(/:$/, '').replace(/^['"]|['"]$/g, '');
      if (!['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].includes(name)) directNames.add(name);
    }
  }
  for (const name of directNames) {
    if (byName.has(name)) byName.get(name)!.direct = true;
    else byName.set(name, { name, version: '', direct: true, hasInstallScript: false });
  }
  const pkgPath = join(dirname(path), 'package.json'); // pnpm hook signal = onlyBuiltDependencies grant
  if (existsSync(pkgPath)) { try { const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); for (const name of (pkg.pnpm?.onlyBuiltDependencies || [])) if (byName.has(name)) byName.get(name)!.hasInstallScript = true; } catch { /* ignore */ } }
  return byName;
}

const guardLoad = (path: string): Map<string, GDep> => (path.endsWith('pnpm-lock.yaml') ? guardParsePnpm : guardParseNpm)(path);

function guardDiff(base: Map<string, GDep>, head: Map<string, GDep>): { added: GDep[]; bumped: GDep[] } {
  const added: GDep[] = [], bumped: GDep[] = [];
  for (const [name, h] of head) { const b = base.get(name); if (!b) added.push(h); else if (b.version !== h.version) bumped.push({ ...h, from: b.version }); }
  return { added, bumped };
}

async function guardFetchJson(url: string, ms = 1500): Promise<any> {
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), ms); const r = await fetch(url, { signal: c.signal }); clearTimeout(t); return r.ok ? await r.json() : null; } catch { return null; }
}

async function guardContributors(owner: string, repo: string): Promise<number | null> {
  const headers: Record<string, string> = { 'user-agent': 'rdv-guard', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 2000);
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors?per_page=1&anon=true`, { headers, signal: c.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const link = r.headers.get('link');
    const last = link && link.match(/[?&]page=(\d+)>;\s*rel="last"/);
    if (last) return parseInt(last[1], 10);
    const arr = await r.json();
    return Array.isArray(arr) ? arr.length : null;
  } catch { return null; }
}

async function guardGarnish(name: string): Promise<GGarnish> {
  const pack = await guardFetchJson(`https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`);
  const created = pack?.time?.created ? new Date(pack.time.created) : null;
  const url: string | undefined = typeof pack?.repository === 'string' ? pack.repository : pack?.repository?.url;
  const m = url && url.match(/github\.com[/:]([^/]+)\/([^/.#]+)/i);
  const contributors = m ? await guardContributors(m[1], m[2]) : null;
  return { known: !!pack, created, contributors };
}

function guardEstablished(name: string, g: GGarnish | null): { yes: boolean; why: string } {
  if (GUARD_ALLOWLIST.has(name)) return { yes: true, why: 'allowlisted native dep' };
  if (g && g.contributors !== null && g.contributors >= GUARD_CONTRIB_MIN) return { yes: true, why: `${g.contributors}+ contributors` };
  return { yes: false, why: g && g.contributors !== null ? `only ${g.contributors} contributor(s)` : 'contributors unknown (private/offline)' };
}

function guardEval(dep: GDep, kind: 'added' | 'bumped', g: GGarnish | null): GEval {
  const flags: string[] = [];
  let level: GLevel = 'green';
  const verified = dep.name.startsWith('@rederive/');
  if (verified) flags.push('rederive-verified');
  if (dep.hasInstallScript) {
    const est = guardEstablished(dep.name, g);
    if (est.yes) flags.push(`install hook — established (${est.why}), treated as a build step`);
    else { flags.push(`install hook on non-established package (${est.why}) — worm vector; allowlist it if it's a known-safe native dep`); level = 'red'; }
  }
  if (kind === 'added' && dep.direct && !verified && level !== 'red') { flags.push('new unverified dependency'); level = gworse(level, 'yellow'); }
  if (g && g.created) { const age = (Date.now() - g.created.getTime()) / 86400000; if (age < 30) { flags.push(`brand-new package (${Math.round(age)}d old — typosquat window)`); level = gworse(level, 'yellow'); } }
  if (g && !g.known) flags.push('registry: unknown (private/offline — not blocking)');
  return { level, flags };
}

async function cmdGuard(basePath: string, headPath: string, reporter: string): Promise<number> {
  const { added, bumped } = guardDiff(guardLoad(basePath), guardLoad(headPath));
  const results: (GDep & GEval & { kind: string })[] = [];
  for (const d of added) { const g = (d.direct || d.hasInstallScript) ? await guardGarnish(d.name) : null; results.push({ ...d, kind: 'added', ...guardEval(d, 'added', g) }); }
  for (const d of bumped) { const g = d.hasInstallScript ? await guardGarnish(d.name) : null; results.push({ ...d, kind: 'bumped', ...guardEval(d, 'bumped', g) }); }
  const overall = results.reduce<GLevel>((a, r) => gworse(a, r.level), 'green');

  if (reporter === 'json') { console.log(JSON.stringify({ overall, counts: { added: added.length, bumped: bumped.length }, results }, null, 2)); return overall === 'red' ? 1 : 0; }

  const nags = results.filter((r) => r.direct || r.level === 'red');
  const transitives = results.filter((r) => !r.direct && r.level !== 'red');
  const dot = { green: C.g('●'), yellow: C.y('●'), red: C.r('●') } as Record<GLevel, string>;
  if (reporter === 'github') {
    for (const r of nags) { const lvl = r.level === 'red' ? 'error' : r.level === 'yellow' ? 'warning' : 'notice'; console.log(`::${lvl} title=dep-guard::${r.name}@${r.version} — ${r.flags.join('; ')}`); }
  } else if (reporter === 'ado') {
    for (const r of nags.filter((x) => x.level !== 'green')) console.log(`##vso[task.logissue type=${r.level === 'red' ? 'error' : 'warning'}]dep-guard: ${r.name}@${r.version} — ${r.flags.join('; ')}`);
  } else {
    console.log(`\n  ${dot[overall]} ${C.b('dep-guard: ' + overall.toUpperCase())}   ${C.dim(`(${added.length} added, ${bumped.length} bumped)`)}\n`);
    for (const r of nags) { console.log(`  ${dot[r.level]} ${r.name}@${r.version}${r.from ? C.dim(' (from ' + r.from + ')') : ''}${r.direct ? '' : C.dim(' [transitive]')}`); for (const f of r.flags) console.log(`      ${C.dim('· ' + f)}`); }
    if (transitives.length) console.log(`\n  ${C.dim(`+ ${transitives.length} transitive dep(s) added, none tripped a hard signal (rolled up).`)}`);
    console.log(`\n  ${C.dim(`GitHub check: ${overall === 'red' ? 'failure' : overall === 'yellow' ? 'neutral' : 'success'}  ·  ADO: ${overall === 'red' ? 'error + exit 1' : overall === 'yellow' ? 'warning' : 'pass'}`)}\n`);
  }
  return overall === 'red' ? 1 : 0;
}

// `rdv init [dir] [flags]` — its own usage block AND its own flag whitelist. A second
// consumer ran `init --help` expecting help and instead got the generic frame silently
// written into their repo, because nothing here ever checked what flags init actually
// understood. --help/-h and any unrecognized flag must be caught BEFORE cmdInit runs.
const INIT_USAGE = [
  'usage: rdv init [dir] [--lang L --type T] [--profiles-dir P] [--marketplace S]',
  '                [--yes] [--dry-run] [--adopt] [--force-adopt] [--prune-agents]',
  '                [--refresh PATH ...] [--force]',
  '                install the rederive frame into a project (CLAUDE.md/AGENTS.md section,',
  '                contract guard + verify hooks, agent roster, pre-commit + CI seal); with',
  '                --lang/--type, also scaffolds that profile (using the PROFILE\'s own hook',
  '                scripts/workflow/pre-commit body when it ships them, the generic frame\'s',
  '                otherwise), wires the plugin marketplace, writes rederive.lock, runs doctor',
  '                bare init (no --lang/--type) PLANS by default: it prints what it would do',
  '                and writes nothing unless run at a TTY (prompts y/N) or given --yes',
  '                --dry-run: print the plan for either form and exit 0, writing nothing',
  '                --adopt: replace an unmanaged CLAUDE.md/AGENTS.md duplicate of the section',
  '                with the managed one; NEVER drops content — any line with no counterpart',
  '                in the managed section is kept verbatim in a "## Project rules" section',
  '                --force-adopt: like --adopt but DROPS what --adopt would have kept (prints',
  '                what it drops) — the explicit opt-in to losing project-specific content',
  '                --prune-agents: delete .claude/agents/sir-*.md (files/symlinks only) —',
  '                stale project copies the plugin roster (--lang/--type) supersedes',
  '                --refresh PATH: force-sync a profile-shipped file or directory (repeatable;',
  '                a directory expands to every file under it) that init\'s normal write-only-',
  '                if-absent rule would otherwise never re-touch. Refused if the repo\'s copy',
  '                has diverged from what rederive.lock recorded at the last init (local',
  '                edits) — pass --force to overwrite it anyway (prints what it overwrites)',
].join('\n');
// `rdv --help` — every command, one block each (the header comment at the top of this file is the long form)
const USAGE = [
  'rdv — the trust-nothing package manager (rederive). A package ships its CONTRACT (SIR spec + held-out oracle), not trusted bytes.',
  '',
  'usage: rdv <command> [args]',
  '',
  ...INIT_USAGE.split('\n').map((l, i) => i ? l : '  ' + l.replace(/^usage: /, '')),
  '  rdv doctor [dir] [--brief] [--strict] [--profiles-dir P]',
  '                compare the live judge (plugin/sir-factory/typikon/rdv/toolchain) to rederive.lock; --brief prints one',
  '                line (for a SessionStart hook), --strict exits 1 on DRIFT/MISSING (for CI)',
  '  rdv claude [claude-args…] [--init] [--allow-api-key]',
  '                report whether the optional sir-factory/typikon are found, init the repo if it is not (--init),',
  '                then exec the real `claude` with your args; refuses while ANTHROPIC_API_KEY is set unless',
  '                --allow-api-key',
  '  rdv check <pkgdir>',
  '                verify src/ against the held-out oracle + content hashes (deterministic, no tokens); a v0.5',
  '                bundle is also held to the strict v0.5 SIR lint; js/ts/rust variants each graded by their driver',
  '  rdv check <pkgdir> --lang js[,ts,rust]',
  '                a PARTIAL check: grade only the named languages, report every other lang: variant NOT CHECKED',
  '                (exit 0 only if every named language verifies). Without --lang, a missing toolchain halts',
  '  rdv vis <pkgdir>',
  '                (re)generate vis.html from the SIR + manifest (no tokens)',
  '  rdv audit [dir] [--json]',
  '                declared vs delivered: the real dependency surface of a project (package-lock or node_modules),',
  '                install hooks included',
  '  rdv resynth <pkgdir> [--unit U] [--n 3]',
  '                PREPARE a local rebuild: write ready-to-spawn worker prompts + a plan (.resynth/plan.json)',
  '  rdv resynth <pkgdir> --apply [--unit U]',
  '                APPLY the workers\' output: grade vs held-out, pick a quorum emission, update src/ + manifest,',
  '                re-verify (v0.1-v0.4 bundles; v0.5 language variants halt — re-derive those with sir-factory)',
  '  rdv guard <base-lock> <head-lock> [--reporter human|github|ado|json]',
  '                gate a PR\'s dependency ADDS (npm/pnpm) → green/yellow/red; RED = install hook on a',
  '                non-established dep',
  '  rdv --version | --help',
].join('\n');
const INIT_VALUE_FLAGS = new Set(['--lang', '--type', '--profiles-dir', '--marketplace', '--refresh']);
const INIT_FLAGS = new Set([...INIT_VALUE_FLAGS, '--yes', '--dry-run', '--adopt', '--force-adopt', '--prune-agents', '--force', '--help', '-h']);
function validateInitArgs(argv: string[]): { help: boolean; unknown?: string } {
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('-')) continue; // positional (the target dir) — not a flag
    if (a === '--help' || a === '-h') { help = true; continue; }
    if (!INIT_FLAGS.has(a)) return { help: false, unknown: a };
    if (INIT_VALUE_FLAGS.has(a)) i++; // its value is consumed, not a flag itself
  }
  return { help };
}

async function main() {
  const [cmd, dirArg] = process.argv.slice(2);
  // ANY token starting with '-' is a flag, single- or double-dash — never the target dir
  // ('-h' used to resolve to a literal directory named "-h").
  const dir = resolve(dirArg && !dirArg.startsWith('-') ? dirArg : '.');
  const has = (f: string) => process.argv.includes(f);
  const arg = (name: string, d: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : d; };
  const argOpt = (name: string): string | undefined => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
  // repeatable value flags (--refresh PATH --refresh PATH …) — argOpt only ever finds the FIRST
  const argAll = (name: string): string[] => {
    const out: string[] = [];
    for (let i = 0; i < process.argv.length; i++) if (process.argv[i] === name && process.argv[i + 1] !== undefined) out.push(process.argv[i + 1]);
    return out;
  };
  const unit = has('--unit') ? arg('--unit', '') : null;
  try {
    if (cmd === '--version' || cmd === '-v') {
      const { version, commit } = rdvInfo();
      console.log(commit ? `rdv ${version} (${commit})` : `rdv ${version}`);
      process.exit(0);
    }
    if (cmd === 'init') {
      const v = validateInitArgs(process.argv.slice(3));
      if (v.unknown) { console.error(`rdv init: unknown flag '${v.unknown}'\n`); console.error(INIT_USAGE); process.exit(2); }
      if (v.help) { console.log(INIT_USAGE); process.exit(0); } // asking for help isn't an error — scripts/shells expect 0
      process.exit(await cmdInit(dir, {
        lang: argOpt('--lang'), type: argOpt('--type'), profilesDir: argOpt('--profiles-dir'),
        marketplace: argOpt('--marketplace'), yes: has('--yes'), dryRun: has('--dry-run'),
        adopt: has('--adopt'), forceAdopt: has('--force-adopt'), pruneAgents: has('--prune-agents'),
        refresh: argAll('--refresh'), force: has('--force'),
      }));
    }
    if (cmd === 'doctor') process.exit(cmdDoctor(dir, { brief: has('--brief'), strict: has('--strict'), profilesDir: argOpt('--profiles-dir') }));
    if (cmd === 'claude') process.exit(await cmdClaude(process.cwd(), process.argv.slice(3), process.env));
    if (cmd === 'check') {
      const langs = argOpt('--lang');
      if (has('--lang') && (!langs || langs.startsWith('-'))) { console.error('rdv check: --lang needs a value, e.g. --lang js or --lang js,ts'); process.exit(2); }
      const only = langs ? new Set(langs.split(',').map((l) => l.trim()).filter(Boolean)) : null;
      process.exit(await cmdCheck(dir, only));
    }
    if (cmd === 'vis') process.exit(cmdVis(dir));
    if (cmd === 'audit') process.exit(cmdAudit(dir, has('--json')));
    if (cmd === 'resynth') process.exit(has('--apply') ? await cmdResynthApply(dir, unit) : cmdResynthPrepare(dir, unit, parseInt(arg('--n', '3'), 10)));
    if (cmd === 'guard') {
      const [, baseLock, headLock] = process.argv.slice(2);
      if (!baseLock || !headLock || baseLock.startsWith('--')) { console.log('usage: rdv guard <base-lock> <head-lock> [--reporter human|github|ado|json]'); process.exit(2); }
      process.exit(await cmdGuard(baseLock, headLock, arg('--reporter', 'human')));
    }
    // --help/-h/help is a request, not an error: exit 0 (scripts and shells expect it); no/unknown command is a usage error: exit 2
    const askedHelp = cmd === '--help' || cmd === '-h' || cmd === 'help';
    if (cmd && !askedHelp) console.error(`rdv: unknown command '${cmd}'\n`);
    (askedHelp ? console.log : console.error)(USAGE);
    process.exit(askedHelp ? 0 : 2);
  } catch (e: any) { if (e?.userFacing) { console.error(`rdv: ${e.message}`); process.exit(1); } console.error('rdv error:', e?.stack ?? e?.message ?? e); process.exit(1); }
}
main();
