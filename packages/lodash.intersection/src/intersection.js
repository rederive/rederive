// @rederive/intersection — verified-recompose of lodash.intersection@4.4.0. quorum 3/3, differential 400/400, round 1. SIR: sir/intersection.sir
// Clean-room re-emission of lodash.intersection@4.4.0
// Reconstructed strictly from the SIR contract and frozen oracle.

// H1. SameValueZero equality
function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

// H2. isObjectLike(v): truthy AND typeof === "object"
function isObjectLike(v) {
  return v != null && typeof v === 'object';
}

// H3. isLength(v): non-negative safe integer
function isLength(v) {
  return typeof v === 'number' && v > -1 && v % 1 === 0 && v <= 9007199254740991;
}

// H4. isFunction(v): "[object Function]" or "[object GeneratorFunction]"
function isFunction(v) {
  const tag = Object.prototype.toString.call(v);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

// H5. isArrayLike(v): not null, valid length, not a function
function isArrayLike(v) {
  return v != null && isLength(v.length) && !isFunction(v);
}

// H6. isArrayLikeObject(v): isObjectLike AND isArrayLike
function isArrayLikeObject(v) {
  return isObjectLike(v) && isArrayLike(v);
}

// H7. castArrayLikeObject(v): returns v if array-like-object, else fresh []
function castArrayLikeObject(v) {
  return isArrayLikeObject(v) ? v : [];
}

// H8. arrayIncludes(arr, value): linear scan with SameValueZero
function arrayIncludes(arr, value) {
  if (arr == null) return false;
  const len = arr.length;
  for (let i = 0; i < len; i++) {
    if (eq(arr[i], value)) return true;
  }
  return false;
}

// N4. baseIntersection(arrs): intersect all arrays, ordered/deduped by first
function baseIntersection(arrs) {
  const length = arrs[0].length;
  // maxLength = min length across all arrays
  let maxLength = Infinity;
  for (let i = 0; i < arrs.length; i++) {
    if (arrs[i].length < maxLength) maxLength = arrs[i].length;
  }

  const result = [];

  outer: for (let index = 0; index < length && result.length < maxLength; index++) {
    let value = arrs[0][index];
    // Zero normalization: +0 or -0 -> +0
    value = (value !== 0) ? value : 0;

    // Dedup: skip if already in result
    if (arrayIncludes(result, value)) continue;

    // Membership in every other array
    for (let othIndex = arrs.length - 1; othIndex >= 1; othIndex--) {
      if (!arrayIncludes(arrs[othIndex], value)) {
        continue outer;
      }
    }

    result.push(value);
  }

  return result;
}

// Main intersection function (N1..N3)
function intersection(...arrays) {
  // N2: cast each arg
  const mapped = arrays.map(castArrayLikeObject);

  // N3: first-arg gate
  if (mapped.length > 0 && mapped[0] === arrays[0]) {
    return baseIntersection(mapped);
  }

  return [];
}

export default intersection;
