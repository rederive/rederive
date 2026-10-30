// Stamp the liveness expectation by running the SOUND ring through rdv's shape.
import { readFileSync, writeFileSync } from 'node:fs';
function makeGate() {
  const pending = new Map(); const order = []; let nextId = 1, maxInFlight = 0;
  const tokenEvents = []; const holders = new Set(); let maxHolders = 0;
  const mark = () => { if (holders.size > maxHolders) maxHolders = holders.size; };
  const api = {
    open(v) { const id = nextId++; return new Promise((r) => { pending.set(id, () => r(v)); if (pending.size > maxInFlight) maxInFlight = pending.size; }); },
    inFlight: () => [...pending.keys()],
    token: { take(w) { holders.add(w); mark(); tokenEvents.push(`held(${w})`); },
             pass(f, t) { holders.delete(f); holders.add(t); mark(); tokenEvents.push(`passed(${f}->${t})`); },
             release(w) { holders.delete(w); tokenEvents.push(`released(${w})`); } },
  };
  function settle(id) { const r = pending.get(id); if (!r) return false; pending.delete(id); order.push(id); r(); return true; }
  const tokenChannel = () => (tokenEvents.length ? { events: tokenEvents, maxConcurrentHolders: maxHolders, stillHeld: [...holders], mutualExclusion: maxHolders <= 1, returned: holders.size === 0 } : null);
  return { api, settle, order, tokenChannel, stats: () => ({ maxInFlight }) };
}
async function runOne(fn, args, decisions) {
  const gate = makeGate(); const branches = []; let settledCall = false;
  const call = Promise.resolve(fn(...args, gate.api)).then((v) => { settledCall = true; return v; }, (e) => { settledCall = true; return { __throw: String(e.message) }; });
  let step = 0, halted = false;
  for (;;) { await new Promise((r) => setImmediate(r)); const c = gate.api.inFlight();
    if (!c.length) { if (settledCall) break; halted = true; break; }
    branches.push(c.length); gate.settle(c[Math.min(decisions[step] ?? 0, c.length - 1)]); step++; }
  const result = halted ? { __halted: true } : await call;
  return { result, order: gate.order, branches, halted, token: gate.tokenChannel(), ...gate.stats() };
}
async function runRing(fn, args, plan = {}) {
  const cap = plan.cap ?? 2000; const runs = []; let truncated = false;
  async function walk(prefix) { if (runs.length >= cap) { truncated = true; return; }
    const r = await runOne(fn, args, prefix);
    if (prefix.length >= r.branches.length) { runs.push(r); return; }
    for (let i = 0; i < r.branches[prefix.length]; i++) await walk([...prefix, i]); }
  await walk([]);
  const outcomes = [...new Set(runs.map((r) => JSON.stringify(r.result)))].sort();
  const free = plan.freeOutcomes ?? [];
  const sound = free.length ? outcomes.every((o) => free.includes(o)) : null;
  const relation = !free.length ? 'unknown' : !sound ? 'NOT-A-REFINEMENT' : outcomes.length === free.length ? 'preserving' : 'refinement';
  const tokens = runs.map((r) => r.token).filter(Boolean);
  const liveness = tokens.length ? { observed: true, mutualExclusion: tokens.every((t) => t.mutualExclusion), returned: tokens.every((t) => t.returned), halted: runs.some((r) => r.halted), events: tokens[0].events } : { observed: false, halted: runs.some((r) => r.halted) };
  return { result: runs[0]?.result, ring: { outcomes, schedules: runs.length, exhaustive: !truncated, freeOutcomes: free.length, sound, relation, drops: free.length ? free.length - outcomes.length : null, liveness } };
}
const { default: fn } = await import('./src/ringToken.js');
const doc = JSON.parse(readFileSync('oracles/live.json', 'utf8'));
for (const v of doc.heldout) {
  v.expected = await runRing(fn, v.args.slice(0, -1), v.args[v.args.length - 1]);
  console.log(' stamped:', JSON.stringify(v.expected.ring.liveness));
}
writeFileSync('oracles/live.json', JSON.stringify(doc, null, 2));
