// @rederive/sortedIndex — verified-recompose of lodash.sortedindex@4.1.0. quorum 3/3, differential 400/400, round 1. SIR: sir/sortedIndex.sir
// Clean-room re-emission of sortedIndex (lodash.sortedindex@4.1.0)
// Reconstructed strictly from the SIR behavioral contract.

const MAX_ARRAY_LENGTH      = 4294967295;            // 0xFFFFFFFF
const MAX_ARRAY_INDEX       = MAX_ARRAY_LENGTH - 1;  // 4294967294
const HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1; // 2147483647
const symbolTag             = '[object Symbol]';

// isObjectLike(v): truthy AND typeof is "object"
// Note: null -> typeof "object" but !!null is false -> returns false
function isObjectLike(v) {
  return Boolean(v) === true && typeof v === 'object';
}

// isSymbol(v): Symbol primitive or Symbol-wrapper object
function isSymbol(v) {
  return typeof v === 'symbol' ||
    (isObjectLike(v) && Object.prototype.toString.call(v) === symbolTag);
}

// baseSortedIndex: numeric fast path or general path depending on value shape
function baseSortedIndex(array, value) {
  let low  = 0;
  let high = array ? array.length : 0;

  // NODE A: path selection
  // Numeric fast path iff: typeof value === "number" AND value === value (non-NaN)
  // AND high <= HALF_MAX_ARRAY_LENGTH
  if (typeof value === 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
    // NODE B: numeric fast path
    while (low < high) {
      const mid      = (low + high) >>> 1;
      const computed = array[mid];
      // advance only if computed is non-null, non-symbol, AND strictly less than value
      const advance  = (computed !== null) &&
                       (isSymbol(computed) === false) &&
                       (computed < value);
      if (advance) {
        low  = mid + 1;
      } else {
        high = mid;
      }
    }
    return high;
  }

  // NODE C: general path (baseSortedIndexBy with identity iteratee, retHighest=falsy)
  // Pre-compute value-shape flags once
  const valIsNaN       = (value !== value);
  const valIsNull      = (value === null);
  const valIsSymbol    = isSymbol(value);
  const valIsUndefined = (value === undefined);

  while (low < high) {
    const mid             = Math.floor((low + high) / 2);
    const computed        = array[mid];
    const othIsDefined    = (computed !== undefined);
    const othIsNull       = (computed === null);
    const othIsReflexive  = (computed === computed); // false only when element is NaN
    const othIsSymbol     = isSymbol(computed);

    let setLow;

    if (valIsNaN) {
      // advance past any non-NaN element; stop at NaN element
      setLow = othIsReflexive;
    } else if (valIsUndefined) {
      // advance past any defined non-NaN element; stop at undefined or NaN
      setLow = othIsReflexive && othIsDefined;
    } else if (valIsNull) {
      // advance past defined, non-NaN, non-null elements; stop at null/undefined/NaN
      setLow = othIsReflexive && othIsDefined && (othIsNull === false);
    } else if (valIsSymbol) {
      // advance past defined non-NaN non-null non-symbol; stop at symbol/null/undefined/NaN
      setLow = othIsReflexive && othIsDefined && (othIsNull === false) && (othIsSymbol === false);
    } else if (othIsNull || othIsSymbol) {
      // ordinary comparable value; null or symbol element is "not less than" -> move left
      setLow = false;
    } else {
      // JS abstract relational comparison (strict less-than, retHighest=false branch)
      setLow = (computed < value);
    }

    if (setLow) {
      low  = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(high, MAX_ARRAY_INDEX);
}

// sortedIndex: public entry point — always calls baseSortedIndex (retHighest omitted => falsy)
function sortedIndex(array, value) {
  return baseSortedIndex(array, value);
}

export default sortedIndex;
