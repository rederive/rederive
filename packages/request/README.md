# @rederive/request

The **verified pure helper core** of [`request@2.88.2`](https://github.com/request/request) — the
deprecated-but-still-everywhere HTTP client — re-derived from its real behavior.

`request` is a big, *effectful* library. The SIR firewall carves its thin **pure** layer out of a large
**HTTP effect spine**. This package verifies the pure leaves **and both effect-boundary classes** (env
reads, and the ordered HTTP emit/response trace). Re-deriving request.js's whole `Request` class verbatim
remains the frontier — **honest scope: the trace-oracle machinery is proven on request's choreography; the
gap is the size of the real Request class, not the method.**

Verified units — oracles **stamped by executing the real `request@2.88.2`**, then re-derived with the
original deleted, **quorum 3/3** on a disjoint held-out set:

- `paramsHaveRequestBody(params)` — does this request carry a body? Reproduces request's exact quirks:
  it returns the *value*, not a boolean (`{multipart:[]}` → `[]`), and `json:true` does **not** count
  while `json:{…}` / `json:'s'` do.
- `toBase64(str)` — the Basic-auth base64 core; `null`/`undefined`/`''` → `''`.
- `getProxyFromURI(uri, env)` — **EFFECT** unit (env boundary). The original reads ambient `process.env`;
  here the env boundary is **injected** as the `env` parameter and verified by record/replay. Reproduces
  the real proxy logic: `NO_PROXY` wildcard/suffix-match canonicalization (`oogle.com` ≠ `google.com`),
  `host:port` zones, `http`/`https` proxy-var precedence.
- `httpRequest(reqOpts, body, http)` — **EFFECT / trace** unit (net boundary). A *representative* model of
  request's HTTP spine, verified by a full record/replay **trace** oracle: the `http` transport is injected;
  the ordered EMIT (`request` → optional `write` → `end`) and the resolved response are checked against the
  recorded trace (order-sensitive — a unit that never `end`s times out, an unconditional `write` is caught).
  Verified by `trace-verify.mjs` (rdv check is value-mode); not `request.js` verbatim.

```
npm i -g rederive
rdv check   <path-to-this-package>     # re-run the held-out oracle + verify hashes
rdv resynth <path-to-this-package>     # rebuild src/ locally from the contract, quorum-verified
```

Apache-2.0 (request is Apache-2.0). Part of [The rederive Promise](https://rederive.ai/promise.html):
the tools that verify trust are open, forever.
