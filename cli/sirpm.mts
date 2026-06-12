#!/usr/bin/env -S npx tsx
/**
 * sirpm — the trust-nothing package manager.
 *
 * A SIR package ships its CONTRACT (the SIR spec + a held-out oracle), not trusted bytes.
 * A consumer either VERIFIES the shipped implementation against that contract (`check`, deterministic,
 * free) or REBUILDS it locally from the spec (`resynth`, torches tokens, quorum-verified) — never
 * trusting the publisher's binary. The oracle is the independent source of truth nobody upstream can move.
 *
 *   sirpm check   <pkgdir>            verify src/ against the held-out oracle + content hashes  (no tokens)
 *   sirpm vis     <pkgdir>            (re)generate vis.html from the SIR + manifest             (no tokens)
 *   sirpm resynth <pkgdir> [--unit U] re-emit src/ from the spec + oracle, quorum-verify        (torches tokens)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
const C = { g: (s: string) => `\x1b[32m${s}\x1b[39m`, r: (s: string) => `\x1b[31m${s}\x1b[39m`,
  y: (s: string) => `\x1b[33m${s}\x1b[39m`, dim: (s: string) => `\x1b[90m${s}\x1b[39m`, b: (s: string) => `\x1b[1m${s}\x1b[22m` };

function loadManifest(dir: string) {
  return JSON.parse(readFileSync(resolve(dir, 'sir.manifest.json'), 'utf-8'));
}

async function resolveFn(srcAbs: string, name: string) {
  const mod: any = await import(srcAbs);
  return mod[name] ?? mod.run ?? mod.default ?? Object.values(mod).find((x) => typeof x === 'function');
}

async function checkUnit(dir: string, u: any) {
  const oraclePath = resolve(dir, u.oracle), srcPath = resolve(dir, u.src), sirPath = resolve(dir, u.sir);
  const oracleShaOk = !u.oracleSha256 || sha256(oraclePath) === u.oracleSha256;
  const srcShaOk = !u.srcSha256 || sha256(srcPath) === u.srcSha256;
  const sirShaOk = !u.sirSha256 || sha256(sirPath) === u.sirSha256;
  const oracle = JSON.parse(readFileSync(oraclePath, 'utf-8'));
  const held = oracle.heldout || oracle.vectors;
  const fn = await resolveFn(srcPath, u.name);
  let pass = 0; const miss: string[] = [];
  for (const v of held) {
    let got: any;
    try { got = await fn(...v.args); } catch (e: any) { got = { __throw: String(e?.message ?? e) }; }
    const threw = (x: any) => x && typeof x === 'object' && '__throw' in x;
    if ((threw(got) && threw(v.expected)) || eq(got, v.expected)) pass++;
    else if (miss.length < 8) miss.push(v.name);
  }
  const full = pass === held.length;
  return { name: u.name, kind: u.kind, sig: u.sig, srcShaOk, oracleShaOk, sirShaOk,
    pass, total: held.length, full, miss, frozen: (oracle.vectors || []).length };
}

async function cmdCheck(dir: string) {
  const m = loadManifest(dir);
  console.log(`${C.b('sirpm check')}  ${m.name}@${m.version}   ${C.dim('source: ' + m.provenance.source)}`);
  let ok = true;
  for (const u of m.units) {
    const r = await checkUnit(dir, u);
    const hashes = r.srcShaOk && r.oracleShaOk && r.sirShaOk;
    const good = r.full && hashes;
    ok = ok && good;
    const badge = good ? C.g('✓ VERIFIED') : C.r('✗ FAILED');
    console.log(`  ${badge}  ${C.b(r.name)} ${C.dim(r.sig)}`);
    console.log(`     held-out ${good ? C.g(`${r.pass}/${r.total}`) : C.r(`${r.pass}/${r.total}` + (r.miss.length ? ` miss=[${r.miss.join(',')}]` : ''))}` +
      `   hashes ${hashes ? C.g('match') : C.r(`MISMATCH (src:${r.srcShaOk} oracle:${r.oracleShaOk} sir:${r.sirShaOk})`)}` +
      `   ${C.dim(`(${r.frozen} frozen / ${r.total} held-out, kind ${r.kind})`)}`);
  }
  console.log(ok ? C.g(`\n  ALL UNITS VERIFIED — shipped src matches its contract.`)
                 : C.r(`\n  VERIFICATION FAILED — do not trust this src; rebuild with: sirpm resynth ${dir}`));
  return ok ? 0 : 1;
}

function cmdVis(dir: string) {
  const m = loadManifest(dir);
  const units = m.units.map((u: any) => {
    const sir = (() => { try { return readFileSync(resolve(dir, u.sir), 'utf-8'); } catch { return ''; } })();
    return { ...u, sirText: sir };
  });
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const out = renderVis(m, units, esc);
  const target = resolve(dir, 'vis.html');
  writeFileSync(target, out);
  console.log(`${C.g('wrote')} ${target}  (${out.length} bytes)`);
  return 0;
}

function cmdResynth(dir: string, unit: string | null, n: number) {
  const m = loadManifest(dir);
  const units = unit ? m.units.filter((u: any) => u.name === unit) : m.units;
  console.log(`${C.b('sirpm resynth')}  ${m.name}@${m.version}   n=${n}`);
  console.log(C.y('  This is the token-torching local rebuild: for each unit, re-emit src/ from'));
  console.log(C.y('  sir/ + oracles/ via N isolated Write-only workers (original deleted), then quorum-verify.'));
  for (const u of units) {
    console.log(`  ${C.dim('•')} ${C.b(u.name)} ${C.dim(u.sig)}  ←  ${u.sir} + ${u.oracle}  (held-out ${u.verified?.heldout ?? '?'})`);
  }
  console.log(C.dim(`\n  Substrate not wired into this CLI build. Drive the re-emit via either:`));
  console.log(C.dim(`    • the sir-verify skill (interactive, in Claude Code — cheap, no API key), or`));
  console.log(C.dim(`    • experiments/sir-toolkit/verify.py <bundle> (claude -p), or a direct Messages-API worker.`));
  console.log(C.dim(`  Then 'sirpm check ${dir}' must pass and the manifest srcSha256 is updated to the new emission.`));
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
      <div class="hashes">src <code>${(u.srcSha256 || '').slice(0, 16)}</code> · oracle <code>${(u.oracleSha256 || '').slice(0, 16)}</code></div>
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
<div class="cmd">sirpm check .</div></div>
<div class="trust"><b>Rebuild it yourself</b> from the spec — torch some tokens, regenerate <code>src/</code> from <code>sir/</code> + <code>oracles/</code> via N isolated quorum workers. Trust your own build, not the publisher's.
<div class="cmd">sirpm resynth . --n 3</div></div>
</section>
<footer>Generated by <code>sirpm vis</code> from <code>sir.manifest.json</code> + <code>sir/</code> + <code>oracles/</code>. The oracle is the source of truth; the source text is fungible.</footer>
</div></body></html>`;
}

async function main() {
  const [cmd, dirArg] = process.argv.slice(2);
  const dir = resolve(dirArg || '.');
  const arg = (name: string, d: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : d; };
  try {
    if (cmd === 'check') process.exit(await cmdCheck(dir));
    if (cmd === 'vis') process.exit(cmdVis(dir));
    if (cmd === 'resynth') process.exit(cmdResynth(dir, process.argv.includes('--unit') ? arg('--unit', '') : null, parseInt(arg('--n', '3'), 10)));
    console.log('usage: sirpm <check|vis|resynth> <pkgdir> [--unit U] [--n 3]');
    process.exit(2);
  } catch (e: any) { console.error('sirpm error:', e?.message ?? e); process.exit(1); }
}
main();
