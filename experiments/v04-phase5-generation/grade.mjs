// PHASE 5 acceptance gate: can a COLD re-emitter build a v0.4 construct from the
// SIR alone?
//
// This is the empirical test of the plan's assumption A3. Every SIR construct
// before v0.4 was self-describing — `TAKES`, `GIVES`, `INVARIANT` explain
// themselves, which is why blind quorum works at all. PAR and RING are the first
// whose SEMANTICS are not inferable from their SYNTAX, so the rule is that the
// keyword is a HINT and the contract lives in INVARIANT lines.
//
// If that rule holds, cold emitters converge with no schema access. If they
// diverge, the construct needs a footnote to be understood — which means it is
// specified wrong, not that the emitter is weak.
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const J = (x) => JSON.stringify(x);

function makeGate() {
  const pending = new Map(); let nextId = 1, maxInFlight = 0;
  const tokenEvents = []; const holders = new Set(); let maxHolders = 0;
  const mark = () => { if (holders.size > maxHolders) maxHolders = holders.size; };
  const api = {
    open(v) { const id = nextId++; return new Promise((r) => { pending.set(id, () => r(v)); if (pending.size > maxInFlight) maxInFlight = pending.size; }); },
    inFlight: () => [...pending.keys()],
    token: { take(w) { holders.add(w); mark(); tokenEvents.push(`held(${w})`); },
             pass(f, t) { holders.delete(f); holders.add(t); mark(); tokenEvents.push(`passed(${f}->${t})`); },
             release(w) { holders.delete(w); tokenEvents.push(`released(${w})`); } },
  };
  const settle = (id) => { const f = pending.get(id); if (!f) return false; pending.delete(id); f(); return true; };
  return { api, settle, stats: () => ({ maxInFlight, tokenEvents, maxHolders, stillHeld: [...holders] }) };
}

async function runOne(fn, args, decisions) {
  const gate = makeGate(); const branches = []; let settled = false;
  const call = Promise.resolve(fn(...args, gate.api)).then((v) => { settled = true; return v; },
                                                          (e) => { settled = true; return { __throw: String(e.message) }; });
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

async function explore(fn, args, cap = 2000) {
  const runs = []; let truncated = false;
  async function walk(prefix) {
    if (runs.length >= cap) { truncated = true; return; }
    const r = await runOne(fn, args, prefix);
    if (prefix.length >= r.branches.length) { runs.push(r); return; }
    for (let i = 0; i < r.branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  return { runs, exhaustive: !truncated };
}

const CHECKS = {
  async bm(fn) {
    const fails = [];
    for (const [input, conc] of [[[1, 2, 3], 2], [[1, 2, 3, 4], 2], [[1, 2, 3, 4, 5], 3]]) {
      const { runs } = await explore(fn, [input, conc]);
      const want = J(input.map((x) => x * 2));
      const bad = runs.filter((r) => J(r.result) !== want);
      const overBound = runs.filter((r) => r.maxInFlight > Math.min(conc, input.length));
      if (bad.length) {
        // Name the defect from the evidence, not from the likeliest story. Same
        // multiset in the wrong order is completion-order keying; a different
        // multiset is a wrong mapping, and calling that "ordering" would be a
        // guess dressed up as a finding.
        const ms = (a) => J([...(Array.isArray(a) ? a : [])].sort((x, y) => x - y));
        const reordered = ms(bad[0].result) === ms(JSON.parse(want));
        fails.push(`n=${input.length} c=${conc}: ${bad.length}/${runs.length} schedules wrong (e.g. ${J(bad[0].result)}, want ${want}) — `
          + (reordered ? 'right values, WRONG ORDER: keyed by completion order, not input position'
                       : 'WRONG VALUES: the mapping itself differs (not an ordering bug)'));
      }
      if (overBound.length) fails.push(`n=${input.length} c=${conc}: concurrency bound exceeded (${Math.max(...overBound.map((r) => r.maxInFlight))} > ${Math.min(conc, input.length)})`);
      if (runs.some((r) => r.halted)) fails.push(`n=${input.length}: a schedule HALTED`);
    }
    const { runs: empty } = await explore(fn, [[], 2]);
    if (J(empty[0]?.result) !== '[]') fails.push(`empty input -> ${J(empty[0]?.result)}, want []`);
    return fails;
  },
  async rt(fn) {
    const fails = [];
    for (const items of [[1, 2, 3], [1, 2, 3, 4]]) {
      const { runs } = await explore(fn, [items]);
      const want = J(items);
      const bad = runs.filter((r) => J(r.result) !== want);
      if (bad.length) fails.push(`n=${items.length}: ${bad.length}/${runs.length} schedules wrong (e.g. ${J(bad[0].result)})`);
      const dup = runs.filter((r) => r.maxHolders > 1);
      const lost = runs.filter((r) => r.stillHeld.length > 0);
      if (dup.length) fails.push(`n=${items.length}: MUTUAL EXCLUSION violated (${dup[0].maxHolders} simultaneous holders) — used take() instead of pass()?`);
      if (lost.length) fails.push(`n=${items.length}: token LOST — still held by ${J(lost[0].stillHeld)}`);
      // R_ring subset R_free: the token is there so only one actor ACTS at a time.
      // A unit that opens every gate at once but emits index order passes the value
      // check and is still not a ring.
      const wide = runs.filter((r) => r.maxInFlight > 1);
      if (wide.length) fails.push(`n=${items.length}: not a ring — ${Math.max(...wide.map((r) => r.maxInFlight))} actors in flight at once (token did not serialize)`);
      if (runs.length !== 1) fails.push(`n=${items.length}: ring did not reduce to a deterministic schedule (${runs.length} distinct schedules)`);
      const ev = runs[0]?.tokenEvents ?? [];
      const wantEv = [`held(0)`, ...items.slice(1).map((_, i) => `passed(${i}->${i + 1})`), `released(${items.length - 1})`];
      if (J(ev) !== J(wantEv)) fails.push(`n=${items.length}: token path ${J(ev)}, want ${J(wantEv)}`);
      if (runs.some((r) => r.halted)) fails.push(`n=${items.length}: a schedule HALTED`);
    }
    const { runs: empty } = await explore(fn, [[]]);
    if (J(empty[0]?.result) !== '[]') fails.push(`empty items -> ${J(empty[0]?.result)}, want []`);
    if (empty[0]?.tokenEvents.length) fails.push(`empty items touched the token: ${J(empty[0].tokenEvents)}`);
    return fails;
  },
};

const DIR = process.argv[2] ?? 'emissions';
console.log(`\n  grading ${DIR}/ — cold emitters, SIR only, no schema and no fragments\n`);
const files = readdirSync(DIR).filter((f) => f.endsWith('.js')).sort();
const results = { bm: [], rt: [] };
for (const f of files) {
  const kind = f.startsWith('bm') ? 'bm' : 'rt';
  let fails;
  try {
    const m = await import(pathToFileURL(`${DIR}/${f}`).href);
    const fn = m.default ?? Object.values(m).find((x) => typeof x === 'function');
    fails = typeof fn === 'function' ? await CHECKS[kind](fn) : ['no callable default export'];
  } catch (e) { fails = [`load/run error: ${e.message}`]; }
  results[kind].push({ f, fails });
  console.log(`  ${f.padEnd(10)} ${fails.length ? 'FAIL' : 'PASS'}${fails.map((x) => `\n      - ${x}`).join('')}`);
}

console.log('');
let allOk = true;
for (const [kind, label] of [['bm', 'boundedMap (PAR)'], ['rt', 'ringToken (RING)']]) {
  const rs = results[kind];
  if (!rs.length) continue;
  const passed = rs.filter((r) => !r.fails.length).length;
  const quorum = passed >= 2;
  console.log(`  ${label.padEnd(20)} quorum ${passed}/${rs.length}  ${quorum ? 'REACHED' : 'NOT REACHED'}`);
  if (!quorum) allOk = false;
}
console.log('');
console.log(allOk
  ? 'PHASE 5 GATE: PASS — cold emitters built v0.4 constructs from the SIR alone (A3 holds).'
  : 'PHASE 5 GATE: FAIL — divergence means the CONSTRUCT is under-specified, not that the emitter is weak.');
process.exit(allOk ? 0 : 1);
