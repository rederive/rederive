// Stamp expecteds by EXECUTING the correct unit through rdv's own par explorer shape.
import { readFileSync, writeFileSync } from 'node:fs';
function makeGate() {
  const pending = new Map(); const order = []; let nextId = 1, maxInFlight = 0;
  const api = { open(value) { const id = nextId++; return new Promise((resolve) => { pending.set(id, () => resolve(value)); if (pending.size > maxInFlight) maxInFlight = pending.size; }); }, inFlight: () => [...pending.keys()] };
  function settle(id) { const r = pending.get(id); if (!r) return false; pending.delete(id); order.push(id); r(); return true; }
  return { api, settle, order, stats: () => ({ maxInFlight }) };
}
async function runOneSchedule(fn, args, decisions) {
  const gate = makeGate(); const branches = [];
  const call = Promise.resolve(fn(...args, gate.api));
  let step = 0;
  for (;;) {
    await new Promise((r) => setImmediate(r));
    const c = gate.api.inFlight(); if (!c.length) break;
    branches.push(c.length);
    gate.settle(c[Math.min(decisions[step] ?? 0, c.length - 1)]); step++;
  }
  let result; try { result = await call; } catch (e) { result = { __throw: String(e.message) }; }
  return { result, order: gate.order, branches, ...gate.stats() };
}
async function runPar(fn, args, plan = {}) {
  const cap = plan.cap ?? 2000; const runs = []; let truncated = false;
  async function walk(prefix) {
    if (runs.length >= cap) { truncated = true; return; }
    const r = await runOneSchedule(fn, args, prefix);
    if (prefix.length >= r.branches.length) { runs.push(r); return; }
    for (let i = 0; i < r.branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  const outcomes = new Set(runs.map((r) => JSON.stringify([r.result, r.maxInFlight])));
  const rung = truncated ? (outcomes.size === 1 ? 'partial-order-reduction' : 'sampled') : 'exhaustive';
  return { result: runs[0]?.result, par: { schedules: runs.length, exhaustive: !truncated, outcomeClasses: outcomes.size, maxInFlight: Math.max(...runs.map((r) => r.maxInFlight)), rung } };
}
const { default: fn } = await import('./src/boundedMap.js');
const doc = JSON.parse(readFileSync('oracles/spec.json', 'utf8'));
for (const v of doc.heldout) {
  const args = v.args.slice(0, -1), plan = v.args[v.args.length - 1];
  v.expected = await runPar(fn, args, plan);
  console.log(` ${v.name}: ${v.expected.par.schedules} schedules, ${v.expected.par.outcomeClasses} outcome class(es), rung=${v.expected.par.rung}, maxInFlight=${v.expected.par.maxInFlight}`);
}
writeFileSync('oracles/spec.json', JSON.stringify(doc, null, 2));
