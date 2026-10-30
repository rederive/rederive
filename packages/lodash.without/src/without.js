// @rederive/without — verified-recompose of lodash.without@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/without.sir
export default function without(array, ...values) {
  // NODE 1: isArrayLikeObject guard
  // isObjectLike: truthy AND typeof === 'object'
  if (array == null || typeof array !== 'object') {
    return [];
  }
  // isArrayLike: value != null AND isLength(value.length) AND NOT isFunction(value)
  // (isFunction check is redundant here since typeof 'object' already excludes functions)
  const len = array.length;
  if (typeof len !== 'number' || len < 0 || len % 1 !== 0 || len > 9007199254740991) {
    return [];
  }

  // NODE 2: baseDifference(array, values) — no iteratee, no comparator
  const result = [];
  const valuesLength = values.length;

  if (len === 0) {
    return result;
  }

  // Check whether values contains a NaN (for the NaN membership path)
  let valuesHasNaN = false;
  for (let i = 0; i < valuesLength; i++) {
    if (values[i] !== values[i]) {
      valuesHasNaN = true;
      break;
    }
  }

  for (let index = 0; index < len; index++) {
    const value = array[index];

    // ZERO-NORMALIZATION: replace ±0 with +0
    const normalized = (value !== 0) ? value : 0;

    // MEMBERSHIP TEST under SameValueZero
    if (value !== value) {
      // NODE 2.b: element is NaN
      if (valuesHasNaN) {
        // skip — NaN is in values
        continue;
      }
    } else {
      // NODE 2.a: element is not NaN — use strict === (±0 collapse: +0 === -0)
      let found = false;
      for (let vi = 0; vi < valuesLength; vi++) {
        if (values[vi] === value) {
          found = true;
          break;
        }
      }
      if (found) {
        continue;
      }
    }

    result.push(normalized);
  }

  return result;
}
