// Reusable quorum helper for the greenfield-quorum skill.
// The AGENT writes per-library call adapters (each npm lib has a different API — that's the discovery work) and
// an input set (stratified + CHAOS). This helper does the MECHANICAL part: run every adapter on every input,
// compute agreement vs disagreement, and cluster the libraries by pairwise agreement (so "different algorithms"
// separate from "edge ambiguity"). It never decides anything — it surfaces the decision surface.
//
// Usage (the agent writes ~12 lines per leaf):
//   import { runQuorum, report } from '<plugin>/skills/greenfield-quorum/quorum.mjs';
//   const adapters = { 'Intl(spec)': x => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x),
//                      'currency.js': x => currency(x).format(), ... };   // ONE fn per reference
//   const inputs = [1234.5, -1234.5, 0, 1234.567, /* + chaos: */ NaN, Infinity, '', {}];
//   console.log(report(runQuorum(adapters, inputs)));
//
// For multi-arg leaves, make each input an ARRAY and the adapters spread it: x => fn(...x).

const S = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

export function runQuorum(adapters, inputs) {
  const names = Object.keys(adapters);
  const call = (fn, inp) => { try { return Array.isArray(inp) ? fn(...inp) : fn(inp); } catch (e) { return { __throw: String(e && e.message || e).slice(0, 40) }; } };

  const rows = inputs.map((inp) => {
    const outs = names.map((n) => call(adapters[n], inp));
    return { inp, outs, distinct: new Set(outs.map(S)).size };
  });

  const agree = rows.filter((r) => r.distinct === 1).length;

  // pairwise agreement → clustering signal
  const pairs = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    let same = 0; for (const r of rows) if (S(r.outs[i]) === S(r.outs[j])) same++;
    pairs.push({ a: names[i], b: names[j], same, rate: same / rows.length });
  }
  // greedy clusters at >=80% pairwise agreement (a coarse "same school" signal for the agent to refine)
  const clusters = [];
  const placed = new Set();
  for (const n of names) {
    if (placed.has(n)) continue;
    const cluster = [n]; placed.add(n);
    for (const m of names) {
      if (placed.has(m)) continue;
      const p = pairs.find((x) => (x.a === n && x.b === m) || (x.a === m && x.b === n));
      if (p && p.rate >= 0.8) { cluster.push(m); placed.add(m); }
    }
    clusters.push(cluster);
  }

  return { names, rows, agree, total: rows.length, pairs, clusters };
}

export function report(q) {
  const { names, rows, agree, total, pairs, clusters } = q;
  const L = [];
  L.push(`QUORUM: ${names.length} references × ${total} inputs`);
  L.push(`  references: ${names.join(', ')}`);
  L.push(`  FULL AGREEMENT: ${agree}/${total}   DISAGREEMENT: ${total - agree}/${total}`);
  L.push(`  CLUSTERS (>=80% pairwise — refine by hand): ${clusters.map((c) => '{' + c.join(', ') + '}').join('  ')}`);
  L.push('');
  L.push('  DISAGREEMENTS (input → each reference):');
  for (const r of rows.filter((x) => x.distinct > 1)) {
    L.push(`  ${S(r.inp).slice(0, 24).padEnd(26)} [${r.distinct} distinct]`);
    names.forEach((n, i) => L.push(`      ${n.padEnd(16)} ${S(r.outs[i])}`));
  }
  L.push('');
  L.push('  PAIRWISE AGREEMENT (the clustering evidence):');
  for (const p of pairs.sort((a, b) => b.rate - a.rate)) L.push(`    ${p.a.padEnd(16)} ~ ${p.b.padEnd(16)} ${p.same}/${total} (${Math.round(100 * p.rate)}%)`);
  return L.join('\n');
}
