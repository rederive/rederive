# eq — structural equality (rdv verdict core)

    eq(a: any, b: any): boolean

The comparison primitive that decides whether a unit's output matches an oracle's expected output.
Reconstruct its behavior EXACTLY, including its sharp edges:

- Equality is **value-based via canonical JSON**: `JSON.stringify(a) === JSON.stringify(b)`.
- **Order is significant** — both array element order (`[1,2] ≠ [2,1]`) and object key-insertion
  order (`{a:1,b:2} ≠ {b:2,a:1}`). This is intentional: oracle expecteds and actual outputs come
  from the same producer, so key order is stable, and a looser set-equality would mask real diffs.
- Type coercion is **rejected**: `1 ≠ "1"`, `0 ≠ false`, `null ≠ 0`, `[] ≠ {}`, `"" ≠ []`.
- It is the kernel of trust: a too-loose `eq` would let a wrong implementation pass grading.

ZERO dependencies — `JSON` only, no imports.
