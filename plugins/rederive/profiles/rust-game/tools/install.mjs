// tools/install.mjs <unit> --from runs/rust/emit_<k>   |   --check [<unit>]
// INSTALL: copy the accepted rust emission BYTE-EXACT into crates/<unit>/ and record what was installed
// (crates/<unit>/INSTALLED.json: the emission path, sha256 per file, the primary's canonical sha, the oracle's
// canonical sha, the grade round and quorum from runs/decision.json). The crate is the unit's export surface and
// nothing else; the sim depends on it by path. Editing the crate is never the fix — edit the contract, re-emit.
// CHECK: every installed crate's files hash to what INSTALLED.json recorded, and the recorded primary sha still
// equals the current primary's PRIMARY-SHA256 in the language file (a contract edit since install = STALE).
// Exit 0 only when every checked crate is byte-exact and current. No network, no tokens.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync, cpSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path'; import { createHash } from 'node:crypto'; import { fileURLToPath } from 'node:url';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..'); const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; }; const flag = (k) => argv.includes(k);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const walk = (d, base = d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? (f === 'target' ? [] : walk(p, base)) : [relative(base, p)]; }).sort();
const KEEP = (rel) => rel === 'Cargo.toml' || rel.startsWith('src/');   // the artifact: manifest + sources; never a lockfile, never target/
const primaryShaOf = (unit) => (readFileSync(join(REPO, 'units', unit, 'sir', `${unit}.rust.sir`), 'utf8').match(/^PRIMARY-SHA256\s+([0-9a-f]{64})/m) || [])[1] ?? null;
if (flag('--check')) {
  const units = argv.filter((a) => !a.startsWith('--')); const dirs = units.length ? units.map((u) => join(REPO, 'crates', u)) : readdirSync(join(REPO, 'crates')).map((u) => join(REPO, 'crates', u)).filter((d) => existsSync(join(d, 'INSTALLED.json')));
  let bad = 0;
  for (const d of dirs) {
    const unit = relative(join(REPO, 'crates'), d); const ip = join(d, 'INSTALLED.json');
    if (!existsSync(ip)) { console.log(`${unit.padEnd(20)} NOT INSTALLED (no INSTALLED.json)`); bad++; continue; }
    const rec = JSON.parse(readFileSync(ip, 'utf8')); const now = Object.fromEntries(walk(d).filter(KEEP).map((r) => [r, sha(join(d, r))]));
    const drift = [...new Set([...Object.keys(rec.files), ...Object.keys(now)])].filter((r) => rec.files[r] !== now[r]);
    const cur = primaryShaOf(unit); const stale = cur !== rec.primarySha256;
    const ok = !drift.length && !stale; if (!ok) bad++;
    console.log(`${unit.padEnd(20)} ${ok ? 'BYTE-EXACT + CURRENT' : drift.length ? `DRIFT ${drift.join(', ')}` : ''}${stale ? ` STALE (primary ${String(cur).slice(0, 12)}… ≠ installed ${String(rec.primarySha256).slice(0, 12)}…)` : ''}  from ${rec.from} (round ${rec.round}, quorum ${rec.quorum})`);
  }
  process.exit(bad ? 1 : 0);
}
const unit = argv.find((a) => !a.startsWith('--')); const from = opt('--from');
if (!unit || !from) { console.log('usage: tools/install <unit> --from runs/rust/emit_<k>   |   tools/install --check [<unit>…]'); process.exit(2); }
const unitDir = join(REPO, 'units', unit); const src = resolve(unitDir, from); const dst = join(REPO, 'crates', unit);
if (!existsSync(join(src, 'Cargo.toml')) || !existsSync(join(src, 'src', 'lib.rs'))) { console.log(`install: STOP — ${from} is not a library crate (Cargo.toml + src/lib.rs)`); process.exit(1); }
const dp = join(unitDir, 'runs', 'decision.json'); if (!existsSync(dp)) { console.log('install: STOP — no runs/decision.json; grade first'); process.exit(1); }
const dec = JSON.parse(readFileSync(dp, 'utf8')); const rust = dec.perLang?.rust ?? dec.langs?.rust ?? dec.rust ?? null;   // grade writes perLang
// exact membership in the grade's kept list — a substring test let emit_1 pass on a kept emit_10 (scar 2026-09-25)
const kept = (rust?.kept ?? []).includes(relative(unitDir, src).replace(/\/$/, ''));
if (dec.next !== 'accept') { console.log(`install: STOP — decision.json next=${dec.next}, not accept`); process.exit(1); }
if (!kept) { console.log(`install: STOP — ${from} is not named as a kept emission in runs/decision.json`); process.exit(1); }
const oracle = JSON.parse(readFileSync(join(unitDir, 'oracles', `${unit}.json`), 'utf8'));
if (existsSync(dst)) rmSync(dst, { recursive: true }); mkdirSync(dst, { recursive: true });
for (const r of walk(src).filter(KEEP)) { mkdirSync(dirname(join(dst, r)), { recursive: true }); cpSync(join(src, r), join(dst, r)); }
const files = Object.fromEntries(walk(dst).filter(KEEP).map((r) => [r, sha(join(dst, r))]));
const rec = { unit, from: relative(REPO, src), installedAt: new Date().toISOString(), files, primarySha256: primaryShaOf(unit), oracleCanonicalSha256: oracle.canonicalSha256 ?? null, round: dec.round ?? null, quorum: rust?.quorum ?? rust?.kept ?? null, decision: relative(REPO, dp) };
writeFileSync(join(dst, 'INSTALLED.json'), JSON.stringify(rec, null, 2) + '\n');
console.log(`installed ${unit} <- ${rec.from}: ${Object.keys(files).length} file(s) byte-exact into crates/${unit}/  primary ${String(rec.primarySha256).slice(0, 12)}…  oracle ${String(rec.oracleCanonicalSha256).slice(0, 12)}…  round ${rec.round} quorum ${rec.quorum}`);
