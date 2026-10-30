// The real function behind unit decode_value: the canonical decoder (decode) — how every oracle argument reaches a js/ts artifact.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (tree) => m.decode(tree);
