// @rederive/drop — verified-recompose of lodash.drop@4.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/drop.sir
// Clean-room reconstruction of lodash.drop@4.1.1 from SIR contract.
// All dependencies (toNumber, toFinite, toInteger, isSymbol, isObject,
// isObjectLike, baseSlice) are inlined as specified.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;

const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;

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
  if (isSymbol(value)) return NaN;
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return (value === 0) ? value : (+value);
  }
  // string path
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return freeParseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(value)) return NaN;
  return +value;
}

function toFinite(value) {
  if (!value) {
    return (value === 0) ? value : 0;
  }
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
  return (result === result)
    ? (remainder ? result - remainder : result)
    : 0;
}

function baseSlice(array, start, end) {
  let length = array.length;
  if (start < 0) {
    start = (-start > length) ? 0 : (length + start);
  }
  if (end > length) {
    end = length;
  }
  if (end < 0) {
    end += length;
  }
  length = (start > end) ? 0 : ((end - start) >>> 0);
  start = start >>> 0;
  const result = new Array(length);
  let index = -1;
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

function drop(array, n, guard) {
  // D1
  const length = array ? array.length : 0;
  // D2
  if (!length) return [];
  // D3
  n = (guard || n === undefined) ? 1 : toInteger(n);
  // D4
  return baseSlice(array, n < 0 ? 0 : n, length);
}

export default drop;
