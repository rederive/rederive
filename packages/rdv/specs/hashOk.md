# hashOk — content-hash check (rdv verdict core)

    hashOk(bytes, want?: string): boolean

The second half of tamper detection (the first is behavioral grading). Reconstruct the **control
logic** exactly:

- If `want` is absent or empty (`undefined` / `""`), the hash is **not pinned** ⇒ return `true`.
- Otherwise return `sha256_hex(bytes) === want` — an exact hex match.
- A single changed byte in `bytes` against a fixed `want` ⇒ `false` (tamper caught).

Scope note: this unit is **not zero-dep**. The SHA-256 algorithm is delegated to the host
(`node:crypto`); the contract verifies the *control logic*, not the hash primitive. Verifying the
algorithm itself (and the substrate it runs on) is the enterprise / every-byte-verified extension and
is intentionally out of scope. Under the SIR firewall this unit is therefore `FUNCTIONAL?` (suspect):
functional in shape, with a named opaque dependency, behaviorally pinned by its oracle.
