// @rederive/slice — verified-recompose of lodash.slice@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/slice.sir
// Clean-room reconstruction of lodash.slice@4.2.0
// Implements the full pipeline: guard, defaulting asymmetry, toInteger/toFinite/toNumber
// coercion (with exact string rules), negative-wrap, clamp, uint32 coercion, dense baseSlice.

const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reTrim = /^\s+|\s+$/g;
const reIsUint = /^(?:0|[1-9]\d*)$/;

const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function isFunction(value) {
  if (!isObject(value)) return false;
  const tag = Object.prototype.toString.call(value);
  return tag === '[object Function]' || tag === '[object GeneratorFunction]';
}

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 &&
    value % 1 === 0 &&
    value <= MAX_SAFE_INTEGER;
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && !isFunction(value);
}

function isIndex(value, length) {
  length = (length == null) ? MAX_SAFE_INTEGER : length;
  return !!length &&
    (typeof value === 'number' || reIsUint.test(value)) &&
    (value > -1 && value % 1 === 0 && value < length);
}

function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

function isIterateeCall(value, index, object) {
  if (!isObject(object)) return false;
  const type = typeof index;
  if (type === 'number'
      ? (isArrayLike(object) && isIndex(index, object.length))
      : (type === 'string' && index in object)) {
    return eq(object[index], value);
  }
  return false;
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NaN;
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') return value === 0 ? value : +value;
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return reIsBadHex.test(value) ? NaN : +value;
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === Infinity || value === -Infinity) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result) ? (remainder ? result - remainder : result) : 0;
}

function baseSlice(array, start, end) {
  let index = -1;
  let length = array.length;

  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }
  end = (end > length) ? length : end;
  if (end < 0) {
    end += length;
  }
  length = (start > end) ? 0 : ((end - start) >>> 0);
  start >>>= 0;

  const result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

function slice(array, start, end) {
  // S0: length probe + empty short-circuit
  let length = array ? array.length : 0;
  if (!length) return [];

  // S1: iteratee-call guard (checked BEFORE defaulting)
  if (end && typeof end !== 'number' && isIterateeCall(array, start, end)) {
    start = 0;
    end = length;
  } else {
    // S2: defaulting + integer coercion
    // start: null OR undefined -> 0; anything else -> toInteger
    start = (start == null) ? 0 : toInteger(start);
    // end: STRICT undefined -> length; null -> toInteger(null) = 0
    end = (end === undefined) ? length : toInteger(end);
  }

  // S3: baseSlice — dense copy with negative-wrap and clamp
  return baseSlice(array, start, end);
}

export default slice;
