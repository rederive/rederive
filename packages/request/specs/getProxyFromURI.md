# getProxyFromURI — resolve the proxy for a URI from the environment (request@2.88.2)

    getProxyFromURI(uri, env): string | null

request's proxy resolver (`lib/getProxyFromURI.js`). This is an **EFFECT** unit: the original reads
ambient `process.env`. For verification the env boundary is **INJECTED** as the `env` parameter — a
snapshot of the relevant variables (record / replay). Reconstruct the decision EXACTLY, reading the
env from the injected `env` object (NOT from `process.env`):

Relevant variables: `NO_PROXY`, `no_proxy`, `HTTP_PROXY`, `http_proxy`, `HTTPS_PROXY`, `https_proxy`.

1. `noProxy = env.NO_PROXY || env.no_proxy || ''`.
2. If `noProxy === '*'` → return `null`.
3. If `noProxy !== ''` AND the uri is in the no-proxy list → return `null`. The list is comma-split;
   each zone is trimmed + lowercased. The uri matches a zone when the uri hostname **ends with** the
   zone hostname, where both are canonicalized by prefixing `'.'` and lowercasing — so `'oogle.com'`
   does **NOT** match `'google.com'`, but `'sub.example.com'` matches `'example.com'`. If a zone has a
   port (`host:port`), the uri's port must also match (uri.port, defaulting to `'443'` for `https:` and
   `'80'` for `http:`).
4. If `uri.protocol === 'http:'`  → return `env.HTTP_PROXY || env.http_proxy || null`.
5. If `uri.protocol === 'https:'` → return `env.HTTPS_PROXY || env.https_proxy || env.HTTP_PROXY || env.http_proxy || null`.
6. Otherwise → return `null`.

Returns `null` (not `undefined`) in every no-proxy / no-match case. EFFECT: ambient env reads, injected
as `env` for record/replay verification. ZERO dependencies.
