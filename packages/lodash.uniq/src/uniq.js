// @rederive/uniq — verified-recompose of lodash.uniq@4.5.0. quorum 3/3, differential 400/400, round 1. SIR: sir/uniq.sir
function uniq(array) {
  // NODE 1: guard / coercion
  // isTruthyLen := array && array.length
  // If not truthy, return fresh empty array
  if (!array || !array.length) {
    return [];
  }

  const length = array.length;
  const result = [];

  // We walk indices 0..length-1 in ascending order.
  // For the membership test we use SameValueZero equality.
  // The Set fast-path (>=200) and linear scan (<200) are observably identical;
  // we implement a single SameValueZero path that matches both.

  // Use a Set for O(1) lookup — but NaN and ±0 need special handling.
  // JS Set already uses SameValueZero, so NaN dedupes and +0/-0 collapse.
  // We use the Set for all values; this matches PATH-B semantics for all lengths.
  const seen = new Set();

  for (let i = 0; i < length; i++) {
    const value = array[i];

    // NODE Z (zero normalization):
    // pushed := (value !== 0) ? value : 0
    // If value is +0 or -0 (since -0 !== 0 is false in JS, meaning -0 === 0),
    // push +0 instead. For all other values, push unchanged.
    const pushed = (value !== 0) ? value : 0;

    // MEMBERSHIP TEST using SameValueZero on `value` (pre-normalization; doesn't matter
    // since +0 and -0 are SameValueZero-equal anyway).
    // JS Set.has uses SameValueZero, so NaN collapses and ±0 collapse correctly.
    if (!seen.has(pushed)) {
      seen.add(pushed);
      result.push(pushed);
    }
  }

  return result;
}

export default uniq;
