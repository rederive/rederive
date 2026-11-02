# @rederive/review-core

rederive's own trust kernel, given the rederive treatment (`selfhost/`, REDERIVE_SELF_PLAN). 13 units — the
canonical codec, the SIR parser and lints, the gates, the graders — each shipped as its **contract**: a primary SIR, a
language file per language, one held-out oracle stamped from a pinned rederive commit, and implementations written blind
from the contract and kept only on quorum. `rdv check .` re-verifies every one; the rdv doing the checking is the
code these units re-derive.

| unit | languages | stamped from |
|---|---|---|
| annotations_text | js, ts | rederive@9e2245be5f42 |
| binding_of | js, ts | rederive@9e2245be5f42 |
| directive_spans | js, ts | rederive@9e2245be5f42 |
| escape_data | js, ts | rederive@c509956a8f8a |
| escape_property | js, ts | rederive@c41c5fcd84e0 |
| explain_contract | js, ts | rederive@9b9e5d24ca9d |
| explain_diff | js, ts | rederive@9b9e5d24ca9d |
| git_line | js, ts | rederive@4c134cacd842 |
| hunk_lines | js, ts | rederive@9b9e5d24ca9d |
| oracle_diff | js, ts | rederive@4c134cacd842 |
| review_summary | js, ts | rederive@9b9e5d24ca9d |
| vector_set_sha | js, rust, ts | rederive@6199e2cc8b75 |
| word_diff | js, ts | rederive@c41c5fcd84e0 |
