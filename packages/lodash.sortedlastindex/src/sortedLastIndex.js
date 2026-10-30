// @rederive/sortedLastIndex — verified-recompose of lodash.sortedlastindex@4.1.0. quorum 3/3, differential 400/400, round 2. SIR: sir/sortedLastIndex.sir
// sortedLastIndex — clean-room re-emission from SIR (emit #1)
// lodash.sortedlastindex@4.1.0, MIT license
// Default export: sortedLastIndex(array, value) -> number

const MAX_ARRAY_LENGTH      = 4294967295;  // 2^32 - 1
const MAX_ARRAY_INDEX       = 4294967294;  // MAX_ARRAY_LENGTH - 1
const HALF_MAX_ARRAY_LENGTH = 2147483647;  // MAX_ARRAY_LENGTH >>> 1 == 2^31 - 1
const symbolTag             = '[object Symbol]';

function isSymbol(value) {
  if (typeof value === 'symbol') {
    return true;
  }
  // isObjectLike: truthy AND typeof === 'object'
  if (value && typeof value === 'object') {
    return Object.prototype.toString.call(value) === symbolTag;
  }
  return false;
}

// NODE B — numeric fast path (retHighest = true)
function baseSortedIndexNumeric(array, value, high) {
  let low = 0;
  // high already established with nullish guard; if 0, loop never runs
  while (low < high) {
    const mid = (low + high) >>> 1;
    const computed = array[mid];
    // retHighest=true: advance low when computed is an ordinary value <= value
    if (computed !== null && !isSymbol(computed) && computed <= value) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return high;
}

// NODE C — general path (retHighest = true)
function baseSortedIndexBy(array, value, high) {
  // value = identity(value) — no-op
  let low = 0;
  // high already established with nullish guard; if 0, loop never runs

  const valIsNaN       = (value !== value);
  const valIsNull      = (value === null);
  const valIsSymbol    = isSymbol(value);
  const valIsUndefined = (value === undefined);

  while (low < high) {
    const mid      = Math.floor((low + high) / 2);
    const computed = array[mid]; // identity(array[mid]) == array[mid]

    const othIsDefined   = (computed !== undefined);
    const othIsNull      = (computed === null);
    const othIsReflexive = (computed === computed); // false iff NaN
    const othIsSymbol    = isSymbol(computed);

    let setLow;

    if (valIsNaN) {
      // retHighest=true => setLow = TRUE always
      setLow = true; // (retHighest || othIsReflexive) and retHighest is always true
    } else if (valIsUndefined) {
      // retHighest=true => setLow = othIsReflexive
      setLow = othIsReflexive;
    } else if (valIsNull) {
      // retHighest=true => setLow = othIsReflexive AND othIsDefined
      setLow = othIsReflexive && othIsDefined;
    } else if (valIsSymbol) {
      // retHighest=true => setLow = othIsReflexive AND othIsDefined AND (NOT othIsNull)
      setLow = othIsReflexive && othIsDefined && !othIsNull;
    } else if (othIsNull || othIsSymbol) {
      // value is ordinary, but element is null or symbol -> never advance low
      setLow = false;
    } else {
      // retHighest=true => setLow = (computed <= value)
      setLow = computed <= value;
    }

    if (setLow) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(high, MAX_ARRAY_INDEX);
}

// NODE A — sortedLastIndex entry (retHighest = true)
function sortedLastIndex(array, value) {
  // CRITICAL INVARIANT: high derived ONCE as the FIRST statement, nullish guard, NO re-read of array.length
  const low  = 0;
  const high = array ? array.length : 0;

  // ROUTING GUARD: tests the VARIABLE `high`, NOT array.length, does NOT dereference `array`
  if (typeof value === 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
    // numeric fast path: value is a non-NaN JS number AND array not oversized
    return baseSortedIndexNumeric(array, value, high);
  } else {
    // general path
    return baseSortedIndexBy(array, value, high);
  }
}

export default sortedLastIndex;
