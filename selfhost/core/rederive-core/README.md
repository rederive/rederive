# @rederive/rederive-core

rederive's own trust kernel, given the rederive treatment (`selfhost/`, REDERIVE_SELF_PLAN). 42 units — the
canonical codec, the SIR parser and lints, the gates, the graders — each shipped as its **contract**: a primary SIR, a
language file per language, one held-out oracle stamped from a pinned rederive commit, and implementations written blind
from the contract and kept only on quorum. `rdv check .` re-verifies every one; the rdv doing the checking is the
code these units re-derive.

| unit | languages | stamped from |
|---|---|---|
| adopt_find_duplicate | js, rust, ts | rederive@7b348e351c9f |
| adopt_kept_content | js, rust, ts | rederive@c7b0916ed08a |
| adopt_replace_block | js, rust, ts | rederive@6199e2cc8b75 |
| any_ban_hits | js, rust, ts | rederive@aa3b8dce6ef8 |
| canonical_string | js, rust, ts | rederive@6199e2cc8b75 |
| canonical_text | js, rust, ts | rederive@6199e2cc8b75 |
| carried_canonical | js, rust, ts | rederive@b15b56613f9d |
| carried_declared | js, rust, ts | rederive@6199e2cc8b75 |
| carried_shape_type | js, rust, ts | rederive@6199e2cc8b75 |
| check_carried | js, rust, ts | rederive@6199e2cc8b75 |
| cmp_ver | js, rust, ts | rederive@b15b56613f9d |
| decode_value | js, ts | rederive@6199e2cc8b75 |
| detect_features | js, rust, ts | rederive@69b68b4a1c39 |
| diff_hint | js, rust, ts | rederive@6199e2cc8b75 |
| directive | js, rust, ts | rederive@6199e2cc8b75 |
| display_value | js, rust, ts | rederive@6199e2cc8b75 |
| divergence_of | js, rust, ts | rederive@6199e2cc8b75 |
| encode_value | js, rust, ts | rederive@7b348e351c9f |
| escape_markers | js, ts | rederive@f68cca701417 |
| f64_bits | js, rust, ts | rederive@b329a40412df |
| f64_canonical_bits | js, rust, ts | rederive@b15b56613f9d |
| f64_from_bits | js, rust, ts | rederive@b15b56613f9d |
| hash_ok | js, rust, ts | rederive@6199e2cc8b75 |
| languages_of | js, rust, ts | rederive@6199e2cc8b75 |
| legacy_grade | js, ts | rederive@6199e2cc8b75 |
| legacy_print_sha | js, rust, ts | rederive@6199e2cc8b75 |
| lint_leak | js, rust, ts | rederive@6199e2cc8b75 |
| lint_transcription | js, rust, ts | rederive@6199e2cc8b75 |
| parse_sig | js, rust, ts | rederive@6199e2cc8b75 |
| parse_type | js, rust, ts | rederive@6199e2cc8b75 |
| parse_wire | js, rust, ts | rederive@f68cca701417 |
| pin_lint | js, rust, ts | rederive@6199e2cc8b75 |
| quorum | js, rust, ts | rederive@b15b56613f9d |
| rust_carried_table | js, rust, ts | rederive@6199e2cc8b75 |
| rust_reshape | js, rust, ts | rederive@6199e2cc8b75 |
| schema_lint | js, rust, ts | rederive@6199e2cc8b75 |
| sir_parse | js, rust, ts | rederive@6199e2cc8b75 |
| spec_version_for | js, rust, ts | rederive@b15b56613f9d |
| tree_sha | js, rust, ts | rederive@b15b56613f9d |
| ts_sig_of | js, rust, ts | rederive@7f015c4d1023 |
| vector_set_sha | js, rust, ts | rederive@6199e2cc8b75 |
| wire_line | js, ts | rederive@f68cca701417 |
