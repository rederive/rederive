// @rederive/isInteger — verified-recompose of lodash.isinteger@4.0.4. quorum 3/3, differential 400/400, round 1. SIR: sir/isInteger.sir
// Clean-room re-emission of lodash.isinteger@4.0.4
// SIR: isInteger(value) -> boolean
// Behavior: typeof-number guard (no coercion) + finite-integer test.
// Non-number inputs (strings, booleans, null, undefined, objects, arrays,
// boxed Number, Symbol, BigInt, functions) always return false with zero
// coercion hooks invoked. For number-typed inputs, returns true iff the
// value is a finite integer-valued double (including -0 and +0, excluding
// NaN and ±Infinity and fractional values).

export default function isInteger(value) {
  return typeof value === 'number' && Number.isInteger(value);
}
