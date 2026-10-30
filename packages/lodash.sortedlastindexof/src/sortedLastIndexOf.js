// @rederive/sortedLastIndexOf — verified-recompose of lodash.sortedlastindexof@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/sortedLastIndexOf.sir
// Clean-room re-emission of sortedLastIndexOf (lodash.sortedlastindexof@4.1.0)
// Reconstructed from SIR contract. No external imports.

const MAX_ARRAY_LENGTH      = 4294967295;  // 2^32 - 1
const MAX_ARRAY_INDEX       = 4294967294;  // MAX_ARRAY_LENGTH - 1
const HALF_MAX_ARRAY_LENGTH = 2147483647;  // MAX_ARRAY_LENGTH >>> 1
const symbolTag             = '[object Symbol]';

function isObjectLike(value) {
  return (!!value) && (typeof value === 'object');
}

function isSymbol(value) {
  return (typeof value === 'symbol') ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === symbolTag);
}

function identity(value) {
  return value;
}

// SameValueZero equality
function eq(a, b) {
  return (a === b) || (a !== a && b !== b);
}

// baseSortedIndexBy — slow path
function baseSortedIndexBy(array, value, iteratee, retHighest) {
  value = iteratee(value);
  var low  = 0;
  var high = array ? array.length : 0;

  var valIsNaN       = (value !== value);
  var valIsNull      = (value === null);
  var valIsSymbol    = isSymbol(value);
  var valIsUndefined = (value === undefined);

  while (low < high) {
    var mid      = Math.floor((low + high) / 2);
    var computed = iteratee(array[mid]);

    var othIsDefined   = (computed !== undefined);
    var othIsNull      = (computed === null);
    var othIsReflexive = (computed === computed);  // false iff NaN
    var othIsSymbol    = isSymbol(computed);

    var setLow;
    if (valIsNaN) {
      // retHighest=true => setLow always true
      setLow = retHighest || othIsReflexive;
    } else if (valIsUndefined) {
      setLow = othIsReflexive && (retHighest || othIsDefined);
    } else if (valIsNull) {
      setLow = othIsReflexive && othIsDefined && (retHighest || !othIsNull);
    } else if (valIsSymbol) {
      setLow = othIsReflexive && othIsDefined && !othIsNull && (retHighest || !othIsSymbol);
    } else if (othIsNull || othIsSymbol) {
      setLow = false;
    } else {
      setLow = retHighest ? (computed <= value) : (computed < value);
    }

    if (setLow) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  // nativeMin clamp (unreachable for in-scope sizes)
  return high < MAX_ARRAY_INDEX ? high : MAX_ARRAY_INDEX;
}

// baseSortedIndex — dual-path bisection
function baseSortedIndex(array, value, retHighest) {
  var low  = 0;
  var high = array ? array.length : 0;

  // FAST PATH: numeric, non-NaN value, and high within bounds
  if (typeof value === 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
    while (low < high) {
      var mid      = (low + high) >>> 1;
      var computed = array[mid];
      // retHighest=true comparison: null or Symbol element forces high := mid
      if (computed !== null && !isSymbol(computed) && computed <= value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    return high;
  }

  // SLOW PATH: non-numeric, NaN, or oversized array
  return baseSortedIndexBy(array, value, identity, retHighest);
}

export default function sortedLastIndexOf(array, value) {
  // NODE 0: length guard (truthiness of array)
  var length = array ? array.length : 0;
  if (!length) {
    return -1;  // BRANCH A
  }

  // NODE 1: bisect with retHighest=true, step back by 1
  var index = baseSortedIndex(array, value, true) - 1;

  // NODE 2: SameValueZero membership check
  if (eq(array[index], value)) {
    return index;  // BRANCH B
  }
  return -1;       // BRANCH C
}
