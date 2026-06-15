// @rederive/rdv — the verdict, COMPOSED on the verified `eq` leaf. ZERO-DEP.
// grade does NOT implement its own equality — it delegates to the verified eq unit, so a re-derivation
// cannot quietly loosen it ("a verified leaf oracles the next layer"). full=(pass===total); a throw
// matches a throw (message NOT compared); empty vectors => full:true (vacuous); miss capped at 8.
import { eq } from './eq.js';

const threw = (x) => x && typeof x === 'object' && '__throw' in x;

export function grade(gots, vectors) {
  let pass = 0;
  const miss = [];
  for (let i = 0; i < vectors.length; i++) {
    const got = gots[i], exp = vectors[i].expected;
    if ((threw(got) && threw(exp)) || eq(got, exp)) pass++;
    else if (miss.length < 8) miss.push(vectors[i].name);
  }
  return { pass, total: vectors.length, full: pass === vectors.length, miss };
}
