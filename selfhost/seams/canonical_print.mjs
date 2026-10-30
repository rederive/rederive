// The real function behind unit canonical_print: the SIR canonical printer applied to the canonical parse — exactly what
// canonicalSha() hashes and every PRIMARY-SHA256 binds to (cli/sir/sir-parse.mjs: canonicalSha = sha256(print(parse(t).ast))).
export const module = 'cli/sir/sir-parse.mjs';
export const make = (m) => (text) => m.print(m.parse(text).ast);
