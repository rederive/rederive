# toBase64 — UTF-8 → base64 (request@2.88.2)

    toBase64(str): string

request's pure helper (`lib/helpers.js`), the core of Basic-auth header construction
(`'Basic ' + toBase64(user + ':' + pass)`):

    Buffer.from(str || '', 'utf8').toString('base64')

- Coerces a falsy input to the empty string FIRST: `toBase64(undefined)`, `toBase64(null)`, and
  `toBase64('')` all return `''` (base64 of empty is empty). A reconstruction that omits the `|| ''`
  guard throws on `null`/`undefined` and fails the held-out.
- Otherwise standard UTF-8 → base64 (multi-byte characters encoded as their UTF-8 bytes).

Uses the Node `Buffer` builtin (deterministic, no I/O) — FUNCTIONAL. ZERO dependencies.
