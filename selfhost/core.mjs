// selfhost/core.mjs [--out <dir>] [--only u1,u2] [--name @rederive/x] — rederive's own kernel as ONE v0.5 bundle, @rederive/rederive-core
// (or, with --only and --name, another verified bundle: @rederive/review-core is the review system's units)
// (REDERIVE_SELF_PLAN, "the bootstrapping step": rdv N checks rdv N+1's core). Every VERIFIED selfhost unit is packed by
// sir-factory's pack-v05 — which refuses anything it cannot back (unbound family, lint, no quorum, no license) and deletes a
// bundle unless `rdv check` verifies it as written — then the per-unit bundles are merged into one manifest and the WHOLE
// bundle is checked again by this rdv. A unit that is not verified, or that pack refuses, is listed and left out; it is never
// shipped half-checked. Default out: selfhost/core/rederive-core (replaced on every run: it is a build product of units/).
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, cpSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)); const REPO = resolve(HERE, '..');
const FACTORY = process.env.SIR_FACTORY ?? join(homedir(), 'sir-factory');
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const OUT = resolve(opt('--out', join(HERE, 'core', 'rederive-core')));
const only = opt('--only', null)?.split(',');
const NAME = opt('--name', '@rederive/rederive-core');
const { packV05 } = await import(pathToFileURL(join(FACTORY, 'lib', 'pack-v05.mjs')).href);
const { detectFeatures, specVersionFor } = await import(pathToFileURL(join(REPO, 'cli', 'features.mjs')).href);
const auth = JSON.parse(readFileSync(join(HERE, 'AUTHORITY.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version;

// a unit is VERIFIED when its last grade said so: decision.json next === 'accept' (every language in quorum, every rung)
const units = readdirSync(join(HERE, 'units')).sort().filter((u) => (!only || only.includes(u)) && !existsSync(join(HERE, 'units', u, 'SUPERSEDED.md')));   // a retired unit is history, not part of the core
const packed = [], left = [];
const scratch = mkdtempSync(join(tmpdir(), 'rederive-core-'));
for (const u of units) {
  const dp = join(HERE, 'units', u, 'runs', 'decision.json');
  const d = existsSync(dp) ? JSON.parse(readFileSync(dp, 'utf8')) : null;
  if (d?.next !== 'accept') { left.push([u, d ? `last grade: ${d.next} (round ${d.round})` : 'never graded']); continue; }
  try { const r = packV05({ unitDir: join(HERE, 'units', u), packagesDir: scratch, name: `core-${u}`, version }); packed.push({ unit: u, dir: r.dir, languages: r.languages }); console.log(`  packed ${u}: ${r.languages.join(', ')} (rdv check verified)`); }
  catch (e) { left.push([u, e.message.split('\n')[0].replace(/^refuse to pack \S+: /, 'pack refused: ')]); }
}
if (!packed.length) { console.error('core: nothing verified to pack'); process.exit(1); }

// ---- merge: the files of every unit bundle (unit-named, so they never collide) and their manifest units
rmSync(OUT, { recursive: true, force: true }); for (const d of ['sir', 'oracles', 'src']) mkdirSync(join(OUT, d), { recursive: true });
const manifestUnits = []; const sirFiles = []; const variantsAll = {};
for (const p of packed) {
  const m = JSON.parse(readFileSync(join(p.dir, 'sir.manifest.json'), 'utf8'));
  for (const d of ['sir', 'oracles']) cpSync(join(p.dir, d), join(OUT, d), { recursive: true });
  for (const f of readdirSync(join(p.dir, 'src'))) if (f !== 'index.js') cpSync(join(p.dir, 'src', f), join(OUT, 'src', f), { recursive: true });
  for (const mu of m.units) { manifestUnits.push({ ...mu, authority: m.provenance.source }); for (const [k, v] of Object.entries(mu.variants)) { variantsAll[`${mu.name}:${k}`] = v; sirFiles.push(v.sir); } }
}
rmSync(scratch, { recursive: true, force: true });
// features: the UNION of what every unit's own contract uses (one detector), and the spec version that union needs
const features = [...new Set(manifestUnits.flatMap((mu) => detectFeatures({ sirText: readFileSync(join(OUT, mu.sir), 'utf8'), sirFiles: Object.values(mu.variants).map((v) => v.sir), variants: mu.variants })))];
const manifest = { name: NAME, version, zeroDep: true, specVersion: specVersionFor(features), features,
  provenance: { source: `rederive@${auth.commit}`, sourceRepo: 'rederive/rederive', license: 'Apache-2.0', decompiledBy: "rederive's own v0.5 loop on itself (selfhost/): a cold sighted decomposer per unit, an oracle stamped from the pinned authority, blind re-emitters per language, verifier-owned drivers", capturedAt: new Date().toISOString().slice(0, 10),
    note: 'each unit names the authority its oracle was stamped from (units[].authority); every one reproduces on the current kernel (selfhost/regress.test.mjs)' },
  units: manifestUnits };
writeFileSync(join(OUT, 'sir.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(OUT, 'src', 'index.js'), packed.filter((p) => p.languages.includes('js')).map((p) => `export * as ${p.unit} from './${p.unit}.mjs';`).join('\n') + '\n');
writeFileSync(join(OUT, 'package.json'), JSON.stringify({ name: NAME, version, private: true,
  description: "rederive's trust kernel, re-derived by rederive: every unit a contract (SIR + held-out oracle) with verified js, ts and rust implementations. Verify with `npx -p rederive rdv check .` (the npm name `rdv` belongs to an unrelated package).",
  license: 'Apache-2.0', type: 'module', main: 'src/index.js', exports: { '.': './src/index.js' }, sir: 'sir.manifest.json', dependencies: {} }, null, 2) + '\n');
cpSync(join(REPO, 'LICENSE'), join(OUT, 'LICENSE'));
writeFileSync(join(OUT, 'README.md'), `# ${NAME}

rederive's own trust kernel, given the rederive treatment (\`selfhost/\`, REDERIVE_SELF_PLAN). ${packed.length} units — the
canonical codec, the SIR parser and lints, the gates, the graders — each shipped as its **contract**: a primary SIR, a
language file per language, one held-out oracle stamped from a pinned rederive commit, and implementations written blind
from the contract and kept only on quorum. \`rdv check .\` re-verifies every one; the rdv doing the checking is the
code these units re-derive.

| unit | languages | stamped from |
|---|---|---|
${packed.map((p) => `| ${p.unit} | ${p.languages.join(', ')} | ${manifestUnits.find((m) => m.name === p.unit).authority} |`).join('\n')}
${left.length ? `\nNot in this build:\n\n${left.map(([u, why]) => `- ${u}: ${why}`).join('\n')}\n` : ''}`);

// ---- the whole bundle, checked once more by this rdv
const r = spawnSync(process.execPath, [join(REPO, 'dist', 'cli.cjs'), 'check', OUT], { encoding: 'utf8' });
const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '');
console.log(out.split('\n').filter((l) => /VERIFIED|✗|FAIL|HALT|rdv check/.test(l)).join('\n'));
console.log(`\ncore: ${packed.length} unit(s) in ${OUT}${left.length ? `; left out: ${left.map(([u]) => u).join(', ')}` : ''}`);
for (const [u, why] of left) console.log(`  - ${u}: ${why}`);
process.exit(r.status === 0 ? 0 : 1);
