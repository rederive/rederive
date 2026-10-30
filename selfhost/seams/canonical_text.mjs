// The real function behind unit canonical_text: the BINDING normal form every PRIMARY-SHA256 hashes
// (cli/sir/sir-parse.mjs: canonicalSha = sha256(canonicalText(t))). It replaced print(parse(t)) on 2026-10-26, after the
// round-0 re-derivation of that function (units/canonical_print) showed it under-covered the primary.
export const module = 'cli/sir/sir-parse.mjs';
export const make = (m) => (text) => m.canonicalText(text);
