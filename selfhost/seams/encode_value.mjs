// The real function behind unit encode_value: the canonical encoder (encode under a parsed type) — how every observation becomes a sir-canonical-v1 tree.
export const module = 'cli/sir/canon.mjs';
export const make = (m) => (value, type) => m.encode(value, m.parseType(type));
