# strip — remove ANSI SGR color codes (colors@1.4.0)

    strip(str: string): string

The `strip` (alias `stripColors`) function from the `colors` terminal-styling library. Reconstruct
its behavior EXACTLY, including its narrowness — it is a *color* stripper, not a terminal sanitizer:

- First coerce the input to a string by concatenation (`'' + str`), so non-strings work:
  `42` → `"42"`, `null` → `"null"`, `true` → `"true"`.
- Then remove ONLY SGR codes of the exact form `ESC[<one-or-more-digits>m` — a global replace with
  the regex `/\x1B\[\d+m/g`, replacing each match with the empty string.
- Do NOT remove any other escape sequence. Combined / multi-parameter SGR like `ESC[1;31m` (contains
  a `;` — the leading code survives), CSI non-SGR like `ESC[2J`, and OSC sequences like `ESC]0;…BEL`
  must be left INTACT. This narrowness is part of the contract — do not "improve" it.

ZERO dependencies — `String`/`RegExp` only, no imports, no Node builtins.
