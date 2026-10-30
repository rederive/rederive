// selfhost/stamp.mjs <unitDir> [--frozen 24] [--heldout 48] [--seed 1] — stamp a selfhost unit's oracle from the PINNED
// authority (REDERIVE_SELF_PLAN): rederive's own cli/ at AUTHORITY.json's commit, extracted with git archive into
// .authority/<commit>/ and REFUSED unless its tree hash matches the pin. The unit's function is built by its seam
// (seams/<unit>.mjs) from that snapshot — never from the live cli/, so editing rederive cannot move an oracle.
// Inputs come from the decomposer's generator, sir/<unit>.inputs.mjs (genInputs(n, rnd) -> list of argument lists, the
// sir-factory convention). Writes oracles/<unit>.json in the legacy form (v0.4 codec tags, the lab's encodeLegacy) for the
// lab's `prepare`, which encodes it to sir-canonical-v1 under the primary's SIG. A throw is recorded as { __throw }.
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { join, resolve, basename, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { treeSha } from '../cli/tree-sha.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const REPO = resolve(HERE, '..');
const LAB = process.env.SIR_LAB ?? join(homedir(), 'sir-lab/v05-lang');   // the judge: its legacy codec, pinned like any lab use
const argv = process.argv.slice(2); const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const unitDir = resolve(argv.find((a) => !a.startsWith('--') && !['--frozen', '--heldout', '--seed'].includes(argv[argv.indexOf(a) - 1])) ?? '');
const unit = basename(unitDir); const stop = (m) => { console.error(`stamp: STOP — ${m}`); process.exit(1); };

/** The pinned authority, extracted once and verified by tree hash every time. */
export function authority() {
  const pin = JSON.parse(readFileSync(join(HERE, 'AUTHORITY.json'), 'utf8')); const dir = join(HERE, '.authority', pin.commit);
  if (!existsSync(dir)) {
    const tmp = `${dir}.${process.pid}.tmp`; rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
    const a = spawnSync('sh', ['-c', `git -C "${REPO}" archive ${pin.commit} ${pin.paths.join(' ')} | tar -x -C "${tmp}"`], { encoding: 'utf8' });
    if (a.status !== 0) stop(`git archive ${pin.commit} failed: ${a.stderr}`);
    renameSync(tmp, dir);
  }
  const got = treeSha(dir); if (got !== pin.treeSha256) stop(`authority ${pin.commit} hashes ${got.slice(0, 12)}…, the pin says ${pin.treeSha256.slice(0, 12)}… — refusing to stamp from it`);
  return { dir, ...pin };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const frozenN = Number(opt('--frozen', 24)), heldoutN = Number(opt('--heldout', 48)), seed = Number(opt('--seed', 1));
  const stage = JSON.parse(readFileSync(join(unitDir, 'STAGE.json'), 'utf8'));
  const auth = authority();
  // STAGE.json names the authority the unit is stamped from (#69: its source/realPath were never read and went stale while the
  // brief told decomposers to trust them). A stamp from a different pin is refused unless --restage records the new one.
  const pinned = { source: `rederive@${auth.commit}`, realPath: `.authority/${auth.commit}` };
  if (stage.source !== pinned.source || stage.realPath !== pinned.realPath) {
    if (!argv.includes('--restage')) stop(`STAGE.json names ${stage.source} (${stage.realPath}); the pinned authority is ${pinned.source} — re-run with --restage to record it`);
    Object.assign(stage, pinned, { stagedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), note: `${(stage.note ?? '').replace(/ \[restaged on [0-9a-f]+\]$/, '')} [restaged on ${auth.commit}]` }); writeFileSync(join(unitDir, 'STAGE.json'), JSON.stringify(stage, null, 2) + '\n');
  }
  const seam = await import(pathToFileURL(join(HERE, stage.seam)).href);
  const fn = seam.make(await import(pathToFileURL(join(auth.dir, seam.module)).href));
  const inputsPath = join(unitDir, 'sir', `${unit}.inputs.mjs`); if (!existsSync(inputsPath)) stop(`no input generator at ${inputsPath}`);
  const { genInputs } = await import(pathToFileURL(inputsPath).href + `?v=${Date.now()}`);
  if (typeof genInputs !== 'function') stop('the inputs module exports no genInputs(n, rnd)');
  const { encodeLegacy, decodeLegacy } = await import(pathToFileURL(join(LAB, 'lib/legacy.mjs')).href);
  // mulberry32, the factory's seeded generator: the same seed gives the same oracle
  const rnd = ((a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; })(seed);
  const want = frozenN + heldoutN; const seen = new Set(); const uniq = [];
  for (let guard = 0; uniq.length < want && guard < 50; guard++)
    for (const args of genInputs(want, rnd)) { const k = JSON.stringify(encodeLegacy(args)); if (!seen.has(k)) { seen.add(k); uniq.push(args); } if (uniq.length >= want) break; }
  if (uniq.length < want) stop(`the generator produced ${uniq.length} distinct inputs; ${want} needed`);
  const vecs = uniq.map((args, i) => {
    // the authority sees EXACTLY what an artifact will be handed: the args through the codec round trip a driver applies (round 5,
    // selfhost legacy_grade #7 / wire_line #16: structuredClone turned a Buffer into a plain Uint8Array while the oracle recorded
    // buf:true, so the expected value was computed from a different argument than any artifact receives)
    const live = decodeLegacy(encodeLegacy(args)); let expected;
    // a RETURNED value is recorded as the value it is — a map {__threw: <text>} included (encodeLegacy escapes it): since round 4
    // every driver marker-escapes what an artifact returns, so only a real throw is a throw on either side (selfhost #55 #58;
    // round 2 had recorded decode_value's returned marker as a throw, to match drivers that read it in-band)
    try { const r = fn(...live); expected = encodeLegacy(r); } catch (e) {
      // a HOST stack overflow is not an observation of the function (selfhost vector_set_sha: it was recorded as the oracle's truth
      // on an in-cap input, and which input overflowed depended on JIT warm-up): stop, and narrow the generator
      if (e instanceof RangeError && /call stack/i.test(e.message)) stop(`vector ${i} overflowed the host stack — not an observation; narrow the input generator`);
      expected = { __throw: String(e?.message ?? e) }; }
    return { name: 'v' + i, args: encodeLegacy(args), expected };
  });
  mkdirSync(join(unitDir, 'oracles'), { recursive: true });
  const out = { mode: 'vectors', unit, authority: `rederive@${auth.commit}`, authorityTreeSha256: auth.treeSha256, seed, frozen: vecs.slice(0, frozenN), heldout: vecs.slice(frozenN) };
  writeFileSync(join(unitDir, 'oracles', `${unit}.json`), JSON.stringify(out, null, 1) + '\n');
  const throws = vecs.filter((v) => v.expected && v.expected.__throw !== undefined).length;
  console.log(`stamped ${unit}: ${frozenN} frozen + ${heldoutN} held-out from rederive@${auth.commit} (authority tree ${auth.treeSha256.slice(0, 12)}…), seed ${seed}, ${throws} throw(s)`);
}
