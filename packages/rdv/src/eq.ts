// @rederive/rdv — verified-recompose of rdv's deep-equality primitive (verdict core). ZERO-DEP.
// Value-based, order-sensitive structural equality via canonical JSON. It is the comparison primitive
// under grade(): a unit's actual output equals an oracle's expected output iff their JSON forms match.
// Exactness is the contract — array order AND object key-insertion order are significant.
export function eq(a: any, b: any): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
