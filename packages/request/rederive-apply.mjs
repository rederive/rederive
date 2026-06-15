// Grade the re-emitted @rederive/request units on HELD-OUT, take quorum, apply winners, build manifest.
// (rdv resynth --apply only handles .ts emits; these are plain .js, so this is the .js equivalent.)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const threw = (x) => x && typeof x === 'object' && '__throw' in x;

async function gradeEmit(emitAbs, name, vectors) {
  const mod = await import(pathToFileURL(emitAbs).href);
  const fn = mod[name] ?? mod.default ?? Object.values(mod).find((x) => typeof x === 'function');
  let pass = 0; const miss = [];
  for (const v of vectors) {
    let got; try { got = await fn(...v.args); } catch (e) { got = { __throw: String((e && e.message) || e) }; }
    if ((threw(got) && threw(v.expected)) || eq(got, v.expected)) pass++; else if (miss.length < 8) miss.push(v.name);
  }
  return { pass, total: vectors.length, full: pass === vectors.length, miss };
}

const UNITS = [
  { name: 'paramsHaveRequestBody', kind: 'FUNCTIONAL', sig: '(params) => any' },
  { name: 'toBase64', kind: 'FUNCTIONAL', sig: '(str) => string' },
  { name: 'getProxyFromURI', kind: 'EFFECT', sig: '(uri, env) => string | null', boundary: 'env.read (NO_PROXY/HTTP_PROXY/...) — injected as env for record/replay' },
];
const PROV = 'request@2.88.2 lib/helpers.js';
mkdirSync(resolve(DIR, 'src'), { recursive: true });
const units = []; let ok = true;

for (const u of UNITS) {
  const rdir = resolve(DIR, '.resynth', u.name);
  const oracle = JSON.parse(readFileSync(resolve(DIR, 'oracles', u.name + '.json'), 'utf8'));
  const held = oracle.heldout || oracle.vectors;
  const emits = readdirSync(rdir).filter((f) => /^emit_\d+\.js$/.test(f)).sort();
  const graded = [];
  for (const f of emits) graded.push({ f, ...(await gradeEmit(resolve(rdir, f), u.name, held)) });
  console.log(`  ${u.name}: ` + graded.map((g) => `${g.f.replace('.js', '')} ${g.pass}/${g.total}${g.full ? '' : ' miss[' + g.miss + ']'}`).join('  '));
  const full = graded.filter((g) => g.full);
  if (full.length < 2) { console.log(`     NO-QUORUM (${full.length}/${graded.length} full)`); ok = false; continue; }
  const winner = resolve(rdir, full[0].f);
  const header = `// @rederive/request — verified-recompose of ${u.name} (${PROV}). ZERO-DEP.\n` +
    `// Re-derived by quorum from sir/ + oracles/ (stamped from the real original, then deleted);\n` +
    `// quorum ${full.length}/${graded.length}, ${held.length}/${held.length} held-out. Trust your own build.\n`;
  writeFileSync(resolve(DIR, 'src', u.name + '.js'), header + readFileSync(winner, 'utf8').replace(/^\s+/, ''));
  const srcSha = sha(resolve(DIR, 'src', u.name + '.js'));
  console.log(`     QUORUM ${full.length}/${graded.length} -> applied ${full[0].f} -> src/${u.name}.js (${srcSha.slice(0, 12)})`);
  units.push({
    name: u.name, kind: u.kind, sig: u.sig,
    ...(u.boundary ? { boundary: u.boundary } : {}),
    sir: `sir/${u.name}.sir`, sirSha256: sha(resolve(DIR, 'sir', u.name + '.sir')),
    oracle: `oracles/${u.name}.json`, oracleSha256: sha(resolve(DIR, 'oracles', u.name + '.json')),
    src: `src/${u.name}.js`, srcSha256: srcSha,
    verified: { mode: 'vectors', frozen: oracle.vectors.length, heldout: held.length, quorum: `${full.length}/${graded.length}`, capturedFrom: PROV, at: '2026-06-15' },
    spec: `specs/${u.name}.md`, specSha256: sha(resolve(DIR, 'specs', u.name + '.md')),
  });
}

writeFileSync(resolve(DIR, 'src', 'index.js'),
  `// @rederive/request — verified PURE helper core of request@2.88.2 (the HTTP effect spine is NOT here).\n` +
  UNITS.map((u) => `export { ${u.name} } from './${u.name}.js';`).join('\n') + '\n');

const manifest = {
  name: '@rederive/request', version: '2.88.2-rdv.1', zeroDep: true,
  provenance: {
    source: 'request@2.88.2', sourceRepo: 'github.com/request/request', sourceFile: 'lib/helpers.js',
    note: 'pure helper core + one EFFECT leaf (getProxyFromURI, env boundary verified by record/replay injection) of the deprecated request HTTP client; oracles stamped by executing the real original, then re-derived original-deleted (quorum). The NET/HTTP EMIT trace (the actual send) is declared in sir/MODULE.sir and remains the frontier.',
    decompiledBy: 'sir decompile (SIR Schema v0.1)', capturedAt: '2026-06-15',
  },
  module: 'sir/MODULE.sir',
  units,
};
writeFileSync(resolve(DIR, 'sir.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(ok ? '\nmanifest written.' : '\nNO-QUORUM on some unit — manifest partial.');
process.exit(ok ? 0 : 1);
