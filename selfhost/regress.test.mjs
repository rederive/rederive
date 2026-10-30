// Every selfhost oracle, re-run against the LIVE cli/ (REDERIVE_SELF_PLAN, "a regression suite the day it is stamped").
// The oracle was stamped from the pinned authority; this checks that today's code still does exactly that. A miss means the
// kernel's behavior moved: either a fix (then pin a new authority in AUTHORITY.json and re-stamp — the decision is recorded,
// never silent) or a regression. Units whose oracle is not yet canonical (before the lab's `prepare`) are skipped by name.
// Run: node --test selfhost/regress.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseSig, escapeMarkers, ENCODING } from '../cli/sir/canon.mjs';
import { gradeArtifact } from '../cli/lang/grade.mjs';

const HERE = new URL('.', import.meta.url).pathname; const REPO = join(HERE, '..');
const sigOf = (primary) => parseSig(primary.match(/^SIG\s+(.+)$/m)[1].trim());

for (const unit of readdirSync(join(HERE, 'units')).sort()) {
  const dir = join(HERE, 'units', unit); const oraclePath = join(dir, 'oracles', `${unit}.json`); const primaryPath = join(dir, 'sir', `${unit}.sir`);
  const oracle = existsSync(oraclePath) ? JSON.parse(readFileSync(oraclePath, 'utf8')) : null;
  const ready = oracle?.encoding === ENCODING && existsSync(primaryPath);
  test(`${unit}: the live cli/ reproduces every vector stamped from the pinned authority`, { skip: !ready && `${unit} has no canonical oracle yet` }, async () => {
    const stage = JSON.parse(readFileSync(join(dir, 'STAGE.json'), 'utf8'));
    const seam = await import(pathToFileURL(join(HERE, stage.seam)).href);
    const fn = seam.make(await import(pathToFileURL(join(REPO, seam.module)).href));   // the LIVE module, not the snapshot
    // called exactly as a js driver calls an artifact: a returned value is marker-escaped, only the catch writes {__threw} (#55 #58)
    const prepared = { typeCheck: { applicable: false }, callBatch: async (argsList) => argsList.map((a) => { try { return escapeMarkers(fn(...structuredClone(a))); } catch (e) { return { __threw: String(e?.message ?? e) }; } }) };
    const g = await gradeArtifact(prepared, oracle, sigOf(readFileSync(primaryPath, 'utf8')));
    assert.ok(g.exact, `${unit}: frozen ${g.frozen}, held-out ${g.heldout}; first misses: ${JSON.stringify(g.misses.slice(0, 3))}`);
  });
}
