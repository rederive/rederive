# canonical_print — round 0, superseded

The cold re-derivation of `print(parse(text).ast)`, stamped from rederive@20bdd3dd041a, when that was what every
`PRIMARY-SHA256` hashed. Its decomposer's findings showed the hash under-covered the primary (a later CITED overwrote an
earlier one, a legacy ` # ` cut a literal, orphan lines vanished, re-printing changed the hash). Under the pilot's rule
(fix and re-stamp) the binding now hashes `canonicalText` instead (rederive 7c2a6d0); that function is unit
`../canonical_text`. These files stay as the evidence. The printer itself is now only the formatter's layout (sir-fmt),
and its non-idempotence (finding 1) is an open item for a later formatter unit.

Round-1 note (2026-10-26): a properly seeded re-sweep found one more error in this round-0 contract — R8 says a repeated
attribute keyword joins old and new values with a space, but the code skips the join when the earlier value is empty
(input `"CITED # Ué\n \u2028CITED\r \u2029\u00a0\r  #\u2028 CITED  "`: CITED = `"#"`, R8 predicts `" #"`). Recorded, not edited:
the unit is superseded.
