// @rederive/sortedIndexOf — verified-recompose of lodash.sortedindexof@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/sortedIndexOf.sir
// Clean-room re-emission of lodash.sortedindexof@4.1.0
// Reconstructed from SIR alone. Default export: sortedIndexOf(array, value).

const MAX_ARRAY_LENGTH      = 4294967295;   // 2^32 - 1
const MAX_ARRAY_INDEX       = 4294967294;   // MAX_ARRAY_LENGTH - 1
const HALF_MAX_ARRAY_LENGTH = 2147483647;   // MAX_ARRAY_LENGTH >>> 1

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol'
    || (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

// identity iteratee
function identity(value) {
  return value;
}

// SameValueZero equality
function eq(value, other) {
  return (value === other) || (value !== value && other !== other);
}

// Generic bisection path (BRANCH B)
function baseSortedIndexBy(array, value, iteratee, retHighest) {
  value = iteratee(value); // identity -> value unchanged
  let low  = 0;
  let high = array ? array.length : 0;

  const valIsNaN       = (value !== value);
  const valIsNull      = (value === null);
  const valIsSymbol    = isSymbol(value);
  const valIsUndefined = (value === undefined);

  while (low < high) {
    const mid      = Math.floor((low + high) / 2);
    const computed = iteratee(array[mid]); // identity -> array[mid]

    const othIsDefined   = (computed !== undefined);
    const othIsNull      = (computed === null);
    const othIsReflexive = (computed === computed); // false iff NaN
    const othIsSymbol    = isSymbol(computed);

    let setLow;
    if (valIsNaN) {
      // retHighest is falsey here, so: setLow = othIsReflexive
      setLow = retHighest || othIsReflexive;
    } else if (valIsUndefined) {
      // -> othIsReflexive && othIsDefined
      setLow = othIsReflexive && (retHighest || othIsDefined);
    } else if (valIsNull) {
      // -> othIsReflexive && othIsDefined && !othIsNull
      setLow = othIsReflexive && othIsDefined && (retHighest || !othIsNull);
    } else if (valIsSymbol) {
      // -> othIsReflexive && othIsDefined && !othIsNull && !othIsSymbol
      setLow = othIsReflexive && othIsDefined && !othIsNull && (retHighest || !othIsSymbol);
    } else if (othIsNull || othIsSymbol) {
      // null/symbol element while value is "ordinary"
      setLow = false;
    } else {
      // -> (computed < value) for retHighest=false
      setLow = retHighest ? (computed <= value) : (computed < value);
    }

    if (setLow) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(high, MAX_ARRAY_INDEX);
}

// Core bisection dispatcher
function baseSortedIndex(array, value, retHighest) {
  let low  = 0;
  let high = array ? array.length : low;

  // BRANCH A: numeric fast path
  if (typeof value === 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
    while (low < high) {
      const mid      = (low + high) >>> 1;
      const computed = array[mid];

      // setLow iff: computed !== null AND !isSymbol(computed) AND (computed < value)
      if (computed !== null && !isSymbol(computed) && computed < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return high;
  }

  // BRANCH B: generic path
  return baseSortedIndexBy(array, value, identity, retHighest);
}

function sortedIndexOf(array, value) {
  // N1: length guard (truthiness on array)
  const length = array ? array.length : 0;

  // N2: if length is truthy, bisect then confirm with eq
  if (length) {
    const index = baseSortedIndex(array, value /*, retHighest = undefined (falsey) */);
    if (index < length && eq(array[index], value)) {
      return index;
    }
  }

  // N3: not found
  return -1;
}

export default sortedIndexOf;
