// Builds the F.2 A6 fixture: the shipped @rederive/bytes bundle plus a `lang:rust` variant taken from the v0.5 lab
// (sir-lab/v05-lang units/bytes: the rust language file + a quorum-kept rust emission, js/ts/rust 3/3, 1976/1976).
// It is a SHAPE fixture for the capability gates — what a v0.5 bundle looks like to an rdv — not a bundle any rdv can
// verify today: no released rdv has a Rust driver, which is exactly what the gates must say.
// Run: node experiments/v05-f2-lang-variant/stamp.mjs   (from the rederive root; needs ~/sir-lab/v05-lang)
import { cpSync, copyFileSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const OUT = join(HERE, 'bundle');
const LAB = join(homedir(), 'sir-lab/v05-lang/units/bytes');
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

rmSync(OUT, { recursive: true, force: true });
cpSync(join(HERE, '../../packages/bytes'), OUT, { recursive: true });
copyFileSync(join(LAB, 'sir/bytes.rust.sir'), join(OUT, 'sir/bytes.rust.sir'));
mkdirSync(join(OUT, 'src'), { recursive: true });
copyFileSync(join(LAB, 'runs/rust/emit_1/src/lib.rs'), join(OUT, 'src/bytes.rs'));

const mp = join(OUT, 'sir.manifest.json');
const m = JSON.parse(readFileSync(mp, 'utf8'));
const u = m.units[0];
const pkg = { sir: u.sir, sirSha256: u.sirSha256, oracle: u.oracle, oracleSha256: u.oracleSha256, src: u.src, srcSha256: u.srcSha256 };
const rust = { anchor: { kind: 'package', ref: 'bytes@3.1.2' }, sir: 'sir/bytes.rust.sir', sirSha256: sha(join(OUT, 'sir/bytes.rust.sir')),
  oracle: u.oracle, oracleSha256: u.oracleSha256, src: 'src/bytes.rs', srcSha256: sha(join(OUT, 'src/bytes.rs')) };
m.name = '@fixture/bytes-lang-rust';
m.specVersion = '0.5';
m.features = ['vectors', 'lang-variant'];
u.variants = { package: pkg, 'lang:rust': rust };
writeFileSync(mp, JSON.stringify(m, null, 2) + '\n');
console.log(`wrote ${OUT}`);
