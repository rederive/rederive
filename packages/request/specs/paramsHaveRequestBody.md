# paramsHaveRequestBody — does this request carry a body? (request@2.88.2)

    paramsHaveRequestBody(params): any

request's pure predicate (`lib/helpers.js`) deciding whether a request-options object carries a body.
Reconstruct EXACTLY, including its quirks — it is *used* in a boolean context but **returns the value**:

    return params.body
        || params.requestBodyStream
        || (params.json && typeof params.json !== 'boolean')
        || params.multipart

- Returns the **first truthy** of those four expressions; otherwise the last falsy value (often
  `undefined`). It returns the VALUE, not a coerced boolean: `{body:'x'}` → `'x'`, `{multipart:[]}` → `[]`.
- **The quirk:** `json` counts ONLY when non-boolean. `{json:true}` → the json clause is `true && false`
  = `false`, so it does not count (→ `undefined` if nothing else matches). `{json:{...}}` or `{json:'s'}`
  → counts (→ `true`). A faithful re-derivation MUST reproduce this exactly.
- Falsy bodies do not count: `{body:0}`, `{body:''}` fall through.
- Returning `false` where the original returns `undefined` is WRONG (the held-out distinguishes them).

Pure — reads only the params object; no I/O. ZERO dependencies.
