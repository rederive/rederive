// @rederive/rdv — verified-recompose of rdv's verdict grader (verdict core). ZERO-DEP.
// Given already-computed results `gots` and their `vectors`, decide pass / total / full / miss.
// A captured throw matches a captured throw (the message is NOT compared); otherwise structural
// equality. `full` requires EVERY vector to pass — note the vacuous case: empty `vectors` => full:true
// (which is exactly why a held-out set must be non-empty). `miss` records up to 8 failing names.
export function grade(gots: any[], vectors: { name: string; expected: any }[]) {
  const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
  const threw = (x: any) => x && typeof x === 'object' && '__throw' in x;
  const ok = (got: any, exp: any) => (threw(got) && threw(exp)) || eq(got, exp);
  let pass = 0;
  const miss: string[] = [];
  for (let i = 0; i < vectors.length; i++) {
    if (ok(gots[i], vectors[i].expected)) pass++;
    else if (miss.length < 8) miss.push(vectors[i].name);
  }
  return { pass, total: vectors.length, full: pass === vectors.length, miss };
}
