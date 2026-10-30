// @rederive/chunk — verified-recompose of lodash.chunk@4.2.0. quorum 3/3, differential 400/400, round 1. SIR: sir/chunk.sir
const INFINITY = 1 / 0;
const MAX_SAFE_INTEGER = 9007199254740991;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsUint = /^(?:0|[1-9]\d*)$/;
const nativeCeil = Math.ceil;
const nativeMax = Math.max;
const freeParseInt = parseInt;

function isObject(value) {
  const type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NAN;
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') return (value === 0) ? value : (+value);
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  }
  return reIsBadHex.test(value) ? NAN : (+value);
}

function toFinite(value) {
  if (!value) return (value === 0) ? value : 0;
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = (value < 0) ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return (value === value) ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result) ? (remainder ? result - remainder : result) : 0;
}

function isLength(value) {
  return typeof value === 'number' &&
    value > -1 && value % 1 === 0 && value <= MAX_SAFE_INTEGER;
}

function isArrayLike(value) {
  return value != null && isLength(value.length) && typeof value !== 'function';
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

function baseSlice(array, start, end) {
  let index = -1;
  let length = array.length;
  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }
  if (end > length) end = length;
  if (end < 0) end += length;
  length = (start > end) ? 0 : ((end - start) >>> 0);
  start = start >>> 0;
  const result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

function chunk(array, size, guard) {
  if (guard ? isIterateeCall(array, size, guard) : size === undefined) {
    size = 1;
  } else {
    size = nativeMax(toInteger(size), 0);
  }

  const length = array ? array.length : 0;
  if (!length || size < 1) {
    return [];
  }

  let index = 0;
  let resIndex = 0;
  const result = Array(nativeCeil(length / size));
  while (index < length) {
    result[resIndex++] = baseSlice(array, index, (index += size));
  }
  return result;
}

export default chunk;
