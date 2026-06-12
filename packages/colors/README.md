# @sirpm/colors

A verified-recompose of **`colors@1.4.0`** (github.com/Marak/colors.js) — the last release before the
maintainer's Jan-2022 sabotage. Zero-dependency core; every unit behavior-locked to a held-out oracle
and quorum-verified with the original deleted. Ships its contract (`sir/` + `oracles/`); verify or
rebuild with `sirpm`.

## Units

| unit | kind | sig | verified | zero-dep |
|---|---|---|---|---|
| `strip` (alias `stripColors`) | FUNCTIONAL | `(str) => string` | quorum 3/3 · 10 frozen / 10 held-out | ✓ |

```ts
import { strip } from '@sirpm/colors';
strip('\x1b[31mhello\x1b[39m'); // 'hello'
```

## ⚠ Known limitation (documented in the oracle, not hidden)

`strip` removes **only single-parameter SGR color codes** of the form `ESC[<digits>m`. By design it
does **not** remove:

- combined / multi-parameter SGR (`ESC[1;31m` — the leading code survives),
- CSI non-SGR (cursor moves, `ESC[2J` clear-screen),
- OSC sequences (`ESC]0;…BEL` window-title, `ESC]8;;url BEL` hyperlinks).

So **do not use `strip` to sanitize untrusted terminal output** — title-spoofing, fake hyperlinks, and
cursor/screen manipulation pass straight through. This matches the original `colors@1.4.0` behavior
exactly (it's a *color* stripper, not a terminal sanitizer). The held-out oracle pins this on purpose
(`ho_csi_clear_screen`, `ho_osc_set_title`, `ho_osc_hyperlink`), so the contract is honest about it.
A hardened `sanitize` unit that strips all CSI/OSC is a candidate future unit — a deliberate behavior
*change*, not a silent one.

## Verify / rebuild

```bash
sirpm check .          # held-out oracle + content hashes  → ✓ VERIFIED  (deterministic, no tokens)
sirpm resynth . --n 3  # rebuild src/ locally from sir/ + oracles/  (torches tokens, quorum-verified)
sirpm vis .            # regenerate vis.html
```

Provenance, hashes, and verify status: `sir.manifest.json`. The oracle's expecteds were stamped by
**executing `colors@1.4.0`** (never hand-authored).
