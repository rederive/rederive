// Builds the Phase 2a gate fixture (SIR_V05_PLAN Phase 2, `@fixture/lang`, TypeScript half): the shipped @rederive/bytes
// bundle with its v0.5 contract family and a `lang:ts` variant, all taken from the v0.5 lab (sir-lab/v05-lang units/bytes:
// js/ts/rust 3/3, cross-verified 1976/1976). The lab's primary takes the `<unit>.sir` name the v0.5 bundle contract gives it;
// the package variant keeps its own v0.4 SIR as bytes-v04.sir (a hyphen: `<x>.<y>.sir` names a language file).
//   bundle/            — correct: lang:ts is the quorum-kept emit_1.ts. Must VERIFY at harness-verified.
//   controls/widened/  — emit_1.ts with ONLY its return type widened (+ `| undefined`). Behavior is identical, so held-out
//                        passes; it must FAIL at type-checked alone.
//   controls/stale/    — the primary's text changed after bytes.ts.sir was bound to it (the manifest re-stamped to the new
//                        primary, as a publisher would). It must FAIL on the binding alone.
// Run: node experiments/v05-p2-lang-ts/stamp.mjs   (from the rederive root; needs ~/sir-lab/v05-lang)
import { cpSync, copyFileSync, readFileSync, writeFileSync, rmSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { canonicalSha } from '../../cli/sir/sir-parse.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const LAB = join(homedir(), 'sir-lab/v05-lang/units/bytes');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function build(out, { tsSrc = readFileSync(join(LAB, 'runs/ts/emit_1.ts'), 'utf8'), primaryEdit = null } = {}) {
  rmSync(out, { recursive: true, force: true });
  cpSync(join(HERE, '../../packages/bytes'), out, { recursive: true });
  renameSync(join(out, 'sir/bytes.sir'), join(out, 'sir/bytes-v04.sir'));
  copyFileSync(join(LAB, 'sir/bytes.sir'), join(out, 'sir/bytes.sir'));
  copyFileSync(join(LAB, 'sir/bytes.ts.sir'), join(out, 'sir/bytes.ts.sir'));
  if (primaryEdit) writeFileSync(join(out, 'sir/bytes.sir'), primaryEdit(readFileSync(join(out, 'sir/bytes.sir'), 'utf8')));
  writeFileSync(join(out, 'src/bytes.ts'), tsSrc);
  const mp = join(out, 'sir.manifest.json'); const m = JSON.parse(readFileSync(mp, 'utf8')); const u = m.units[0];
  const pkg = { sir: 'sir/bytes-v04.sir', sirSha256: sha(join(out, 'sir/bytes-v04.sir')), oracle: u.oracle, oracleSha256: u.oracleSha256, src: u.src, srcSha256: u.srcSha256 };
  const ts = { lang: 'ts', sir: 'sir/bytes.ts.sir', langSha256: sha(join(out, 'sir/bytes.ts.sir')),
    primarySha256: canonicalSha(readFileSync(join(out, 'sir/bytes.sir'), 'utf8')),
    oracle: u.oracle, oracleSha256: u.oracleSha256, src: 'src/bytes.ts', srcSha256: sha(join(out, 'src/bytes.ts')),
    verified: { rung: 'harness-verified', lab: 'sir-lab/v05-lang units/bytes round 1: ts 3/3, cross 1976/1976' } };
  m.name = '@fixture/lang-ts'; m.specVersion = '0.5'; m.features = ['vectors', 'lang-variant'];
  u.sir = 'sir/bytes.sir'; u.sirSha256 = sha(join(out, 'sir/bytes.sir'));
  u.variants = { package: pkg, 'lang:ts': ts };
  writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
  console.log(`wrote ${out}`);
}

build(join(HERE, 'bundle'));
const good = readFileSync(join(LAB, 'runs/ts/emit_1.ts'), 'utf8');
const widened = good.replace('): string | number | null {', '): string | number | null | undefined {');
if (widened === good) throw new Error('emit_1.ts no longer has the expected return annotation');
build(join(HERE, 'controls/widened'), { tsSrc: widened });
build(join(HERE, 'controls/stale'), { primaryEdit: (t) => {
  const e = t.replace(/^(R1\b.*)$/m, '$1 (restated)');
  if (e === t) throw new Error('primary has no R1 line to edit');
  return e;
} });
