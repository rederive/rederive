// @rederive/pullAt — verified-recompose of lodash.pullat@4.6.0. quorum 3/3, differential 400/400, round 1. SIR: sir/pullAt.sir
// emit_2.mjs — clean-room reconstruction of lodash.pullAt@4.6.0
// KIND STATE: returns removed-values array AND mutates `array` in place.
// Emitter #2 of 3. Reconstructed solely from the SIR and frozen oracle.

const MAX_SAFE_INTEGER = 9007199254740991;

// isIndex(value, length): true if value is a valid array index in [0, length).
// When length is omitted / defaulted it uses MAX_SAFE_INTEGER.
function isIndex(value, length) {
  const len = length === undefined ? MAX_SAFE_INTEGER : length;
  if (len === 0) return false;
  const type = typeof value;
  if (type === 'number') {
    return value > -1 && value % 1 === 0 && value < len;
  }
  // numeric string — must match canonical unsigned integer form: "0" or /^[1-9]\d*$/
  if (type === 'string') {
    if (!/^(?:0|[1-9]\d*)$/.test(value)) return false;
    const n = +value;
    return n > -1 && n % 1 === 0 && n < len;
  }
  return false;
}

// isKey(value, object): true if value is a direct (non-path) property key.
// For our in-scope use, numbers and plain strings that are NOT deep paths qualify.
// Deep path strings contain '.' or '['. Numbers always qualify (they're not path strings).
function isKey(value) {
  if (typeof value === 'number') return true;
  if (typeof value === 'string') {
    // A "key" is a non-path — no dots or bracket notation
    return !/[.[\]]/.test(value);
  }
  return false;
}

// compareAscending: ascending total order for the sort in NODE 5.
// Undefined / NaN sorts to end.
function compareAscending(a, b) {
  // Handle undefined
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;

  // Handle NaN
  const aIsNaN = typeof a === 'number' && a !== a;
  const bIsNaN = typeof b === 'number' && b !== b;
  if (aIsNaN && bIsNaN) return 0;
  if (aIsNaN) return 1;
  if (bIsNaN) return -1;

  if (a < b) return -1;
  if (a > b) return 1;
  // Equal values
  return 0;
}

// baseFlatten: flatten one level. Arrays (and array-like objects with Symbol.isConcatSpreadable)
// are spread one level; everything else is kept as-is.
function baseFlatten(arr) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const val = arr[i];
    // Flattenable: real Array, or arguments object, or Symbol.isConcatSpreadable
    if (Array.isArray(val)) {
      for (let j = 0; j < val.length; j++) {
        result.push(val[j]);
      }
    } else {
      // Check for arguments object or Symbol.isConcatSpreadable
      const spreadable = val != null && val[Symbol.isConcatSpreadable];
      if (spreadable) {
        // Treat like array-like
        const len = val.length >>> 0;
        for (let j = 0; j < len; j++) {
          result.push(val[j]);
        }
      } else {
        result.push(val);
      }
    }
  }
  return result;
}

// get(array, idx): read array[idx]; returns undefined for OOR/negative/fractional/missing.
function get(array, idx) {
  const length = array ? array.length : 0;
  if (isIndex(idx, length)) {
    return array[+idx];
  }
  // For non-index (OOR, negative, fractional, non-canonical string): undefined
  return undefined;
}

// baseAt(array, idxs): compute removed-values array in index order, pre-mutation.
function baseAt(array, idxs) {
  const result = new Array(idxs.length);
  for (let i = 0; i < idxs.length; i++) {
    result[i] = get(array, idxs[i]);
  }
  return result;
}

// basePullAt(array, sortedIndexes): mutate array in place.
// sortedIndexes is ascending; walk back-to-front, skip adjacent duplicates.
function basePullAt(array, sortedIndexes) {
  const length = sortedIndexes.length;
  if (!length) return;
  const lastPos = length - 1;
  let previous;
  for (let pos = lastPos; pos >= 0; pos--) {
    const index = sortedIndexes[pos];
    // Skip adjacent (consecutive) duplicates — only skip if NOT the last position
    // and index === previous from the prior iteration
    if (pos !== lastPos && index === previous) {
      continue;
    }
    previous = index;
    // isIndex with default length (MAX_SAFE_INTEGER) — checks if it's a valid non-negative integer
    if (isIndex(index)) {
      // Splice out one element
      array.splice(+index, 1);
    } else if (!isKey(index)) {
      // Deep path: delete via castPath/parent — out of in-scope; not emitted
      // (no-op in practice for our inputs)
    } else {
      // Shallow non-index key (OOR number, negative number, etc.)
      // delete array[index] — for a non-existent property this is a no-op
      delete array[index];
    }
  }
}

// pullAt: the main function.
// Signature: pullAt(array, ...indexes)
function pullAt(array, ...indexes) {
  // NODE 1: `indexes` is already gathered by rest parameter

  // NODE 2: flatten one level
  const idxs = baseFlatten(indexes);

  // NODE 3: capture length BEFORE mutation
  const length = array ? array.length : 0;

  // NODE 4: compute result (pre-mutation, original index order)
  const result = baseAt(array, idxs);

  // NODE 5: build sorted removal list
  // Map in-range indexes to their number form; out-of-range left as-is
  const sorted = idxs.map(idx => isIndex(idx, length) ? +idx : idx);
  sorted.sort(compareAscending);

  // NODE 6: in-place removal (back-to-front, adjacent dedup)
  basePullAt(array, sorted);

  // NODE 7: return result
  return result;
}

export default pullAt;
