// @rederive/isOdd — verified-recompose of is-odd@3.0.1. quorum 3/3, differential 400/400, round 1. SIR: sir/isOdd.sir
'use strict';

export default function isOdd(value) {
  // NODE 0: Math.abs performs ToNumber coercion. For BigInt arguments the JS engine
  // throws a native TypeError ('Cannot convert a BigInt value to a number') here,
  // before any of isOdd's own validation runs.
  const n = Math.abs(value);

  // NODE 1: inlined is-number reduction. After Math.abs, n is always a JS number
  // (never a string, so is-number's string branch is dead). isNumber(n) collapses to
  // Number.isFinite(n): false iff n is NaN or +Infinity.
  if (!Number.isFinite(n)) {
    throw new TypeError('expected a number');
  }

  // NODE 2: integer guard (plain Error, not TypeError).
  if (!Number.isInteger(n)) {
    throw new Error('expected an integer');
  }

  // NODE 3: safe-integer guard (plain Error, not TypeError).
  if (!Number.isSafeInteger(n)) {
    throw new Error('value exceeds maximum safe integer');
  }

  // NODE 4: oddness test on the non-negative absolute value.
  // n >= 0, so (n % 2) is 0 or 1 — the === 1 form is correct here.
  return (n % 2) === 1;
}
