// @rederive/takeRight — verified-recompose of lodash.takeright@4.1.1. quorum 3/3, differential 400/400, round 1. SIR: sir/takeRight.sir
// Clean-room re-emission of lodash takeRight@4.1.1
// Reconstructed from SIR + frozen oracle. Zero dependencies.

const INFINITY = 1 / 0;
const MAX_INTEGER = 1.7976931348623157e+308;

const reTrim = /^\s+|\s+$/g;
const reIsBinary = /^0b[01]+$/i;
const reIsOctal = /^0o[0-7]+$/i;
const reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

function isObject(value) {
  return !!value && (typeof value === 'object' || typeof value === 'function');
}

function isObjectLike(value) {
  return !!value && typeof value === 'object';
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (isObjectLike(value) && Object.prototype.toString.call(value) === '[object Symbol]');
}

function toNumber(value) {
  if (typeof value === 'number') {
    return value;
  }
  if (isSymbol(value)) {
    return NaN;
  }
  if (isObject(value)) {
    const other = (typeof value.valueOf === 'function') ? value.valueOf() : value;
    value = isObject(other) ? (other + '') : other;
  }
  if (typeof value !== 'string') {
    return (value === 0 ? value : +value);
  }
  value = value.replace(reTrim, '');
  const isBinary = reIsBinary.test(value);
  if (isBinary || reIsOctal.test(value)) {
    return parseInt(value.slice(2), isBinary ? 2 : 8);
  }
  if (reIsBadHex.test(value)) {
    return NaN;
  }
  return +value;
}

function toFinite(value) {
  if (!value) {
    return value === 0 ? value : 0;
  }
  value = toNumber(value);
  if (value === INFINITY || value === -INFINITY) {
    return (value < 0 ? -1 : 1) * MAX_INTEGER;
  }
  return value === value ? value : 0;
}

function toInteger(value) {
  const result = toFinite(value);
  const remainder = result % 1;
  return (result === result)
    ? (remainder ? result - remainder : result)
    : 0;
}

function baseSlice(array, start, end) {
  let index = -1;
  const len = array.length;
  if (start < 0) {
    start = (-start > len) ? 0 : (len + start);
  }
  end = (end > len) ? len : end;
  if (end < 0) {
    end += len;
  }
  const outLen = (start > end) ? 0 : ((end - start) >>> 0);
  start >>>= 0;
  const result = new Array(outLen);
  while (++index < outLen) {
    result[index] = array[index + start];
  }
  return result;
}

function takeRight(array, n, guard) {
  // NODE 0: length probe
  const length = array ? array.length : 0;

  // NODE 1: empty / no-length early return
  if (!length) {
    return [];
  }

  // NODE 2: resolve n
  n = (guard || n === undefined) ? 1 : toInteger(n);

  // NODE 3: compute start, slice
  n = length - n;
  return baseSlice(array, n < 0 ? 0 : n, length);
}

export default takeRight;
