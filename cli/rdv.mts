/**
 * rederive (CLI: rdv) — the trust-nothing package manager.
 *
 * A SIR package ships its CONTRACT (the SIR spec + a held-out oracle), not trusted bytes.
 * A consumer either VERIFIES the shipped implementation against that contract (`check`, deterministic,
 * free) or REBUILDS it locally from the spec (`resynth`, torches tokens, quorum-verified) — never
 * trusting the publisher's binary. The oracle is the independent source of truth nobody upstream can move.
 *
 *   rdv check   <pkgdir>             verify src/ against the held-out oracle + content hashes  (no tokens)
 *   rdv vis     <pkgdir>             (re)generate vis.html from the SIR + manifest             (no tokens)
 *   rdv resynth <pkgdir> [--unit U]  PREPARE a local rebuild: write ready-to-spawn worker prompts + a plan
 *   rdv resynth <pkgdir> --apply     APPLY the workers' output: grade vs held-out, pick a quorum
 *                                      emission, update src/ + manifest, re-verify (deterministic)
 *
 * The prepare/apply split is the wiring to the interactive sir-verify skill: a plain CLI cannot spawn
 * Claude Code subagents, so `resynth` (prepare) emits the prompts and the SKILL spawns N `sir-reemitter`
 * workers, then `resynth --apply` does the deterministic selection + manifest update.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { grade, quorum, hashHex } from './verdict.mts';

const sha256 = (path: string) => hashHex(readFileSync(path));
const C = { g: (s: string) => `\x1b[32m${s}\x1b[39m`, r: (s: string) => `\x1b[31m${s}\x1b[39m`,
  y: (s: string) => `\x1b[33m${s}\x1b[39m`, dim: (s: string) => `\x1b[90m${s}\x1b[39m`, b: (s: string) => `\x1b[1m${s}\x1b[22m` };

const loadManifest = (dir: string) => JSON.parse(readFileSync(resolve(dir, 'sir.manifest.json'), 'utf-8'));
const saveManifest = (dir: string, m: any) => writeFileSync(resolve(dir, 'sir.manifest.json'), JSON.stringify(m, null, 2) + '\n');

// SIR Schema version this rdv understands. A package stamps `manifest.specVersion`; a trust-nothing consumer
// must NOT verify against a contract format it doesn't fully understand, so a NEWER spec halts (upgrade rdv).
// Absent specVersion = pre-0.2 (v0.1) bundle — verifies normally (back-compat for the existing catalog).
const SUPPORTED_SPEC = '0.2';
const cmpVer = (a: string, b: string) => {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
};
const specStatus = (m: any): { ok: boolean; label: string } => {
  const v = m.specVersion;
  if (!v) return { ok: true, label: C.dim('spec v0.1 (legacy/unstamped)') };
  if (cmpVer(String(v), SUPPORTED_SPEC) > 0) return { ok: false, label: C.r(`spec v${v} > rdv ${SUPPORTED_SPEC}`) };
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

async function runTrace(fn: any, args: any[]) {
  const [a0, a1, script] = args;                                  // last arg = the scripted boundary
  const { http, emitted } = makeFakeHttp(script || {});
  let result: any;
  try {
    result = await Promise.race([
      Promise.resolve(fn(a0, a1, http)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: never resolved')), 800)),
    ]);
  } catch (e: any) { result = { __throw: String((e && e.message) || e) }; }
  return { emitted, result };
}

// Oracle args may carry non-JSON values the build encoded (RegExp/Set/Map/Uint8Array flatten under
// JSON.stringify; bigint THROWS; undefined/NaN/±Infinity -> null; boxed primitives lose class). A trust-nothing
// verifier must reconstruct the EXACT call, so revive them before grading. Tags: { __t:
// 'regex'|'bigint'|'num'|'undef'|'boxed'|'set'|'map'|'u8', ... } — kept in lockstep with the factory codec
// (orchestrator/lib/codec.mjs). Recursive + idempotent on plain values.
function reviveArg(v: any): any {
  if (Array.isArray(v)) return v.map(reviveArg);
  if (v && typeof v === 'object') {
    if (v.__t === 'undef') return undefined;
    if (v.__t === 'regex') return new RegExp(v.source, v.flags);
    if (v.__t === 'bigint') return BigInt(v.v);
    if (v.__t === 'num') return Number(v.v);
    if (v.__t === 'boxed') { const x = reviveArg(v.v); return v.k === 'Number' ? new Number(x) : v.k === 'String' ? new String(x) : new Boolean(x); }
    if (v.__t === 'set') return new Set((v.values || []).map(reviveArg));
    if (v.__t === 'map') return new Map((v.entries || []).map(([k, val]: any[]) => [reviveArg(k), reviveArg(val)]));
    if (v.__t === 'u8') return v.buf ? Buffer.from(v.bytes) : Uint8Array.from(v.bytes);
    if (v.__t === 'sparse') { const a = new Array(v.length); for (const [i, val] of (v.entries || [])) a[i] = reviveArg(val); return a; }
    const o: any = {}; for (const k of Object.keys(v)) o[k] = reviveArg(v[k]); return o;
  }
  return v;
}
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
      if (mode === 'trace') gots.push(await runTrace(fn, args));
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
    const hashOk = !cd.sha256 || sha256(p) === cd.sha256;
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
  const shaOk = (file: string, want: string | undefined) => !want || sha256(file) === want;
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

// v0.2 §12: a unit may carry a `variants` map (package | spec | …), each independently verified against its own
// anchor. Absence ⇒ ONE implicit `package` variant from the unit's own fields (back-compat — the 218 shipped units).
async function checkUnit(dir: string, u: any) {
  const entries: [string, any][] = u.variants ? Object.entries(u.variants) : [['package', u]];
  const variants: any[] = [];
  for (const [vname, v] of entries) variants.push({ variant: vname, anchor: v.anchor ?? null, ...(await checkVariant(dir, u.name, v)) });
  return { name: u.name, kind: u.kind, sig: u.sig, variants, ok: variants.every((x) => x.full && x.hashes && x.carriedOk) };
}

async function cmdCheck(dir: string) {
  const m = loadManifest(dir);
  const sv = specStatus(m);
  console.log(`${C.b('rdv check')}  ${m.name}@${m.version}   ${C.dim('source: ' + m.provenance.source)}   ${sv.label}`);
  if (!sv.ok) { console.log(C.r(`\n  HALTED — built against SIR spec v${m.specVersion}, newer than this rdv (understands ≤ v${SUPPORTED_SPEC}). Upgrade rdv to verify.`)); return 1; }
  let ok = true;
  for (const u of m.units) {
    const r = await checkUnit(dir, u);
    ok = ok && r.ok;
    const single = r.variants.length === 1 && r.variants[0].variant === 'package';   // back-compat: render exactly as v0.1
    console.log(`  ${r.ok ? C.g('✓ VERIFIED') : C.r('✗ FAILED')}  ${C.b(r.name)} ${C.dim(r.sig)}`);
    for (const v of r.variants) {
      const vgood = v.full && v.hashes && v.carriedOk;
      const vlabel = single ? '' : `${vgood ? C.g('✓ ') : C.r('✗ ')}${C.b(v.variant)}${v.anchor ? C.dim(` ⟂ ${v.anchor.kind}${v.anchor.ref ? ':' + v.anchor.ref : ''}`) : ''}  `;
      console.log(`     ${vlabel}held-out ${vgood ? C.g(`${v.pass}/${v.total}`) : C.r(`${v.pass}/${v.total}` + (v.miss.length ? ` miss=[${v.miss.join(',')}]` : ''))}` +
        `   hashes ${v.hashes ? C.g('match') : C.r(`MISMATCH (src:${v.sd.src} oracle:${v.sd.oracle} sir:${v.sd.sir} spec:${v.sd.spec})`)}` +
        `   ${C.dim(`(${v.frozen} frozen / ${v.total} held-out, ${r.kind})`)}`);
      if (v.carriedReport.length) console.log(`     carried-data ${v.carriedOk ? C.g('attested') : C.r('UNVERIFIED')}   ` +
        v.carriedReport.map((c: any) => `${c.file} [hash:${c.hashOk ? 'ok' : C.r('BAD')} authority:${c.authOk ? 'ok' : C.r(c.attested ? 'FAIL' : 'none')}]`).join(' '));
    }
  }
  console.log(ok ? C.g(`\n  ALL UNITS VERIFIED — shipped src matches its contract.`)
                 : C.r(`\n  VERIFICATION FAILED — do not trust this src; rebuild with: rdv resynth ${relative(process.cwd(), dir) || '.'}`));
  return ok ? 0 : 1;
}

function buildPrompt(dir: string, u: any, outPath: string) {
  const spec = readFileSync(resolve(dir, u.spec), 'utf-8').trim();
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

function cmdResynthPrepare(dir: string, unitName: string | null, n: number) {
  const m = loadManifest(dir);
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
  const units = (unitName ? m.units.filter((u: any) => u.name === unitName) : m.units);
  let ok = true;
  for (const u of units) {
    const rdir = resolve(dir, '.resynth', u.name);
    const emits = existsSync(rdir) ? readdirSync(rdir).filter((f) => /^emit_\d+\.ts$/.test(f)).sort() : [];
    if (!emits.length) { console.log(C.r(`  ${u.name}: no emissions in ${relative(dir, rdir)} — run prepare + spawn the workers first`)); ok = false; continue; }
    const oracle = JSON.parse(readFileSync(resolve(dir, u.oracle), 'utf-8'));
    const held = oracle.heldout || oracle.vectors;
    const graded: any[] = [];
    for (const f of emits) graded.push({ f, ...(await gradeVs(resolve(rdir, f), u.name, held)) });
    const q = quorum(graded);
    console.log(`  ${C.b(u.name)}: ` + graded.map((g) => `${g.f.replace('.ts', '')} ${g.full ? C.g(g.pass + '/' + g.total) : C.r(g.pass + '/' + g.total)}`).join('  '));
    if (!q.hasQuorum) { console.log(C.r(`     NO-QUORUM (${q.fullCount}/${graded.length} full) — not applied. Add coverage or escalate the worker tier.`)); ok = false; continue; }
    const winnerFile = graded[q.winnerIdx].f;
    const winner = resolve(rdir, winnerFile);
    const header = `// @rederive/${m.name.split('/').pop()} — verified-recompose of ${u.name} (${m.provenance.source}). ZERO-DEP.\n` +
      `// Rebuilt locally by 'rdv resynth': reconstructed from sir/ + oracles/ with the original deleted;\n` +
      `// quorum ${q.fullCount}/${graded.length}, ${held.length}/${held.length} held-out. Trust your own build, not the publisher's.\n`;
    writeFileSync(resolve(dir, u.src), header + readFileSync(winner, 'utf-8').replace(/^\s+/, ''));
    u.srcSha256 = sha256(resolve(dir, u.src));
    u.verified = { ...(u.verified || {}), mode: 'vectors', frozen: (oracle.vectors || []).length, heldout: held.length, quorum: `${q.fullCount}/${graded.length}` };
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

async function main() {
  const [cmd, dirArg] = process.argv.slice(2);
  const dir = resolve(dirArg && !dirArg.startsWith('--') ? dirArg : '.');
  const has = (f: string) => process.argv.includes(f);
  const arg = (name: string, d: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : d; };
  const unit = has('--unit') ? arg('--unit', '') : null;
  try {
    if (cmd === 'check') process.exit(await cmdCheck(dir));
    if (cmd === 'vis') process.exit(cmdVis(dir));
    if (cmd === 'audit') process.exit(cmdAudit(dir, has('--json')));
    if (cmd === 'resynth') process.exit(has('--apply') ? await cmdResynthApply(dir, unit) : cmdResynthPrepare(dir, unit, parseInt(arg('--n', '3'), 10)));
    console.log('usage: rdv <check|vis|audit|resynth> <pkgdir> [--unit U] [--n 3] [--apply] [--json]');
    process.exit(2);
  } catch (e: any) { console.error('rdv error:', e?.stack ?? e?.message ?? e); process.exit(1); }
}
main();
