// @rederive/dropRight — verified-recompose of lodash.dropright@4.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/dropRight.sir
// Clean-room re-emission of lodash.dropright@4.1.1
// Reconstructed from SIR + frozen oracle. Zero dependencies.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;
const NAN = 0 / 0;
const reTrim = /^\s+|\s+$/g;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const symbolTag = '[object Symbol]';
const objectToString = Object.prototype.toString;

function isObject(value) {
  const type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && objectToString.call(value) === symbolTag);
}

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (isSymbol(value)) return NAN;
  if (isObject(value)) {
    const other = typeof value.valueOf === 'function' ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return value === 0 ? value : +value;
  }
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  return (isBinary || reIsOctal.test(value))
    ? parseInt(value.slice(2), isBinary ? 2 : 8)
    : (reIsBadHex.test(value) ? NAN : +value);
}

function toFinite(value) {
  if (!value) return value === 0 ? value : 0;
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    const sign = value < 0 ? -1 : 1;
    return sign * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return result === result ? (remainder ? result - remainder : result) : 0;
}

function baseSlice(array, start, end) {
  let index = -1;
  let length = array.length;
  // start is always 0 here, so start < 0 branch not taken
  if (end > length) end = length;
  // end >= 0 here (caller clamped), so end < 0 branch not taken
  length = (start > end) ? 0 : ((end - start) >>> 0);
  start >>>= 0;
  const result = Array(length);
  while (++index < length) {
    result[index] = array[index + start];
  }
  return result;
}

function dropRight(array, n, guard) {
  const length = array ? array.length : 0;
  if (!length) return [];
  n = (guard || (n === undefined)) ? 1 : toInteger(n);
  const end = length - n;
  return baseSlice(array, 0, end < 0 ? 0 : end);
}

export default dropRight;
