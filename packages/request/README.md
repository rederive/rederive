# @rederive/request

The **verified pure helper core** of [`request@2.88.2`](https://github.com/request/request) — the
deprecated-but-still-everywhere HTTP client — re-derived from its real behavior.

`request` is a big, *effectful* library. The SIR firewall carves its thin **pure** layer
(`lib/helpers.js`) out of a large **HTTP effect spine**. This package verifies the pure leaves; the
effect spine (the actual HTTP, redirects, cookies, multipart, oauth) is declared in `sir/MODULE.sir`
and is trace-oracle work — **honest scope: pure core only, for now.**

Verified units — oracles **stamped by executing the real `request@2.88.2`**, then re-derived with the
original deleted, **quorum 3/3** on a disjoint held-out set:

- `paramsHaveRequestBody(params)` — does this request carry a body? Reproduces request's exact quirks:
  it returns the *value*, not a boolean (`{multipart:[]}` → `[]`), and `json:true` does **not** count
  while `json:{…}` / `json:'s'` do.
- `toBase64(str)` — the Basic-auth base64 core; `null`/`undefined`/`''` → `''`.

```
npm i -g rederive
rdv check   <path-to-this-package>     # re-run the held-out oracle + verify hashes
rdv resynth <path-to-this-package>     # rebuild src/ locally from the contract, quorum-verified
```

Apache-2.0 (request is Apache-2.0). Part of [The rederive Promise](https://rederive.ai/promise.html):
the tools that verify trust are open, forever.
