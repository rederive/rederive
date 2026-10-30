// THE DUMB-AGENT TEST: do the decomposer INSTRUCTIONS work on someone who does
// not already know the answer?
//
// Phase 5 tested the consumption direction with SIRs I wrote myself, which means
// it never tested the instructions at all — I was standing in for the decomposer.
// Here a weak model reads only the derived payload + the "concurrency keywords are
// hints" rule, and writes the contract. Blind emitters then build from ITS SIR.
//
// This grader cannot presume the answer, because I did not write the contract. It
// reports three independent things, and the 2x2 they form is the actual finding:
//
//   CONVERGE?   did 3 blind emitters agree behaviorally on every schedule?
//               -> this is the real quorum criterion; divergence means the SIR
//                  was ambiguous, i.e. the instructions did not produce a
//                  self-describing contract.
//   CHANNELS?   was the concurrency bound / token discipline respected?
//               -> derivable from the construct alone, no contract needed.
//   FAITHFUL?   does the agreed behavior match the plain-English task I gave?
//               -> converge+unfaithful is a DIFFERENT failure: a clear contract
//                  that lost the requirement in translation.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const J = (x) => JSON.stringify(x);

function makeGate() {
  const pending = new Map(); let nextId = 1, maxInFlight = 0;
  const events = []; const holders = new Set(); let maxHolders = 0;
  const mark = () => { if (holders.size > maxHolders) maxHolders = holders.size; };
  const api = {
    open(v) { const id = nextId++; return new Promise((r) => { pending.set(id, () => r(v)); if (pending.size > maxInFlight) maxInFlight = pending.size; }); },
    inFlight: () => [...pending.keys()],
    token: {
      take(w) { holders.add(w); mark(); events.push(`held(${w})`); },
      pass(f, t) { holders.delete(f); holders.add(t); mark(); events.push(`passed(${f}->${t})`); },
      release(w) { holders.delete(w); events.push(`released(${w})`); },
    },
  };
  const settle = (id) => { const f = pending.get(id); if (!f) return false; pending.delete(id); f(); return true; };
  return { api, settle, stats: () => ({ maxInFlight, events, maxHolders, stillHeld: [...holders] }) };
}

async function runOne(fn, args, decisions) {
  const gate = makeGate(); const branches = []; let settled = false;
  const call = Promise.resolve(fn(...args, gate.api)).then((v) => { settled = true; return v; },
                                                          (e) => { settled = true; return { __throw: String(e?.message ?? e) }; });
  let step = 0, halted = false;
  for (;;) {
    await new Promise((r) => setImmediate(r));
    const c = gate.api.inFlight();
    if (!c.length) { if (settled) break; halted = true; break; }
    branches.push(c.length);
    gate.settle(c[Math.min(decisions[step] ?? 0, c.length - 1)]); step++;
  }
  return { result: halted ? { __halted: true } : await call, branches, halted, ...gate.stats() };
}

async function explore(fn, args, cap = 400) {
  const runs = []; let truncated = false;
  async function walk(prefix) {
    if (runs.length >= cap) { truncated = true; return; }
    const r = await runOne(fn, args, prefix);
    if (prefix.length >= r.branches.length) { runs.push({ ...r, prefix }); return; }
    for (let i = 0; i < r.branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  return { runs, exhaustive: !truncated };
}

const UNITS = {
  boundedFilter: {
    sir: 'sirs/boundedFilter.sir',
    cases: [[[1, 2, 3, 4], 2], [[2, 4, 6], 2], [[1, 3, 5], 2], [[1, 2, 3, 4, 5, 6], 3], [[], 2]],
    // the plain-English task I handed the decomposer
    want: ([input]) => input.filter((n) => n % 2 === 0),
    channels(runs, [input, conc]) {
      const bad = [];
      const lim = Math.min(conc, Math.max(input.length, 1));
      const over = runs.filter((r) => r.maxInFlight > lim);
      if (over.length) bad.push(`concurrency bound exceeded (${Math.max(...over.map((r) => r.maxInFlight))} > ${lim})`);
      if (runs.some((r) => r.halted)) bad.push('a schedule HALTED');
      if (!input.length && runs[0]?.maxInFlight) bad.push('empty input still opened the gate');
      return bad;
    },
  },
  ringLabel: {
    sir: 'sirs/ringLabel.sir',
    cases: [[['a', 'b', 'c']], [['x']], [[]], [['p', 'q', 'r', 's']]],
    want: ([items]) => items.map((it, i) => `${i}:${it}`),
    channels(runs, [items]) {
      const bad = [];
      if (runs.some((r) => r.maxHolders > 1)) bad.push('MUTUAL EXCLUSION violated (>1 token holder)');
      if (runs.some((r) => r.stillHeld.length)) bad.push('token LOST (still held at return)');
      if (runs.some((r) => r.halted)) bad.push('a schedule HALTED');
      if (items.length && runs.length !== 1) bad.push(`ring did not reduce to one schedule (${runs.length})`);
      if (!items.length && runs[0]?.events.length) bad.push('empty input touched the token');
      return bad;
    },
  },
};

const unitName = process.argv[2];
const spec = UNITS[unitName];
if (!spec) { console.error(`usage: grade-dumb.mjs <${Object.keys(UNITS).join('|')}>`); process.exit(2); }

console.log(`\n=== ${unitName} — contract written by a weak model from the instructions alone ===\n`);
if (existsSync(spec.sir)) {
  const sig = readFileSync(spec.sir, 'utf8').split('\n').find((l) => l.startsWith('SIG')) || '(no SIG line)';
  console.log(`  ${sig.trim()}`);
  const txt = readFileSync(spec.sir, 'utf8');
  console.log(`  ${txt.split('\n').filter((l) => l.trim()).length} lines · ` +
    `${(txt.match(/^INVARIANT/gm) || []).length} INVARIANT · ${(txt.match(/^DESCRIPTION/gm) || []).length} DESCRIPTION\n`);
}

const files = readdirSync('emissions').filter((f) => f.startsWith(unitName) && f.endsWith('.js')).sort();
const impls = [];
for (const f of files) {
  try {
    const m = await import(pathToFileURL(`emissions/${f}`).href);
    const fn = m.default ?? Object.values(m).find((x) => typeof x === 'function');
    if (typeof fn !== 'function') { console.log(`  ${f}: no callable default export`); continue; }
    impls.push({ f, fn });
  } catch (e) { console.log(`  ${f}: load error — ${e.message}`); }
}
if (impls.length < 2) { console.log('\n  too few loadable emissions to judge convergence'); process.exit(1); }

let converged = true, faithful = true, channelsOk = true;
for (const args of spec.cases) {
  const label = J(args);
  const per = [];
  for (const { f, fn } of impls) {
    const { runs } = await explore(fn, args);
    per.push({ f, runs, outcomes: [...new Set(runs.map((r) => J(r.result)))].sort() });
  }
  // CONVERGENCE — every emitter must produce the same outcome SET over the schedule space.
  const sets = per.map((p) => J(p.outcomes));
  let agree = new Set(sets).size === 1;
  if (!agree) {
    converged = false;
    console.log(`  ${label}  DIVERGE (value)`);
    per.forEach((p) => console.log(`      ${p.f}: ${p.outcomes.join(' | ')}`));
  }
  // CONVERGENCE ON THE CHANNEL — emitters can agree on every returned value and
  // still disagree about the PROTOCOL (who takes the token vs who receives it).
  // Comparing event sequences catches a contract that is ambiguous about the
  // mechanism, and it presumes no particular answer — only that they match.
  const paths = per.map((p) => J(p.runs[0]?.events ?? []));
  if (new Set(paths).size !== 1) {
    converged = false; agree = false;
    console.log(`  ${label}  DIVERGE (token/channel protocol — same values, different mechanism)`);
    per.forEach((p, i) => console.log(`      ${p.f}: ${paths[i]}`));
  }
  // FAITHFUL — does the agreed behavior match the task as stated in English?
  const want = J(spec.want(args));
  const got = per[0].outcomes;
  if (agree && (got.length !== 1 || got[0] !== want)) {
    faithful = false;
    console.log(`  ${label}  UNFAITHFUL — all emitters agree on ${got.join(' | ')}, task asked for ${want}`);
  }
  // CHANNELS
  for (const p of per) {
    const bad = spec.channels(p.runs, args);
    if (bad.length) { channelsOk = false; console.log(`  ${label}  ${p.f}: ${bad.join('; ')}`); }
  }
  if (agree && got.length === 1 && got[0] === want && !per.some((p) => spec.channels(p.runs, args).length)) {
    console.log(`  ${label}  ok  (${per[0].runs.length} schedule(s), all ${impls.length} emitters agree on ${want})`);
  }
}

console.log('');
console.log(`  CONVERGE  ${converged ? 'YES — the SIR was self-describing' : 'NO — the SIR was ambiguous; the instructions did not produce a self-describing contract'}`);
console.log(`  CHANNELS  ${channelsOk ? 'YES — bound / token discipline held' : 'NO'}`);
console.log(`  FAITHFUL  ${faithful ? 'YES — matches the task as handed to the decomposer' : 'NO — a clear contract that lost the requirement in translation'}`);
console.log('');
const pass = converged && channelsOk && faithful;
console.log(pass
  ? 'DUMB-AGENT TEST: PASS — a weak model produced a contract cold emitters built correctly.'
  : 'DUMB-AGENT TEST: FAIL — see which of the three failed; they mean different things.');
process.exit(pass ? 0 : 1);
