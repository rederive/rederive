// @rederive/rdv — the verdict, COMPOSED on the verified `eq` leaf.
// grade does NOT implement its own equality — it delegates to the verified `eq` unit. That is the
// fix for the drift quorum-3/3 once missed: a re-derivation cannot quietly loosen an equality it does
// not contain. ("A verified leaf oracles the next layer.")
// full = (pass === total); a throw matches a throw (message NOT compared); empty vectors => full:true
// (vacuous); miss capped at the first 8; no first-vector short-circuit.
import { eq } from './eq.ts';

const threw = (x: any) => x && typeof x === 'object' && '__throw' in x;

export function grade(gots: any[], vectors: { name: string; expected: any }[]) {
  let pass = 0;
  const miss: string[] = [];
  for (let i = 0; i < vectors.length; i++) {
    const got = gots[i], exp = vectors[i].expected;
    if ((threw(got) && threw(exp)) || eq(got, exp)) pass++;
    else if (miss.length < 8) miss.push(vectors[i].name);
  }
  return { pass, total: vectors.length, full: pass === vectors.length, miss };
}
