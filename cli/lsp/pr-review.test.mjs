// The PR review replays the three pushes of the demo PR (rederive/sir-review-demo#1) on a scratch git repo holding the
// shipped @rederive/colors bundle: (1) a tested rule changes with no test change → Stop; (2) the author "updates the
// tests" by rewriting a hidden answer colors@1.4.0 gave, re-hashing and re-binding → rdv check passes, the review STILL
// stops; (3) strip restored and a new unit added → no Stop. Plus a prose-only edit, which passes.
// Run: node --test cli/lsp/pr-review.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { review, summary, annotations } from './pr-review.mjs';
import { canonicalSha } from '../sir/sir-parse.mjs';
import { vectorSetSha } from '../sir/canon.mjs';

const ROOT = new URL('../..', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'sir-review-')); process.chdir(dir);
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
const P = 'packages/colors/'; const rd = (f) => readFileSync(P + f, 'utf8'); const wr = (f, s) => writeFileSync(P + f, s);
git('init', '-q', '-b', 'main'); cpSync(join(ROOT, 'packages/colors'), join(dir, 'packages/colors'), { recursive: true, filter: (s) => !s.includes('node_modules') });
git('add', '-A'); git('commit', '-qm', 'base');
const commit = (msg) => { git('add', '-A'); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };
const fromMain = (name) => { git('checkout', '-q', 'main'); git('checkout', '-q', '-b', name); };

// push 1: the rule changes, the tests do not
fromMain('p1');
wr('sir/strip.sir', rd('sir/strip.sir').replace('then one or more ASCII decimal digits, then', 'then one or more ASCII decimal digits separated by ";", then').replace('PINNED grammar CODE = ESC "[" DIGIT+ "m"', 'PINNED grammar CODE = ESC "[" DIGIT+ (";" DIGIT+)* "m"'));
const p1 = commit('rule');
// push 2: "update the tests" — rewrite the answer the package gave, re-hash, re-bind (everything a mechanical gate checks)
const o = JSON.parse(rd('oracles/strip.json')); o.heldout.find((c) => c.name === 'ho_combined_sgr_leading').expected = { t: 'text', v: 'hi', cu: 'utf8' }; o.canonicalSha256 = vectorSetSha(o);
wr('oracles/strip.json', JSON.stringify(o, null, 1) + '\n'); const p = rd('sir/strip.sir').replace(/(^ORACLE .*CANONICAL-SHA256 )[0-9a-f]{64}/m, `$1${o.canonicalSha256}`); wr('sir/strip.sir', p);
for (const l of ['js', 'ts', 'rust']) wr(`sir/strip.${l}.sir`, rd(`sir/strip.${l}.sir`).replace(/^PRIMARY-SHA256 [0-9a-f]{64}/m, `PRIMARY-SHA256 ${canonicalSha(p)}`));
const p2 = commit('update the tests');
// a prose-only edit, from main
fromMain('prose'); wr('sir/strip.sir', rd('sir/strip.sir').replace('NOTE 10 frozen + 10 held-out', 'NOTE Ten frozen and ten held-out cases'));
const pr = commit('prose');

test('push 1: a tested rule changed without a test change is a Stop, annotated on its lines', () => {
  const r = review({ base: 'main', head: p1 }); assert.ok(r.stops >= 1);
  assert.deepEqual(r.units.map((u) => [u.unit, u.status, u.tests, u.bindings]), [['strip', 'fail', '✗ unchanged', '✗ js, rust, ts stale']]);
  const e = r.findings.filter((f) => f.level === 'error'); assert.ok(e.some((f) => /Rule 2 changed, no test did/.test(f.title) && f.line > 0));
  assert.ok(e.some((f) => /contradicts its own citation/.test(f.title)));
  assert.match(annotations(r.findings), /^::error file=packages\/colors\/sir\/strip\.sir,line=\d+,title=strip%3A Rule 2 changed%2C no test did::/m);
  assert.match(summary(r), /❌ 1 of 1 contract failing/);
});

test('push 2: a rewritten answer under package fidelity stays a Stop although every hash and binding is consistent', () => {
  const r = review({ base: 'main', head: p2 });
  assert.equal(r.units[0].status, 'fail'); assert.equal(r.units[0].tests, '✗ 1 answer rewritten'); assert.equal(r.units[0].bindings, '✓');
  assert.ok(r.findings.some((f) => f.level === 'error' && f.path.endsWith('oracles/strip.json') && /ho_combined_sgr_leading/.test(f.title)));
  assert.match(r.body, /captured by running colors@1\.4\.0/);
});

test('a prose-only edit passes, with nothing to stop on', () => {
  const r = review({ base: 'main', head: pr }); assert.equal(r.stops, 0);
  assert.deepEqual(r.units.map((u) => [u.status, u.change]), [['pass', 'prose only']]); assert.match(r.body, /✅ \*\*Nothing to stop on\.\*\*/);
});

test('no SIR change: an empty report', () => { const r = review({ base: 'main', head: 'main' }); assert.equal(r.stops, 0); assert.deepEqual(r.units, []); });
