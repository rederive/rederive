# httpRequest — perform an HTTP request over an injected transport (representative of request's spine)

    httpRequest(reqOpts, body, http): Promise<{ statusCode, body }>

A **representative** EFFECT unit modeling the core choreography of request's HTTP spine: emit a request,
optionally write a body, end it, then consume the response. This is **NOT `request.js` verbatim** —
request's real send is far larger — it is a faithful model of the EMIT+REQUEST ordering, verified
end-to-end by a record/replay **trace** oracle with the `http` transport **injected** as the 3rd arg.

Behavior (use the injected `http`, never node's real `http`):

1. `req = http.request(reqOpts, onResponse)`            — EMIT `net.request`.
2. `req.on('error', reject)`.
3. If `body` is **truthy**, `req.write(body)`           — EMIT `net.write` (conditional: falsy / `''` body ⇒ no write).
4. `req.end()`                                          — EMIT `net.end`.
5. `onResponse(res)`: `res.setEncoding('utf8')`; collect `res.on('data', …)` chunks; `res.on('end', …)`
   resolve `{ statusCode: res.statusCode, body: <chunks concatenated> }`   — REQUEST `net.read` (injected/replayed).
6. On transport `error`, reject (the promise rejects → recorded as a thrown result).

The trace oracle records the **ordered** emit sequence (`request`, optional `write`, `end`) **and** the
resolved value, replaying a canned response. **Order matters**: `write` must precede `end`; a unit that
never calls `end` never resolves (the harness times out → caught). ZERO dependencies.
