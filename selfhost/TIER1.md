# Tier 1 scoreboard (REDERIVE_SELF_PLAN)

Authority: rederive@31803f408bef (round 3) (selfhost/AUTHORITY.json). One row per unit; a finding fixed in the kernel retires the authority and re-stamps the units it touched.

| unit | wave | findings | runner | js | ts | rust | cross | stamped from |
|---|---|---|---|---|---|---|---|---|
| canonical_string | pilot | strict domain, canon.py anchor | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 825/825 | ccc0bd9d45cb |
| canonical_text | pilot | binding = parser lines, E_NOT_UNICODE | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | ccc0bd9d45cb |
| f64_bits | A | #1 #2 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | b329a40412df |
| f64_from_bits | A | #4 #48 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | b15b56613f9d |
| f64_canonical_bits | A | #52 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | b15b56613f9d |
| parse_type | A | #16 #44 #65 | VERIFIED r2 | 3/3 | 3/3 | 3/3 | 2000/2000 | 31803f408bef |
| parse_sig | A | #20 #44 #65 | VERIFIED r2 | 3/3 | 3/3 | 3/3 | 2000/2000 | 31803f408bef |
| encode_value | A | #28–31 #35–39 #66 | VERIFIED r2 | 3/3 | 3/3 | 3/3 | 1271/1271 | 31803f408bef |
| decode_value | A | #24–26 #33 #34 #58 #66 | VERIFIED r1 | 3/3 | 3/3 | — | 777/777 | 31803f408bef |
| vector_set_sha | A | #8–10 #32 | VERIFIED r2 | 3/3 | 3/3 | 3/3 | 653/653 | b329a40412df |
| cmp_ver | B | #14 #46 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | b15b56613f9d |
| detect_features | B | #22 #41 #54 #64 | VERIFIED r3 | 3/3 | 3/3 | 3/3 | 667/667 | 31803f408bef |
| spec_version_for | B | #5–7 #49 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | b15b56613f9d |
| languages_of | B | #15 #40 #63 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 576/576 | 31803f408bef |
| quorum | B | #3 #47 | VERIFIED r2 | 3/3 | 3/3 | 3/3 | 2000/2000 | b15b56613f9d |
| tree_sha | B | #11–13 #45 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 2000/2000 | b15b56613f9d |
| sir_parse | B | #27 #43 #59–#62 | VERIFIED r2 | 3/3 | 2/3 | 3/3 | 2000/2000 | 31803f408bef |
| directive | B | #19 #43 #53 #59–#62 | VERIFIED r3 | 3/3 | 3/3 | 3/3 | 2000/2000 | 31803f408bef |
| lint_transcription | B | #21 #50 | VERIFIED r2 | 3/3 | 3/3 | 3/3 | 2000/2000 | 31803f408bef |
| lint_leak | B | #23 #42 #62 | VERIFIED r3 | 3/3 | 3/3 | 3/3 | 2000/2000 | 31803f408bef |
| carried_canonical | B | #17 #18 #51 | VERIFIED r1 | 3/3 | 3/3 | 3/3 | 847/847 | b15b56613f9d |

**Tier 1 complete (2026-10-26): 21 of 21 VERIFIED** in every language each family declares (decode_value is js/ts by domain). Three rounds against three kernels: round 1 found 32 findings, round 2 22 more (#33–#56), round 3 the batch fix + re-cut of the 10 units it touched (#57–#71). Units stamped from an earlier authority (ccc0bd9d45cb, b329a40412df, b15b56613f9d) compute the same function in the round-3 kernel: regress.test proves the live kernel reproduces every vector of all 21 (206/206).
