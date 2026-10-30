// Stamp the oracle: R_free comes from the RETAINED ORIGINAL (the free unit), which is
// exactly what normalization has available. rdv then checks the ring src against it.
import { writeFileSync } from 'node:fs';
import { sharedAppendFree } from './units.mjs';
import { readFileSync } from 'node:fs';

async function outcomesOf(unit, items) {
  const seen = new Set();
  let sawToken = false, halted = false, exclusive = true, returned = true, firstEvents = null;
  async function walk(prefix) {
    const pending = new Map(); let nextId = 1, step = 0;
    const holders = new Set(); const events = []; let maxHolders = 0;
    const mark = () => { if (holders.size > maxHolders) maxHolders = holders.size; };
    // Mirror rdv's token channel (cli/rdv.mts makeGate). A unit that never touches
    // the token leaves this silent, and the stamped liveness records `observed:
    // false` — DERIVED from the run, not asserted here, so a unit that starts using
    // the token gets the richer shape without anyone remembering to update this.
    const gate = {
      open(v) { const id = nextId++; return new Promise((r) => pending.set(id, () => r(v))); },
      token: {
        take(w) { sawToken = true; holders.add(w); mark(); events.push(`held(${w})`); },
        pass(f, t) { sawToken = true; holders.delete(f); holders.add(t); mark(); events.push(`passed(${f}->${t})`); },
        release(w) { sawToken = true; holders.delete(w); events.push(`released(${w})`); },
      },
    };
    let settled = false;
    const call = Promise.resolve(unit(items, gate)).then((v) => { settled = true; return v; });
    const branches = [];
    for (;;) { await new Promise((r) => setImmediate(r)); const c = [...pending.keys()];
      if (!c.length) { if (!settled) halted = true; break; }
      branches.push(c.length); const pick = c[Math.min(prefix[step] ?? 0, c.length - 1)]; step++;
      const f = pending.get(pick); pending.delete(pick); f(); }
    const result = await call;
    if (maxHolders > 1) exclusive = false;
    if (holders.size) returned = false;
    if (firstEvents === null) firstEvents = events;
    if (prefix.length >= branches.length) { seen.add(JSON.stringify(result)); return; }
    for (let i = 0; i < branches[prefix.length]; i++) await walk([...prefix, i]);
  }
  await walk([]);
  return { outcomes: [...seen].sort(),
           liveness: sawToken
             ? { observed: true, mutualExclusion: exclusive, returned, halted, events: firstEvents ?? [] }
             : { observed: false, halted } };
}

const { default: ringFn } = await import('./src/ringAppend.js');
const heldout = [];
for (const items of [[1, 2, 3], [1, 2, 3, 4]]) {
  const { outcomes: free } = await outcomesOf(sharedAppendFree, items);
  const plan = { cap: 2000, freeOutcomes: free };
  // stamp the expectation by running the CORRECT ring unit under the same plan
  const { outcomes, liveness } = await outcomesOf(ringFn, items);
  const sound = outcomes.every((o) => free.includes(o));
  heldout.push({ name: `n=${items.length}`, args: [items, plan],
    expected: { result: JSON.parse(outcomes[0]),
      ring: { outcomes, schedules: 1, exhaustive: true, freeOutcomes: free.length,
              sound, relation: outcomes.length === free.length ? 'preserving' : 'refinement',
              drops: free.length - outcomes.length, liveness } } });
  console.log(` n=${items.length}: R_free=${free.length}  R_ring=${outcomes.length}  relation=${outcomes.length === free.length ? 'preserving' : 'refinement'} (drops ${free.length - outcomes.length})`);
}
writeFileSync('oracles/spec.json', JSON.stringify({ mode: 'ring', exportName: 'ringAppend', vectors: [], heldout }, null, 2));
