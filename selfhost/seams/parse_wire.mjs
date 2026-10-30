// The real function behind unit parse_wire (REDERIVE_SELF_PLAN Tier 3): rust driver parseWire: one harness output line -> the value it carries.
export const module = 'cli/lang/rust.mjs';
export const make = (m) => (line) => m.parseWire(line);
